import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { CalendarX, CheckCircle2 } from 'lucide-react'
import type { LeadFunnelStage, LeadPause } from '../../../types'
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
import { destacar } from '../../../components/shared/Destaque'
import type { PulseTone } from '../pulseEvents'
import type { PulseEvent, PulseTempos, PulseVgl } from '../types'
import { fmtTaxa, passos, taxa } from '../../leads/conversao'
import { FunilJoia } from '../../../components/shared/FunilJoia'
import type { EtapaFunil } from '../../../components/shared/FunilJoia'
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
export function Painel({ titulo, extra, children, className = '', compacto = false }: {
  /** cabeçalho baixo — para o painel que divide a coluna com outro */
  compacto?: boolean
  titulo: string
  extra?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    // 24/11/2026: o painel branco da dashboard — canto largo e sombra macia.
    <section className={`pulse-card rounded-[28px] flex flex-col min-h-0 min-w-0 overflow-hidden ${className}`}>
      <header className={`flex items-baseline gap-3 px-6 shrink-0 ${compacto ? 'pt-3.5 pb-0' : 'pt-5 pb-3'}`}>
        <h2 className="font-display text-[20px] font-bold tracking-[-0.02em] text-t1 whitespace-nowrap">{destacar(titulo)}</h2>
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

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase()
}

// ─── Equipe no palco (24/11/2026) ─────────────────────────────────────────────

/**
 * O placar da equipe em bloco Marinho, na pegada da dashboard: uma pílula de
 * vidro por corretor, com a foto grande dentro do anel dourado da meta de
 * ligações do dia.
 *
 * O HOLOFOTE: quem acabou de registrar alguma coisa ganha a pílula BRANCA —
 * como a opção ativa das cápsulas e o cartão em destaque da previsão na
 * dashboard. Quando outro corretor registra, o holofote pula para ele ao
 * vivo. É o feed traduzido em gente: de longe, a sala vê quem está jogando.
 * Sem registro nos últimos 30 min, ninguém fica em destaque (holofote não
 * inventa movimento).
 */
export const HOLOFOTE_MS = 30 * 60_000

export function EquipeNoMarinho({ corretores, agora, foco, compacto = false }: {
  /** celular: foto e números menores, para caber em 375 px */
  compacto?: boolean
  corretores: Corretor[]
  agora: number
  /** quem fez o último registro e quando */
  foco: { id: string; at: string; texto: string } | null
}) {
  const focoAtivo = foco && agora - new Date(foco.at).getTime() < HOLOFOTE_MS ? foco : null
  return (
    <ul className="flex flex-col gap-3 min-h-0">
      {corretores.map(c => {
        const emFoco = focoAtivo?.id === c.id
        const pct = c.metaLigacoes > 0 ? Math.min(1, c.ligacoes / c.metaLigacoes) : 0
        const R = 37, C = 2 * Math.PI * R
        return (
          <li key={c.id} className={`pulse-equipe ${compacto ? 'pulse-equipe-compacta' : ''} ${emFoco ? 'pulse-equipe-foco' : ''}`}>
            <span className={`relative shrink-0 ${compacto ? 'h-[60px] w-[60px]' : 'h-[76px] w-[76px]'}`} title={`${c.ligacoes} de ${c.metaLigacoes} ligações hoje`}>
              <svg viewBox="0 0 84 84" className="absolute inset-0 -rotate-90" aria-hidden>
                <defs>
                  <linearGradient id={`anel-${c.id}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#C9A35A" /><stop offset="100%" stopColor="#F1DDB0" />
                  </linearGradient>
                </defs>
                <circle cx={42} cy={42} r={R} fill="none" stroke="var(--eq-trilho)" strokeWidth={5} />
                <circle cx={42} cy={42} r={R} fill="none" stroke={pct >= 1 ? 'var(--m-ok)' : `url(#anel-${c.id})`} strokeWidth={5} strokeLinecap="round"
                        strokeDasharray={C} strokeDashoffset={C * (1 - pct)} style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(.2,.8,.2,1)' }} />
              </svg>
              {c.foto ? (
                <img src={c.foto} alt="" draggable={false} className={`absolute rounded-full object-cover ${compacto ? 'inset-[6px] h-[48px] w-[48px]' : 'inset-[8px] h-[60px] w-[60px]'}`} />
              ) : (
                <span className="absolute inset-[8px] flex items-center justify-center rounded-full font-display text-[22px] font-bold"
                      style={{ background: 'var(--eq-vidro)', color: 'var(--eq-t1)' }} aria-hidden>{iniciais(c.nome)}</span>
              )}
              {emFoco ? (
                // no holofote, a etiqueta "agora" pisca embaixo da foto
                <span className="pulse-equipe-agora absolute -bottom-1.5 left-1/2 -translate-x-1/2">agora</span>
              ) : (
                <span className={`absolute right-1 bottom-1 h-[18px] w-[18px] rounded-full border-[3px] ${c.ativo && !c.pausa ? 'pulse-live-dot' : ''}`}
                      style={{ borderColor: 'var(--eq-borda-ponto)', background: c.pausa ? 'var(--m-alerta)' : c.ativo ? 'var(--m-ok)' : 'rgba(255,255,255,0.35)' }} aria-hidden />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block truncate font-display font-extrabold tracking-[-0.03em] ${compacto ? 'text-[19px]' : 'text-[24px]'}`} style={{ color: 'var(--eq-t1)' }}>{c.nome.split(' ')[0]}</span>
              <span className="block truncate text-[14.5px] tabular-nums mt-0.5" style={{ color: c.pausa ? 'var(--eq-alerta)' : 'var(--eq-t3)' }}>
                {emFoco ? focoAtivo!.texto
                  : c.pausa ? `Em pausa · volta ${horaDaVolta(c.pausa.untilAt, agora)}` : c.status}
              </span>
            </span>
            <PlacarNoMarinho compacto={compacto} rotulo="atend." valor={c.atend} />
            <PlacarNoMarinho compacto={compacto} rotulo="leads" valor={c.leads} nota={c.herdados > 0 ? `+${n(c.herdados)}` : undefined} />
            <PlacarNoMarinho compacto={compacto} rotulo={compacto ? 'lig.' : `lig. de ${c.metaLigacoes}`} valor={c.ligacoes} bateu={c.ligacoes >= c.metaLigacoes && c.metaLigacoes > 0} />
          </li>
        )
      })}
    </ul>
  )
}

function PlacarNoMarinho({ rotulo, valor, nota, bateu = false, compacto = false }: { rotulo: string; valor: number | null; nota?: string; bateu?: boolean; compacto?: boolean }) {
  return (
    <span className={`shrink-0 text-right ${compacto ? 'w-[38px]' : 'w-[58px]'}`}>
      <span className={`block font-display leading-none ${compacto ? 'text-[22px]' : 'text-[32px]'} font-extrabold tracking-[-0.04em] whitespace-nowrap tabular-nums`}
            style={{ color: valor === null || valor === 0 ? 'var(--eq-t4)' : bateu ? 'var(--eq-ok)' : 'var(--eq-t1)' }}>
        {valor === null ? '—' : <NumeroVivo valor={valor} />}
        {nota && <span className="text-[13px] font-semibold align-top ml-0.5" style={{ color: 'var(--eq-t3)' }}>{nota}</span>}
      </span>
      <span className="block mt-1.5 text-[12.5px] whitespace-nowrap" style={{ color: 'var(--eq-t3)' }}>{rotulo}</span>
    </span>
  )
}

/** A resposta da equipe em três cartões de vidro, no pé do placar Marinho. */
export function RespostaNoMarinho({ tempos }: { tempos: PulseTempos }) {
  const p1 = tempos.primeiroContato, p2 = tempos.segundaTentativa
  const sla = p1.amostra > 0 ? p1.pctDentroSla : null
  const corSla = sla === null ? 'var(--m-t3)' : sla >= 80 ? 'var(--m-ok)' : sla >= 50 ? 'var(--m-alerta)' : 'var(--m-risco)'
  const itens: [string, ReactNode, string?][] = [
    ['1º contato', textoDaResposta(p1.medianaMin, p1.amostra)],
    ['2ª tentativa', textoDaResposta(p2.medianaMin, p2.amostra)],
    ['no prazo', sla === null ? '—' : `${sla}%`, corSla],
  ]
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {itens.map(([rotulo, valor, cor]) => (
        <div key={rotulo} className="dash-vidro !rounded-[20px] px-4 py-2.5 min-w-0">
          <p className="text-[13px] truncate" style={{ color: 'var(--m-t3)' }}>{rotulo} <span className="opacity-70 max-md:hidden">· 30 d</span></p>
          <p className="mt-1 font-display text-[26px] leading-none font-extrabold tracking-[-0.03em] tabular-nums" style={{ color: cor ?? 'var(--m-t1)' }}>{valor}</p>
        </div>
      ))}
    </div>
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

const FILA_MAX = 4

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
      <div className="px-5 pb-5">
        <p className="pulse-pilula flex items-center gap-3">
          <CheckCircle2 size={26} strokeWidth={1.8} className="shrink-0" style={{ color: 'var(--v-ok)' }} aria-hidden />
          <span className="font-display text-[18px] font-bold tracking-[-0.02em] text-t1">Fila vazia</span>
          <span className="text-[14.5px] text-t3 truncate">todo lead novo já foi chamado</span>
        </p>
      </div>
    )
  }

  const visiveis = ordenada.slice(0, FILA_MAX)
  const resto = ordenada.length - visiveis.length

  return (
    <ul className="flex-1 min-h-0 overflow-hidden px-5 pb-3">
      {visiveis.map(e => {
        const { urgencia, frac, faltaMs } = urgenciaDe(e.slaDueAt, agora, prazoMin)
        const texto = urgencia === 'risco' ? `venceu há ${textoDeMinutos(-faltaMs / 60_000)}`
          : urgencia === 'parado' ? `prazo ${diaEHora(e.slaDueAt)}`
          : `vence em ${textoDeMinutos(faltaMs / 60_000)}`
        const tomTexto = urgencia === 'risco' ? 'text-error' : urgencia === 'parado' ? 'text-t3' : urgencia === 'alerta' ? 'text-warning' : 'text-success'
        return (
          <li key={e.id} className="mb-2 pulse-item-in">
            <button type="button" onClick={() => abrirLead(e.id)} title="Abrir a ficha do lead"
                    className="pulse-pilula block w-full text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
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
  const base = 'flex w-full items-start gap-3 px-4 py-2.5 rounded-[22px] text-left'
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
        <ul className="px-5" aria-live="polite" aria-label="Registros da equipe hoje">
          {eventos.map((ev, i) => {
            const v = fraseDoCorretor(ev)
            // O mais recente é a linha escolhida da dashboard: pílula Marinho.
            return (
              <li key={ev.id} className={`mb-2 pulse-item-in ${i === 0 ? 'marinho pulse-pilula-ultima' : 'pulse-pilula-feed'}`}>
                <Linha leadId={ev.leadId}>
                <span className="w-[44px] shrink-0 pt-[2px] text-[14px] text-t4 tabular-nums">{horaCurta(ev.at)}</span>
                <span className="mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COR_DO_TOM[v.tone] }} aria-hidden />
                {/* a foto de quem fez, ao lado do nome em negrito */}
                {ev.brokerId && <FotoPerfil nome={nomes.get(ev.brokerId)} url={fotoDe(ev.brokerId)} tamanho={30} className="-mt-[3px]" />}
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

/** Os passos da safra, na régua da dashboard: chegaram → venda. */
const JOIA_DO_PASSO: LeadFunnelStage[] = ['atendimento', 'visita', 'proposta', 'venda']

export function etapasDaConversao(c: RelatorioConversao): EtapaFunil[] {
  return [
    { chave: 'recebidos', nome: 'Leads', n: c.received, joia: 'lead' },
    ...passos(c).map((p, i) => ({
      chave: JOIA_DO_PASSO[i] ?? p.para,
      nome: p.para === 'Venda' ? 'Vendas' : p.para,
      n: p.avancaram,
      joia: JOIA_DO_PASSO[i] ?? 'venda',
    })),
  ]
}

/**
 * O funil da imobiliária — protagonista da TV. 24/11/2026 (Rafael: "quero o
 * funil igual da dashboard, com os números no próprio funil"): o mesmo
 * FunilJoia do detalhe da dashboard, num bloco Marinho, enchendo o card.
 * Cada fatia traz quantos dos leads da janela chegaram ali; cada passagem, a
 * taxa do passo e quanto do topo chegou. A conta é a da aba Conversão
 * (lead_conversion_report, modo safra), para os números baterem. A escada de
 * conversão ao lado e o funil "agora" por etapa saíram — o "agora" fica numa
 * linha do cabeçalho.
 */
export function FunilDaImobiliaria({ porEtapa, conversao, janelaDias, empilhado = false }: {
  /** celular: altura natural em vez de encher a coluna */
  empilhado?: boolean
  porEtapa: Partial<Record<LeadFunnelStage, number>>
  conversao: RelatorioConversao | null
  janelaDias: number
}) {
  const ativos = ETAPAS_FUNIL.filter(e => e !== 'venda').reduce((t, e) => t + (porEtapa[e] ?? 0), 0)
  const etapas = conversao ? etapasDaConversao(conversao) : null
  const fim = conversao && etapas ? taxa(etapas[etapas.length - 1].n, conversao.received) : null

  return (
    <section className={`pulse-marinho pulse-funil marinho-bloco relative flex flex-col min-w-0 overflow-hidden ${empilhado ? 'rounded-[24px] p-4' : 'rounded-[28px] min-h-0 px-6 pt-5 pb-6'}`}
             aria-label="Funil da imobiliária">
      <header className="relative flex flex-wrap items-end gap-x-4 gap-y-2 shrink-0">
        <div className="min-w-0">
          <h2 className={`font-display font-bold tracking-[-0.02em] whitespace-nowrap ${empilhado ? 'text-[18px]' : 'text-[22px]'}`} style={{ color: 'var(--m-t1)' }}>
            {destacar('Funil da *imobiliária*')}
          </h2>
          <p className={`mt-1 leading-snug ${empilhado ? 'text-[13px]' : 'text-[14px]'}`} style={{ color: 'var(--m-t3)' }}>
            Quem chegou nos últimos {janelaDias} dias<br />
            <b className="tabular-nums" style={{ color: 'var(--m-t1)' }}>{ativos.toLocaleString('pt-BR')}</b> em andamento agora
          </p>
        </div>
        <div className="ml-auto text-right shrink-0">
          <p className={`font-display leading-none font-extrabold tracking-[-0.04em] tabular-nums ${empilhado ? 'text-[34px]' : 'text-[46px]'}`} style={{ color: 'var(--m-ouro)' }}>
            {fmtTaxa(fim)}
          </p>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--m-t2)' }}>dos leads viram venda</p>
        </div>
      </header>

      <div className={`dash-vidro relative mt-4 flex ${empilhado ? 'px-2 py-4' : 'flex-1 min-h-0 px-3 py-4'}`}>
        {etapas
          ? <FunilJoia escuro preencher={!empilhado} etapas={etapas}
                       rotulo={`Funil da imobiliária, leads que chegaram nos últimos ${janelaDias} dias`} />
          : <p className="m-auto px-4 text-center text-[15px]" style={{ color: 'var(--m-t2)' }}>
              Conversão indisponível agora — a leitura do banco falhou.
            </p>}
      </div>
    </section>
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
export function Batimento({ batidas, de, ate, agora, altura = 52 }: { batidas: Batida[]; de: number; ate: number; agora: number; altura?: number }) {
  const W = 1000, H = altura
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
      <div className="relative cursor-crosshair" style={{ height: H }} role="presentation"
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
        {horas.map((h, i) => (
          // no celular, uma hora sim, outra não: 17 rótulos não cabem em 400 px
          <span key={h} className={`absolute -translate-x-1/2 text-[12.5px] tabular-nums first:translate-x-0 last:-translate-x-full ${(h - de) % 2 && i !== horas.length - 1 ? 'max-md:hidden' : ''}`}
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
          <p className="mt-1 font-display text-[42px] leading-[0.95] font-extrabold tracking-[-0.045em]"
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

/**
 * Os mesmos números no celular (22/11/2026): duas colunas de cartões dentro da
 * faixa Marinho, número grande e a nota embaixo — a tela estreita não comporta
 * a fileira de seis da TV.
 */
export function NumerosNoCelular({ itens }: { itens: NumeroMarinho[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {itens.map((it, i) => (
        // número ímpar de itens: o último ocupa a linha toda (sem buraco)
        <div key={it.rotulo} className={`min-w-0 rounded-[16px] px-3.5 py-3 ${itens.length % 2 && i === itens.length - 1 ? 'col-span-2' : ''}`} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid var(--m-line)' }}>
          <p className="font-label text-[11px] uppercase tracking-[0.14em] truncate" style={{ color: 'var(--m-t3)' }}>{it.rotulo}</p>
          <p className="mt-1 font-display text-[34px] leading-[0.95] font-extrabold tracking-[-0.04em]"
             style={{ color: it.cor ? COR_MARINHO[it.cor] : 'var(--m-t1)' }}>
            {it.valor === null ? <span style={{ color: 'var(--m-t3)' }}>—</span> : <NumeroVivo valor={it.valor} />}
          </p>
          <div className="mt-1.5">
            {it.marca}
            {it.nota && <p className={`text-[12.5px] leading-snug ${it.marca ? 'mt-1' : ''}`} style={{ color: 'var(--m-t2)' }}>{it.nota}</p>}
          </div>
        </div>
      ))}
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
        <p className="mt-1 font-display text-[38px] leading-[0.95] font-extrabold tracking-[-0.045em] tabular-nums whitespace-nowrap" style={{ color: 'var(--m-ouro)' }}>
          {formatCurrency(vgl.realizadoMes)}
        </p>
        {/* o trilho listrado da meta da dashboard */}
        <span className="dash-trilho mt-2 block" aria-hidden>
          {pct > 0 && <span className="dash-trilho-cheio" style={{ width: `${Math.max(pct, 4)}%` }} />}
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
            <p className="mt-1 font-display text-[36px] leading-none font-extrabold tabular-nums" style={{ color: corSeca }}>{seca}</p>
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
