import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Target, CalendarX } from 'lucide-react'
import type { LeadFunnelStage } from '../../../types'
import { STAGE_THEME } from '../../../lib/stageTheme'
import { destacar } from '../../../components/shared/Destaque'
import { Grafico, eixoCategoria, eixoValor, resolverCor } from '../../../components/charts/Grafico'
import type { CoresGrafico } from '../../../components/charts/Grafico'
import { ETAPAS_FUNIL, fraseDoCorretor, rotuloDia } from '../../leads/dashboardLeads'
import { NumeroVivo } from '../../leads/PainelMonitor'
import { formatCurrency } from '../../../lib/formatters'
import { agruparFeed, horaCurta } from '../pulseEvents'
import type { PulseTone } from '../pulseEvents'
import type { PulseEvent, PulseVgl } from '../types'

/**
 * As peças da sala de comando do Pulse — o que veio do Dashboard de Leads
 * (22/11/2026), redesenhado para a TV: vista de longe, nunca tocada, sempre
 * dentro de uma tela só. Cada bloco preenche o espaço que o layout der.
 */

// ─── Moldura de bloco ─────────────────────────────────────────────────────────

/** Bloco da sala: superfície do sistema, filete + ícone + título (princípio 4). */
export function Bloco({ icon: Icon, titulo, extra, children, className = '' }: {
  icon: LucideIcon
  titulo: string
  extra?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-[16px] border border-line surface-premium shadow-card overflow-hidden flex flex-col min-h-0 min-w-0 ${className}`}>
      <header className="flex items-center gap-2.5 px-5 pt-4 pb-3 shrink-0">
        <span className="w-1 h-4 rounded-full bg-brand" aria-hidden />
        <Icon size={17} strokeWidth={1.6} className="text-t3" aria-hidden />
        <h2 className="font-display text-[17px] font-bold tracking-[-0.015em] text-t1">{destacar(titulo)}</h2>
        {extra && <div className="ml-auto min-w-0">{extra}</div>}
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

// ─── Faixa do agora ───────────────────────────────────────────────────────────

export interface ItemFaixa {
  rotulo: string
  valor: number | string | null
  /** cor do número — só tom semântico (princípio 1) */
  tom?: 'text-t1' | 'text-warning' | 'text-error' | 'text-success'
  nota?: ReactNode
}

/**
 * Os números do momento, lado a lado. O número é o maior elemento da tela;
 * o rótulo é pequeno e maiúsculo; a nota diz contra o quê comparar.
 * `null` = ainda não dá para afirmar (dado não chegou): mostra um traço.
 */
export function FaixaAgora({ itens, destaque }: { itens: ItemFaixa[]; destaque?: ReactNode }) {
  return (
    <div className="grid gap-3 shrink-0" style={{ gridTemplateColumns: `repeat(${itens.length}, minmax(0, 1fr))${destaque ? ' minmax(0, 1.55fr)' : ''}` }}>
      {itens.map(it => (
        <div key={it.rotulo} className="rounded-[16px] border border-line surface-premium shadow-card px-5 py-4 min-w-0">
          <p className="font-label text-[11.5px] uppercase tracking-[0.14em] text-t3 truncate">{it.rotulo}</p>
          <p className={`mt-1.5 font-display text-[44px] leading-none font-extrabold tracking-[-0.03em] ${it.tom ?? 'text-t1'}`}>
            {it.valor === null ? <span className="text-t4">—</span> : <NumeroVivo valor={it.valor} />}
          </p>
          {it.nota && <p className="mt-2 text-[13px] text-t3 truncate">{it.nota}</p>}
        </div>
      ))}
      {destaque}
    </div>
  )
}

// ─── Meta do mês ──────────────────────────────────────────────────────────────

/** A partir daqui a seca de vendas deixa de ser normal e vira alerta. */
const SECA_ALERTA = 7
const SECA_GRAVE  = 15

/**
 * VGL do mês contra a meta — o ÚNICO dourado da tela (princípio 2): dinheiro,
 * meta e marca ao mesmo tempo. Ao lado, o ritmo que falta por dia útil e há
 * quantos dias não sai venda (o número desconfortável de propósito).
 */
export function MetaDoMes({ vgl }: { vgl: PulseVgl | null }) {
  if (!vgl) {
    return <div className="rounded-[16px] border border-line surface-premium shadow-card px-5 py-4 min-w-0 shimmer" aria-busy="true" />
  }
  const pct = vgl.metaMes > 0 ? Math.min(100, Math.round((vgl.realizadoMes / vgl.metaMes) * 100)) : 0
  const porDia = vgl.diasUteisRestantes > 0 ? vgl.faltaParaMeta / vgl.diasUteisRestantes : null
  const seca = vgl.diasSemVenda
  const corSeca = seca === null ? 'text-t4' : seca >= SECA_GRAVE ? 'text-error' : seca >= SECA_ALERTA ? 'text-warning' : 'text-success'

  return (
    <div className="relative rounded-[16px] border border-line surface-premium shadow-card px-5 py-4 min-w-0 gold-edge gold-glow-tl flex gap-5">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 font-label text-[11.5px] uppercase tracking-[0.14em] text-t3">
          <Target size={14} strokeWidth={1.6} aria-hidden /> VGL do mês · {pct}% da meta
        </p>
        <p className="mt-1.5 flex items-baseline gap-2 min-w-0">
          <span className="font-display text-[40px] leading-none font-extrabold tracking-[-0.03em] text-brand tabular-nums truncate">
            {formatCurrency(vgl.realizadoMes)}
          </span>
          <span className="font-label text-[12px] uppercase tracking-[0.12em] text-t4 whitespace-nowrap">de {formatCurrency(vgl.metaMes)}</span>
        </p>
        <div className="h-2 rounded-full bg-s3 overflow-hidden mt-2.5">
          <div className="h-full rounded-full bg-brand-fill transition-[width] duration-[420ms]" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-[13px] text-t3 truncate tabular-nums">
          {vgl.faltaParaMeta <= 0 ? 'meta do mês batida'
            : porDia === null ? `faltam ${formatCurrency(vgl.faltaParaMeta)}`
            : `faltam ${formatCurrency(vgl.faltaParaMeta)} · ${formatCurrency(porDia)}/dia útil`}
        </p>
      </div>
      <div className="shrink-0 pl-5 border-l border-line/70 flex flex-col justify-center items-start">
        <CalendarX size={16} strokeWidth={1.6} className={corSeca} aria-hidden />
        {seca === null ? (
          <p className="mt-1 font-label text-[11px] uppercase tracking-[0.12em] text-t4 leading-tight">nenhuma<br />venda</p>
        ) : (
          <>
            <p className={`mt-1 font-display text-[36px] leading-none font-extrabold tabular-nums ${corSeca}`}>{seca}</p>
            <p className="font-label text-[11px] uppercase tracking-[0.12em] text-t4 leading-tight mt-1">{seca === 1 ? 'dia' : 'dias'}<br />sem venda</p>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Leads por dia ────────────────────────────────────────────────────────────

/** Média dos dias anteriores a hoje — hoje ainda está em andamento. */
export function mediaSemHoje(serie: { n: number }[]): number | null {
  const fechados = serie.slice(0, -1)
  if (fechados.length === 0) return null
  return fechados.reduce((s, p) => s + p.n, 0) / fechados.length
}

export function GraficoLeads({ serie }: { serie: { data: string; n: number }[] }) {
  const [ref, altura] = useAltura<HTMLDivElement>()
  const media = mediaSemHoje(serie)

  const opcao = useCallback((t: CoresGrafico) => {
    const ultimo = serie.length - 1
    const neutro = resolverCor('var(--stage-lead)')
    return {
      grid: { left: 4, right: 14, top: 26, bottom: 2, containLabel: true },
      legend: { show: false },
      tooltip: { show: false },
      xAxis: { ...eixoCategoria(t, serie.map((p, i) => rotuloDia(p.data, i === ultimo))), axisLabel: { color: t.textoFraco, fontSize: 12, interval: 6 } },
      yAxis: { ...eixoValor(t, undefined, { minInterval: 1 }), axisLabel: { color: t.textoFraco, fontSize: 12 } },
      series: [{
        name: 'Leads recebidos', type: 'bar', barMaxWidth: 22,
        // Hoje é a única barra dourada: é o dia que ainda está acontecendo.
        data: serie.map((p, i) => ({
          value: p.n,
          itemStyle: { color: i === ultimo ? t.marca : neutro, opacity: i === ultimo ? 1 : 0.42, borderRadius: [5, 5, 0, 0] },
        })),
        markLine: media === null ? undefined : {
          silent: true, symbol: 'none',
          lineStyle: { color: t.textoFraco, type: 'dashed', width: 1 },
          label: { formatter: `média ${media.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}`, color: t.textoFraco, fontSize: 12, position: 'insideEndTop' },
          data: [{ yAxis: media }],
        },
      }],
    }
  }, [serie, media])

  const total = serie.reduce((s, p) => s + p.n, 0)
  return (
    <div ref={ref} className="flex-1 min-h-0 px-3 pb-3">
      {altura > 40 && (
        <Grafico
          altura={altura}
          opcao={opcao}
          rotulo={`Leads recebidos por dia nos últimos ${serie.length} dias: ${total} no total, ${serie[serie.length - 1]?.n ?? 0} hoje.`}
        />
      )}
    </div>
  )
}

// ─── Funil desenhado ──────────────────────────────────────────────────────────

/**
 * O funil é uma FORMA, não um gráfico de proporção: com 90 leads em followup
 * e 1 em proposta, barras proporcionais virariam um traço. A silhueta afunila
 * por posição; cada fatia leva a cor da etapa, o nome e o número DENTRO dela.
 * Preenchimento tingido (não sólido) para o texto ler igual nos dois temas.
 */
export function FunilDesenhado({ porEtapa, vendasNoMes }: {
  porEtapa: Partial<Record<LeadFunnelStage, number>>
  vendasNoMes: number | null
}) {
  const L = 320, H = 62, VAO = 6, PASSO = 34
  const linhas = ETAPAS_FUNIL.map(e => ({
    etapa: e,
    nome: e === 'venda' ? 'Vendas no mês' : STAGE_THEME[e].columnLabel,
    n: e === 'venda' ? vendasNoMes : (porEtapa[e] ?? 0),
    cor: STAGE_THEME[e].solidVar,
  }))
  const altura = linhas.length * (H + VAO) - VAO

  return (
    <div className="flex-1 min-h-0 flex items-center justify-center px-4 pb-4">
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
              <polygon points={pontos} strokeWidth={1.5} strokeLinejoin="round"
                style={{ fill: `color-mix(in srgb, ${l.cor} 20%, transparent)`, stroke: l.cor }} />
              <text x={L / 2} y={y + 23} textAnchor="middle" className="font-label"
                style={{ fill: 'var(--t2)', fontSize: 11.5, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{l.nome}</text>
              <text x={L / 2} y={y + 50} textAnchor="middle" className="font-display tabular-nums"
                style={{ fill: 'var(--t1)', fontSize: 24, fontWeight: 800 }}>
                {l.n === null ? '—' : l.n.toLocaleString('pt-BR')}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ─── Registros ao vivo ────────────────────────────────────────────────────────

/** Ícone do evento dentro de um disco tingido pelo tom — cor sempre com ícone. */
const TOM_DISCO: Record<PulseTone, string> = {
  neutral: 'bg-s2 text-t3',
  good:    'bg-info-bg text-info',
  warn:    'bg-warning-bg text-warning',
  win:     'bg-success-bg text-success',
}

/** Na TV não há rolagem: cabem as linhas mais recentes; a mais nova entra no topo. */
const LINHAS_MAX = 40

/**
 * Tudo o que a equipe registrou hoje, do mais recente para o mais antigo, com o
 * nome de quem fez. O que não cabe na altura simplesmente não aparece — numa
 * tela que ninguém toca, rolar não existe.
 */
export function RegistrosAoVivo({ feed, nomes, carregado }: {
  feed: PulseEvent[]
  /** id → primeiro nome de quem aparece na sala */
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
        <div className="m-5 h-40 rounded-[12px] shimmer" aria-busy="true" />
      ) : eventos.length === 0 ? (
        <p className="text-[15px] text-t4 px-5 py-12 text-center">Nenhum registro hoje ainda.</p>
      ) : (
        <ul className="pb-2" aria-live="polite" aria-label="Registros da equipe hoje">
          {eventos.map(ev => {
            const v = fraseDoCorretor(ev)
            const Icone = v.icon
            return (
              <li key={ev.id} className="flex items-start gap-3 px-5 py-2.5 border-t border-line/60 first:border-t-0 pulse-item-in">
                <span className="w-[46px] flex-shrink-0 pt-[6px] font-label text-[13px] text-t4 tabular-nums">{horaCurta(ev.at)}</span>
                <span className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${TOM_DISCO[v.tone]}`} aria-hidden>
                  <Icone size={15} strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1 pt-[4px]">
                  <span className="block text-[15px] text-t1 leading-snug truncate">
                    {ev.brokerId && <span className="font-semibold">{nomes.get(ev.brokerId)} · </span>}
                    {v.texto}
                  </span>
                  {v.detalhe && <span className="block text-[13px] text-t3 truncate mt-0.5">{v.detalhe}</span>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {/* o fim da lista some num degradê em vez de cortar uma linha ao meio */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16" style={{ background: 'linear-gradient(to bottom, transparent, var(--surface))' }} aria-hidden />
    </div>
  )
}

// ─── Legenda da linha do dia ──────────────────────────────────────────────────

/** O que cada cor de traço quer dizer na linha do dia — quatro palavras, sem caixa. */
export function LegendaDaLinha({ ontem }: { ontem: string | null }) {
  const itens: [string, string][] = [
    ['var(--info)', 'contato'],
    ['var(--success)', 'interesse ou visita'],
    ['var(--warning)', 'descarte'],
    ['var(--t3)', 'anotação'],
  ]
  return (
    <ul className="flex items-center gap-x-4 text-[12.5px] text-t3" aria-label="Cores da linha do dia">
      {itens.map(([cor, nome]) => (
        <li key={nome} className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="h-3 w-[3px] rounded-full" style={{ background: cor }} aria-hidden /> {nome}
        </li>
      ))}
      {ontem && <li className="pl-4 border-l border-line text-t4 whitespace-nowrap">{ontem}</li>}
    </ul>
  )
}
