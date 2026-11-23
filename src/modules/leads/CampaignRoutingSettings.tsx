import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, Info, Loader2, RefreshCw } from 'lucide-react'
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
 * Banco primeiro: o chip, o interruptor e os campos só mudam depois que o
 * banco confirma. Falha de leitura aparece como falha — antes a lista vazia
 * dizia "nenhuma campanha detectada" mesmo quando a consulta tinha dado erro.
 */

const chave = (r: MetaFormRouting) => `${r.productName?.trim() ?? ''}|${r.productTicket ?? ''}`

export function CampaignRoutingSettings() {
  const { allProfiles, fetchAllProfiles } = useAuthStore()
  const [rules, setRules] = useState<MetaFormRouting[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  /** produto|ticket como está no banco — para o blur não salvar o que não mudou */
  const salvos = useRef<Record<string, string>>({})

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(false)
    try {
      const lista = await db.metaFormRouting.fetchAll()
      salvos.current = Object.fromEntries(lista.map(r => [r.formId, chave(r)]))
      setRules(lista)
    } catch {
      setErro(true)   // aviso já disparado pela camada db
    } finally {
      setLoading(false)
    }
  }, [])

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

  // O campo acompanha a digitação; o que vale é o que foi salvo ao sair dele.
  function updateLocal(formId: string, patch: Partial<MetaFormRouting>) {
    setRules(rs => rs.map(r => r.formId === formId ? { ...r, ...patch } : r))
  }

  async function saveProduct(rule: MetaFormRouting) {
    if (salvos.current[rule.formId] === chave(rule)) return   // nada mudou: não salva nem avisa
    setSavingId(rule.formId)
    try {
      await db.metaFormRouting.setProduct(
        rule.formId,
        rule.productName?.trim() || null,
        rule.productTicket != null && !Number.isNaN(rule.productTicket) ? rule.productTicket : null,
      )
      salvos.current[rule.formId] = chave(rule)
      toast.success('Produto e ticket salvos')
    } catch { /* erro já toastado */ }
    finally { setSavingId(null) }
  }

  return (
    <SecaoConfig
      id="config-campanhas-titulo"
      titulo="Distribuição de *campanhas*"
      descricao="Quem recebe os leads de cada formulário do Meta. Com mais de um corretor marcado, os leads alternam entre eles. Produto e ticket já entram preenchidos em cada lead do formulário."
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
                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,230px)_150px] gap-x-4 gap-y-3 mt-3.5 items-end">
                      <div className="min-w-0">
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
                        <input
                          type="text"
                          value={rule.productName ?? ''}
                          onChange={e => updateLocal(rule.formId, { productName: e.target.value })}
                          onBlur={() => void saveProduct(rule)}
                          placeholder="Ex.: Greenview"
                          className={`${CAMPO} w-full`}
                        />
                      </label>

                      <label className="flex flex-col gap-1.5 min-w-0">
                        <span className="text-[12.5px] text-t4">Ticket</span>
                        <span className="relative flex items-center">
                          <span className="absolute left-3 text-[13px] text-t3 select-none" aria-hidden>R$</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={rule.productTicket != null ? rule.productTicket.toLocaleString('pt-BR') : ''}
                            onChange={e => {
                              const digits = e.target.value.replace(/\D/g, '')
                              updateLocal(rule.formId, { productTicket: digits ? Number(digits) : undefined })
                            }}
                            onBlur={() => void saveProduct(rule)}
                            placeholder="500.000"
                            aria-label={`Ticket de ${nome}, em reais`}
                            className={`${CAMPO} w-full pl-9 tabular-nums`}
                          />
                        </span>
                      </label>
                    </div>
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
