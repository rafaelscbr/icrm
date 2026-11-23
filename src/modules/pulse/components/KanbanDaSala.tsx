import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { AlertTriangle, LayoutGrid, Activity, ArrowRight, ChevronRight, Inbox, Trophy } from 'lucide-react'
import type { LeadFunnelStage } from '../../../types'
import type { Profile } from '../../../store/useAuthStore'
import { STAGE_THEME } from '../../../lib/stageTheme'
import { JOIA, degradeJoiaClaro } from '../../../lib/paletaJoia'
import { formatCurrencyRound } from '../../../lib/formatters'
import { FotoPerfil } from '../../../components/shared/FotoPerfil'
import { destacar } from '../../../components/shared/Destaque'
import { useRelogio } from '../useKiosk'
import { colunasDaSala, dinheiroDoCartao, DINHEIRO_ZERO, somar } from '../kanbanDaSala'
import type { CartaoSala, ColunaSala, DinheiroSala } from '../kanbanDaSala'

/**
 * A segunda tela do Pulse (23/11/2026): o Kanban da imobiliária inteira, na
 * trilha colorida do Kanban de Leads, com o dinheiro de cada coluna e de cada
 * corretor. Gira com a sala a cada 5 minutos (PulsePage).
 *
 * Os dados vêm do store do Pulse (kanbanDaSala.ts): uma leitura e depois só
 * os eventos do canal. Esta tela não consulta nada.
 *
 * Desenho: a faixa Marinho em cima com o placar (o que está em jogo e a parte
 * de cada corretor, com a foto); embaixo, as seis colunas. Cada coluna mostra
 * os cartões que cabem — o mais recente em cima — e diz quantos ficaram de
 * fora e quanto valem. Cartão que mexeu ao vivo acende na cor da etapa.
 */

const CARTAO_H = 76
const VAO = 8
/** quanto tempo o cartão que mexeu fica marcado como "agora" */
const VIVO_MS = 2 * 60 * 1000

const rs = (v: number) => formatCurrencyRound(v)

function diasNaEtapa(desde: string, agora: number): string {
  const d = Math.floor((agora - new Date(desde).getTime()) / 86_400_000)
  if (d <= 0) return 'hoje'
  if (d === 1) return '1 dia'
  return `${d} dias`
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

// ─── Cartão ───────────────────────────────────────────────────────────────────

function Cartao({ c, dono, agora }: { c: CartaoSala; dono?: Profile; agora: number }) {
  const vivo = c.vivoAt !== undefined && agora - c.vivoAt < VIVO_MS
  return (
    <li className={`pulse-card pulse-cartao relative rounded-[16px] px-3 flex items-center gap-3 ${vivo ? 'pulse-cartao-vivo' : ''}`}
        style={{ height: CARTAO_H, ['--etapa' as string]: JOIA[c.etapa].medio }}>
      <FotoPerfil nome={dono?.name ?? '?'} url={dono?.avatarUrl} tamanho={42} anel
                  className="shadow-[0_3px_8px_-3px_rgba(15,39,89,.45)]" />
      <div className="flex-1 min-w-0 leading-tight">
        <p className="font-heading text-[15.5px] font-semibold text-t1 truncate tracking-[-0.015em]">{c.nome}</p>
        <p className="mt-0.5 text-[12.5px] text-t3 truncate">{c.produto ?? 'Sem produto'}</p>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p className="text-[14px] font-bold text-t1 tabular-nums tracking-[-0.01em]">{c.vgv > 0 ? rs(c.vgv) : <span className="font-medium text-t4">sem VGV</span>}</p>
          {vivo
            ? <span className="shrink-0 rounded-full px-2 text-[10.5px] leading-[18px] font-bold uppercase tracking-[0.08em] text-white" style={{ background: JOIA[c.etapa].medio }}>agora</span>
            : <span className="shrink-0 rounded-full px-2 text-[11.5px] leading-[18px] font-medium text-t3 tabular-nums bg-s2">{diasNaEtapa(c.desde, agora)}</span>}
        </div>
      </div>
    </li>
  )
}

// ─── Coluna ───────────────────────────────────────────────────────────────────

/** Quantos cartões cabem na altura que a coluna tem (TV); no celular, todos. */
function useCapacidade(total: number, ativo: boolean): [RefObject<HTMLUListElement | null>, number] {
  const ref = useRef<HTMLUListElement>(null)
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
  if (!ativo) return [ref, total]
  if (h === 0) return [ref, 0]
  const cabem = Math.floor((h + VAO) / (CARTAO_H + VAO))
  // Se não couber tudo, um lugar vira o rodapé "+ N leads".
  return [ref, total <= cabem ? total : Math.max(0, cabem - 1)]
}

/**
 * Uma raia por etapa (redesenho de 23/11/2026, "mais bonito na TV"): a raia
 * inteira levemente tingida da cor da etapa, a cabeça como uma joia (o degradê
 * claro da paleta, texto branco: nome, quantos, o VGV grande e a divisão), e
 * os cartões brancos por cima. Entre uma cabeça e a próxima, uma seta — a
 * trilha do funil continua legível sem a faixa recortada.
 */
function Coluna({ col, ultima, perfis, agora, celular }: {
  col: ColunaSala
  ultima: boolean
  perfis: Map<string, Profile>
  agora: number
  celular: boolean
}) {
  const etapa = col.etapa as LeadFunnelStage
  const j = JOIA[etapa]
  const [ref, cabem] = useCapacidade(col.cartoes.length, !celular)
  const visiveis = col.cartoes.slice(0, cabem)
  const resto = col.cartoes.slice(cabem)
  const restoVgv = resto.reduce((t, c) => t + c.vgv, 0)
  const venda = etapa === 'venda'
  const d: DinheiroSala = col.dinheiro
  const nome = venda ? 'Vendas do mês' : STAGE_THEME[etapa].columnLabel

  return (
    <div className={`relative flex flex-col min-h-0 min-w-0 rounded-[24px] p-2 ${celular ? 'w-[82vw] shrink-0 snap-start' : ''}`}
         style={{
           ['--etapa' as string]: j.medio,
           background: `linear-gradient(180deg, color-mix(in srgb, ${j.medio} 11%, var(--surface)) 0%, color-mix(in srgb, ${j.medio} 5%, transparent) 100%)`,
           border: `1px solid color-mix(in srgb, ${j.medio} 16%, transparent)`,
         }}>
      {/* a cabeça da raia: a joia da etapa */}
      <header className="relative shrink-0 rounded-[18px] px-4 pt-3 pb-3.5 text-white"
              style={{ backgroundImage: degradeJoiaClaro(etapa, 140), boxShadow: `0 12px 24px -14px ${j.fundo}` }}>
        <div className="flex items-center gap-2">
          <h3 className="font-display text-[13px] font-bold uppercase tracking-[0.14em] truncate text-white/90">{nome}</h3>
          <span className="ml-auto inline-flex items-center justify-center min-w-[32px] h-[26px] px-2 rounded-full bg-white/20 text-[15px] font-extrabold tabular-nums">
            {col.cartoes.length}
          </span>
        </div>
        <p className="mt-1.5 font-display text-[27px] font-extrabold tabular-nums leading-none tracking-[-0.03em]">{rs(d.vgv)}</p>
        <p className="mt-0.5 text-[11.5px] font-medium text-white/70">{venda ? 'VGV vendido' : 'VGV em jogo'}</p>
        <div className="mt-2.5 pt-2.5 grid grid-cols-2 gap-2 border-t border-white/20">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-white/65">Corretores</p>
            <p className="text-[14.5px] font-bold tabular-nums leading-tight">{rs(d.corretor)}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-white/65">Souza</p>
            <p className="text-[14.5px] font-bold tabular-nums leading-tight" style={{ color: '#F6E3B8' }}>{rs(d.souza)}</p>
          </div>
        </div>
        {/* a seta para a próxima etapa */}
        {!ultima && !celular && (
          <span className="absolute top-1/2 -right-[30px] z-10 -translate-y-1/2 flex h-[26px] w-[26px] items-center justify-center rounded-full bg-surface"
                style={{ boxShadow: '0 2px 8px -2px rgba(15,39,89,.35)', color: j.medio }} aria-hidden>
            <ChevronRight size={17} strokeWidth={2.6} />
          </span>
        )}
      </header>

      {/* os cartões */}
      <ul ref={ref} className={`mt-2 flex flex-col min-h-0 ${celular ? 'max-h-[62vh] overflow-y-auto pb-1' : 'flex-1 overflow-hidden'}`} style={{ gap: VAO }}>
        {col.cartoes.length === 0 ? (
          <li className="flex-1 min-h-[160px] flex flex-col items-center justify-center gap-3 text-center px-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-full"
                  style={{ background: `color-mix(in srgb, ${j.medio} 12%, transparent)`, color: j.medio }} aria-hidden>
              {venda ? <Trophy size={24} strokeWidth={1.8} /> : <Inbox size={24} strokeWidth={1.8} />}
            </span>
            <p className="text-[14.5px] font-medium text-t3 leading-snug">
              {venda ? 'Nenhuma venda no mês ainda' : `Ninguém em ${nome.toLowerCase()} agora`}
            </p>
          </li>
        ) : (
          <>
            {visiveis.map(c => <Cartao key={c.id} c={c} dono={c.brokerId ? perfis.get(c.brokerId) : undefined} agora={agora} />)}
            {resto.length > 0 && (
              <li className="shrink-0 rounded-[16px] px-4 flex items-center justify-between gap-2 bg-surface/70"
                  style={{ height: CARTAO_H - 22, border: `1px dashed color-mix(in srgb, ${j.medio} 35%, transparent)` }}>
                <span className="text-[14.5px] font-bold tabular-nums" style={{ color: j.medio }}>
                  + {resto.length.toLocaleString('pt-BR')} {resto.length === 1 ? 'lead' : 'leads'}
                </span>
                {restoVgv > 0 && <span className="text-[13.5px] font-semibold text-t2 tabular-nums">{rs(restoVgv)}</span>}
              </li>
            )}
          </>
        )}
      </ul>
    </div>
  )
}

// ─── Placar (faixa Marinho) ───────────────────────────────────────────────────

function Numero({ rotulo, valor, nota, cor, pequeno = false, className = '' }: {
  rotulo: string; valor: string; nota?: string; cor?: string
  /** celular: número menor, para dois caberem lado a lado */
  pequeno?: boolean
  className?: string
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="font-display text-[13px] font-semibold uppercase tracking-[0.14em] whitespace-nowrap" style={{ color: 'var(--m-t3)' }}>{rotulo}</p>
      <p className={`mt-1 font-display ${pequeno ? 'text-[24px]' : 'text-[34px]'} font-extrabold tabular-nums leading-none tracking-[-0.03em] whitespace-nowrap`} style={{ color: cor ?? 'var(--m-t1)' }}>{valor}</p>
      {nota && <p className="mt-1.5 text-[13.5px] whitespace-nowrap" style={{ color: 'var(--m-t2)' }}>{nota}</p>}
    </div>
  )
}

function CorretorNoPlacar({ p, liquida, leads, vgv, celular }: { p: Profile; liquida: number; leads: number; vgv: number; celular: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-[18px] pl-2 pr-4 py-2 ${celular ? 'shrink-0' : ''}`}
         style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid var(--m-line)' }}>
      <FotoPerfil nome={p.name} url={p.avatarUrl} tamanho={celular ? 40 : 48} className="ring-2 ring-white/70" />
      <div className="leading-tight min-w-0">
        <p className="text-[14px] font-semibold whitespace-nowrap" style={{ color: 'var(--m-t1)' }}>
          {p.name.split(' ')[0]}
          {p.commissionShare ? <span className="ml-1.5 text-[12px] font-medium" style={{ color: 'var(--m-t3)' }}>{p.commissionShare}%</span> : null}
        </p>
        <p className="mt-0.5 font-display text-[20px] font-extrabold tabular-nums whitespace-nowrap" style={{ color: liquida > 0 ? 'var(--m-ok)' : 'var(--m-t1)' }}>
          {liquida > 0 ? rs(liquida) : rs(vgv)}
        </p>
        <p className="text-[12px] whitespace-nowrap" style={{ color: 'var(--m-t3)' }}>
          {liquida > 0 ? 'líquida' : 'VGV'} · {leads} {leads === 1 ? 'lead' : 'leads'}
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
  /** o indicador do giro */
  giro: ReactNode
  celular?: boolean
}) {
  const porId = useMemo(() => new Map(perfis.map(p => [p.id, p])), [perfis])
  const shareDe = useMemo(() => (id: string | null) => (id ? porId.get(id)?.commissionShare ?? null : null), [porId])
  const pctDe = useMemo(() => (id: string | null) => (id ? pctProduto[id] : undefined), [pctProduto])

  const colunas = useMemo(() => (cartoes ? colunasDaSala(cartoes, shareDe, pctDe) : null), [cartoes, shareDe, pctDe])

  // O que está em jogo: tudo em aberto (fora a coluna de vendas do mês)
  const placar = useMemo(() => {
    if (!cartoes) return null
    const abertos = cartoes.filter(c => c.etapa !== 'venda')
    let total: DinheiroSala = DINHEIRO_ZERO
    const porCorretor = new Map<string, { liquida: number; leads: number; vgv: number }>()
    for (const c of abertos) {
      const d = dinheiroDoCartao(c, shareDe, pctDe)
      total = somar(total, d)
      if (!c.brokerId) continue
      const x = porCorretor.get(c.brokerId) ?? { liquida: 0, leads: 0, vgv: 0 }
      porCorretor.set(c.brokerId, { liquida: x.liquida + d.corretor, leads: x.leads + 1, vgv: x.vgv + d.vgv })
    }
    const corretores = [...porCorretor.entries()]
      .map(([id, v]) => ({ p: porId.get(id), ...v }))
      .filter((x): x is { p: Profile; liquida: number; leads: number; vgv: number } => !!x.p)
      .sort((a, b) => b.liquida - a.liquida || b.vgv - a.vgv)
    return { n: abertos.length, total, corretores }
  }, [cartoes, shareDe, pctDe, porId])

  const faixa = (
    <section className={`pulse-marinho relative shrink-0 overflow-hidden ${celular ? 'rounded-[24px] px-4 py-4' : 'rounded-[26px] px-8 pt-5 pb-5'}`}>
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

      {/* o placar: o que está em jogo e a parte de cada corretor */}
      <div className={`relative ${celular ? 'mt-4 pt-4' : 'mt-4 pt-4'}`} style={{ borderTop: '1px solid var(--m-line)' }}>
        {!placar ? (
          <div className="h-[76px] rounded-[14px] bg-white/10 animate-pulse" aria-busy="true" />
        ) : (
          <div className={celular ? 'flex flex-col gap-4' : 'flex items-center gap-10'}>
            <div className={celular ? 'grid grid-cols-2 gap-4' : 'flex items-start gap-10'}>
              <Numero rotulo="VGV em aberto" valor={rs(placar.total.vgv)} nota={`${placar.n} leads no funil`} className={celular ? 'col-span-2' : ''} />
              <Numero rotulo="Comissão geral" valor={rs(placar.total.bruta)} nota={celular ? 'bruta' : 'bruta, % de cada produto'} pequeno={celular} />
              <Numero rotulo="Líquida Souza" valor={rs(placar.total.souza)} cor="var(--m-ouro)" nota={celular ? 'o que fica na casa' : 'depois de ISS, Simples e corretor'} pequeno={celular} />
            </div>
            <div className={`flex items-center gap-3 ${celular ? 'overflow-x-auto -mx-4 px-4 pb-1' : 'ml-auto'}`}>
              {placar.corretores.map(x => (
                <CorretorNoPlacar key={x.p.id} p={x.p} liquida={x.liquida} leads={x.leads} vgv={x.vgv} celular={celular} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )

  return (
    <>
      {faixa}

      {erro ? (
        <p className="flex items-center gap-2 rounded-[14px] border border-error-line bg-error-bg px-4 py-3 text-[16px] text-t1" role="alert">
          <AlertTriangle size={18} strokeWidth={1.8} className="text-error" aria-hidden />
          Não consegui ler o Kanban: {erro}
        </p>
      ) : !colunas ? (
        <div className={celular ? 'h-[420px] rounded-[20px] shimmer' : 'flex-1 min-h-0 grid grid-cols-6 gap-3'} aria-busy="true">
          {!celular && Array.from({ length: 6 }, (_, i) => <div key={i} className="rounded-[20px] shimmer" />)}
        </div>
      ) : (
        <div className={celular
          ? 'flex items-start gap-3 overflow-x-auto snap-x snap-mandatory -mx-3 px-3 pb-2'
          : 'flex-1 min-h-0 grid gap-4'}
             style={celular ? undefined : { gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
          {colunas.map((col, i) => (
            <Coluna key={col.etapa} col={col} ultima={i === colunas.length - 1} perfis={porId} agora={agora}
                    celular={celular} />
          ))}
        </div>
      )}
    </>
  )
}
