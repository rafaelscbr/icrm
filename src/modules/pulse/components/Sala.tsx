import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { CalendarX, CheckCircle2 } from 'lucide-react'
import type { LeadFunnelStage, LeadPause } from '../../../types'
import { STAGE_THEME } from '../../../lib/stageTheme'
import { Grafico, eixoCategoria, eixoValor } from '../../../components/charts/Grafico'
import type { CoresGrafico } from '../../../components/charts/Grafico'
import { ETAPAS_FUNIL, fraseDoCorretor, rotuloDia } from '../../leads/dashboardLeads'
import { posicaoNoDia, textoDeMinutos } from '../../leads/monitorLeads'
import { NumeroVivo } from '../../leads/PainelMonitor'
import { horaDaVolta } from '../../../lib/pausaLeads'
import { formatCurrency } from '../../../lib/formatters'
import { agruparFeed, horaCurta } from '../pulseEvents'
import type { PulseTone } from '../pulseEvents'
import type { PulseEvent, PulseTempos, PulseVgl } from '../types'

/**
 * A sala de comando do Pulse — redesenho de 22/11/2026 para a TV.
 *
 * Direção: moldura quieta (Folha, painéis brancos lisos, texto em marinho) e
 * COR VIVA SÓ NO QUE ESTÁ VIVO — a etapa de cada lead, o pulso de quem está
 * ativo, o prazo escorrendo, as marcas do dia. As cores são as famílias das
 * etapas e dos status do sistema, acesas (--v-* em .pulse-fundo).
 *
 * Números são tipografia grande, não cartão com ícone. O elemento que só a
 * Souza tem é a Fila do 1º contato: cada lead esperando, com o prazo dele
 * correndo numa barra que esvazia ao vivo.
 */

const n = (v: number) => v.toLocaleString('pt-BR')

const ROTULO = 'font-label text-[12.5px] uppercase tracking-[0.14em] text-t3'

/** Cor viva de cada tipo de registro — a mesma na linha do dia e no feed. */
export const COR_DO_TOM: Record<PulseTone, string> = {
  neutral: 'var(--v-neutro)',
  good:    'var(--v-contato)',
  warn:    'var(--v-alerta)',
  win:     'var(--v-ok)',
}

const COR_DA_ETAPA: Record<LeadFunnelStage, string> = {
  lead: 'var(--v-lead)', followup: 'var(--v-followup)', atendimento: 'var(--v-atendimento)',
  visita: 'var(--v-visita)', proposta: 'var(--v-proposta)', venda: 'var(--v-venda)',
}

// ─── Moldura ──────────────────────────────────────────────────────────────────

/** Painel liso: branco sobre a Folha, um filete de borda, sem sombra. */
export function Painel({ titulo, extra, children, className = '' }: {
  titulo: string
  extra?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-[18px] border border-line bg-surface flex flex-col min-h-0 min-w-0 overflow-hidden ${className}`}>
      <header className="flex items-baseline gap-3 px-6 pt-5 pb-3 shrink-0">
        <h2 className="font-display text-[19px] font-bold tracking-[-0.02em] text-t1 whitespace-nowrap">{titulo}</h2>
        {extra && <div className="ml-auto min-w-0 text-[14px] text-t3 truncate">{extra}</div>}
      </header>
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
    </section>
  )
}

/** Altura viva de um contêiner — para o gráfico ocupar o espaço que sobrar. */
function useAltura<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [h, setH] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setH(Math.floor(e.contentRect.height)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, h]
}

// ─── Números do momento ───────────────────────────────────────────────────────

export interface Numero {
  rotulo: string
  /** null = ainda não dá para afirmar: mostra um traço, nunca um zero */
  valor: number | string | null
  tom?: 'text-t1' | 'text-warning' | 'text-error' | 'text-success'
  nota?: ReactNode
  /** o desenho que mostra o número (pontos da fila, barra do prazo) */
  marca?: ReactNode
}

/** Os números do momento numa faixa só, como tipografia. A meta do mês fecha a faixa. */
export function NumerosDoMomento({ itens, meta }: { itens: Numero[]; meta: ReactNode }) {
  return (
    <div className="shrink-0 rounded-[18px] border border-line bg-surface grid"
         style={{ gridTemplateColumns: `repeat(${itens.length}, minmax(0, 1fr)) minmax(0, 1.7fr)` }}>
      {itens.map((it, i) => (
        <div key={it.rotulo} className={`px-6 py-5 min-w-0 flex flex-col ${i > 0 ? 'border-l border-line' : ''}`}>
          <p className={`${ROTULO} truncate`}>{it.rotulo}</p>
          <p className={`mt-2 font-display text-[60px] leading-[0.95] font-extrabold tracking-[-0.04em] ${it.tom ?? 'text-t1'}`}>
            {it.valor === null ? <span className="text-t4">—</span> : <NumeroVivo valor={it.valor} />}
          </p>
          <div className="mt-auto pt-3 min-h-[22px]">
            {it.marca}
            {it.nota && <p className={`text-[14px] text-t3 truncate ${it.marca ? 'mt-1.5' : ''}`}>{it.nota}</p>}
          </div>
        </div>
      ))}
      <div className="border-l border-line min-w-0">{meta}</div>
    </div>
  )
}

export type Urgencia = 'ok' | 'alerta' | 'risco' | 'parado'

/** Um ponto por lead esperando, na cor da urgência — a fila vista de relance. */
export function PontosDaFila({ urgencias }: { urgencias: Urgencia[] }) {
  if (urgencias.length === 0) return null
  return (
    <span className="flex flex-wrap gap-1.5" aria-hidden>
      {urgencias.slice(0, 16).map((u, i) => (
        <span key={i} className={`h-2.5 w-2.5 rounded-full ${u === 'risco' ? 'pulse-live-dot' : ''}`}
              style={{ background: COR_DA_URGENCIA[u] }} />
      ))}
    </span>
  )
}

/** Barra de "x de y no prazo": verde o cumprido, âmbar o atrasado, vermelho o perdido. */
export function BarraDoPrazo({ noPrazo, fora, perdidos }: { noPrazo: number; fora: number; perdidos: number }) {
  const total = noPrazo + fora + perdidos
  if (total === 0) return null
  return (
    <span className="flex h-2.5 w-full overflow-hidden rounded-full bg-s3" aria-hidden>
      <span style={{ width: `${(noPrazo / total) * 100}%`, background: 'var(--v-ok)' }} />
      <span style={{ width: `${(fora / total) * 100}%`, background: 'var(--v-alerta)' }} />
      <span style={{ width: `${(perdidos / total) * 100}%`, background: 'var(--v-risco)' }} />
    </span>
  )
}

// ─── Meta do mês ──────────────────────────────────────────────────────────────

const SECA_ALERTA = 7
const SECA_GRAVE  = 15

/**
 * VGL do mês contra a meta — o ÚNICO dourado da tela (princípio 2): dinheiro,
 * meta e marca ao mesmo tempo. Ao lado, há quantos dias não sai venda.
 */
export function MetaDoMes({ vgl }: { vgl: PulseVgl | null }) {
  if (!vgl) return <div className="h-[calc(100%-40px)] m-5 rounded-[12px] shimmer" aria-busy="true" />
  const pct = vgl.metaMes > 0 ? Math.min(100, Math.round((vgl.realizadoMes / vgl.metaMes) * 100)) : 0
  const porDia = vgl.diasUteisRestantes > 0 ? vgl.faltaParaMeta / vgl.diasUteisRestantes : null
  const seca = vgl.diasSemVenda
  const corSeca = seca === null ? 'text-t4' : seca >= SECA_GRAVE ? 'text-error' : seca >= SECA_ALERTA ? 'text-warning' : 'text-success'

  return (
    <div className="relative h-full px-6 py-5 flex gap-6">
      <div className="min-w-0 flex-1 flex flex-col">
        <p className={`${ROTULO} truncate`}>VGL do mês · {pct}% de {formatCurrency(vgl.metaMes)}</p>
        <p className="mt-2 font-display text-[54px] leading-[0.95] font-extrabold tracking-[-0.04em] text-brand tabular-nums whitespace-nowrap">
          {formatCurrency(vgl.realizadoMes)}
        </p>
        <div className="mt-auto pt-3">
          <span className="block h-2.5 rounded-full bg-s3 overflow-hidden" aria-hidden>
            {pct > 0 && <span className="block h-full rounded-full bg-brand-fill transition-[width] duration-[420ms]" style={{ width: `${pct}%` }} />}
          </span>
          <p className="mt-1.5 text-[14px] text-t3 truncate tabular-nums">
            {vgl.faltaParaMeta <= 0 ? 'meta do mês batida'
              : porDia === null ? `faltam ${formatCurrency(vgl.faltaParaMeta)}`
              : `faltam ${formatCurrency(vgl.faltaParaMeta)} · ${formatCurrency(porDia)}/dia útil`}
          </p>
        </div>
      </div>
      <div className="shrink-0 flex flex-col justify-center items-center text-center">
        <CalendarX size={18} strokeWidth={1.6} className={corSeca} aria-hidden />
        {seca === null ? (
          <p className="mt-1.5 text-[14px] text-t3 leading-tight">nenhuma<br />venda</p>
        ) : (
          <>
            <p className={`mt-1 font-display text-[44px] leading-none font-extrabold tabular-nums ${corSeca}`}>{seca}</p>
            <p className="mt-1 text-[14px] text-t3 leading-tight">{seca === 1 ? 'dia' : 'dias'}<br />sem venda</p>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Equipe agora ─────────────────────────────────────────────────────────────

export interface Corretor {
  id: string
  nome: string
  ativo: boolean
  status: string
  pausa?: LeadPause
  marcas: { t: number; tom: PulseTone }[]
  atend: number
  ligacoes: number
  metaLigacoes: number
  avancos: number
  visitas: number
  /** null enquanto a trilha de distribuição não chegou */
  leads: number | null
  herdados: number
}

/** Tons de identidade: cada pessoa uma cor pálida própria, longe da vizinha no círculo. */
const IDENTIDADE = [
  { fundo: 'color-mix(in srgb, var(--v-lead) 14%, var(--surface))',        tinta: 'var(--stage-lead)' },
  { fundo: 'color-mix(in srgb, var(--v-visita) 16%, var(--surface))',      tinta: 'var(--stage-visita)' },
  { fundo: 'color-mix(in srgb, var(--v-proposta) 18%, var(--surface))',    tinta: 'var(--stage-proposta)' },
  { fundo: 'color-mix(in srgb, var(--v-followup) 14%, var(--surface))',    tinta: 'var(--stage-followup)' },
  { fundo: 'color-mix(in srgb, var(--v-atendimento) 14%, var(--surface))', tinta: 'var(--stage-atendimento)' },
]

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase()
}

const COLUNAS_EQUIPE = '290px minmax(0, 1fr) repeat(5, 104px)'

/**
 * A equipe, uma faixa por corretor: quem é e como está agora, a linha do dia
 * (cada registro um traço vivo na hora em que aconteceu, o cursor dourado é o
 * agora) e o que produziu hoje.
 */
export function EquipeAgora({ corretores, de, ate, agora }: {
  corretores: Corretor[]; de: number; ate: number; agora: number
}) {
  const horas: number[] = []
  for (let h = de; h <= ate + 1; h += 2) horas.push(h)
  const largura = ate + 1 - de

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="grid items-end gap-x-5 px-6 pb-2" style={{ gridTemplateColumns: COLUNAS_EQUIPE }}>
        <span />
        <span className="relative h-5" aria-hidden>
          {horas.map(h => (
            <span key={h} className="absolute bottom-0 -translate-x-1/2 text-[13px] text-t4 tabular-nums first:translate-x-0 last:-translate-x-full"
                  style={{ left: `${((h - de) / largura) * 100}%` }}>{h}h</span>
          ))}
        </span>
        {['Atend.', 'Ligações', 'Avanços', 'Visitas', 'Leads'].map(r => (
          <span key={r} className={`${ROTULO} text-right`}>{r}</span>
        ))}
      </div>
      <ul className="flex-1 min-h-0 overflow-hidden">
        {corretores.map((c, i) => {
          const id = IDENTIDADE[i % IDENTIDADE.length]
          return (
            <li key={c.id} className="grid items-center gap-x-5 px-6 py-3 border-t border-line/70" style={{ gridTemplateColumns: COLUNAS_EQUIPE }}>
              <div className="flex items-center gap-3.5 min-w-0">
                <span className="relative shrink-0">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full font-display text-[16px] font-bold"
                        style={{ background: id.fundo, color: id.tinta }} aria-hidden>{iniciais(c.nome)}</span>
                  <span className={`absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-[color:var(--surface)] ${c.ativo && !c.pausa ? 'pulse-live-dot' : ''}`}
                        style={{ background: c.pausa ? 'var(--v-alerta)' : c.ativo ? 'var(--v-ok)' : 'var(--v-neutro)' }} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-display text-[19px] font-bold tracking-[-0.02em] text-t1">{c.nome}</span>
                  <span className={`block truncate text-[14px] tabular-nums ${c.pausa ? 'text-warning font-medium' : c.ativo ? 'text-success font-medium' : 'text-t3'}`}>
                    {c.pausa ? `Em pausa · volta ${horaDaVolta(c.pausa.untilAt, agora)}` : c.status}
                  </span>
                </span>
              </div>

              <LinhaDoDia marcas={c.marcas} de={de} ate={ate} agora={agora} nome={c.nome} />

              <Contagem valor={c.atend} />
              <Contagem valor={c.ligacoes} meta={c.metaLigacoes} />
              <Contagem valor={c.avancos} />
              <Contagem valor={c.visitas} />
              <Contagem valor={c.leads} nota={c.herdados > 0 ? `+${n(c.herdados)} herdado${c.herdados === 1 ? '' : 's'}` : undefined} />
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Contagem({ valor, meta, nota }: { valor: number | null; meta?: number; nota?: string }) {
  const bateu = meta !== undefined && valor !== null && valor >= meta
  return (
    <span className="text-right min-w-0">
      <span className="block font-display text-[30px] leading-none font-extrabold tracking-[-0.03em] whitespace-nowrap">
        {valor === null ? <span className="text-t4">—</span>
          : <NumeroVivo valor={valor} className={bateu ? 'text-success' : valor === 0 ? 'text-t4' : 'text-t1'} />}
        {meta !== undefined && <span className="text-[15px] font-semibold text-t4 tabular-nums">/{n(meta)}</span>}
      </span>
      {nota && <span className="block mt-1 text-[12.5px] text-t3 truncate">{nota}</span>}
    </span>
  )
}

function LinhaDoDia({ marcas, de, ate, agora, nome }: {
  marcas: { t: number; tom: PulseTone }[]
  de: number; ate: number; agora: number; nome: string
}) {
  const ref = new Date(agora)
  const cursor = posicaoNoDia(agora, de, ate, ref)
  return (
    <div className="relative h-12" role="img"
         aria-label={`Linha do dia de ${nome}: ${marcas.length} ${marcas.length === 1 ? 'registro' : 'registros'}.`}>
      {/* o dia que já passou é um trilho cheio; o que falta, um trilho claro */}
      <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-s3" aria-hidden />
      {cursor !== null && (
        <span className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full"
              style={{ width: `${cursor}%`, background: 'color-mix(in srgb, var(--t1) 14%, transparent)' }} aria-hidden />
      )}
      {marcas.map((m, i) => {
        const x = posicaoNoDia(m.t, de, ate, ref)
        if (x === null) return null
        return (
          <span key={i} aria-hidden
                className="absolute top-1/2 w-[5px] h-[30px] -translate-x-1/2 -translate-y-1/2 rounded-full pulse-item-in"
                style={{ left: `${x}%`, background: COR_DO_TOM[m.tom] }} />
        )
      })}
      {cursor !== null && (
        <span className="absolute inset-y-0 w-[2px] -translate-x-1/2 bg-brand" style={{ left: `${cursor}%` }} aria-hidden>
          <span className="absolute -top-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-brand pulse-live-dot" />
        </span>
      )}
    </div>
  )
}

/** O que cada cor de traço quer dizer — quatro palavras. */
export function LegendaDoDia() {
  const itens: [PulseTone, string][] = [['good', 'contato'], ['win', 'interesse ou visita'], ['warn', 'descarte'], ['neutral', 'anotação']]
  return (
    <span className="flex items-center justify-end gap-x-4" aria-label="Cores da linha do dia">
      {itens.map(([tom, nome]) => (
        <span key={nome} className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="h-3.5 w-[4px] rounded-full" style={{ background: COR_DO_TOM[tom] }} aria-hidden /> {nome}
        </span>
      ))}
    </span>
  )
}

// ─── Fila do 1º contato ───────────────────────────────────────────────────────

export interface Espera {
  id: string
  nome: string
  corretor?: string
  slaDueAt: string
}

const COR_DA_URGENCIA: Record<Urgencia, string> = {
  ok: 'var(--v-ok)', alerta: 'var(--v-alerta)', risco: 'var(--v-risco)', parado: 'var(--v-neutro)',
}

/**
 * Quão perto do fim está o prazo de um lead. O prazo só corre no expediente:
 * se faltam mais minutos do que o prazo inteiro, o relógio está parado (lead
 * da noite, que vence de manhã) — cinza, sem urgência inventada.
 */
export function urgenciaDe(slaDueAt: string, agora: number, prazoMin: number | null): { urgencia: Urgencia; frac: number; faltaMs: number } {
  const janela = (prazoMin ?? 10) * 60_000
  const faltaMs = new Date(slaDueAt).getTime() - agora
  if (faltaMs < 0) return { urgencia: 'risco', frac: 1, faltaMs }
  if (faltaMs > janela * 1.05) return { urgencia: 'parado', frac: 1, faltaMs }
  const frac = Math.max(0, Math.min(1, faltaMs / janela))
  return { urgencia: frac < 0.5 ? 'alerta' : 'ok', frac, faltaMs }
}

const FILA_MAX = 5

/** "seg 09:10" — o dia da semana sem ponto nem vírgula. */
function diaEHora(iso: string): string {
  const d = new Date(iso)
  const dia = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  return `${dia} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

/**
 * O elemento que só a Souza tem: cada lead que ainda não recebeu o 1º
 * contato, com o prazo dele escorrendo numa barra viva. Verde com folga,
 * âmbar na metade final, vermelho pulsando quando venceu.
 */
export function FilaPrimeiroContato({ fila, agora, prazoMin }: { fila: Espera[]; agora: number; prazoMin: number | null }) {
  const ordenada = useMemo(
    () => [...fila].sort((a, b) => new Date(a.slaDueAt).getTime() - new Date(b.slaDueAt).getTime()),
    [fila],
  )

  if (ordenada.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 pb-6 text-center">
        <CheckCircle2 size={44} strokeWidth={1.6} style={{ color: 'var(--v-ok)' }} aria-hidden />
        <p className="font-display text-[22px] font-bold tracking-[-0.02em] text-t1">Fila vazia</p>
        <p className="text-[15px] text-t3">Todo lead novo já foi chamado.</p>
      </div>
    )
  }

  const visiveis = ordenada.slice(0, FILA_MAX)
  const resto = ordenada.length - visiveis.length

  return (
    <ul className="flex-1 min-h-0 overflow-hidden px-6 pb-4">
      {visiveis.map(e => {
        const { urgencia, frac, faltaMs } = urgenciaDe(e.slaDueAt, agora, prazoMin)
        const texto = urgencia === 'risco' ? `venceu há ${textoDeMinutos(-faltaMs / 60_000)}`
          : urgencia === 'parado' ? `prazo ${diaEHora(e.slaDueAt)}`
          : `vence em ${textoDeMinutos(faltaMs / 60_000)}`
        const tomTexto = urgencia === 'risco' ? 'text-error' : urgencia === 'parado' ? 'text-t3' : urgencia === 'alerta' ? 'text-warning' : 'text-success'
        return (
          <li key={e.id} className="py-2.5 border-t border-line/70 first:border-t-0 pulse-item-in">
            <div className="flex items-baseline justify-between gap-3 min-w-0">
              <span className="min-w-0 truncate text-[17px] font-semibold text-t1">
                {e.nome}{e.corretor && <span className="font-normal text-t3"> · {e.corretor.split(' ')[0]}</span>}
              </span>
              <span className={`shrink-0 text-[14px] font-semibold tabular-nums ${tomTexto}`}>{texto}</span>
            </div>
            <span className="mt-2 block h-2 rounded-full bg-s3 overflow-hidden" aria-hidden>
              <span className={`block h-full rounded-full transition-[width] duration-[900ms] ${urgencia === 'risco' ? 'pulse-live-dot' : ''}`}
                    style={{ width: `${frac * 100}%`, background: COR_DA_URGENCIA[urgencia] }} />
            </span>
          </li>
        )
      })}
      {resto > 0 && <li className="pt-2 text-[14px] text-t3">+{n(resto)} na fila</li>}
    </ul>
  )
}

// ─── Ao vivo ──────────────────────────────────────────────────────────────────

const LINHAS_MAX = 24

/**
 * O que a equipe acabou de fazer, do mais recente para o mais antigo, com o
 * nome de quem fez. O que não cabe na altura não aparece — numa tela que
 * ninguém toca, rolar não existe.
 */
export function AoVivo({ feed, nomes, carregado }: {
  feed: PulseEvent[]
  nomes: Map<string, string>
  carregado: boolean
}) {
  const eventos = useMemo(
    () => agruparFeed(feed.filter(e => e.brokerId && nomes.has(e.brokerId))).slice(0, LINHAS_MAX),
    [feed, nomes],
  )

  return (
    <div className="flex-1 min-h-0 overflow-hidden relative">
      {!carregado ? (
        <div className="mx-6 h-40 rounded-[12px] shimmer" aria-busy="true" />
      ) : eventos.length === 0 ? (
        <p className="text-[16px] text-t3 px-6 py-10">Nenhum registro hoje ainda.</p>
      ) : (
        <ul className="px-6" aria-live="polite" aria-label="Registros da equipe hoje">
          {eventos.map(ev => {
            const v = fraseDoCorretor(ev)
            return (
              <li key={ev.id} className="flex items-start gap-3.5 py-2.5 border-t border-line/70 first:border-t-0 pulse-item-in">
                <span className="w-[48px] shrink-0 pt-[2px] text-[14px] text-t4 tabular-nums">{horaCurta(ev.at)}</span>
                <span className="mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COR_DO_TOM[v.tone] }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] text-t1 leading-snug line-clamp-2">
                    {ev.brokerId && <span className="font-semibold">{nomes.get(ev.brokerId)} · </span>}
                    {v.texto}
                  </span>
                  {v.detalhe && <span className="block text-[13.5px] text-t3 truncate mt-0.5">{v.detalhe}</span>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20" style={{ background: 'linear-gradient(to bottom, transparent, var(--surface))' }} aria-hidden />
    </div>
  )
}

// ─── Funil ────────────────────────────────────────────────────────────────────

/**
 * O funil é uma FORMA, não um gráfico de proporção: com 90 leads em followup
 * e 1 em proposta, barras proporcionais virariam um traço. A silhueta afunila
 * por posição; cada fatia leva a cor viva da etapa e o número dentro dela.
 */
export function FunilVivo({ porEtapa, vendasNoMes }: {
  porEtapa: Partial<Record<LeadFunnelStage, number>>
  vendasNoMes: number | null
}) {
  const L = 320, H = 66, VAO = 6, PASSO = 32
  const linhas = ETAPAS_FUNIL.map(e => ({
    etapa: e,
    nome: e === 'venda' ? 'Vendas no mês' : STAGE_THEME[e].columnLabel,
    n: e === 'venda' ? vendasNoMes : (porEtapa[e] ?? 0),
    cor: COR_DA_ETAPA[e],
  }))
  const altura = linhas.length * (H + VAO) - VAO

  return (
    <div className="flex-1 min-h-0 flex items-center justify-center px-5 pb-5">
      <svg viewBox={`0 0 ${L} ${altura}`} className="h-full max-h-full w-auto max-w-full" role="img"
           aria-label={`Funil agora: ${linhas.map(l => `${l.nome} ${l.n ?? 'sem dado'}`).join(', ')}.`}>
        {linhas.map((l, i) => {
          const y = i * (H + VAO)
          const topo = L - i * PASSO, base = L - (i + 1) * PASSO
          const pontos = [
            [(L - topo) / 2, y], [(L + topo) / 2, y], [(L + base) / 2, y + H], [(L - base) / 2, y + H],
          ].map(p => p.join(',')).join(' ')
          return (
            <g key={l.etapa}>
              <polygon points={pontos} strokeWidth={2} strokeLinejoin="round"
                style={{ fill: `color-mix(in srgb, ${l.cor} 34%, var(--surface))`, stroke: l.cor }} />
              <text x={L / 2} y={y + 24} textAnchor="middle"
                style={{ fill: 'var(--t2)', fontSize: 16, fontWeight: 600 }}>{l.nome}</text>
              <text x={L / 2} y={y + 55} textAnchor="middle" className="font-display tabular-nums"
                style={{ fill: 'var(--t1)', fontSize: 30, fontWeight: 800 }}>
                {l.n === null ? '—' : l.n.toLocaleString('pt-BR')}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ─── Chegada e resposta ───────────────────────────────────────────────────────

/** Média dos dias anteriores a hoje — hoje ainda está em andamento. */
export function mediaSemHoje(serie: { n: number }[]): number | null {
  const fechados = serie.slice(0, -1)
  if (fechados.length === 0) return null
  return fechados.reduce((s, p) => s + p.n, 0) / fechados.length
}

/** Leads que chegaram em cada um dos últimos 30 dias; hoje é a barra dourada. */
export function ChegadaDeLeads({ serie }: { serie: { data: string; n: number }[] }) {
  const [ref, altura] = useAltura<HTMLDivElement>()
  const media = mediaSemHoje(serie)

  const opcao = useCallback((t: CoresGrafico) => {
    const ultimo = serie.length - 1
    return {
      grid: { left: 2, right: 10, top: 24, bottom: 0, containLabel: true },
      legend: { show: false },
      tooltip: { show: false },
      xAxis: { ...eixoCategoria(t, serie.map((p, i) => rotuloDia(p.data, i === ultimo))), axisLabel: { color: t.textoFraco, fontSize: 13, interval: 6 } },
      yAxis: { ...eixoValor(t, undefined, { minInterval: 1 }), axisLabel: { color: t.textoFraco, fontSize: 13 } },
      series: [{
        name: 'Leads recebidos', type: 'bar', barMaxWidth: 18,
        data: serie.map((p, i) => ({
          value: p.n,
          // o lead é índigo no sistema todo; hoje, o dia que ainda acontece, é dourado
          itemStyle: { color: i === ultimo ? t.marca : 'rgba(99, 102, 241, 0.82)', borderRadius: [4, 4, 0, 0] },
        })),
        markLine: media === null ? undefined : {
          silent: true, symbol: 'none',
          lineStyle: { color: t.textoFraco, type: 'dashed', width: 1 },
          label: { formatter: `média ${media.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}`, color: t.textoFraco, fontSize: 13, position: 'insideEndTop' },
          data: [{ yAxis: media }],
        },
      }],
    }
  }, [serie, media])

  const total = serie.reduce((s, p) => s + p.n, 0)
  return (
    <div ref={ref} className="flex-1 min-h-0 px-4">
      {altura > 40 && (
        <Grafico altura={altura} opcao={opcao}
          rotulo={`Leads recebidos por dia nos últimos ${serie.length} dias: ${total} no total, ${serie[serie.length - 1]?.n ?? 0} hoje.`} />
      )}
    </div>
  )
}

/** "52 min" · "1h31" · "4,3 d" — a duração de uma resposta; sem amostra, traço. */
export function textoDaResposta(min: number, amostra: number): string {
  if (amostra === 0) return '—'
  if (min < 60) return `${Math.round(min)} min`
  if (min < 24 * 60) {
    const h = Math.floor(min / 60), m = Math.round(min % 60)
    return m === 0 ? `${h} h` : `${h}h${String(m).padStart(2, '0')}`
  }
  return `${(min / (24 * 60)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} d`
}

/** Quanto a equipe demora para responder — mediana dos últimos 30 dias. */
export function Resposta({ tempos }: { tempos: PulseTempos }) {
  const p1 = tempos.primeiroContato, p2 = tempos.segundaTentativa
  const sla = p1.amostra > 0 ? p1.pctDentroSla : null
  const corSla = sla === null ? 'var(--t4)' : sla >= 80 ? 'var(--success)' : sla >= 50 ? 'var(--warning)' : 'var(--error)'
  return (
    <div className="shrink-0 grid grid-cols-3 gap-4 px-6 pt-4 pb-5 border-t border-line/70">
      <div className="min-w-0">
        <p className="text-[13.5px] text-t3 truncate">1º contato</p>
        <p className="mt-1 font-display text-[28px] leading-none font-extrabold tracking-[-0.03em] text-t1 tabular-nums">{textoDaResposta(p1.medianaMin, p1.amostra)}</p>
      </div>
      <div className="min-w-0">
        <p className="text-[13.5px] text-t3 truncate">2ª tentativa</p>
        <p className="mt-1 font-display text-[28px] leading-none font-extrabold tracking-[-0.03em] text-t1 tabular-nums">{textoDaResposta(p2.medianaMin, p2.amostra)}</p>
      </div>
      <div className="min-w-0">
        <p className="text-[13.5px] text-t3 truncate">no prazo</p>
        <p className="mt-1 font-display text-[28px] leading-none font-extrabold tracking-[-0.03em] tabular-nums" style={{ color: corSla }}>
          {sla === null ? '—' : `${sla}%`}
        </p>
      </div>
    </div>
  )
}
