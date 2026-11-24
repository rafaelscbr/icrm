import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { AlertTriangle, LayoutGrid, Activity, ArrowRight, AlarmClock } from 'lucide-react'
import type { LeadFunnelStage } from '../../../types'
import { MAX_TENTATIVAS_FOLLOWUP } from '../../../types'
import type { Profile } from '../../../store/useAuthStore'
import { STAGE_THEME } from '../../../lib/stageTheme'
import { BRILHO_CHAMPANHE, JOIA, degradeJoia } from '../../../lib/paletaJoia'
import { formatCurrencyRound } from '../../../lib/formatters'
import { FotoPerfil } from '../../../components/shared/FotoPerfil'
import { destacar } from '../../../components/shared/Destaque'
import { ESFRIANDO_DIAS, tomDoContato, TOM_CONTATO } from '../../leads/contato'
import { useRelogio } from '../useKiosk'
import { colunasDaSala, dinheiroDoCartao, DINHEIRO_ZERO, somar, VIVO_MS } from '../kanbanDaSala'
import type { CartaoSala, ColunaSala, DinheiroSala } from '../kanbanDaSala'

/**
 * A segunda tela do Pulse (23/11/2026): o Kanban da imobiliária inteira. Gira
 * com a sala a cada 5 minutos (PulsePage).
 *
 * DESENHO (24/11/2026, "melhora o Kanban do Pulse, você já sabe como eu
 * gosto"): a pegada da dashboard, feita para ler de longe.
 *   • A faixa Marinho traz o dinheiro em jogo — VGV em aberto, comissão,
 *     líquida Souza em ouro — e a parte de cada corretor com a foto.
 *   • Cada coluna é um painel branco com a JOIA da etapa no topo (o degradê
 *     da paleta joia + o brilho champanhe do card da meta): quantos, quanto
 *     e quantos atrasados (a régua de 24 h do Kanban de Leads).
 *   • O lead é uma PÍLULA: foto do dono, nome, VGV, o último contato (em
 *     vermelho quando atrasado) e o produto; no followup, os toques sempre à
 *     vista. Antes eram cartões de 136 px e cabiam três por coluna.
 *   • Quem mexeu agora (VIVO_MS) vira pílula Marinho com "agora" — o
 *     holofote da sala, no quadro.
 *   • Coluna vazia continua aberta, só mais estreita (PESO_VAZIA): o espaço
 *     vai para onde há leads. Nada de recolher coluna.
 * Fica de fora o que é de clicar (Chamar, atalhos, arrastar): a TV é para
 * olhar.
 *
 * Os dados vêm do store do Pulse (kanbanDaSala.ts): uma leitura e depois só
 * os eventos do canal. Esta tela não consulta nada.
 */

/** alturas fixas da pílula: a coluna sabe quantas cabem sem medir uma a uma */
const PILULA_H = 60
const PILULA_FOLLOWUP_H = 74
const RODAPE_H = 44
const VAO = 8
const DIA = 86_400_000

const rs = (v: number) => formatCurrencyRound(v)
const alturaDe = (c: CartaoSala) => (c.etapa === 'followup' ? PILULA_FOLLOWUP_H : PILULA_H)

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

// ─── Pílula — o lead, em uma linha e meia ─────────────────────────────────────

/** "Contato há 3 h" · "Sem contato há 2 dias" — curto, para caber na pílula. */
function contatoCurto(c: CartaoSala, agora: number): string {
  const ref = c.ultimoContatoAt ?? c.criadoEm
  const ms = Math.max(0, agora - new Date(ref).getTime())
  const h = Math.floor(ms / 3_600_000)
  const d = Math.floor(ms / DIA)
  const tempo = h < 1 ? 'agora' : h < 24 ? `há ${h} h` : `há ${d} ${d === 1 ? 'dia' : 'dias'}`
  if (!c.ultimoContatoAt) return h < 1 ? 'Sem contato ainda' : `Sem contato ${tempo}`
  return h < 1 ? 'Contato agora' : `Contato ${tempo}`
}

function Pilula({ c, dono, agora }: { c: CartaoSala; dono?: Profile; agora: number }) {
  const vivo = c.vivoAt !== undefined && agora - c.vivoAt < VIVO_MS
  const venda = c.etapa === 'venda'
  // O mesmo destaque de followup atrasado do Kanban de Leads (contato.ts, +24h)
  const tom = vivo ? null : tomDoContato({ lastContactAt: c.ultimoContatoAt, createdAt: c.criadoEm, funnelStage: c.etapa }, agora)
  const dias = Math.max(0, Math.floor((agora - new Date(c.desde).getTime()) / DIA))
  return (
    <div className={`pulse-kanban-pilula pulse-cartao relative shrink-0 flex flex-col justify-center px-3 ${vivo ? 'marinho pulse-cartao-vivo' : ''} ${tom ? TOM_CONTATO[tom].classe : ''}`}
         style={{ height: alturaDe(c), ['--etapa' as string]: JOIA[c.etapa].claro }}>
      <div className="flex items-center gap-2.5 min-w-0">
        <FotoPerfil nome={dono?.name ?? '?'} url={dono?.avatarUrl} tamanho={34} anel={vivo} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 min-w-0">
            <p className="flex-1 min-w-0 font-heading text-[14.5px] font-semibold text-t1 truncate leading-tight tracking-[-0.015em]">{c.nome}</p>
            {c.vgv > 0 && <p className="shrink-0 text-[13px] font-bold text-t1 tabular-nums leading-tight">{rs(c.vgv)}</p>}
          </div>
          <p className="mt-[3px] flex items-center gap-1.5 min-w-0 text-[12px] leading-tight">
            {vivo && <span className="pulse-equipe-agora pulse-kanban-agora shrink-0">agora</span>}
            {venda
              ? <span className="truncate text-t3">{c.produto ?? 'Sem produto'} · vendido há {dias} {dias === 1 ? 'dia' : 'dias'}</span>
              : <>
                  <span className="kanban-frase shrink-0 text-t2">{tom && <AlarmClock size={11} strokeWidth={2.2} className="inline-block align-[-1px] mr-0.5" aria-hidden />}{contatoCurto(c, agora)}</span>
                  <span className="truncate text-t4">· {c.produto ?? 'sem produto'}</span>
                </>}
          </p>
        </div>
      </div>

      {/* Os toques do followup, sempre à vista */}
      {c.etapa === 'followup' && (
        <div className="flex items-center gap-[3px] mt-2 pl-[44px]" aria-label={`${c.passo} de ${MAX_TENTATIVAS_FOLLOWUP} tentativas`}>
          {Array.from({ length: MAX_TENTATIVAS_FOLLOWUP }, (_, k) => k + 1).map(step => (
            <span key={step} className="flex-1 h-[4px] rounded-full" style={{ background: step <= c.passo ? 'var(--etapa)' : 'var(--line-strong)' }} />
          ))}
          <span className="shrink-0 ml-1.5 text-[11px] font-semibold text-t3 tabular-nums">{c.passo}/{MAX_TENTATIVAS_FOLLOWUP}</span>
        </div>
      )}
    </div>
  )
}

// ─── Coluna — a joia da etapa em cima, as pílulas embaixo ────────────────────

/** Quantas pílulas cabem na altura da coluna (TV); no celular, todas. */
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
  let usado = 0, n = 0
  for (const c of cartoes) {
    const prox = usado + (n > 0 ? VAO : 0) + alturaDe(c)
    if (prox > h) break
    usado = prox; n++
  }
  if (n === cartoes.length) return [ref, n]
  // Não cabe tudo: abre lugar para o rodapé "+ N leads".
  while (n > 0 && usado + VAO + RODAPE_H > h) {
    n--
    usado = cartoes.slice(0, n).reduce((t, c, k) => t + alturaDe(c) + (k > 0 ? VAO : 0), 0)
  }
  return [ref, n]
}

function Coluna({ col, perfis, agora, celular }: {
  col: ColunaSala
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
  const atrasados = venda ? 0 : col.cartoes.filter(c => esfriando(c, agora)).length
  const vazia = col.cartoes.length === 0

  return (
    <section className={`pulse-card pulse-kanban-col flex flex-col min-h-0 min-w-0 p-2 ${celular ? 'w-[84vw] shrink-0 snap-start' : ''}`}
             style={{ ['--etapa' as string]: JOIA[etapa].medio }} aria-label={`${venda ? 'Vendas do mês' : conf.columnLabel}: ${col.cartoes.length}`}>
      {/* A joia da etapa: quantos, quanto e — se houver — quantos atrasados */}
      <header className="pulse-kanban-joia shrink-0 px-4 pt-3 pb-3.5"
              style={{ backgroundImage: `${BRILHO_CHAMPANHE}, ${degradeJoia(etapa)}` }}>
        <div className="flex items-start gap-2">
          <p className="min-w-0 text-[12.5px] font-bold uppercase tracking-[0.14em] leading-tight pulse-kanban-joia-titulo pt-1 line-clamp-2">{venda ? 'Vendas do mês' : conf.columnLabel}</p>
          <p className="ml-auto font-display text-[34px] leading-none font-extrabold tracking-[-0.04em] text-white tabular-nums">{col.cartoes.length}</p>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 min-w-0">
          <p className="min-w-0 font-display text-[19px] font-bold leading-tight tracking-[-0.02em] text-white tabular-nums truncate">
            {rs(d.vgv)} <span className="text-[12px] font-semibold tracking-normal pulse-kanban-joia-nota">{venda ? 'vendido' : 'VGV'}</span>
          </p>
          {atrasados > 0 && (
            <span className="pulse-kanban-atrasados ml-auto shrink-0" title="Sem contato há mais de 24 horas">
              <AlarmClock size={12} strokeWidth={2.2} aria-hidden />{atrasados} {atrasados === 1 ? 'atrasado' : 'atrasados'}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[12px] tabular-nums truncate pulse-kanban-joia-nota">
          Corretor {rs(d.corretor)} · Souza {rs(d.souza)}
        </p>
      </header>

      {/* As pílulas */}
      <div ref={ref} className={`mt-2 flex flex-col ${celular ? 'max-h-[62vh] overflow-y-auto pb-1' : 'flex-1 min-h-0 overflow-hidden'}`}
           style={{ gap: VAO }}>
        {vazia ? (
          <div className="pulse-kanban-resto shrink-0 flex items-center justify-center px-3 text-center" style={{ height: PILULA_H }}>
            <p className="text-[13px] text-t3 leading-snug">{venda ? 'Nenhuma venda no mês ainda' : `Ninguém em ${conf.columnLabel.toLowerCase()} agora`}</p>
          </div>
        ) : (
          <>
            {visiveis.map(c => <Pilula key={c.id} c={c} dono={c.brokerId ? perfis.get(c.brokerId) : undefined} agora={agora} />)}
            {resto.length > 0 && (
              <div className="pulse-kanban-resto shrink-0 flex items-center justify-between gap-2 px-4" style={{ height: RODAPE_H }}>
                <span className="text-[13.5px] font-bold tabular-nums" style={{ color: 'var(--etapa)' }}>
                  + {resto.length.toLocaleString('pt-BR')} {resto.length === 1 ? 'lead' : 'leads'}
                </span>
                {restoVgv > 0 && <span className="text-[13px] font-semibold text-t2 tabular-nums">{rs(restoVgv)}</span>}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}

// ─── O dinheiro em jogo, na faixa Marinho ─────────────────────────────────────

function NumeroDaFaixa({ rotulo, valor, nota, ouro = false, celular }: {
  rotulo: string; valor: string; nota?: string; ouro?: boolean; celular: boolean
}) {
  return (
    <div className="min-w-0">
      <p className={`font-label uppercase tracking-[0.14em] truncate ${celular ? 'text-[11px]' : 'text-[12.5px]'}`} style={{ color: 'var(--m-t3)' }}>{rotulo}</p>
      <p className={`mt-1 font-display leading-[0.95] font-extrabold tracking-[-0.04em] tabular-nums whitespace-nowrap ${celular ? 'text-[23px]' : 'text-[38px]'}`}
         style={{ color: ouro ? 'var(--m-ouro)' : 'var(--m-t1)' }}>
        {valor}
      </p>
      {nota && <p className={`mt-1.5 truncate ${celular ? 'text-[12px]' : 'text-[14px]'}`} style={{ color: 'var(--m-t2)' }}>{nota}</p>}
    </div>
  )
}

// ─── A tela ───────────────────────────────────────────────────────────────────

/**
 * Largura da coluna na TV: a etapa vazia continua aberta (com a joia e o
 * aviso), só mais estreita — o espaço vai para onde há leads.
 */
const PESO_VAZIA = 0.72
const PESO_CHEIA = 1.3

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

  // O placar: o que está em jogo nos leads em aberto (fora Venda)
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

  const pctComissao = placar && placar.total.vgv
    ? `${(placar.total.bruta / placar.total.vgv * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% do VGV`
    : '5% do VGV'

  const numeros = placar && (
    <div className={`relative ${celular ? 'mt-3 pt-3 grid grid-cols-2 gap-x-4 gap-y-4' : 'mt-4 pt-4 flex items-stretch gap-0'}`}
         style={{ borderTop: '1px solid var(--m-line)' }}>
      {[
        { rotulo: 'Em jogo', valor: rs(placar.total.vgv), nota: `VGV de ${placar.n} leads em aberto` },
        { rotulo: 'Comissão geral', valor: rs(placar.total.bruta), nota: pctComissao },
        { rotulo: 'Líquida Souza', valor: rs(placar.total.souza), nota: 'o que fica na casa', ouro: true },
      ].map((n, k) => (
        <div key={n.rotulo} className={celular ? `min-w-0 ${k === 0 ? 'col-span-2' : ''}` : `min-w-0 flex-1 pr-6 ${k > 0 ? 'pl-6' : ''}`}
             style={!celular && k > 0 ? { borderLeft: '1px solid var(--m-line)' } : undefined}>
          <NumeroDaFaixa {...n} celular={celular} />
        </div>
      ))}
      {placar.corretores.length > 0 && (
        <div className={celular ? 'col-span-2 grid grid-cols-2 gap-2' : 'flex items-stretch gap-3 pl-6'}
             style={!celular ? { borderLeft: '1px solid var(--m-line)' } : undefined}>
          {placar.corretores.map(x => (
            <div key={x.p.id} className={`dash-vidro flex items-center gap-3 ${celular ? 'px-3 py-2.5' : 'px-4 py-3 min-w-[230px]'}`}>
              <FotoPerfil nome={x.p.name} url={x.p.avatarUrl} tamanho={celular ? 38 : 50} className="dash-foto" />
              <div className="min-w-0">
                <p className={`truncate ${celular ? 'text-[12px]' : 'text-[13.5px]'}`} style={{ color: 'var(--m-t2)' }}>
                  {x.p.name.split(' ')[0]}{x.p.commissionShare ? <span style={{ color: 'var(--m-t3)' }}> · {x.p.commissionShare}%</span> : null}
                </p>
                <p className={`font-display font-extrabold tracking-[-0.03em] tabular-nums leading-tight ${celular ? 'text-[19px]' : 'text-[26px]'}`} style={{ color: 'var(--m-ok)' }}>
                  {rs(x.valor)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const faixa = (
    <section className={`pulse-marinho relative shrink-0 overflow-hidden ${celular ? 'rounded-[24px] px-4 py-4' : 'pulse-palco-hero px-9 pt-5 pb-6'}`}>
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
      {numeros}
    </section>
  )

  const quadro = erro ? (
    <p className="flex items-center gap-2 rounded-[14px] border border-error-line bg-error-bg px-4 py-3 text-[16px] text-t1" role="alert">
      <AlertTriangle size={18} strokeWidth={1.8} className="text-error" aria-hidden />
      Não consegui ler o Kanban: {erro}
    </p>
  ) : !colunas ? (
    <div className={celular ? 'h-[420px] rounded-[24px] shimmer' : 'flex-1 min-h-0 grid grid-cols-6 gap-3'} aria-busy="true">
      {!celular && Array.from({ length: 6 }, (_, k) => <div key={k} className="rounded-[26px] shimmer" />)}
    </div>
  ) : (
    <div className={celular
      ? 'flex items-start gap-3 overflow-x-auto snap-x snap-mandatory -mx-3 px-3 pb-2'
      : 'flex-1 min-h-0 grid gap-3'}
         style={celular ? undefined : {
           gridTemplateColumns: colunas.map(c => `minmax(0, ${c.cartoes.length ? PESO_CHEIA : PESO_VAZIA}fr)`).join(' '),
         }}>
      {colunas.map(col => (
        <Coluna key={col.etapa} col={col} perfis={porId} agora={agora} celular={celular} />
      ))}
    </div>
  )

  return <>{faixa}{quadro}</>
}
