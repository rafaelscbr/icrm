import { BarChart2 } from 'lucide-react'
import { Painel, PainelTitulo } from './Primitives'

/**
 * Atividade do dia, hora a hora.
 *
 * SVG puro, redesenhado só quando um bucket muda — nada de canvas com
 * requestAnimationFrame rodando 12 horas para animar uma linha parada.
 */

const HORA_INICIO = 7
const HORA_FIM    = 21   // inclusive

interface Props {
  porHora:    number[]
  horaAtual:  number
  className?: string
}

export function DayChart({ porHora, horaAtual, className = '' }: Props) {
  const faixa = porHora.slice(HORA_INICIO, HORA_FIM + 1)
  const total = faixa.reduce((a, b) => a + b, 0)
  const pico  = Math.max(...faixa, 1)

  const W = 100
  const H = 34
  const passo = W / Math.max(faixa.length - 1, 1)

  const pontos = faixa.map((v, i) => {
    const x = i * passo
    const y = H - (v / pico) * (H - 3)
    return { x, y }
  })

  const linha = pontos.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
  const area  = `0,${H} ${linha} ${W},${H}`

  return (
    <Painel className={className}>
      <PainelTitulo
        icon={BarChart2}
        extra={
          <span className="font-label text-[10px] uppercase tracking-[0.14em] text-t4 tabular-nums">
            {total} ações
          </span>
        }
      >
        Atividade do dia
      </PainelTitulo>

      <div className="flex-1 min-h-0 px-4 pb-2 flex flex-col">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="flex-1 min-h-0 w-full"
          role="img"
          aria-label={`Atividade por hora, ${total} ações no dia`}
        >
          <defs>
            <linearGradient id="pulse-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="var(--brand)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          <polygon points={area} fill="url(#pulse-area)" />
          <polyline
            points={linha}
            fill="none"
            stroke="var(--brand)"
            strokeWidth="0.7"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* Marcador da hora corrente — onde estamos na curva do dia */}
          {horaAtual >= HORA_INICIO && horaAtual <= HORA_FIM && (
            <line
              x1={(horaAtual - HORA_INICIO) * passo}
              y1="0"
              x2={(horaAtual - HORA_INICIO) * passo}
              y2={H}
              stroke="var(--line-strong)"
              strokeWidth="0.5"
              strokeDasharray="1.5 1.5"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        <div className="flex justify-between pt-1">
          {faixa.map((_, i) => {
            const h = HORA_INICIO + i
            const marcar = h % 2 === 0
            return (
              <span
                key={h}
                className={`font-label text-[10px] tabular-nums ${
                  h === horaAtual ? 'text-brand' : 'text-t5'
                }`}
              >
                {marcar || h === horaAtual ? String(h).padStart(2, '0') : ''}
              </span>
            )
          })}
        </div>
      </div>
    </Painel>
  )
}
