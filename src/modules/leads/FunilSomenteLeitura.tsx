import { useCallback, useEffect, useMemo, useState } from 'react'
import { BadgeCheck, Eye, RefreshCw } from 'lucide-react'
import type { Lead, LeadFunnelStage } from '../../types'
import { MAX_TENTATIVAS_FOLLOWUP } from '../../types'
import { db } from '../../lib/db'
import { STAGE_THEME, FUNNEL_STAGES } from '../../lib/stageTheme'
import { formatCurrency } from '../../lib/formatters'
import { EstadoTela } from '../../components/shared/EstadoTela'
import { CorretorComFoto } from '../../components/shared/CorretorComFoto'
import { EsqueletoCards } from '../../components/shared/Esqueleto'
import { ORIGEM_META } from './origens'
import { fraseContato, nivelContato, tomDoContato, TOM_CONTATO } from './contato'
import { ordemEfetiva } from './leadFiltros'
import { aoTeclarAbrir } from '../../components/shared/lista'
import { LeadSomenteLeitura } from './LeadSomenteLeitura'
import { SinalDeFluxo } from './fluxos/SinalDeFluxo'

/**
 * O funil de OUTRO corretor, para o gestor acompanhar — somente leitura
 * (migração 091).
 *
 * Não é o Kanban de trabalho com os botões escondidos: é uma tela à parte, sem
 * arrastar e sem nenhuma ação. Assim não existe botão para "esquecer de
 * esconder". E não depende só da tela: o banco não deixa o gestor gravar em
 * lead de colega.
 *
 * O quadro vem sem telefone, e-mail, anotações e respostas do formulário. Os
 * detalhes só saem do banco um lead por vez, quando o gestor clica no cartão e
 * abre a ficha de leitura (LeadSomenteLeitura, migração 095).
 *
 * É um retrato do momento em que foi lido, não uma tela ao vivo — o banco não
 * entrega ao gestor os eventos em tempo real dos leads dos colegas. Por isso a
 * hora da leitura fica à vista, com o botão de atualizar.
 */
export function FunilSomenteLeitura({ brokerId, nome }: { brokerId: string; nome: string }) {
  const [leads, setLeads] = useState<Lead[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [lidoEm, setLidoEm] = useState<Date | null>(null)
  const [aberto, setAberto] = useState<Lead | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const lista = await db.leads.funilDaEquipe(brokerId)
      setLeads(lista)
      setLidoEm(new Date())
      setErro(null)
    } catch (e) {
      // Falhou: não se mostra um funil velho como se fosse o de agora.
      setLeads(null)
      setErro((e as { message?: string })?.message ?? 'Falha ao ler o funil')
    } finally {
      setCarregando(false)
    }
  }, [brokerId])

  useEffect(() => { setLeads(null); setLidoEm(null); setAberto(null); void carregar() }, [carregar])

  const porEtapa = useMemo(() => {
    const mapa = new Map<LeadFunnelStage, Lead[]>(FUNNEL_STAGES.map(e => [e, []]))
    for (const l of leads ?? []) mapa.get(l.funnelStage)?.push(l)
    for (const lista of mapa.values()) lista.sort((a, b) => ordemEfetiva(b) - ordemEfetiva(a))
    return mapa
  }, [leads])

  const total = leads?.length ?? 0
  const pipeline = (leads ?? []).reduce((s, l) => s + (l.averageTicket ?? 0), 0)
  const agora = Date.now()

  return (
    <div>
      <div className="mb-4 flex items-center gap-x-4 gap-y-2 flex-wrap rounded-[14px] border border-info-line bg-info-bg px-4 py-3" role="status">
        <Eye size={16} strokeWidth={1.8} className="text-info flex-shrink-0" aria-hidden />
        <p className="min-w-0 flex-1 text-[13.5px] text-t1">
          Funil de <CorretorComFoto id={brokerId} nome={nome} tamanho={28} className="font-semibold" /> — somente leitura.
          <span className="text-t3"> Clique num lead para ver os detalhes. Nada pode ser alterado por aqui.</span>
        </p>
        <p className="text-[12.5px] text-t3 tabular-nums flex-shrink-0">
          {leads && <>{total} {total === 1 ? 'lead' : 'leads'}{pipeline > 0 && <> · {formatCurrency(pipeline)}</>}</>}
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
        icone={Eye}
        titulo="Nenhum lead em aberto"
        descricao={`${nome} não tem leads ativos no funil agora.`}
        esqueleto={<EsqueletoCards cards={6} colunas={3} />}
      >
        <div className="flex gap-4 overflow-x-auto pb-4 items-start [justify-content:safe_center]" aria-label={`Funil de ${nome}, somente leitura`}>
          {FUNNEL_STAGES.map(etapa => {
            const conf = STAGE_THEME[etapa]
            const lista = porEtapa.get(etapa) ?? []
            const vgv = lista.reduce((s, l) => s + (l.averageTicket ?? 0), 0)

            return (
              // Colunas iguais e sempre abertas, como no Kanban.
              <section key={etapa}
                       className="flex flex-col flex-1 basis-[18.5rem] min-w-[18.5rem] lg:basis-[16rem] lg:min-w-[16rem] max-w-[22rem]"
                       style={{ ['--etapa' as string]: `var(--stage-${etapa})` }}>
                <div className="flex flex-col flex-1 kanban-col">
                  <div className="kanban-cabeca kanban-col-bg flex items-center gap-2 px-1 pt-0.5 pb-2 mb-2.5">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${conf.dot}`} aria-hidden />
                    <h3 className="text-[14px] font-semibold text-t1">{conf.columnLabel}</h3>
                    <span className="text-[13px] font-semibold tabular-nums text-t4">{lista.length}</span>
                    {vgv > 0 && <span className="ml-auto text-[12px] text-t3 tabular-nums">{formatCurrency(vgv)}</span>}
                  </div>
                  {/* Coluna vazia continua aberta, como no Kanban: o funil tem sempre as mesmas colunas. */}
                  {lista.length === 0 ? (
                    <p className="text-xs text-t4 text-center leading-snug px-3 py-8">
                      Nada em {conf.columnLabel.toLowerCase()}
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {lista.map(l => <li key={l.id}><CartaoSomenteLeitura lead={l} agora={agora} onAbrir={() => setAberto(l)} /></li>)}
                    </ul>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </EstadoTela>

      {aberto && (
        <LeadSomenteLeitura leadId={aberto.id} nome={aberto.name} corretor={nome} corretorId={brokerId} onClose={() => setAberto(null)} />
      )}
    </div>
  )
}

const DIA_MS = 86_400_000

/** O mesmo cartão do Kanban, só com o que se lê: sem ação e sem telefone. O clique abre a ficha de leitura. */
function CartaoSomenteLeitura({ lead, agora, onAbrir }: { lead: Lead; agora: number; onAbrir: () => void }) {
  const origem = ORIGEM_META[lead.origin]
  const diasNaEtapa = Math.floor((agora - new Date(lead.stageChangedAt ?? lead.createdAt).getTime()) / DIA_MS)
  const nivel = nivelContato(lead, agora)
  const corContato = nivel === 'parado' ? 'text-error' : nivel === 'esfriando' ? 'text-warning' : 'text-t3'
  // O mesmo destaque de contato do Kanban de Leads (contato.ts)
  const tom = tomDoContato(lead, agora)

  return (
    // <div role="button">, como o cartão do Kanban: um <button> de verdade não
    // pode conter os parágrafos e blocos do cartão.
    <div role="button" tabIndex={0} onClick={onAbrir} onKeyDown={aoTeclarAbrir(onAbrir)}
         aria-label={`Ver detalhes de ${lead.name}`}
         className={`kanban-card ${tom ? TOM_CONTATO[tom].classe : ''} relative border rounded-[14px] px-3.5 py-3 overflow-hidden cursor-pointer
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-brand`}>
      <div className="flex items-baseline gap-2">
        <p className="font-heading text-[14px] font-bold text-t1 truncate leading-tight tracking-[-0.02em]">{lead.name}</p>
        <span className="self-center"><SinalDeFluxo quantos={lead.fluxosCount} /></span>
        {lead.averageTicket ? (
          <span className="ml-auto flex-shrink-0 font-heading text-[13px] font-bold text-t1 tabular-nums leading-tight">
            {formatCurrency(lead.averageTicket)}
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5 mt-1 min-w-0 text-[12px] text-t3">
        {origem && <origem.icon size={11} strokeWidth={1.6} className="flex-shrink-0" aria-label={origem.label} />}
        <span className="truncate">{lead.propertyName ?? 'Sem produto'}</span>
        {lead.qualifiedAt && (
          <span className="ml-auto inline-flex items-center gap-0.5 font-label text-[11px] font-semibold uppercase tracking-[0.08em] text-success flex-shrink-0">
            <BadgeCheck size={11} strokeWidth={2} aria-hidden /> Qualificado
          </span>
        )}
      </div>

      <div className="flex items-start gap-2 mt-2">
        <p className={`kanban-frase flex-1 min-w-0 text-xs font-semibold leading-snug ${corContato}`}>{fraseContato(lead, agora)}</p>
        <span className="flex-shrink-0 font-label text-[11px] text-t3 tabular-nums"
              title={`${diasNaEtapa} ${diasNaEtapa === 1 ? 'dia' : 'dias'} nesta etapa`}>
          {diasNaEtapa}d
        </span>
      </div>

      {lead.funnelStage === 'followup' && (
        <div className="mt-2.5 flex items-center gap-1" role="img"
             aria-label={`${lead.followupStep} de ${MAX_TENTATIVAS_FOLLOWUP} tentativas`}>
          {Array.from({ length: MAX_TENTATIVAS_FOLLOWUP }, (_, i) => i + 1).map(passo => (
            <span key={passo} className={`flex-1 h-1.5 rounded-full ${passo <= lead.followupStep ? 'bg-brand' : 'bg-s3'}`} />
          ))}
        </div>
      )}
    </div>
  )
}
