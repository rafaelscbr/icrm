import { JOIA } from '../../../lib/paletaJoia'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { useContagem } from '../../../hooks/useContagem'
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
import { CorretorComFoto, useFotoDoCorretor } from '../../../components/shared/CorretorComFoto'
import { FotoPerfil } from '../../../components/shared/FotoPerfil'
import { agruparFeed, horaCurta } from '../pulseEvents'
import type { PulseTone } from '../pulseEvents'
import type { PulseEvent, PulseTempos, PulseVgl } from '../types'
import { fmtTaxa, passos, taxa } from '../../leads/conversao'
import type { RelatorioConversao } from '../../leads/conversao'

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

/** A TV continua no Pulse: a ficha do lead abre numa aba nova. */
function abrirLead(id: string) {
  window.open(`/leads?lead=${encodeURIComponent(id)}`, '_blank', 'noopener')
}

/** Cor viva de cada tipo de registro — a mesma na linha do dia e no feed. */
export const COR_DO_TOM: Record<PulseTone, string> = {
  neutral: 'var(--v-neutro)',
  good:    'var(--v-contato)',
  warn:    'var(--v-alerta)',
  win:     'var(--v-ok)',
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
    <section className={`pulse-card rounded-[20px] flex flex-col min-h-0 min-w-0 overflow-hidden ${className}`}>
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

export type Urgencia = 'ok' | 'alerta' | 'risco' | 'parado'

// ─── Meta do mês ──────────────────────────────────────────────────────────────

const SECA_ALERTA = 7
const SECA_GRAVE  = 15

// ─── Equipe agora ─────────────────────────────────────────────────────────────

export interface Corretor {
  id: string
  nome: string
  /** foto de perfil (migrações 105/106) — sem ela, as iniciais */
  foto?: string
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

/**
 * A equipe em formato de placar: uma linha por corretor, com o anel da meta
 * de ligações do dia em volta do avatar (enche conforme ele liga), o estado
 * agora e o que produziu. A linha do dia de cada um saiu: o batimento da
 * faixa Marinho já conta o dia da imobiliária.
 */
export function EquipeCompacta({ corretores, agora }: { corretores: Corretor[]; agora: number }) {
  return (
    <ul className="flex-1 min-h-0 overflow-hidden px-6 pb-4">
      {corretores.map((c, i) => {
        const id = IDENTIDADE[i % IDENTIDADE.length]
        const pct = c.metaLigacoes > 0 ? Math.min(1, c.ligacoes / c.metaLigacoes) : 0
        const R = 27, C = 2 * Math.PI * R
        const corAnel = pct >= 1 ? 'var(--v-ok)' : 'var(--v-lead)'
        return (
          <li key={c.id} className="-mx-3 px-3 flex items-center gap-3 py-2.5 rounded-[12px] border-t border-line/70 first:border-t-0 pulse-item-in transition-colors hover:bg-s2 hover:border-transparent">
            <span className="relative shrink-0 h-[62px] w-[62px]" title={`${c.ligacoes} de ${c.metaLigacoes} ligações hoje`}>
              <svg viewBox="0 0 62 62" className="absolute inset-0 -rotate-90" aria-hidden>
                <circle cx={31} cy={31} r={R} fill="none" stroke="var(--s3)" strokeWidth={4} />
                <circle cx={31} cy={31} r={R} fill="none" stroke={corAnel} strokeWidth={4} strokeLinecap="round"
                        strokeDasharray={C} strokeDashoffset={C * (1 - pct)} style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(.2,.8,.2,1)' }} />
              </svg>
              {c.foto ? (
                <img src={c.foto} alt="" draggable={false} className="absolute inset-[7px] h-[48px] w-[48px] rounded-full object-cover" />
              ) : (
                <span className="absolute inset-[8px] flex items-center justify-center rounded-full font-display text-[16px] font-bold"
                      style={{ background: id.fundo, color: id.tinta }} aria-hidden>{iniciais(c.nome)}</span>
              )}
              <span className={`absolute right-0 bottom-0 h-4 w-4 rounded-full border-[3px] border-[color:var(--surface)] ${c.ativo && !c.pausa ? 'pulse-live-dot' : ''}`}
                    style={{ background: c.pausa ? 'var(--v-alerta)' : c.ativo ? 'var(--v-ok)' : 'var(--v-neutro)' }} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-[18px] font-bold tracking-[-0.02em] text-t1">{c.nome.split(' ')[0]}</span>
              <span className={`block truncate text-[13.5px] tabular-nums ${c.pausa ? 'text-warning font-medium' : c.ativo ? 'text-success font-medium' : 'text-t3'}`}>
                {c.pausa ? `Em pausa · volta ${horaDaVolta(c.pausa.untilAt, agora)}` : c.status}
              </span>
            </span>
            <Placar rotulo="atend." valor={c.atend} />
            <Placar rotulo="leads" valor={c.leads} nota={c.herdados > 0 ? `+${n(c.herdados)}` : undefined} />
            <Placar rotulo="lig." valor={c.ligacoes} meta={c.metaLigacoes} />
          </li>
        )
      })}
    </ul>
  )
}

function Placar({ rotulo, valor, meta, nota }: { rotulo: string; valor: number | null; meta?: number; nota?: string }) {
  const bateu = meta !== undefined && valor !== null && valor >= meta
  return (
    <span className="shrink-0 w-[46px] text-right">
      <span className="block font-display text-[24px] leading-none font-extrabold tracking-[-0.03em] whitespace-nowrap">
        {valor === null ? <span className="text-t4">—</span>
          : <NumeroVivo valor={valor} className={bateu ? 'text-success' : valor === 0 ? 'text-t4' : 'text-t1'} />}
        {nota && <span className="text-[13px] font-semibold text-t3 align-top ml-0.5">{nota}</span>}
      </span>
      <span className="block mt-1 text-[12.5px] text-t3">{rotulo}</span>
    </span>
  )
}

// ─── Fila do 1º contato ───────────────────────────────────────────────────────

export interface Espera {
  id: string
  nome: string
  corretor?: string
  /** id do corretor — para a foto ao lado do nome */
  corretorId?: string | null
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
          <li key={e.id} className="-mx-3 border-t border-line/70 first:border-t-0 pulse-item-in">
            <button type="button" onClick={() => abrirLead(e.id)} title="Abrir a ficha do lead"
                    className="block w-full text-left px-3 py-2.5 rounded-[12px] cursor-pointer transition-colors hover:bg-s2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
            <div className="flex items-center justify-between gap-3 min-w-0">
              <span className="min-w-0 flex items-center gap-2 text-[17px] font-semibold text-t1">
                <span className="min-w-0 truncate">{e.nome}</span>
                {/* a foto ao lado do nome: na TV, quem é quem de longe */}
                {e.corretor && (
                  <span className="flex shrink-0 items-center gap-2 font-normal text-t3">
                    <span aria-hidden>·</span>
                    <CorretorComFoto id={e.corretorId} nome={e.corretor} tamanho={26}>{e.corretor.split(' ')[0]}</CorretorComFoto>
                  </span>
                )}
              </span>
              <span className={`shrink-0 text-[14px] font-semibold tabular-nums ${tomTexto}`}>{texto}</span>
            </div>
            <span className="mt-2 block h-2 rounded-full bg-s3 overflow-hidden" aria-hidden>
              <span className={`block h-full rounded-full transition-[width] duration-[900ms] ${urgencia === 'risco' ? 'pulse-live-dot' : ''}`}
                    style={{ width: `${frac * 100}%`, background: COR_DA_URGENCIA[urgencia] }} />
            </span>
            </button>
          </li>
        )
      })}
      {resto > 0 && <li className="pt-2 text-[14px] text-t3">+{n(resto)} na fila</li>}
    </ul>
  )
}

// ─── Ao vivo ──────────────────────────────────────────────────────────────────

const LINHAS_MAX = 24

/** Linha do feed: um botão que abre a ficha quando o registro é de um lead; senão, só a linha. */
function Linha({ leadId, children }: { leadId?: string; children: ReactNode }) {
  const base = 'flex w-full items-start gap-3.5 px-3 py-2.5 rounded-[12px] text-left'
  if (!leadId) return <div className={base}>{children}</div>
  return (
    <button type="button" onClick={() => abrirLead(leadId)} title="Abrir a ficha do lead"
            className={`${base} cursor-pointer transition-colors hover:bg-s2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40`}>
      {children}
    </button>
  )
}

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
  const fotoDe = useFotoDoCorretor()

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
              <li key={ev.id} className="-mx-3 border-t border-line/70 first:border-t-0 pulse-item-in">
                <Linha leadId={ev.leadId}>
                <span className="w-[48px] shrink-0 pt-[2px] text-[14px] text-t4 tabular-nums">{horaCurta(ev.at)}</span>
                <span className="mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COR_DO_TOM[v.tone] }} aria-hidden />
                {/* a foto de quem fez, ao lado do nome em negrito */}
                {ev.brokerId && <FotoPerfil nome={nomes.get(ev.brokerId)} url={fotoDe(ev.brokerId)} tamanho={26} className="-mt-[2px]" />}
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] text-t1 leading-snug line-clamp-2">
                    {ev.brokerId && <span className="font-semibold">{nomes.get(ev.brokerId)} · </span>}
                    {v.texto}
                  </span>
                  {v.detalhe && <span className="block text-[13.5px] text-t3 truncate mt-0.5">{v.detalhe}</span>}
                </span>
                </Linha>
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

/** Tons de cada fatia, do claro (topo) ao profundo — texto branco legível em todas. */
// Paleta joia (lib/paletaJoia.ts): a receita do card da Meta de VGV em um
// tom por etapa — claro → médio → fundo, texto branco legível em todas.
const FATIA: Record<LeadFunnelStage, [string, string, string]> = {
  lead:        [JOIA.lead.claro,        JOIA.lead.medio,        JOIA.lead.fundo],
  followup:    [JOIA.followup.claro,    JOIA.followup.medio,    JOIA.followup.fundo],
  atendimento: [JOIA.atendimento.claro, JOIA.atendimento.medio, JOIA.atendimento.fundo],
  visita:      [JOIA.visita.claro,      JOIA.visita.medio,      JOIA.visita.fundo],
  proposta:    [JOIA.proposta.claro,    JOIA.proposta.medio,    JOIA.proposta.fundo],
  venda:       [JOIA.venda.claro,       JOIA.venda.medio,       JOIA.venda.fundo],
}

/** Texto de número que sobe até o valor (700 ms) e acende quando muda. */
function ContagemSvg({ valor, ...props }: { valor: number } & React.SVGProps<SVGTextElement>) {
  const v = useContagem(valor)
  const anterior = useRef(valor)
  const [acende, setAcende] = useState(0)
  useEffect(() => {
    if (anterior.current !== valor) { anterior.current = valor; setAcende(a => a + 1) }
  }, [valor])
  return <text key={acende} className={acende ? 'pulse-acende' : undefined} {...props}>{Math.round(v).toLocaleString('pt-BR')}</text>
}

/**
 * O funil da imobiliária, protagonista da tela, em duas leituras lado a lado:
 *
 *   • AGORA — quantos leads estão em cada etapa neste momento. É uma FORMA,
 *     não um gráfico de proporção (com 90 em followup e 1 em proposta, barras
 *     proporcionais virariam um traço).
 *   • CONVERSÃO — dos leads que chegaram nos últimos 90 dias, quantos chegaram
 *     a cada etapa e a taxa de cada passo. A mesma conta da aba Conversão
 *     (lead_conversion_report, modo safra), para os números baterem.
 *
 * Com o mouse: passar sobre uma fatia acende a fatia (as outras recuam) e
 * mostra o que ela é — quantos estão lá, quanto do funil ativo isso é e, na
 * escada ao lado, o passo de conversão correspondente.
 */
export function FunilDaImobiliaria({ porEtapa, vendasNoMes, conversao, janelaDias }: {
  porEtapa: Partial<Record<LeadFunnelStage, number>>
  vendasNoMes: number | null
  conversao: RelatorioConversao | null
  janelaDias: number
}) {
  const [foco, setFoco] = useState<LeadFunnelStage | null>(null)
  const W = 440, H = 66, VAO = 8, TOPO = 430, BASE = 150
  const ativos = ETAPAS_FUNIL.filter(e => e !== 'venda').reduce((t, e) => t + (porEtapa[e] ?? 0), 0)
  const passo = (TOPO - BASE) / ETAPAS_FUNIL.length
  const altura = ETAPAS_FUNIL.length * (H + VAO) - VAO
  const cx = W / 2
  const fatias = ETAPAS_FUNIL.map((e, i) => {
    const y = i * (H + VAO)
    const a = TOPO - i * passo, b = TOPO - (i + 1) * passo
    const pts = [[cx - a / 2, y], [cx + a / 2, y], [cx + b / 2, y + H], [cx - b / 2, y + H]]
    return {
      etapa: e, i, y,
      nome: e === 'venda' ? 'Vendas no mês' : STAGE_THEME[e].columnLabel,
      n: e === 'venda' ? vendasNoMes : (porEtapa[e] ?? 0),
      pontos: pts.map(p => p.join(',')).join(' '),
    }
  })
  const focada = fatias.find(f => f.etapa === foco)

  return (
    <div className="flex-1 min-h-0 grid gap-2 px-6 pb-6" style={{ gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 1fr)' }}>
      {/* ── agora ── */}
      <div className="relative min-h-0 flex flex-col">
        <p className="text-[13.5px] text-t3 mb-2">Agora · <span className="font-semibold text-t1 tabular-nums">{ativos.toLocaleString('pt-BR')}</span> leads ativos</p>
        <div className="relative flex-1 min-h-0 flex items-center justify-center" role="presentation" onMouseLeave={() => setFoco(null)}>
          <svg viewBox={`0 -4 ${W} ${altura + 8}`} className="h-full max-h-full w-auto max-w-full overflow-visible" role="img"
               aria-label={`Funil agora: ${fatias.map(f => `${f.nome} ${f.n ?? 'sem dado'}`).join(', ')}.`}>
            <defs>
              {fatias.map(f => (
                <linearGradient key={f.etapa} id={`fatia-${f.etapa}`} x1="0" y1="0" x2="0.45" y2="1">
                  <stop offset="0%" stopColor={FATIA[f.etapa][0]} />
                  <stop offset="48%" stopColor={FATIA[f.etapa][1]} />
                  <stop offset="100%" stopColor={FATIA[f.etapa][2]} />
                </linearGradient>
              ))}
              <clipPath id="funil-forma">{fatias.map(f => <polygon key={f.etapa} points={f.pontos} />)}</clipPath>
              <radialGradient id="funil-champanhe" cx="1" cy="0" r="1.1">
                <stop offset="0%" stopColor="#D6B26E" stopOpacity="0.30" />
                <stop offset="55%" stopColor="#D6B26E" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="funil-luz" x1="0" x2="1">
                <stop offset="0%" stopColor="#fff" stopOpacity="0" />
                <stop offset="50%" stopColor="#fff" stopOpacity="0.30" />
                <stop offset="100%" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
            </defs>

            {fatias.map(f => {
              const recua = foco !== null && foco !== f.etapa
              return (
                <g key={f.etapa} className="funil-fatia cursor-pointer focus:outline-none" style={{ animationDelay: `${f.i * 110}ms` }}
                   role="button" tabIndex={0} aria-label={`${f.nome}: ${f.n ?? 'sem dado'}`}
                   onMouseEnter={() => setFoco(f.etapa)} onFocus={() => setFoco(f.etapa)} onBlur={() => setFoco(null)}
                   onKeyDown={e => { if (e.key === 'Escape') setFoco(null) }}>
                  <g style={{
                    transformBox: 'fill-box', transformOrigin: 'center',
                    transform: foco === f.etapa ? 'scale(1.045)' : 'none',
                    opacity: recua ? 0.38 : 1,
                    transition: 'transform 260ms cubic-bezier(.2,.8,.2,1), opacity 260ms ease',
                  }}>
                    <polygon points={f.pontos} fill={`url(#fatia-${f.etapa})`} stroke="rgba(255,255,255,0.6)" strokeWidth={1.5} strokeLinejoin="round" />
                    <text x={cx} y={f.y + 23} textAnchor="middle" pointerEvents="none"
                          style={{ fill: 'rgba(255,255,255,0.9)', fontSize: 13.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                      {f.nome}
                    </text>
                    {f.n === null
                      ? <text x={cx} y={f.y + 54} textAnchor="middle" pointerEvents="none" style={{ fill: '#fff', fontSize: 30, fontWeight: 800 }}>—</text>
                      : <ContagemSvg valor={f.n} x={cx} y={f.y + 54} textAnchor="middle" pointerEvents="none" className="font-display tabular-nums"
                                     style={{ fill: '#fff', fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em' }} />}
                  </g>
                </g>
              )
            })}

            {/* um brilho atravessa a forma de tempos em tempos */}
            <g clipPath="url(#funil-forma)" aria-hidden pointerEvents="none">
              {/* o brilho champanhe do canto, como no card da Meta de VGV */}
              <rect x={0} y={0} width={W} height={altura} fill="url(#funil-champanhe)" />
              <rect className="funil-brilho" x={0} y={-20} width={110} height={altura + 40} fill="url(#funil-luz)" />
            </g>
          </svg>

          {/* o que a fatia sob o mouse é */}
          {focada && (
            <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-[14px] bg-[#0F2759] px-4 py-3 text-white shadow-[0_18px_40px_-12px_rgba(15,39,89,0.55)] pulse-item-in whitespace-nowrap"
                 role="status">
              <p className="text-[13px] font-semibold uppercase tracking-[0.14em]" style={{ color: focada.etapa === 'venda' ? '#E2C385' : 'rgba(255,255,255,0.72)' }}>{focada.nome}</p>
              <p className="mt-0.5 font-display text-[26px] font-extrabold leading-none tabular-nums">
                {focada.n === null ? '—' : focada.n.toLocaleString('pt-BR')}
                <span className="ml-1.5 text-[14px] font-medium text-white/70">
                  {focada.etapa === 'venda' ? 'vendas neste mês' : focada.n === 1 ? 'lead agora' : 'leads agora'}
                </span>
              </p>
              {focada.etapa !== 'venda' && ativos > 0 && focada.n !== null && (
                <p className="mt-1 text-[13.5px] text-white/75">{Math.round((focada.n / ativos) * 100)}% do funil ativo</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── conversão ── */}
      <EscadaDeConversao conversao={conversao} janelaDias={janelaDias} foco={foco} />
    </div>
  )
}

const ETAPA_DO_PASSO: Record<string, LeadFunnelStage> = {
  Recebidos: 'lead', Atendimento: 'atendimento', Visita: 'visita', Proposta: 'proposta', Venda: 'venda',
}

/**
 * A escada de conversão: quantos dos leads que chegaram na janela chegaram a
 * cada etapa, e entre um degrau e outro, a taxa daquele passo. A conversão de
 * ponta a ponta (lead → venda) é o número grande do topo.
 */
function EscadaDeConversao({ conversao, janelaDias, foco }: {
  conversao: RelatorioConversao | null
  janelaDias: number
  foco: LeadFunnelStage | null
}) {
  if (!conversao) {
    return (
      <div className="min-h-0 flex flex-col justify-center rounded-[16px] bg-s2/60 px-5 text-[14px] text-t3">
        Conversão indisponível agora — a leitura do banco falhou.
      </div>
    )
  }
  const ps = passos(conversao)
  const recebidos = conversao.received
  const vendas = ps[ps.length - 1]?.avancaram ?? 0
  const total = taxa(vendas, recebidos)
  const degraus = [{ nome: 'Recebidos', n: recebidos }, ...ps.map(p => ({ nome: p.para, n: p.avancaram }))]
  const maxRaiz = Math.sqrt(Math.max(1, recebidos))

  return (
    <div className="min-h-0 flex flex-col rounded-[18px] bg-[#F4F6FB] px-5 py-4">
      <p className="text-[13.5px] text-t3">Conversão · leads dos últimos {janelaDias} dias</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="font-display text-[44px] leading-none font-extrabold tracking-[-0.04em] text-t1 tabular-nums">{fmtTaxa(total)}</span>
        <span className="text-[14px] text-t2 leading-tight">dos leads<br />viram venda</span>
      </p>

      <ol className="mt-3 flex-1 min-h-0 flex flex-col justify-between">
        {degraus.map((d, i) => {
          const etapa = ETAPA_DO_PASSO[d.nome] ?? 'lead'
          const ativo = foco === null || foco === etapa || (foco === 'followup' && etapa === 'lead')
          const p = i > 0 ? ps[i - 1] : null
          return (
            <li key={d.nome} className="transition-opacity duration-200" style={{ opacity: ativo ? 1 : 0.35 }}>
              {p && (
                <div className="flex items-center gap-2 py-1 pl-1">
                  <span className="text-t4 text-[14px]" aria-hidden>↓</span>
                  <span className="rounded-full px-2.5 py-0.5 text-[13px] font-bold tabular-nums"
                        style={{ background: `color-mix(in srgb, ${FATIA[etapa][1]} 14%, transparent)`, color: FATIA[etapa][1] }}>
                    {fmtTaxa(p.taxa)}
                  </span>
                  <span className="text-[12.5px] text-t3">avançam</span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <span className="w-[104px] shrink-0 text-[14.5px] font-semibold text-t1">{d.nome}</span>
                <span className="relative flex-1 h-3 rounded-full bg-white overflow-hidden">
                  <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700"
                        style={{ width: `${Math.max(2, (Math.sqrt(d.n) / maxRaiz) * 100)}%`, background: `linear-gradient(90deg, ${FATIA[etapa][0]}, ${FATIA[etapa][2]})` }} />
                </span>
                <span className="w-[52px] shrink-0 text-right font-display text-[20px] font-extrabold tabular-nums text-t1">{d.n.toLocaleString('pt-BR')}</span>
              </div>
            </li>
          )
        })}
      </ol>
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
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: (ps: Array<{ dataIndex: number; value: number }>) => {
          const p = ps[0]; const d = serie[p.dataIndex]
          const [, m, dd] = d.data.split('-')
          return `${p.dataIndex === ultimo ? 'Hoje' : `${dd}/${m}`} · <b>${p.value}</b> ${p.value === 1 ? 'lead' : 'leads'}`
        },
      },
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

// ═══ Faixa Marinho ═══════════════════════════════════════════════════════════

/** Um acontecimento do dia, para o batimento: quando e o que foi. */
export interface Batida {
  t: number
  kind: PulseEvent['kind']
}

/** Pontos que pedem destaque sobre a linha: chegada, visita e venda. */
const MARCO: Partial<Record<PulseEvent['kind'], { cor: string; rotulo: string }>> = {
  lead_novo: { cor: '#818CF8', rotulo: 'lead novo' },
  visita:    { cor: '#2DD4BF', rotulo: 'visita' },
  venda:     { cor: '#34D399', rotulo: 'venda' },
}

const BALDE_MIN = 10

/** Contagem por balde de 10 min, suavizada — o traço do dia. */
export function curvaDoDia(batidas: Batida[], de: number, ate: number, agora: number): { y: number[]; bruto: number[]; ini: number; ateAgora: number } {
  const ref = new Date(agora)
  const ini = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), de).getTime()
  const fim = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), ate + 1).getTime()
  const n = Math.round((fim - ini) / (BALDE_MIN * 60_000))
  const bruto = Array<number>(n).fill(0)
  for (const b of batidas) {
    if (b.t < ini || b.t >= fim) continue
    bruto[Math.floor((b.t - ini) / (BALDE_MIN * 60_000))]++
  }
  // suavização 1-2-1: um registro sozinho ainda vira um pico visível
  const y = bruto.map((v, i) => 0.25 * (bruto[i - 1] ?? v) + 0.5 * v + 0.25 * (bruto[i + 1] ?? v))
  const ateAgora = Math.max(0, Math.min(n - 1, Math.floor((agora - ini) / (BALDE_MIN * 60_000))))
  return { y, bruto, ini, ateAgora }
}

/** Curva suave por Catmull-Rom → Bézier. */
function caminho(pts: [number, number][]): string {
  if (pts.length === 0) return ''
  let d = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`
  }
  return d
}

/**
 * O batimento da imobiliária — o nome da tela desenhado. Cada registro da
 * equipe faz a linha subir na hora em que aconteceu; os marcos do dia (lead
 * que chegou, visita, venda) ficam como pontos sobre o trilho; o cursor
 * champanhe é o agora. O que ainda não aconteceu é só o trilho.
 */
export function Batimento({ batidas, de, ate, agora }: { batidas: Batida[]; de: number; ate: number; agora: number }) {
  const W = 1000, H = 52
  const { y, bruto, ini, ateAgora } = useMemo(() => curvaDoDia(batidas, de, ate, agora), [batidas, de, ate, agora])
  const [sob, setSob] = useState<number | null>(null)
  const max = Math.max(1.5, ...y)
  const passo = y.length > 1 ? W / (y.length - 1) : W
  const pts: [number, number][] = y.slice(0, ateAgora + 1).map((v, i) => [i * passo, H - 6 - (v / max) * (H - 18)])
  const linha = caminho(pts)
  const area = pts.length > 1 ? `${linha} L ${pts[pts.length - 1][0]} ${H} L 0 ${H} Z` : ''
  const cursor = posicaoNoDia(agora, de, ate, new Date(agora))
  const horas: number[] = []
  for (let h = de; h <= ate + 1; h += 1) horas.push(h)
  const ref = new Date(agora)
  const marcos = batidas.filter(b => MARCO[b.kind])
  const total = batidas.length

  return (
    <div className="relative">
      <div className="relative h-[52px] cursor-crosshair" role="presentation"
           onMouseMove={e => {
             const r = e.currentTarget.getBoundingClientRect()
             const i = Math.round(((e.clientX - r.left) / r.width) * (y.length - 1))
             setSob(Math.max(0, Math.min(ateAgora, i)))
           }}
           onMouseLeave={() => setSob(null)}>
        <span className="sr-only" role="img"
              aria-label={`Batimento do dia: ${total} ${total === 1 ? 'registro' : 'registros'} da equipe entre ${de}h e ${ate + 1}h.`} />
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          <line x1={0} y1={H - 0.5} x2={W} y2={H - 0.5} stroke="var(--m-line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {area && <path d={area} className="pulse-area" fill="rgba(226, 195, 133, 0.16)" />}
          {linha && <path d={linha} className="pulse-traco" pathLength={1} fill="none" stroke="var(--m-ouro)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        </svg>
        {/* marcos do dia, sobre o trilho */}
        {marcos.map((b, i) => {
          const x = posicaoNoDia(b.t, de, ate, ref)
          if (x === null) return null
          const m = MARCO[b.kind]!
          return (
            <span key={i} className="absolute bottom-0 h-2.5 w-2.5 -translate-x-1/2 translate-y-1/2 rounded-full ring-2 ring-[#0F2759] pulse-item-in"
                  style={{ left: `${x}%`, background: m.cor }} aria-hidden />
          )
        })}
        {sob !== null && (() => {
          const x = (sob / Math.max(1, y.length - 1)) * 100
          const h0 = new Date(ini + sob * BALDE_MIN * 60_000)
          const h1 = new Date(ini + (sob + 1) * BALDE_MIN * 60_000)
          const hm = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          return (
            <span className="pointer-events-none absolute inset-y-0" style={{ left: `${x}%` }}>
              <span className="absolute inset-y-0 w-px" style={{ background: 'rgba(255,255,255,0.45)' }} />
              <span className="absolute bottom-full mb-2 -translate-x-1/2 whitespace-nowrap rounded-[10px] bg-white px-3 py-1.5 text-[13px] text-[#0B1A3A] shadow-[0_10px_24px_-8px_rgba(0,0,0,0.45)]">
                <span className="font-semibold tabular-nums">{hm(h0)}–{hm(h1)}</span> · {bruto[sob]} {bruto[sob] === 1 ? 'registro' : 'registros'}
              </span>
            </span>
          )
        })()}
        {cursor !== null && (
          <span className="pointer-events-none absolute inset-y-0 -translate-x-1/2" style={{ left: `${cursor}%` }} aria-hidden>
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2" style={{ background: 'var(--m-ouro)' }} />
            <span className="absolute left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full pulse-live-dot"
                  style={{ top: `${pts.length ? (pts[pts.length - 1][1] / H) * 100 : 100}%`, background: 'var(--m-ouro)', boxShadow: '0 0 0 4px rgba(226,195,133,0.22)' }} />
          </span>
        )}
      </div>
      <div className="relative mt-2 h-4" aria-hidden>
        {horas.map(h => (
          <span key={h} className="absolute -translate-x-1/2 text-[12.5px] tabular-nums first:translate-x-0 last:-translate-x-full"
                style={{ left: `${((h - de) / (ate + 1 - de)) * 100}%`, color: 'var(--m-t3)' }}>{h}h</span>
        ))}
      </div>
    </div>
  )
}

/** Legenda dos marcos do batimento. */
export function LegendaDoBatimento() {
  return (
    <span className="flex items-center gap-4 text-[13.5px]" style={{ color: 'var(--m-t2)' }}>
      <span className="flex items-center gap-1.5"><span className="h-[3px] w-4 rounded-full" style={{ background: 'var(--m-ouro)' }} /> registros</span>
      {Object.values(MARCO).map(m => (
        <span key={m!.rotulo} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: m!.cor }} /> {m!.rotulo}</span>
      ))}
    </span>
  )
}

export interface NumeroMarinho {
  rotulo: string
  valor: number | string | null
  /** cor do número sobre o Marinho — só quando carrega julgamento */
  cor?: 'ok' | 'alerta' | 'risco'
  nota?: ReactNode
  marca?: ReactNode
}

const COR_MARINHO = { ok: 'var(--m-ok)', alerta: 'var(--m-alerta)', risco: 'var(--m-risco)' } as const

/** Os números do momento sobre o Marinho: brancos, grandes, cor só no julgamento. */
export function NumerosNoMarinho({ itens, meta }: { itens: NumeroMarinho[]; meta: ReactNode }) {
  return (
    <div className="grid gap-0" style={{ gridTemplateColumns: `repeat(${itens.length}, minmax(0, 1fr)) minmax(0, 1.55fr)` }}>
      {itens.map((it, i) => (
        <div key={it.rotulo} className={`min-w-0 pr-5 ${i > 0 ? 'pl-5' : ''}`} style={i > 0 ? { borderLeft: '1px solid var(--m-line)' } : undefined}>
          <p className="font-label text-[12.5px] uppercase tracking-[0.14em] truncate" style={{ color: 'var(--m-t3)' }}>{it.rotulo}</p>
          <p className="mt-1 font-display text-[44px] leading-[0.95] font-extrabold tracking-[-0.045em]"
             style={{ color: it.cor ? COR_MARINHO[it.cor] : 'var(--m-t1)' }}>
            {it.valor === null ? <span style={{ color: 'var(--m-t3)' }}>—</span> : <NumeroVivo valor={it.valor} />}
          </p>
          <div className="mt-2 min-h-[20px]">
            {it.marca}
            {it.nota && <p className={`text-[14px] truncate ${it.marca ? 'mt-1.5' : ''}`} style={{ color: 'var(--m-t2)' }}>{it.nota}</p>}
          </div>
        </div>
      ))}
      <div className="min-w-0 pl-6" style={{ borderLeft: '1px solid var(--m-line)' }}>{meta}</div>
    </div>
  )
}

/** VGL do mês em champanhe sobre o Marinho — dinheiro, meta e marca. */
export function MetaNoMarinho({ vgl }: { vgl: PulseVgl | null }) {
  if (!vgl) return <div className="h-full rounded-[12px] bg-white/5" aria-busy="true" />
  const pct = vgl.metaMes > 0 ? Math.min(100, Math.round((vgl.realizadoMes / vgl.metaMes) * 100)) : 0
  const porDia = vgl.diasUteisRestantes > 0 ? vgl.faltaParaMeta / vgl.diasUteisRestantes : null
  const seca = vgl.diasSemVenda
  const corSeca = seca === null ? 'var(--m-t3)' : seca >= SECA_GRAVE ? 'var(--m-risco)' : seca >= SECA_ALERTA ? 'var(--m-alerta)' : 'var(--m-ok)'
  return (
    <div className="flex gap-6 h-full">
      <div className="min-w-0 flex-1">
        <p className="font-label text-[12.5px] uppercase tracking-[0.14em] truncate" style={{ color: 'var(--m-t3)' }}>
          VGL do mês · {pct}% de {formatCurrency(vgl.metaMes)}
        </p>
        <p className="mt-1 font-display text-[44px] leading-[0.95] font-extrabold tracking-[-0.045em] tabular-nums whitespace-nowrap" style={{ color: 'var(--m-ouro)' }}>
          {formatCurrency(vgl.realizadoMes)}
        </p>
        <span className="mt-2.5 block h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.10)' }} aria-hidden>
          {pct > 0 && <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #D6B26E, #E8CD94)' }} />}
        </span>
        <p className="mt-1.5 text-[14px] truncate tabular-nums" style={{ color: 'var(--m-t2)' }}>
          {vgl.faltaParaMeta <= 0 ? 'meta do mês batida'
            : porDia === null ? `faltam ${formatCurrency(vgl.faltaParaMeta)}`
            : `faltam ${formatCurrency(vgl.faltaParaMeta)} · ${formatCurrency(porDia)}/dia útil`}
        </p>
      </div>
      <div className="shrink-0 flex flex-col justify-center items-center text-center">
        <CalendarX size={18} strokeWidth={1.6} style={{ color: corSeca }} aria-hidden />
        {seca === null ? (
          <p className="mt-1.5 text-[14px] leading-tight" style={{ color: 'var(--m-t2)' }}>nenhuma<br />venda</p>
        ) : (
          <>
            <p className="mt-1 font-display text-[40px] leading-none font-extrabold tabular-nums" style={{ color: corSeca }}>{seca}</p>
            <p className="mt-1 text-[14px] leading-tight" style={{ color: 'var(--m-t2)' }}>{seca === 1 ? 'dia' : 'dias'}<br />sem venda</p>
          </>
        )}
      </div>
    </div>
  )
}

/** Pontos da fila sobre o Marinho. */
export function PontosNoMarinho({ urgencias }: { urgencias: Urgencia[] }) {
  if (urgencias.length === 0) return null
  const cor: Record<Urgencia, string> = { ok: 'var(--m-ok)', alerta: 'var(--m-alerta)', risco: 'var(--m-risco)', parado: 'rgba(255,255,255,0.30)' }
  return (
    <span className="flex flex-wrap gap-1.5" aria-hidden>
      {urgencias.slice(0, 16).map((u, i) => (
        <span key={i} className={`h-2.5 w-2.5 rounded-full ${u === 'risco' ? 'pulse-live-dot' : ''}`} style={{ background: cor[u] }} />
      ))}
    </span>
  )
}

/** Barra do prazo de hoje sobre o Marinho. */
export function PrazoNoMarinho({ noPrazo, fora, perdidos }: { noPrazo: number; fora: number; perdidos: number }) {
  const total = noPrazo + fora + perdidos
  if (total === 0) return null
  return (
    <span className="flex h-2 w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.10)' }} aria-hidden>
      <span style={{ width: `${(noPrazo / total) * 100}%`, background: 'var(--m-ok)' }} />
      <span style={{ width: `${(fora / total) * 100}%`, background: 'var(--m-alerta)' }} />
      <span style={{ width: `${(perdidos / total) * 100}%`, background: 'var(--m-risco)' }} />
    </span>
  )
}
