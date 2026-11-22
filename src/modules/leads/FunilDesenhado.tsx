import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useContagem } from '../../hooks/useContagem'
import type { EtapaSafra } from './safra'

/**
 * O desenho do funil — a mesma forma do Pulse (22/11/2026), para a aba
 * Conversão: fatias em trapézio que afinam de cima para baixo, cada uma com o
 * degradê da sua etapa e o número escrito dentro. É uma FORMA, não um gráfico
 * de proporção: com 534 leads no topo e 5 vendas embaixo, fatias proporcionais
 * virariam um traço. A proporção fica nos números e na escada ao lado.
 *
 * Dois tamanhos: `grande` (o funil da safra, com o mouse) e `mini` (um por
 * corretor ou produto, lado a lado).
 */

export type ChaveFatia = EtapaSafra | 'chegada'

/** Do claro (topo) ao profundo — texto branco legível em todas. As do Pulse. */
export const FATIA: Record<ChaveFatia, [string, string]> = {
  chegada:     ['#818CF8', '#4F46E5'],
  atendimento: ['#38BDF8', '#0284C7'],
  visita:      ['#2DD4BF', '#0D9488'],
  proposta:    ['#FBBF24', '#D97706'],
  venda:       ['#4ADE80', '#16A34A'],
}

export interface FatiaDesenho { chave: ChaveFatia; nome: string; n: number }

const GEO = {
  grande: { W: 440, H: 64, VAO: 8, TOPO: 430, BASE: 140 },
  mini:   { W: 240, H: 30, VAO: 3, TOPO: 238, BASE: 86 },
}

function ContagemSvg({ valor, ...props }: { valor: number } & React.SVGProps<SVGTextElement>) {
  const v = useContagem(valor)
  const anterior = useRef(valor)
  const [acende, setAcende] = useState(0)
  useEffect(() => {
    if (anterior.current !== valor) { anterior.current = valor; setAcende(a => a + 1) }
  }, [valor])
  return <text key={acende} className={acende ? 'pulse-acende' : undefined} {...props}>{Math.round(v).toLocaleString('pt-BR')}</text>
}

export function FunilDesenhado({ fatias, tamanho = 'grande', foco = null, onFoco, rotulo, dica }: {
  fatias: FatiaDesenho[]
  tamanho?: 'grande' | 'mini'
  foco?: ChaveFatia | null
  onFoco?: (c: ChaveFatia | null) => void
  rotulo: string
  /** cartão que aparece sobre a fatia em foco (só no grande) */
  dica?: ReactNode
}) {
  const id = useId().replace(/:/g, '')
  const g = GEO[tamanho]
  const mini = tamanho === 'mini'
  const passo = (g.TOPO - g.BASE) / fatias.length
  const altura = fatias.length * (g.H + g.VAO) - g.VAO
  const cx = g.W / 2
  const formas = fatias.map((f, i) => {
    const y = i * (g.H + g.VAO)
    const a = g.TOPO - i * passo, b = g.TOPO - (i + 1) * passo
    return { ...f, i, y, pontos: [[cx - a / 2, y], [cx + a / 2, y], [cx + b / 2, y + g.H], [cx - b / 2, y + g.H]].map(p => p.join(',')).join(' ') }
  })

  return (
    <div className="relative flex items-center justify-center min-h-0" role="presentation" onMouseLeave={() => onFoco?.(null)}>
      <svg viewBox={`0 -4 ${g.W} ${altura + 8}`} className={`${mini ? 'w-full max-w-[240px]' : 'w-full max-w-[440px]'} h-auto overflow-visible`}
           role="img" aria-label={rotulo}>
        <defs>
          {formas.map(f => (
            <linearGradient key={f.chave} id={`${id}-${f.chave}`} x1="0" y1="0" x2="0.45" y2="1">
              <stop offset="0%" stopColor={FATIA[f.chave][0]} />
              <stop offset="100%" stopColor={FATIA[f.chave][1]} />
            </linearGradient>
          ))}
          <clipPath id={`${id}-forma`}>{formas.map(f => <polygon key={f.chave} points={f.pontos} />)}</clipPath>
          <linearGradient id={`${id}-luz`} x1="0" x2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity="0" />
            <stop offset="50%" stopColor="#fff" stopOpacity="0.30" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {formas.map(f => {
          const recua = foco !== null && foco !== f.chave
          const corpo = (
            <g style={{
              transformBox: 'fill-box', transformOrigin: 'center',
              transform: foco === f.chave ? 'scale(1.045)' : 'none',
              opacity: recua ? 0.38 : 1,
              transition: 'transform 260ms cubic-bezier(.2,.8,.2,1), opacity 260ms ease',
            }}>
              <polygon points={f.pontos} fill={`url(#${id}-${f.chave})`} stroke="rgba(255,255,255,0.6)" strokeWidth={mini ? 1 : 1.5} strokeLinejoin="round" />
              {mini ? (
                <text x={cx} y={f.y + 20} textAnchor="middle" pointerEvents="none">
                  <tspan style={{ fill: 'rgba(255,255,255,0.88)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em' }}>
                    {f.nome.toUpperCase()}
                  </tspan>
                  <tspan dx={6} className="font-display" style={{ fill: '#fff', fontSize: 14.5, fontWeight: 800 }}>
                    {f.n.toLocaleString('pt-BR')}
                  </tspan>
                </text>
              ) : (
                <>
                  <text x={cx} y={f.y + 22} textAnchor="middle" pointerEvents="none"
                        style={{ fill: 'rgba(255,255,255,0.9)', fontSize: 12.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                    {f.nome}
                  </text>
                  <ContagemSvg valor={f.n} x={cx} y={f.y + 53} textAnchor="middle" pointerEvents="none" className="font-display tabular-nums"
                               style={{ fill: '#fff', fontSize: 29, fontWeight: 800, letterSpacing: '-0.02em' }} />
                </>
              )}
            </g>
          )
          return mini ? (
            <g key={f.chave}>{corpo}</g>
          ) : (
            <g key={f.chave} className="funil-fatia cursor-pointer focus:outline-none" style={{ animationDelay: `${f.i * 110}ms` }}
               role="button" tabIndex={0} aria-label={`${f.nome}: ${f.n}`}
               onMouseEnter={() => onFoco?.(f.chave)} onFocus={() => onFoco?.(f.chave)} onBlur={() => onFoco?.(null)}
               onKeyDown={e => { if (e.key === 'Escape') onFoco?.(null) }}>
              {corpo}
            </g>
          )
        })}

        {!mini && (
          <g clipPath={`url(#${id}-forma)`} aria-hidden pointerEvents="none">
            <rect className="funil-brilho" x={0} y={-20} width={110} height={altura + 40} fill={`url(#${id}-luz)`} />
          </g>
        )}
      </svg>
      {dica}
    </div>
  )
}
