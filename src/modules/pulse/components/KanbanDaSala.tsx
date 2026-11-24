import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { AlertTriangle, LayoutGrid, Activity, ArrowRight, Clock, Snowflake, Sparkles } from 'lucide-react'
import type { LeadFunnelStage } from '../../../types'
import { MAX_TENTATIVAS_FOLLOWUP } from '../../../types'
import type { Profile } from '../../../store/useAuthStore'
import { FUNNEL_STAGES, STAGE_THEME } from '../../../lib/stageTheme'
import { JOIA, degradeJoiaClaro, fundoJoiaClaro } from '../../../lib/paletaJoia'
import { formatCurrencyRound } from '../../../lib/formatters'
import { FotoPerfil } from '../../../components/shared/FotoPerfil'
import { destacar } from '../../../components/shared/Destaque'
import { ORIGEM_META } from '../../leads/origens'
import { ESFRIANDO_DIAS, haQuantoTempo, tomDoContato, TOM_CONTATO } from '../../leads/contato'
import { useRelogio } from '../useKiosk'
import { colunasDaSala, dinheiroDoCartao, DINHEIRO_ZERO, somar, VIVO_MS } from '../kanbanDaSala'
import type { CartaoSala, ColunaSala, DinheiroSala } from '../kanbanDaSala'

/**
 * A segunda tela do Pulse (23/11/2026): o Kanban da imobiliária inteira. Gira
 * com a sala a cada 5 minutos (PulsePage).
 *
 * DESENHO = O KANBAN DE LEADS (Rafael, 23/11/2026: "o mais parecido possível
 * com o kanban que já tem nos leads"). As mesmas peças, com as mesmas classes
 * (kanban-col, kanban-cabeca, kanban-trilha, kanban-card): o placar de chips em
 * cima, a coluna com a seta da etapa e o dinheiro, e o cartão — foto do dono,
 * lead, produto e VGV; a faixa Corretor | Souza; o último contato; os toques
 * do followup; a barra de progresso no pé. Fica de fora só o que é de clicar
 * (Chamar, atalhos, arrastar): a TV é para olhar. Mudou o cartão do Kanban de
 * Leads (LeadKanban.tsx)? Mude aqui também.
 *
 * As seis colunas do Kanban têm 22rem cada — não cabem lado a lado no palco
 * de 1600 px. Então o quadro é desenhado num palco maior (ESCALA_QUADRO) e
 * reduzido para caber: a TV mostra as seis etapas inteiras, com o cartão no
 * mesmo desenho.
 *
 * Os dados vêm do store do Pulse (kanbanDaSala.ts): uma leitura e depois só
 * os eventos do canal. Esta tela não consulta nada.
 */

/** o quadro é desenhado 1/0,82 maior e reduzido — ~300 px por coluna */
const ESCALA_QUADRO = 0.82
/** alturas fixas do cartão: a coluna sabe quantos cabem sem medir um a um */
const CARTAO_H = 136
const CARTAO_FOLLOWUP_H = 160
const RODAPE_H = 46
const VAO = 10
const DIA = 86_400_000

const rs = (v: number) => formatCurrencyRound(v)
const alturaDe = (c: CartaoSala) => (c.etapa === 'followup' ? CARTAO_FOLLOWUP_H : CARTAO_H)

/** "Último contato hoje" / "Nenhum contato em 3 dias" — a frase do Kanban (contato.ts). */
function fraseContato(c: CartaoSala, agora: number): string {
  const ref = c.ultimoContatoAt ?? c.criadoEm
  const d = Math.floor(Math.max(0, agora - new Date(ref).getTime()) / DIA)
  if (!c.ultimoContatoAt) return d <= 0 ? 'Sem contato ainda · entrou hoje' : `Nenhum contato em ${d} ${d === 1 ? 'dia' : 'dias'}`
  if (d === 1) return `Último contato há ${Math.floor((agora - new Date(ref).getTime()) / 3_600_000)} h`
  return `Último contato ${haQuantoTempo(d)}`
}

function esfriando(c: CartaoSala, agora: number): boolean {
  return agora - new Date(c.ultimoContatoAt ?? c.criadoEm).getTime() > ESFRIANDO_DIAS * DIA
}

// ─── O giro: qual tela está no ar e quando troca ──────────────────────────────

export type TelaPulse = 'sala' | 'kanban'

/**
 * O botão da troca, na faixa Marinho das duas telas (Rafael, 23/11/2026:
 * "um botãozinho para se eu clicar mudar"): branco, grande, diz para onde vai.
 * Embaixo, uma barra champanhe que enche até a troca automática e o tempo que
 * falta. As setas do teclado também trocam (PulsePage).
 */
export function GiroDasTelas({ tela, trocouEm, duracaoMs, onTrocar }: {
  tela: TelaPulse
  trocouEm: number
  duracaoMs: number
  onTrocar: (t: TelaPulse) => void
}) {
  const agora = useRelogio().getTime()
  const passou = Math.min(1, Math.max(0, (agora - trocouEm) / duracaoMs))
  const falta = Math.max(0, Math.ceil((duracaoMs - (agora - trocouEm)) / 1000))
  const mm = Math.floor(falta / 60), ss = String(falta % 60).padStart(2, '0')
  const outra: TelaPulse = tela === 'sala' ? 'kanban' : 'sala'
  const Icone = outra === 'kanban' ? LayoutGrid : Activity
  return (
    <div className="flex flex-col gap-2 w-[236px]">
      <button type="button" onClick={() => onTrocar(outra)}
              className="group inline-flex items-center gap-3 h-[50px] pl-1.5 pr-4 rounded-full bg-white cursor-pointer
                         shadow-[0_10px_26px_-12px_rgba(0,0,0,0.55)] transition-transform duration-200 hover:scale-[1.03] active:scale-[0.98]
                         focus:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
              style={{ color: '#143275' }}>
        <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full" style={{ background: 'linear-gradient(140deg, #F1DDB0, #D6B26E)' }} aria-hidden>
          <Icone size={19} strokeWidth={2.2} />
        </span>
        <span className="font-display text-[17px] font-bold tracking-[-0.01em] whitespace-nowrap">
          {outra === 'kanban' ? 'Ver o Kanban' : 'Ver a sala'}
        </span>
        <ArrowRight size={19} strokeWidth={2.2} className="ml-auto transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
      </button>
      <div className="flex items-center gap-2 px-2">
        <span className="relative flex-1 h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.18)' }} aria-hidden>
          <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${passou * 100}%`, background: 'var(--m-ouro)' }} />
        </span>
        <span className="text-[12.5px] tabular-nums whitespace-nowrap" style={{ color: 'var(--m-t3)' }}>
          troca sozinha em {mm}:{ss}
        </span>
      </div>
    </div>
  )
}

// ─── Cartão — o mesmo do Kanban de Leads, sem os botões ───────────────────────

function Cartao({ c, dono, agora, pctDe }: { c: CartaoSala; dono?: Profile; agora: number; pctDe: (id: string | null) => number | undefined }) {
  const vivo = c.vivoAt !== undefined && agora - c.vivoAt < VIVO_MS
  const passo = FUNNEL_STAGES.indexOf(c.etapa)
  const dias = Math.floor((agora - new Date(c.desde).getTime()) / DIA)
  const Origem = c.origem ? ORIGEM_META[c.origem] : undefined
  const share = dono?.commissionShare ?? null
  const din = c.vgv ? dinheiroDoCartao(c, () => share, pctDe) : null
  // O mesmo destaque de followup atrasado do Kanban de Leads (contato.ts)
  const tom = tomDoContato({ lastContactAt: c.ultimoContatoAt, createdAt: c.criadoEm, funnelStage: c.etapa }, agora)
  return (
    <div className={`kanban-card pulse-cartao relative shrink-0 border rounded-[16px] overflow-hidden px-3.5 pt-3 pb-3.5 ${vivo ? 'pulse-cartao-vivo' : ''} ${tom ? TOM_CONTATO[tom].classe : ''}`}
         style={{ height: alturaDe(c), ['--etapa' as string]: JOIA[c.etapa].medio }}>
      {/* 1 · Dono · lead · VGV */}
      <div className="flex items-center gap-2.5 min-w-0">
        <FotoPerfil nome={dono?.name ?? '?'} url={dono?.avatarUrl} tamanho={36} anel className="shadow-[0_2px_6px_-2px_rgba(15,39,89,.35)]" />
        <div className="flex-1 min-w-0">
          <p className="font-heading text-[14.5px] font-semibold text-t1 truncate leading-tight tracking-[-0.015em]">{c.nome}</p>
          <p className="mt-0.5 text-[12px] text-t3 truncate">
            {Origem && <Origem.icon size={11} strokeWidth={1.6} className="inline-block align-[-1px] mr-1 text-t4" aria-label={Origem.label} />}
            {c.produto ?? 'Sem produto'}
          </p>
        </div>
        {c.vgv > 0 && (
          <div className="flex-shrink-0 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-t4 leading-none">VGV</p>
            <p className="mt-1 text-[13.5px] font-bold text-t1 tabular-nums leading-none">{rs(c.vgv)}</p>
          </div>
        )}
      </div>

      {/* 2 · O dinheiro em jogo */}
      {din ? (
        <div className="kanban-faixa mt-2.5 flex items-stretch rounded-[11px] bg-s2/70 overflow-hidden text-[12.5px]">
          <div className="flex-1 min-w-0 px-2.5 py-1.5 flex items-center justify-between gap-2">
            <span className="text-[11.5px] font-medium text-success/80 truncate">{dono ? dono.name.split(' ')[0] : 'Corretor'}</span>
            <span className="font-bold text-success tabular-nums whitespace-nowrap">{din.corretor > 0 ? rs(din.corretor) : '—'}</span>
          </div>
          <div className="flex-1 min-w-0 px-2.5 py-1.5 flex items-center justify-between gap-2 border-l border-line">
            <span className="text-[11.5px] font-medium text-brand-text/80">Souza</span>
            <span className="font-bold text-brand-text tabular-nums whitespace-nowrap">{rs(din.souza)}</span>
          </div>
        </div>
      ) : (
        <div className="mt-2.5 h-[30px] rounded-[11px] bg-s2/50 flex items-center px-2.5 text-[11.5px] text-t4">Sem VGV na tabela</div>
      )}

      {/* 3 · Último contato · dias na etapa */}
      <div className="mt-2.5 flex items-center gap-2 min-w-0">
        <Clock size={13} strokeWidth={1.8} className="flex-shrink-0 text-t4" aria-hidden />
        <p className="kanban-frase flex-1 min-w-0 truncate text-[12px] text-t3">{fraseContato(c, agora)}</p>
        {vivo
          ? <span className="flex-shrink-0 rounded-full px-1.5 text-[10.5px] leading-[16px] font-bold uppercase tracking-[0.08em] text-white" style={{ background: JOIA[c.etapa].medio }}>agora</span>
          : <span className="flex-shrink-0 text-[11px] text-t4 tabular-nums">{Math.max(0, dias)}d</span>}
      </div>

      {/* Toques do followup */}
      {c.etapa === 'followup' && (
        <div className="flex items-center gap-1 mt-2" aria-label={`${c.passo} de ${MAX_TENTATIVAS_FOLLOWUP} tentativas`}>
          {Array.from({ length: MAX_TENTATIVAS_FOLLOWUP }, (_, i) => i + 1).map(step => (
            <span key={step} className="flex-1 py-[5px]">
              <span className={`block h-1 rounded-full ${step <= c.passo ? 'bg-brand' : 'bg-line-strong'}`} />
            </span>
          ))}
          <span className="flex-shrink-0 ml-1 text-[11px] text-t4 tabular-nums">{c.passo}/{MAX_TENTATIVAS_FOLLOWUP}</span>
        </div>
      )}

      {/* Progresso no funil, no pé do cartão */}
      <div className="absolute left-0 right-0 bottom-0 flex gap-[2px] px-3.5 pb-1.5" aria-hidden>
        {FUNNEL_STAGES.map((st, i) => (
          <span key={st} className="flex-1 h-[3px] rounded-full" style={{ background: i <= passo ? JOIA[st].medio : 'var(--s3)' }} />
        ))}
      </div>
    </div>
  )
}

// ─── Coluna — a mesma do Kanban de Leads ──────────────────────────────────────

/** Quantos cartões cabem na altura da coluna (TV); no celular, todos. */
function useCapacidade(cartoes: CartaoSala[], ativo: boolean): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [h, setH] = useState(0)
  useEffect(() => {
    if (!ativo || !ref.current) return
    // Mede já: o ResizeObserver não dispara em aba escondida, e o quadro não
    // pode nascer vazio por isso.
    setH(ref.current.clientHeight)
    const ro = new ResizeObserver(([e]) => setH(Math.floor(e.contentRect.height)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [ativo])
  if (!ativo) return [ref, cartoes.length]
  if (h === 0) return [ref, 0]
  // padding de 6 px em cima e embaixo (p-1.5)
  const livre = h - 12
  let usado = 0, n = 0
  for (const c of cartoes) {
    const prox = usado + (n > 0 ? VAO : 0) + alturaDe(c)
    if (prox > livre) break
    usado = prox; n++
  }
  if (n === cartoes.length) return [ref, n]
  // Não cabe tudo: abre lugar para o rodapé "+ N leads".
  while (n > 0 && usado + VAO + RODAPE_H > livre) {
    n--
    usado = cartoes.slice(0, n).reduce((t, c, i) => t + alturaDe(c) + (i > 0 ? VAO : 0), 0)
  }
  return [ref, n]
}

function Coluna({ col, primeira, perfis, agora, celular, pctDe }: {
  pctDe: (id: string | null) => number | undefined
  col: ColunaSala
  primeira: boolean
  perfis: Map<string, Profile>
  agora: number
  celular: boolean
}) {
  const etapa = col.etapa as LeadFunnelStage
  const conf = STAGE_THEME[etapa]
  const [ref, cabem] = useCapacidade(col.cartoes, !celular)
  const visiveis = col.cartoes.slice(0, cabem)
  const resto = col.cartoes.slice(cabem)
  const restoVgv = resto.reduce((t, c) => t + c.vgv, 0)
  const venda = etapa === 'venda'
  const d: DinheiroSala = col.dinheiro
  const frios = venda ? 0 : col.cartoes.filter(c => esfriando(c, agora)).length

  return (
    <div className={`flex flex-col min-h-0 min-w-0 ${celular ? 'w-[86vw] shrink-0 snap-start' : ''}`}
         style={{ ['--etapa' as string]: JOIA[etapa].medio, ['--etapa-fundo' as string]: fundoJoiaClaro(etapa, 120) }}>
      <div className="flex flex-col flex-1 min-h-0 kanban-col">
        {/* Cabeçalho: a seta da trilha e, embaixo, o dinheiro da coluna */}
        <div className="kanban-cabeca kanban-col-bg shrink-0 pb-2 mb-1.5">
          <div className={`kanban-trilha ${primeira ? 'kanban-trilha-primeira' : ''} flex items-center gap-2 h-10 pl-6 pr-7 text-white`}
               style={primeira ? { paddingLeft: 14 } : undefined}>
            <h3 className="text-[13.5px] font-semibold tracking-[0.01em] truncate">{venda ? 'Vendas do mês' : conf.columnLabel}</h3>
            <span className="ml-auto inline-flex items-center justify-center min-w-[24px] h-[20px] px-1.5 rounded-full bg-white/25 text-[12px] font-bold tabular-nums">
              {col.cartoes.length}
            </span>
          </div>
          <div className="px-2 pt-2.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-t4">{venda ? 'VGV vendido' : 'VGV'}</p>
            <p className="font-display text-[19px] font-bold text-t1 leading-tight tracking-[-0.02em] tabular-nums">{rs(d.vgv)}</p>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <div className="min-w-0">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-success/80 truncate">Corretor</p>
                <p className="text-[13.5px] font-bold text-success leading-tight tabular-nums">{rs(d.corretor)}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-brand-text/80 truncate">Souza</p>
                <p className="text-[13.5px] font-bold text-brand-text leading-tight tabular-nums">{rs(d.souza)}</p>
              </div>
            </div>
          </div>
          {frios > 0 && (
            <div className="px-2 pt-1">
              <span className="inline-flex items-center gap-1 text-[12px] text-warning tabular-nums">
                <Snowflake size={11} strokeWidth={1.8} aria-hidden />{frios} esfriando
              </span>
            </div>
          )}
        </div>

        {/* Os cartões */}
        <div ref={ref} className={`rounded-[14px] p-1.5 flex flex-col ${celular ? 'max-h-[64vh] overflow-y-auto' : 'flex-1 min-h-0 overflow-hidden'}`}
             style={{ gap: VAO }}>
          {col.cartoes.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1.5 rounded-[12px] px-3 py-8">
              <p className="text-xs text-t4 text-center leading-snug">
                {venda ? 'Nenhuma venda no mês ainda' : `Nada em ${conf.columnLabel.toLowerCase()}`}
              </p>
            </div>
          ) : (
            <>
              {visiveis.map(c => <Cartao key={c.id} c={c} dono={c.brokerId ? perfis.get(c.brokerId) : undefined} agora={agora} pctDe={pctDe} />)}
              {resto.length > 0 && (
                <div className="shrink-0 rounded-[12px] px-3 flex items-center justify-between gap-2 border border-dashed"
                     style={{ height: RODAPE_H, borderColor: 'color-mix(in srgb, var(--etapa) 30%, transparent)', background: 'color-mix(in srgb, var(--etapa) 6%, transparent)' }}>
                  <span className="text-[13px] font-bold tabular-nums" style={{ color: 'var(--etapa)' }}>
                    + {resto.length.toLocaleString('pt-BR')} {resto.length === 1 ? 'lead' : 'leads'}
                  </span>
                  {restoVgv > 0 && <span className="text-[12.5px] font-semibold text-t2 tabular-nums">{rs(restoVgv)}</span>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Placar — os chips do topo do Kanban de Leads ─────────────────────────────

function Placar({ rotulo, valor, cor, fundo, destaque = false, foto, nota }: {
  rotulo: string; valor: number; cor: string; fundo?: string; destaque?: boolean
  foto?: { nome: string; url?: string }
  nota?: string
}) {
  return (
    <div className="flex-shrink-0 flex items-center gap-3 rounded-[14px] border border-line bg-surface pl-2.5 pr-4 py-2">
      {foto ? (
        <FotoPerfil nome={foto.nome} url={foto.url} tamanho={36} />
      ) : (
        <span className="flex-shrink-0 w-9 h-9 rounded-[11px] flex items-center justify-center text-white" style={{ backgroundImage: fundo }} aria-hidden>
          <Sparkles size={16} strokeWidth={2} />
        </span>
      )}
      <div className="min-w-0">
        <p className="text-[11.5px] font-medium text-t3 leading-tight truncate">
          {rotulo}{nota && <span className="text-t4"> · {nota}</span>}
        </p>
        <p className={`font-display ${destaque ? 'text-[21px]' : 'text-[19px]'} font-bold leading-tight tracking-[-0.02em] tabular-nums`} style={{ color: cor }}>
          {rs(valor)}
        </p>
      </div>
    </div>
  )
}

// ─── A tela ───────────────────────────────────────────────────────────────────

export function KanbanDaSala({ cartoes, erro, pctProduto, perfis, agora, direita, giro, celular = false }: {
  cartoes: CartaoSala[] | null
  erro: string | null
  pctProduto: Record<string, number>
  perfis: Profile[]
  agora: number
  /** status da conexão e relógio (os mesmos da sala) */
  direita: ReactNode
  /** o botão do giro */
  giro: ReactNode
  celular?: boolean
}) {
  const porId = useMemo(() => new Map(perfis.map(p => [p.id, p])), [perfis])
  const shareDe = useMemo(() => (id: string | null) => (id ? porId.get(id)?.commissionShare ?? null : null), [porId])
  const pctDe = useMemo(() => (id: string | null) => (id ? pctProduto[id] : undefined), [pctProduto])

  const colunas = useMemo(() => (cartoes ? colunasDaSala(cartoes, shareDe, pctDe) : null), [cartoes, shareDe, pctDe])

  // O placar do Kanban: o que está em jogo nos leads em aberto (fora Venda)
  const placar = useMemo(() => {
    if (!cartoes) return null
    const abertos = cartoes.filter(c => c.etapa !== 'venda')
    let total: DinheiroSala = DINHEIRO_ZERO
    const porCorretor = new Map<string, number>()
    for (const c of abertos) {
      const d = dinheiroDoCartao(c, shareDe, pctDe)
      total = somar(total, d)
      if (c.brokerId && d.corretor > 0) porCorretor.set(c.brokerId, (porCorretor.get(c.brokerId) ?? 0) + d.corretor)
    }
    const corretores = [...porCorretor.entries()]
      .map(([id, valor]) => ({ p: porId.get(id), valor }))
      .filter((x): x is { p: Profile; valor: number } => !!x.p)
      .sort((a, b) => b.valor - a.valor)
    return { n: abertos.length, total, corretores }
  }, [cartoes, shareDe, pctDe, porId])

  const faixa = (
    <section className={`pulse-marinho relative shrink-0 overflow-hidden ${celular ? 'rounded-[24px] px-4 py-4' : 'rounded-[26px] px-8 py-5'}`}>
      <div className="pulse-luzes" aria-hidden />
      <div className="relative flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-3.5">
          <span className={`flex items-center justify-center rounded-[14px] bg-brand-fill ${celular ? 'h-11 w-11' : 'h-12 w-12'}`} aria-hidden>
            <LayoutGrid size={celular ? 22 : 25} strokeWidth={2.2} className="text-brand-fill-text" />
          </span>
          <span className="leading-tight">
            <span className={`block font-display font-semibold uppercase tracking-[0.2em] ${celular ? 'text-[11px]' : 'text-[15px]'}`} style={{ color: 'var(--m-t3)' }}>Pulse · Souza</span>
            <h1 className={`font-display font-extrabold tracking-[-0.035em] ${celular ? 'text-[22px]' : 'text-[30px]'}`} style={{ color: 'var(--m-t1)' }}>
              {destacar('O Kanban da *imobiliária*')}
            </h1>
          </span>
        </div>
        {!celular && <div className="ml-4">{giro}</div>}
        <div className={celular ? 'w-full flex items-center gap-2' : 'ml-auto'}>{direita}</div>
      </div>
    </section>
  )

  const chips = placar && (
    <div className={`flex items-stretch gap-2 ${celular ? 'overflow-x-auto -mx-3 px-3 pb-1' : 'flex-wrap'}`}>
      <Placar rotulo="VGV" nota={`${placar.n} leads em aberto`} valor={placar.total.vgv} cor="var(--t1)" fundo={degradeJoiaClaro('lead')} />
      <Placar rotulo="Comissão geral"
              nota={placar.total.vgv ? `${(placar.total.bruta / placar.total.vgv * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% do VGV` : '5% do VGV'}
              valor={placar.total.bruta} cor="var(--t1)" fundo={degradeJoiaClaro('atendimento')} />
      <Placar rotulo="Líquida Souza" valor={placar.total.souza} cor="var(--brand-text)" destaque fundo={degradeJoiaClaro('proposta')} />
      {placar.corretores.map(x => (
        <Placar key={x.p.id} rotulo={`Líquida ${x.p.name.split(' ')[0]}`} nota={x.p.commissionShare ? `${x.p.commissionShare}%` : undefined}
                valor={x.valor} cor="#16A34A" destaque foto={{ nome: x.p.name, url: x.p.avatarUrl }} />
      ))}
    </div>
  )

  const quadro = erro ? (
    <p className="flex items-center gap-2 rounded-[14px] border border-error-line bg-error-bg px-4 py-3 text-[16px] text-t1" role="alert">
      <AlertTriangle size={18} strokeWidth={1.8} className="text-error" aria-hidden />
      Não consegui ler o Kanban: {erro}
    </p>
  ) : !colunas ? (
    <div className={celular ? 'h-[420px] rounded-[20px] shimmer' : 'flex-1 min-h-0 grid grid-cols-6 gap-3'} aria-busy="true">
      {!celular && Array.from({ length: 6 }, (_, i) => <div key={i} className="rounded-[16px] shimmer" />)}
    </div>
  ) : (
    <div className={celular
      ? 'flex items-start gap-3 overflow-x-auto snap-x snap-mandatory -mx-3 px-3 pb-2'
      : 'flex-1 min-h-0 grid gap-3'}
         style={celular ? undefined : { gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
      {colunas.map((col, i) => (
        <Coluna key={col.etapa} col={col} primeira={i === 0} perfis={porId} agora={agora} celular={celular} pctDe={pctDe} />
      ))}
    </div>
  )

  if (celular) {
    return <>{faixa}{chips}{quadro}</>
  }

  // TV: o quadro (placar + colunas) desenhado maior e reduzido para caber
  return (
    <>
      {faixa}
      <div className="relative flex-1 min-h-0">
        <div className="absolute left-0 top-0 flex flex-col gap-3"
             style={{
               width: `${100 / ESCALA_QUADRO}%`, height: `${100 / ESCALA_QUADRO}%`,
               transform: `scale(${ESCALA_QUADRO})`, transformOrigin: '0 0',
             }}>
          {chips}
          {quadro}
        </div>
      </div>
    </>
  )
}
