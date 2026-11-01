import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { LineChart, BarChart, PieChart } from 'echarts/charts'
import {
  GridComponent, TooltipComponent, LegendComponent, MarkLineComponent,
} from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/core'
import { useThemeStore } from '../../store/useThemeStore'

/*
 * Gráficos do sistema — Apache ECharts com o tema Signature.
 *
 * Substitui o Recharts (31/10/2026). Só os módulos usados entram no pacote:
 * linha, barra e pizza, com grade, tooltip, legenda e linha de referência.
 * Renderer em SVG: texto nítido em qualquer zoom e nada de canvas borrado no
 * Retina.
 *
 * As cores NÃO são escritas aqui: saem dos tokens CSS no momento do desenho,
 * então o gráfico troca junto com o tema sem cada tela precisar saber disso.
 * Quem monta o gráfico recebe `t` (as cores resolvidas) e devolve a opção.
 */
echarts.use([
  LineChart, BarChart, PieChart,
  GridComponent, TooltipComponent, LegendComponent, MarkLineComponent,
  SVGRenderer,
])

export interface CoresGrafico {
  texto: string
  textoFraco: string
  linha: string
  superficie: string
  marca: string
  sucesso: string
  risco: string
  info: string
  atencao: string
  neutro: string
  fonte: string
}

function lerCores(): CoresGrafico {
  const css = getComputedStyle(document.documentElement)
  const v = (n: string) => css.getPropertyValue(n).trim()
  return {
    texto:      v('--t1'),
    textoFraco: v('--t4'),
    linha:      v('--line'),
    superficie: v('--surface'),
    marca:      v('--brand-fill'),
    sucesso:    v('--success'),
    risco:      v('--error'),
    info:       v('--info'),
    atencao:    v('--warning'),
    neutro:     v('--t3'),
    fonte:      "'Geist', system-ui, sans-serif",
  }
}

/** `var(--token)` → cor resolvida. O SVG do ECharts não entende var(). */
export function resolverCor(c: string): string {
  const m = /^var\((--[\w-]+)\)$/.exec(c.trim())
  if (!m) return c
  return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || c
}

/** Base comum: tipografia, tooltip e eixos no padrão da marca. */
function base(t: CoresGrafico, animar: boolean): EChartsCoreOption {
  return {
    animation: animar,
    // Paleta padrão da marca: série sem cor própria nunca cai no azul do ECharts.
    color: [t.marca, t.info, t.sucesso, t.atencao, t.neutro, t.risco],
    animationDuration: 600,
    animationDurationUpdate: 400,
    animationEasing: 'cubicOut',
    textStyle: { fontFamily: t.fonte, color: t.textoFraco, fontSize: 12 },
    grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: t.superficie,
      borderColor: t.linha,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: t.texto, fontFamily: t.fonte, fontSize: 13 },
      extraCssText: 'border-radius:12px;box-shadow:0 12px 32px -12px rgba(0,0,0,.45);',
      axisPointer: { type: 'line', lineStyle: { color: t.linha, width: 1 } },
    },
    legend: {
      top: 0, left: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, itemGap: 16,
      textStyle: { color: t.textoFraco, fontFamily: t.fonte, fontSize: 12 },
    },
  }
}

/** Eixo de categorias (meses, semanas, nomes). */
export function eixoCategoria(t: CoresGrafico, dados: string[], extra: Record<string, unknown> = {}) {
  return {
    type: 'category' as const,
    data: dados,
    axisLine: { lineStyle: { color: t.linha } },
    axisTick: { show: false },
    axisLabel: { color: t.textoFraco, fontSize: 12, hideOverlap: true },
    ...extra,
  }
}

/** Eixo de valores com grade discreta e formatação própria (R$, %, unidades). */
export function eixoValor(t: CoresGrafico, formatar?: (v: number) => string, extra: Record<string, unknown> = {}) {
  return {
    type: 'value' as const,
    splitNumber: 4,
    axisLabel: { color: t.textoFraco, fontSize: 12, formatter: formatar },
    splitLine: { lineStyle: { color: t.linha, type: 'dashed' as const } },
    ...extra,
  }
}

/**
 * Barras por período (mês, semana, dia) — o gráfico mais comum do sistema.
 * Valor escrito em cima de cada barra: comparar períodos não pode depender de
 * passar o mouse em cada uma.
 */
export function barrasPorPeriodo(t: CoresGrafico, rotulos: string[], valores: number[], o: {
  nome: string
  cor?: string
  formatar?: (v: number) => string
  formatarEixo?: (v: number) => string
  rotular?: boolean
} ) {
  const fmt = o.formatar ?? ((v: number) => String(v))
  return {
    grid: { left: 4, right: 8, top: 28, bottom: 4, containLabel: true },
    xAxis: eixoCategoria(t, rotulos),
    yAxis: eixoValor(t, o.formatarEixo ?? o.formatar, { minInterval: 1 }),
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      valueFormatter: (v: number) => fmt(v),
    },
    legend: { show: false },
    series: [{
      name: o.nome, type: 'bar', barMaxWidth: 34,
      itemStyle: { color: o.cor ?? t.marca, borderRadius: [6, 6, 0, 0] },
      label: {
        show: o.rotular ?? true, position: 'top', color: t.texto, fontSize: 11, fontWeight: 600,
        formatter: (p: { value: number }) => (p.value > 0 ? (o.formatarEixo ?? fmt)(p.value) : ''),
      },
      data: valores,
    }],
  }
}

export function Grafico({ opcao, altura = 260, rotulo, className = '' }: {
  /** Recebe as cores do tema já resolvidas e devolve a opção do ECharts. */
  opcao: (t: CoresGrafico) => EChartsCoreOption
  altura?: number
  /** Resumo em texto para leitor de tela — o gráfico em si é imagem. */
  rotulo: string
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inst = useRef<echarts.ECharts | null>(null)
  const tema = useThemeStore(s => s.theme)

  // Instância única por montagem; o ResizeObserver acompanha a largura do
  // card (sidebar recolhendo, janela mudando) sem re-render do React.
  useEffect(() => {
    if (!ref.current) return
    const c = echarts.init(ref.current, undefined, { renderer: 'svg' })
    inst.current = c
    const ro = new ResizeObserver(() => c.resize())
    ro.observe(ref.current)
    return () => { ro.disconnect(); c.dispose(); inst.current = null }
  }, [])

  useEffect(() => {
    const c = inst.current
    if (!c) return
    // O tema troca a classe do <html> no mesmo ciclo; um quadro de espera
    // garante que os tokens já mudaram antes de lermos as cores.
    const id = requestAnimationFrame(() => {
      const animar = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const t = lerCores()
      c.setOption({ ...base(t, animar), ...opcao(t) }, { notMerge: true })
    })
    return () => cancelAnimationFrame(id)
  }, [opcao, tema])

  return (
    <div
      ref={ref}
      role="img"
      aria-label={rotulo}
      className={`w-full ${className}`}
      style={{ height: altura }}
    />
  )
}
