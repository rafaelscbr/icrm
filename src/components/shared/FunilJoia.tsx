import { useEffect, useId, useRef, useState } from 'react'
import type { LeadFunnelStage } from '../../types'
import { JOIA } from '../../lib/paletaJoia'

/**
 * O funil do sistema — PADRÃO VISUAL OBRIGATÓRIO (Rafael, 23/11/2026: "sempre
 * que eu falo que quero um funil, eu quero nesse padrão"): fatias em trapézio,
 * empilhadas e centradas, cada uma no degradê joia da etapa, com o nome em
 * maiúsculas e o número grande em branco — a forma do funil do Pulse, em tons
 * mais claros, e com a conversão escrita em cada passagem. Sem brilho animado
 * (pedido dele).
 *
 * A largura das fatias é FORMA, não proporção: com 545 no topo e 5 no fundo,
 * fatias proporcionais virariam um traço. A proporção está nos números e nas
 * taxas.
 *
 * O desenho é medido em PIXELS (a caixa é observada e o viewBox é a largura
 * real): a letra tem sempre o mesmo tamanho, no celular e no computador — num
 * SVG que só escala, a letra lateral virava 7 px no celular.
 *
 *   largo   — o passo (quantos da etapa de cima avançaram) à direita da
 *             passagem e o acumulado (quanto do topo chegou) à esquerda
 *   estreito — os dois numa etiqueta só, centrada no vão entre as fatias,
 *             e o funil ocupa a largura toda
 */

export interface EtapaFunil {
  chave: string
  nome: string
  n: number
  /** a cor da etapa na paleta joia */
  joia: LeadFunnelStage
}

/** Mistura com branco: 0 = a cor, 1 = branco. */
function clarear(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.round(v + (255 - v) * t))
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`
}

function pct(parte: number, base: number): string {
  if (base <= 0) return '—'
  const v = (parte / base) * 100
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: v < 10 ? 1 : 0 })}%`
}

/** Largura aproximada de um texto (Inter/Manrope, peso alto). */
const larguraTexto = (t: string, fs: number) => t.length * fs * 0.6

/** Abaixo disto, as taxas vão para o vão entre as fatias. */
const ESTREITO = 520

export function FunilJoia({ etapas, compacto = false, rotulo }: {
  etapas: EtapaFunil[]
  /** versão de cartão: fatias mais baixas, mesma forma */
  compacto?: boolean
  /** descrição para leitor de tela */
  rotulo: string
}) {
  const id = useId().replace(/:/g, '')
  const caixa = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(0)

  useEffect(() => {
    const el = caixa.current
    if (!el) return
    const medir = () => setW(Math.round(el.getBoundingClientRect().width))
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const estreito = W > 0 && W < ESTREITO

  // Tipografia em px — igual em qualquer largura.
  const fsNome = compacto ? 12 : (estreito ? 14 : 15)
  const fsNum  = compacto ? 26 : (estreito ? 30 : 40)
  const fsTaxa = compacto ? 14 : 16
  const fsLado = compacto ? 13 : 14

  const H   = compacto ? 58 : (estreito ? 72 : 92)
  const VAO = estreito ? (compacto ? 32 : 36) : (compacto ? 12 : 14)

  // Espaço lateral para as taxas (só no largo).
  const lado = estreito ? 0 : Math.max(
    larguraTexto('↓ 100%', fsTaxa) + 22,
    larguraTexto('99,9% do total', fsLado),
  ) + 16
  const cx = W / 2
  const TOPO = Math.max(0, Math.min(W - 2 * lado, compacto ? 460 : 640))
  const BASE = TOPO * 0.42
  const passo = (TOPO - BASE) / Math.max(1, etapas.length)
  const altura = etapas.length * (H + VAO) - VAO
  const topo = etapas[0]?.n ?? 0

  const fatias = etapas.map((e, i) => {
    const y = i * (H + VAO)
    const a = TOPO - i * passo, b = TOPO - (i + 1) * passo
    const pts = [[cx - a / 2, y], [cx + a / 2, y], [cx + b / 2, y + H], [cx - b / 2, y + H]]
    return { ...e, i, y, a, pontos: pts.map(p => p.join(',')).join(' ') }
  })

  const descricao = `${rotulo}: ${etapas.map((e, i) =>
    `${e.nome} ${e.n.toLocaleString('pt-BR')}${i > 0 ? ` (${pct(e.n, etapas[i - 1].n)} da etapa anterior)` : ''}`).join(', ')}.`

  return (
    <div ref={caixa} className="w-full">
      {W > 0 && (
        <svg width={W} height={altura + 8} viewBox={`0 -4 ${W} ${altura + 8}`} className="block overflow-visible"
             role="img" aria-label={descricao}>
          <defs>
            {fatias.map(f => {
              const j = JOIA[f.joia]
              return (
                <linearGradient key={f.chave} id={`${id}-${f.chave}`} x1="0" y1="0" x2="0.5" y2="1">
                  <stop offset="0%" stopColor={clarear(j.claro, 0.3)} />
                  <stop offset="55%" stopColor={clarear(j.claro, 0.12)} />
                  <stop offset="100%" stopColor={j.claro} />
                </linearGradient>
              )
            })}
          </defs>

          {fatias.map(f => (
            <g key={f.chave} className="funil-fatia" style={{ animationDelay: `${f.i * 90}ms` }}>
              <polygon points={f.pontos} fill={`url(#${id}-${f.chave})`}
                       stroke="rgba(255,255,255,0.7)" strokeWidth={1.5} strokeLinejoin="round" />
              <text x={cx} y={f.y + H * 0.36} textAnchor="middle"
                    style={{ fill: 'rgba(255,255,255,0.95)', fontSize: fsNome, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                {f.nome}
              </text>
              <text x={cx} y={f.y + H * 0.8} textAnchor="middle" className="font-display tabular-nums"
                    style={{ fill: '#fff', fontSize: fsNum, fontWeight: 800, letterSpacing: '-0.02em' }}>
                {f.n.toLocaleString('pt-BR')}
              </text>
            </g>
          ))}

          {/* conversão em cada passagem */}
          {fatias.slice(1).map(f => {
            const anterior = etapas[f.i - 1]
            const meio = f.y - VAO / 2
            const cor = JOIA[f.joia].medio
            const passoTxt = `↓ ${pct(f.n, anterior.n)}`

            if (estreito) {
              // Uma etiqueta só, centrada no vão: "↓ 12% avançam · 2,2% do total"
              const total = ` · ${pct(f.n, topo)} do total`
              const w = larguraTexto(passoTxt + ' avançam', fsTaxa) + larguraTexto(total, fsLado) + 20
              return (
                <g key={`taxa-${f.chave}`} aria-hidden>
                  <rect x={cx - w / 2} y={meio - fsTaxa * 0.85} width={w} height={fsTaxa * 1.7} rx={fsTaxa * 0.85}
                        fill={cor} fillOpacity={0.12} />
                  <text x={cx} y={meio + fsTaxa * 0.36} textAnchor="middle" className="tabular-nums">
                    <tspan style={{ fill: cor, fontSize: fsTaxa, fontWeight: 800 }}>{passoTxt}</tspan>
                    <tspan style={{ fill: cor, fontSize: fsTaxa, fontWeight: 600 }}> avançam</tspan>
                    <tspan style={{ fill: 'var(--t4)', fontSize: fsLado, fontWeight: 600 }}>{total}</tspan>
                  </text>
                </g>
              )
            }

            const w = larguraTexto(passoTxt, fsTaxa) + 22
            const xd = cx + f.a / 2 + 14
            const xe = cx - f.a / 2 - 14
            return (
              <g key={`taxa-${f.chave}`} aria-hidden>
                <rect x={xd} y={meio - fsTaxa * 0.9} width={w} height={fsTaxa * 1.8} rx={fsTaxa * 0.9}
                      fill={cor} fillOpacity={0.12} />
                <text x={xd + w / 2} y={meio + fsTaxa * 0.36} textAnchor="middle" className="tabular-nums"
                      style={{ fill: cor, fontSize: fsTaxa, fontWeight: 800 }}>
                  {passoTxt}
                </text>
                <text x={xe} y={meio + fsLado * 0.36} textAnchor="end" className="tabular-nums"
                      style={{ fill: 'var(--t4)', fontSize: fsLado, fontWeight: 600 }}>
                  {pct(f.n, topo)} do total
                </text>
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}
