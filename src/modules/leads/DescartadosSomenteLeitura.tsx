import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, RefreshCw, Trash2 } from 'lucide-react'
import type { Lead } from '../../types'
import { db } from '../../lib/db'
import { STAGE_THEME } from '../../lib/stageTheme'
import { formatCurrency } from '../../lib/formatters'
import { useLeadConfigStore } from '../../store/useLeadConfigStore'
import { EstadoTela } from '../../components/shared/EstadoTela'
import { CorretorComFoto } from '../../components/shared/CorretorComFoto'
import { EsqueletoLinhas } from '../../components/shared/Esqueleto'
import { ListContainer } from '../../components/ui/ListContainer'
import { aoTeclarAbrir } from '../../components/shared/lista'
import { ORIGEM_META } from './origens'

/**
 * Os DESCARTADOS de outro corretor, para o gestor ver — somente leitura
 * (migração 116, 26/11/2026: "colocar para o gestor poder visualizar os
 * descartados do corretor").
 *
 * Mesma régua do funil do colega (FunilSomenteLeitura): a lista vem sem
 * telefone, e-mail e anotações; o clique abre a ficha de leitura, que traz o
 * resto um lead por vez. Nenhuma ação: reabrir, mudar o motivo ou transferir
 * seguem barrados no banco. É um retrato com "Atualizar", não uma tela ao vivo.
 *
 * Em cima, os motivos com a contagem — é o que o gestor quer saber de relance
 * ("por que o Ryan está descartando?"). Tocar num motivo filtra a lista.
 */

const DIA_MS = 86_400_000

/** "hoje", "ontem", "há 5 dias", "12/08" — quando o lead foi descartado. */
function quando(iso: string | undefined, agora: number): string {
  if (!iso) return 'sem data'
  const dias = Math.floor((agora - new Date(iso).getTime()) / DIA_MS)
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'ontem'
  if (dias < 30) return `há ${dias} dias`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function DescartadosSomenteLeitura({ brokerId, nome, onAbrir }: {
  brokerId: string
  nome: string
  onAbrir: (lead: Lead) => void
}) {
  const [leads, setLeads] = useState<Lead[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [lidoEm, setLidoEm] = useState<Date | null>(null)
  const [motivo, setMotivo] = useState<string | null>(null)
  const { getByType } = useLeadConfigStore()
  const rotulos = useMemo(() => new Map(getByType('discard_reason').map(r => [r.slug, r.label])), [getByType])
  const rotulo = (slug: string) => rotulos.get(slug) ?? slug

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      setLeads(await db.leads.descartadosDaEquipe(brokerId))
      setLidoEm(new Date())
      setErro(null)
    } catch (e) {
      // Falhou: não se mostra uma lista velha como se fosse a de agora.
      setLeads(null)
      setErro((e as { message?: string })?.message ?? 'Falha ao ler os descartados')
    } finally {
      setCarregando(false)
    }
  }, [brokerId])

  useEffect(() => { setLeads(null); setLidoEm(null); setMotivo(null); void carregar() }, [carregar])

  // Os motivos, do mais frequente para o menos
  const motivos = useMemo(() => {
    const conta = new Map<string, number>()
    for (const l of leads ?? []) if (l.discardReason) conta.set(l.discardReason, (conta.get(l.discardReason) ?? 0) + 1)
    return [...conta.entries()].sort((a, b) => b[1] - a[1])
  }, [leads])

  const total = leads?.length ?? 0
  const visiveis = (leads ?? []).filter(l => !motivo || l.discardReason === motivo)
  const agora = Date.now()

  return (
    <div>
      <div className="mb-4 flex items-center gap-x-4 gap-y-2 flex-wrap rounded-[14px] border border-info-line bg-info-bg px-4 py-3" role="status">
        <Eye size={16} strokeWidth={1.8} className="text-info flex-shrink-0" aria-hidden />
        <p className="min-w-0 flex-1 text-[13.5px] text-t1">
          Descartados de <CorretorComFoto id={brokerId} nome={nome} tamanho={28} className="font-semibold" /> — somente leitura.
          <span className="text-t3"> Clique num lead para ver a ficha e o histórico. Nada pode ser alterado por aqui.</span>
        </p>
        <p className="text-[12.5px] text-t3 tabular-nums flex-shrink-0">
          {leads && <>{total} {total === 1 ? 'descartado' : 'descartados'}</>}
          {lidoEm && <> · lido às {lidoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</>}
        </p>
        <button type="button" onClick={() => void carregar()} disabled={carregando}
                className="inline-flex h-9 flex-shrink-0 cursor-pointer items-center gap-1.5 rounded-[10px] border border-line bg-surface px-3
                           text-[13px] font-semibold text-t1 transition-colors hover:bg-s2 disabled:cursor-default disabled:opacity-60
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
          <RefreshCw size={13} strokeWidth={1.9} className={carregando ? 'animate-spin' : ''} aria-hidden />
          Atualizar
        </button>
      </div>

      <EstadoTela
        carregando={carregando && leads === null}
        erro={erro}
        vazio={leads !== null && total === 0}
        onTentarDeNovo={() => void carregar()}
        icone={Trash2}
        titulo="Nenhum lead descartado"
        descricao={`${nome} não descartou nenhum lead.`}
        esqueleto={<EsqueletoLinhas linhas={8} />}
      >
        {/* Por que descarta: os motivos com a contagem; tocar filtra */}
        <div className="mb-3 flex items-center gap-2 flex-wrap" role="group" aria-label="Filtrar por motivo do descarte">
          <button type="button" onClick={() => setMotivo(null)} aria-pressed={motivo === null}
                  className={`descarte-motivo ${motivo === null ? 'descarte-motivo-ativo' : ''}`}>
            Todos <span className="tabular-nums">{total}</span>
          </button>
          {motivos.map(([slug, n]) => (
            <button key={slug} type="button" onClick={() => setMotivo(motivo === slug ? null : slug)} aria-pressed={motivo === slug}
                    className={`descarte-motivo ${motivo === slug ? 'descarte-motivo-ativo' : ''}`}>
              {rotulo(slug)} <span className="tabular-nums">{n}</span>
              <span className="descarte-motivo-pct tabular-nums">{Math.round((n / Math.max(1, total)) * 100)}%</span>
            </button>
          ))}
        </div>

        <ListContainer aria-label={`Descartados de ${nome}, somente leitura`}>
          <div className="lista-cabecalho flex items-center gap-4 px-5 pt-3 pb-1.5 select-none text-[12px] font-semibold text-t4" role="presentation">
            <span className="flex-1 min-w-0">Lead</span>
            <span className="hidden md:block w-[180px] flex-shrink-0">Motivo</span>
            <span className="hidden sm:block w-[118px] flex-shrink-0">Parou em</span>
            <span className="w-[86px] flex-shrink-0 text-right">Descartado</span>
          </div>
          {visiveis.map(l => {
            const origem = ORIGEM_META[l.origin]
            const etapa = STAGE_THEME[l.funnelStage]
            const abrir = () => onAbrir(l)
            return (
              <div key={l.id} role="button" tabIndex={0} onClick={abrir} onKeyDown={aoTeclarAbrir(abrir)}
                   aria-label={`Ver a ficha de ${l.name}`}
                   className="lista-linha flex items-center gap-4 px-5 py-3 cursor-pointer">
                <div className="flex-1 min-w-0">
                  <p className="font-heading text-[14.5px] font-semibold text-t1 truncate tracking-[-0.01em]">{l.name}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 min-w-0 text-[12.5px] text-t3">
                    {origem && <origem.icon size={12} strokeWidth={1.6} className="flex-shrink-0" aria-label={origem.label} />}
                    <span className="truncate">{l.propertyName ?? 'Sem produto'}</span>
                    {l.averageTicket ? <span className="flex-shrink-0 tabular-nums">· {formatCurrency(l.averageTicket)}</span> : null}
                    {/* no celular o motivo desce para cá */}
                    <span className="md:hidden flex-shrink-0 font-semibold text-error">· {rotulo(l.discardReason ?? '')}</span>
                  </p>
                </div>
                <span className="hidden md:block w-[180px] flex-shrink-0 truncate text-[13.5px] font-semibold text-error">{rotulo(l.discardReason ?? '')}</span>
                <span className="hidden sm:flex w-[118px] flex-shrink-0 items-center gap-1.5 text-[13px] text-t2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: `var(--stage-${l.funnelStage})` }} aria-hidden />
                  <span className="truncate">{etapa?.columnLabel ?? l.funnelStage}</span>
                </span>
                <span className="w-[86px] flex-shrink-0 text-right text-[13px] text-t3 tabular-nums">{quando(l.discardedAt, agora)}</span>
              </div>
            )
          })}
        </ListContainer>
      </EstadoTela>
    </div>
  )
}
