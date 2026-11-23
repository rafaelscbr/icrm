import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Info, Loader2, RefreshCw } from 'lucide-react'
import { useDevelopmentsStore } from '../../store/useDevelopmentsStore'
import { formatCurrencyFull } from '../../lib/formatters'
import { db } from '../../lib/db'
import { useAuthStore } from '../../store/useAuthStore'
import { FotoPerfil } from '../../components/shared/FotoPerfil'
import { MetaFormRouting } from '../../types'
import { CAMPO, Interruptor, SecaoConfig } from './SecaoConfig'
import toast from 'react-hot-toast'

/**
 * Distribuição de leads por campanha (formulário Meta → corretores).
 *
 * O admin escolhe quem recebe os leads de cada formulário. Sem corretores
 * marcados, o formulário cai no rodízio geral. Cada formulário que recebe um
 * lead aparece sozinho na lista. Produto e ticket são herdados pelo lead que
 * entrar por aquele formulário.
 *
 * Produto da campanha (23/11/2026, migração 108): o admin escolhe o lançamento
 * e a TIPOLOGIA da carteira — sempre uma. O lead nasce ligado a ela e o VGV
 * dele é o preço da tabela vigente; a tabela muda, o Kanban acompanha. Ao
 * escolher, os leads em aberto do formulário que ainda não tinham tipologia
 * são ligados também. O ticket digitado à mão saiu daqui.
 *
 * Banco primeiro: o chip, o interruptor e os campos só mudam depois que o
 * banco confirma. Falha de leitura aparece como falha — antes a lista vazia
 * dizia "nenhuma campanha detectada" mesmo quando a consulta tinha dado erro.
 */

export function CampaignRoutingSettings() {
  const { allProfiles, fetchAllProfiles } = useAuthStore()
  const [rules, setRules] = useState<MetaFormRouting[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  /** lançamento escolhido na tela e ainda sem tipologia gravada, por formulário */
  const [produtoEscolhido, setProdutoEscolhido] = useState<Record<string, string>>({})
  const { developments, unidades, carregarCarteira, erroCarteira } = useDevelopmentsStore()

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(false)
    try {
      const [lista] = await Promise.all([db.metaFormRouting.fetchAll(), carregarCarteira(true)])
      setRules(lista)
    } catch {
      setErro(true)   // aviso já disparado pela camada db
    } finally {
      setLoading(false)
    }
  }, [carregarCarteira])

  useEffect(() => {
    if (allProfiles.length === 0) void fetchAllProfiles()
    void carregar()
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps -- carga única na montagem; allProfiles.length nas dependências recarregaria em cada chegada de perfil

  const brokers = allProfiles.filter(p => p.active)
  // Ativas primeiro; dentro de cada grupo, a que mais recebe lead em cima.
  const ordenadas = useMemo(
    () => [...rules].sort((a, b) => Number(b.active) - Number(a.active) || b.leadCount - a.leadCount),
    [rules],
  )
  const ativas = rules.filter(r => r.active).length

  async function toggleBroker(rule: MetaFormRouting, brokerId: string) {
    const next = rule.brokerIds.includes(brokerId)
      ? rule.brokerIds.filter(id => id !== brokerId)
      : [...rule.brokerIds, brokerId]
    setSavingId(rule.formId)
    try {
      await db.metaFormRouting.setBrokers(rule.formId, next)
      setRules(rs => rs.map(r => r.formId === rule.formId ? { ...r, brokerIds: next } : r))
    } catch { /* erro já toastado */ }
    finally { setSavingId(null) }
  }

  async function toggleActive(rule: MetaFormRouting) {
    setSavingId(rule.formId)
    try {
      await db.metaFormRouting.setActive(rule.formId, !rule.active)
      setRules(rs => rs.map(r => r.formId === rule.formId ? { ...r, active: !r.active } : r))
      toast.success(rule.active ? 'Campanha pausada' : 'Campanha ativada')
    } catch { /* erro já toastado */ }
    finally { setSavingId(null) }
  }

  // ── Produto da campanha pela carteira ────────────────────────────────────
  const lancamentos = useMemo(
    () => developments.filter(d => d.active).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [developments],
  )
  /** tipologias com tabela vigente — as únicas que a campanha pode usar */
  const tipologiasDe = useCallback(
    (devId: string) => unidades
      .filter(u => u.developmentId === devId && u.available && (u.price ?? u.priceMin) != null)
      .sort((a, b) => a.displayOrder - b.displayOrder),
    [unidades],
  )
  /** o lançamento que a tela mostra: o escolhido agora, o da tipologia gravada ou o do formulário */
  function lancamentoDa(rule: MetaFormRouting): string {
    if (produtoEscolhido[rule.formId] !== undefined) return produtoEscolhido[rule.formId]
    const u = rule.developmentUnitId ? unidades.find(x => x.id === rule.developmentUnitId) : undefined
    if (u) return u.developmentId
    return developments.find(d => d.metaFormIds.includes(rule.formId))?.id ?? ''
  }

  async function salvarTipologia(rule: MetaFormRouting, unitId: string) {
    const u = unidades.find(x => x.id === unitId)
    if (!u) return
    setSavingId(rule.formId)
    try {
      const ligados = await db.metaFormRouting.setTipologia(rule.formId, unitId)
      const dev = developments.find(d => d.id === u.developmentId)
      setRules(rs => rs.map(r => r.formId === rule.formId
        ? { ...r, developmentUnitId: unitId, productName: dev?.name, productTicket: u.price ?? u.priceMin }
        : r))
      setProdutoEscolhido(p => { const n = { ...p }; delete n[rule.formId]; return n })
      toast.success(ligados > 0
        ? `Produto salvo. ${ligados.toLocaleString('pt-BR')} ${ligados === 1 ? 'lead em aberto passou' : 'leads em aberto passaram'} a usar essa tipologia`
        : 'Produto salvo')
    } catch { /* erro já toastado */ }
    finally { setSavingId(null) }
  }

  function escolherLancamento(rule: MetaFormRouting, devId: string) {
    setProdutoEscolhido(p => ({ ...p, [rule.formId]: devId }))
    // Uma tipologia só com tabela: não há o que escolher.
    const tips = devId ? tipologiasDe(devId) : []
    if (tips.length === 1) void salvarTipologia(rule, tips[0].id)
  }

  return (
    <SecaoConfig
      id="config-campanhas-titulo"
      titulo="Distribuição de *campanhas*"
      descricao="Quem recebe os leads de cada formulário do Meta e de qual produto eles são. Com mais de um corretor marcado, os leads alternam entre eles. O VGV de cada lead vem da tabela da tipologia escolhida."
      lado={!loading && !erro && rules.length > 0
        ? <span className="text-[13px] text-t3 tabular-nums">{ativas} de {rules.length} ativas</span>
        : undefined}
    >
      <div className="bento overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={18} className="animate-spin text-brand" strokeWidth={1.6} aria-label="Carregando" />
          </div>
        ) : erro ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center px-5" role="alert">
            <AlertTriangle size={20} strokeWidth={1.6} className="text-error" aria-hidden />
            <p className="text-[14px] font-semibold text-t1">Não foi possível carregar as campanhas</p>
            <button type="button" onClick={() => void carregar()}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] bg-s2 hover:bg-s3 text-[13.5px] font-semibold text-t1 cursor-pointer">
              <RefreshCw size={14} strokeWidth={1.8} aria-hidden /> Tentar de novo
            </button>
          </div>
        ) : rules.length === 0 ? (
          <div className="py-12 text-center px-5">
            <p className="text-[14px] font-semibold text-t1">Nenhuma campanha por aqui ainda</p>
            <p className="text-[13px] text-t3 mt-1">Cada formulário aparece sozinho assim que o primeiro lead chega.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {ordenadas.map(rule => {
              const nome = rule.formName ?? `Formulário ${rule.formId.slice(0, 8)}…`
              const saving = savingId === rule.formId
              const semCorretor = rule.brokerIds.length === 0
              const devId = lancamentoDa(rule)
              const tips = devId ? tipologiasDe(devId) : []
              const tipologiaAtual = rule.developmentUnitId && unidades.find(u => u.id === rule.developmentUnitId)?.developmentId === devId
                ? unidades.find(u => u.id === rule.developmentUnitId)
                : undefined
              const devAtual = developments.find(d => d.id === devId)
              return (
                <li key={rule.formId} className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className={`min-w-0 flex-1 ${rule.active ? '' : 'opacity-55'}`}>
                      <p className="text-[15px] font-semibold text-t1 truncate">{nome}</p>
                      <p className="text-[12.5px] text-t3 tabular-nums">
                        {rule.leadCount.toLocaleString('pt-BR')} {rule.leadCount === 1 ? 'lead recebido' : 'leads recebidos'}
                        {!rule.active && ' · pausada'}
                      </p>
                    </div>
                    <Interruptor
                      ligado={rule.active} onChange={() => void toggleActive(rule)} carregando={saving}
                      rotulo={`${nome}: ${rule.active ? 'ativa. Pausar' : 'pausada. Ativar'}`}
                    />
                  </div>

                  {rule.active && (
                    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-x-4 gap-y-3 mt-3.5 items-end">
                      <div className="min-w-0 sm:col-span-2">
                        <p className="text-[12.5px] text-t4 mb-1.5">Quem recebe</p>
                        <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Corretores de ${nome}`}>
                          {brokers.map(b => {
                            const on = rule.brokerIds.includes(b.id)
                            return (
                              <button
                                key={b.id}
                                type="button"
                                onClick={() => void toggleBroker(rule, b.id)}
                                disabled={saving}
                                aria-pressed={on}
                                className={`inline-flex items-center gap-1.5 h-9 pl-1.5 pr-3 rounded-full text-[13px] font-medium cursor-pointer transition-colors
                                  disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40
                                  ${on ? 'bg-brand-tint text-brand-text' : 'bg-s2 text-t3 hover:text-t1 hover:bg-s3'}`}
                              >
                                {/* foto do corretor (22/11/2026); quem recebe ganha o selo de
                                    confirmação sobre a foto, quem não recebe fica esmaecido */}
                                <span className="relative flex-shrink-0" aria-hidden>
                                  <FotoPerfil nome={b.name} url={b.avatarUrl} tamanho={26}
                                              className={on ? '' : 'opacity-60 grayscale'} />
                                  {on && (
                                    <span className="absolute -right-1 -bottom-1 w-[15px] h-[15px] rounded-full bg-brand-fill text-brand-fill-text
                                                     flex items-center justify-center ring-2 ring-surface">
                                      <Check size={9} strokeWidth={3.2} />
                                    </span>
                                  )}
                                </span>
                                {b.name.split(' ')[0]}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      <label className="flex flex-col gap-1.5 min-w-0">
                        <span className="text-[12.5px] text-t4">Produto</span>
                        <select
                          value={devId}
                          onChange={e => escolherLancamento(rule, e.target.value)}
                          disabled={saving || !!erroCarteira}
                          aria-label={`Produto de ${nome}`}
                          className={`${CAMPO} w-full cursor-pointer`}
                        >
                          <option value="">Escolha o lançamento</option>
                          {lancamentos.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      </label>

                      <label className="flex flex-col gap-1.5 min-w-0">
                        <span className="text-[12.5px] text-t4">Tipologia</span>
                        <select
                          value={tipologiaAtual?.id ?? ''}
                          onChange={e => e.target.value && void salvarTipologia(rule, e.target.value)}
                          disabled={saving || !devId || tips.length === 0}
                          aria-label={`Tipologia de ${nome}`}
                          className={`${CAMPO} w-full cursor-pointer`}
                        >
                          <option value="">{!devId ? '—' : tips.length === 0 ? 'Sem tabela cadastrada' : 'Escolha a tipologia'}</option>
                          {tips.map(u => (
                            <option key={u.id} value={u.id}>{u.name} · {formatCurrencyFull(u.price ?? u.priceMin ?? 0)}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}

                  {rule.active && tipologiaAtual && devAtual && (
                    <p className="mt-2.5 text-[12.5px] text-t3 tabular-nums">
                      Cada lead entra com <b className="text-t1 font-semibold">{formatCurrencyFull(tipologiaAtual.price ?? tipologiaAtual.priceMin ?? 0)}</b> de VGV,
                      pela tabela vigente · comissão de {devAtual.commissionPct.toLocaleString('pt-BR')}%
                    </p>
                  )}

                  {rule.active && !tipologiaAtual && (
                    <p className="flex items-start gap-1.5 mt-3 text-[12.5px] text-warning">
                      <Info size={13} strokeWidth={1.8} className="flex-shrink-0 mt-[2px]" aria-hidden />
                      {devId && tips.length === 0
                        ? `${devAtual?.name ?? 'Este lançamento'} ainda não tem tabela cadastrada: os leads entram ligados ao produto, mas sem preço da tabela.`
                        : devId
                          ? 'Escolha a tipologia: é ela que dá o VGV de cada lead.'
                          : rule.productName
                            ? `${rule.productName} não está na carteira de lançamentos: os leads entram com o ticket fixo${rule.productTicket ? ` de ${formatCurrencyFull(rule.productTicket)}` : ''}.`
                            : 'Sem produto: os leads deste formulário entram sem VGV.'}
                    </p>
                  )}

                  {rule.active && semCorretor && (
                    <p className="flex items-center gap-1.5 mt-3 text-[12.5px] text-warning">
                      <Info size={13} strokeWidth={1.8} className="flex-shrink-0" aria-hidden />
                      Sem corretor marcado: os leads deste formulário caem no rodízio geral.
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </SecaoConfig>
  )
}
