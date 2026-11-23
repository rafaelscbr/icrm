import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useContagem } from '../../hooks/useContagem'
import type { EtapaSafra } from './safra'

/**
 * O desenho do funil (a forma do Pulse) para a aba Conversão: fatias em
 * trapézio que afinam de cima para baixo, com o número escrito dentro. É uma
 * FORMA, não um gráfico de proporção — a proporção fica nos números.
 *
 * Cor (22/11/2026, versão minimalista): uma família só. O funil desce do azul
 * da Folha ao Marinho — quanto mais fundo no funil, mais escuro — e a venda,
 * que é dinheiro, é champanhe. Nada de arco-íris: a cor diz "profundidade" e
 * "venda", e só.
 *
 * Dois tamanhos: `grande` (com o mouse) e `mini` (lado a lado).
 */

export type ChaveFatia = EtapaSafra | 'chegada'

/**
 * fill  — a fatia do funil
 * texto — o que vai escrito dentro dela
 * barra — a mesma etapa sobre fundo branco (barras, pontos, linhas, taxas)
 */
export const TOM: Record<ChaveFatia, { fill: string; texto: string; barra: string }> = {
  chegada:     { fill: '#E6EBF5', texto: '#0F2759', barra: '#A9B7D9' },
  atendimento: { fill: '#B8C5E3', texto: '#0F2759', barra: '#7F95CC' },
  visita:      { fill: '#7088C2', texto: '#FFFFFF', barra: '#5470B5' },
  proposta:    { fill: '#2F4789', texto: '#FFFFFF', barra: '#2F4789' },
  venda:       { fill: '#C9A45C', texto: '#FFFFFF', barra: '#B8913F' },
}
/** Descartado: cinza neutro — sai do funil, não é etapa. */
export const TOM_DESCARTE = '#D5DAE4'

export interface FatiaDesenho { chave: ChaveFatia; nome: string; n: number }

const GEO = {
  grande: { W: 440, H: 58, VAO: 4, TOPO: 430, BASE: 150 },
  mini:   { W: 240, H: 28, VAO: 2, TOPO: 238, BASE: 90 },
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
      <svg viewBox={`0 -4 ${g.W} ${altura + 8}`} className={`${mini ? 'w-full max-w-[240px]' : 'w-full max-w-[420px]'} h-auto overflow-visible`}
           role="img" aria-label={rotulo}>
        {formas.map(f => {
          const recua = foco !== null && foco !== f.chave
          const t = TOM[f.chave]
          const corpo = (
            <g style={{
              transformBox: 'fill-box', transformOrigin: 'center',
              transform: foco === f.chave ? 'scale(1.03)' : 'none',
              opacity: recua ? 0.35 : 1,
              transition: 'transform 240ms cubic-bezier(.2,.8,.2,1), opacity 240ms ease',
            }}>
              <polygon points={f.pontos} fill={t.fill} strokeLinejoin="round" />
              {mini ? (
                <text x={cx} y={f.y + 18.5} textAnchor="middle" pointerEvents="none">
                  <tspan style={{ fill: t.texto, opacity: 0.75, fontSize: 8.5, fontWeight: 600, letterSpacing: '0.12em' }}>
                    {f.nome.toUpperCase()}
                  </tspan>
                  <tspan dx={6} style={{ fill: t.texto, fontSize: 13, fontWeight: 700 }}>
                    {f.n.toLocaleString('pt-BR')}
                  </tspan>
                </text>
              ) : (
                <>
                  <text x={cx} y={f.y + 21} textAnchor="middle" pointerEvents="none"
                        style={{ fill: t.texto, opacity: 0.75, fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                    {f.nome}
                  </text>
                  <ContagemSvg valor={f.n} x={cx} y={f.y + 46} textAnchor="middle" pointerEvents="none" className="font-display tabular-nums"
                               style={{ fill: t.texto, fontSize: 23, fontWeight: 700, letterSpacing: '-0.02em' }} />
                </>
              )}
            </g>
          )
          return mini ? (
            <g key={f.chave}>{corpo}</g>
          ) : (
            <g key={f.chave} className="funil-fatia cursor-pointer focus:outline-none" style={{ animationDelay: `${f.i * 90}ms` }}
               role="button" tabIndex={0} aria-label={`${f.nome}: ${f.n}`}
               onMouseEnter={() => onFoco?.(f.chave)} onFocus={() => onFoco?.(f.chave)} onBlur={() => onFoco?.(null)}
               onKeyDown={e => { if (e.key === 'Escape') onFoco?.(null) }}>
              {corpo}
            </g>
          )
        })}
      </svg>
      {dica}
    </div>
  )
}
