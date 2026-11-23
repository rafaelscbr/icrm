import { useId } from 'react'
import type { LeadFunnelStage } from '../../types'
import { JOIA } from '../../lib/paletaJoia'

/**
 * O funil do sistema — PADRÃO VISUAL OBRIGATÓRIO (Rafael, 23/11/2026: "sempre
 * que eu falo que quero um funil, eu quero nesse padrão"): fatias em trapézio,
 * empilhadas e centradas, cada uma no degradê joia da etapa, com o nome em
 * maiúsculas e o número grande em branco — a forma do funil do Pulse, em tons
 * mais claros, e com a conversão escrita ao lado de cada passagem.
 *
 * A largura das fatias é FORMA, não proporção: com 545 no topo e 5 no fundo,
 * fatias proporcionais virariam um traço. A proporção está nos números e nas
 * taxas.
 *
 *   à direita de cada passagem — quantos da etapa de cima avançaram (o passo)
 *   à esquerda — quanto do topo chegou até ali (o acumulado)
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

export function FunilJoia({ etapas, compacto = false, rotulo }: {
  etapas: EtapaFunil[]
  /** versão de cartão: fatias mais baixas, mesma forma */
  compacto?: boolean
  /** descrição para leitor de tela */
  rotulo: string
}) {
  const id = useId().replace(/:/g, '')
  const W = 600
  const H = compacto ? 54 : 70
  const VAO = compacto ? 16 : 20
  const TOPO = compacto ? 380 : 400
  const BASE = compacto ? 150 : 160
  const cx = W / 2
  const passo = (TOPO - BASE) / etapas.length
  const altura = etapas.length * (H + VAO) - VAO
  const topo = etapas[0]?.n ?? 0

  const fatias = etapas.map((e, i) => {
    const y = i * (H + VAO)
    const a = TOPO - i * passo, b = TOPO - (i + 1) * passo
    const pts = [[cx - a / 2, y], [cx + a / 2, y], [cx + b / 2, y + H], [cx - b / 2, y + H]]
    return { ...e, i, y, a, pontos: pts.map(p => p.join(',')).join(' ') }
  })

  const fsNome = compacto ? 13 : 14
  const fsNum = compacto ? 25 : 32
  const fsTaxa = compacto ? 17 : 18

  return (
    <svg viewBox={`0 -4 ${W} ${altura + 8}`} className="w-full h-auto overflow-visible" role="img"
         aria-label={`${rotulo}: ${etapas.map((e, i) =>
           `${e.nome} ${e.n.toLocaleString('pt-BR')}${i > 0 ? ` (${pct(e.n, etapas[i - 1].n)} da etapa anterior)` : ''}`).join(', ')}.`}>
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
        <clipPath id={`${id}-forma`}>{fatias.map(f => <polygon key={f.chave} points={f.pontos} />)}</clipPath>
        <radialGradient id={`${id}-champanhe`} cx="1" cy="0" r="1.1">
          <stop offset="0%" stopColor="#E8CF9C" stopOpacity="0.34" />
          <stop offset="55%" stopColor="#E8CF9C" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-luz`} x1="0" x2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="50%" stopColor="#fff" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {fatias.map(f => (
        <g key={f.chave} className="funil-fatia" style={{ animationDelay: `${f.i * 90}ms` }}>
          <polygon points={f.pontos} fill={`url(#${id}-${f.chave})`}
                   stroke="rgba(255,255,255,0.7)" strokeWidth={1.5} strokeLinejoin="round" />
          <text x={cx} y={f.y + H * (compacto ? 0.34 : 0.33)} textAnchor="middle"
                style={{ fill: 'rgba(255,255,255,0.94)', fontSize: fsNome, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            {f.nome}
          </text>
          <text x={cx} y={f.y + H * (compacto ? 0.83 : 0.8)} textAnchor="middle" className="font-display tabular-nums"
                style={{ fill: '#fff', fontSize: fsNum, fontWeight: 800, letterSpacing: '-0.02em' }}>
            {f.n.toLocaleString('pt-BR')}
          </text>
        </g>
      ))}

      {/* o brilho champanhe do canto e a luz que atravessa a forma */}
      <g clipPath={`url(#${id}-forma)`} aria-hidden pointerEvents="none">
        <rect x={0} y={0} width={W} height={altura} fill={`url(#${id}-champanhe)`} />
        <rect className="funil-brilho" x={0} y={-20} width={110} height={altura + 40} fill={`url(#${id}-luz)`} />
      </g>

      {/* conversão: o passo à direita, o acumulado à esquerda — na altura da passagem */}
      {fatias.slice(1).map(f => {
        const anterior = etapas[f.i - 1]
        const meio = f.y - VAO / 2
        const xd = cx + f.a / 2 + 18
        const xe = cx - f.a / 2 - 18
        const cor = JOIA[f.joia].medio
        const texto = `↓ ${pct(f.n, anterior.n)}`
        const largura = texto.length * fsTaxa * 0.6 + 22
        return (
          <g key={`taxa-${f.chave}`} aria-hidden>
            <rect x={xd} y={meio - fsTaxa * 0.9} width={largura} height={fsTaxa * 1.8} rx={fsTaxa * 0.9}
                  fill={cor} fillOpacity={0.12} />
            <text x={xd + largura / 2} y={meio + fsTaxa * 0.36} textAnchor="middle" className="tabular-nums"
                  style={{ fill: cor, fontSize: fsTaxa, fontWeight: 800 }}>
              {texto}
            </text>
            <text x={xe} y={meio + fsTaxa * 0.36} textAnchor="end" className="tabular-nums"
                  style={{ fill: 'var(--t4)', fontSize: fsTaxa - 2, fontWeight: 600 }}>
              {pct(f.n, topo)} do total
            </text>
          </g>
        )
      })}
    </svg>
  )
}
