import { useEffect } from 'react'
import confetti from 'canvas-confetti'
import { Trophy } from 'lucide-react'
import { formatCurrencyFull } from '../../../lib/formatters'
import type { PulseEvent } from '../types'

/**
 * Comemoração de venda.
 *
 * O painel passa o dia inteiro cobrando — SLA, leads parados, dias sem venda.
 * Um quiosque que só cobra cansa e vira ruído. Este é o contrapeso: quando
 * entra venda, a tela inteira para por alguns segundos e comemora.
 *
 * Some sozinha: ninguém toca no iPad para fechar.
 */

const DURACAO_MS = 7000

export function SaleCelebration({ venda, onFim }: {
  venda: PulseEvent | null
  onFim: () => void
}) {
  useEffect(() => {
    if (!venda) return

    // Duas rajadas partindo dos cantos inferiores — sobem e cruzam no centro.
    const disparar = (origemX: number, angulo: number) => {
      confetti({
        particleCount: 70,
        spread: 65,
        angle: angulo,
        origin: { x: origemX, y: 1 },
        startVelocity: 55,
        gravity: 0.9,
        ticks: 260,
        colors: ['#E4B23C', '#F0CC78', '#4ADE80', '#F6F3EC'],
        disableForReducedMotion: true,
      })
    }

    disparar(0.1, 60)
    disparar(0.9, 120)
    const segundaSalva = setTimeout(() => { disparar(0.3, 75); disparar(0.7, 105) }, 700)
    const fim = setTimeout(onFim, DURACAO_MS)

    return () => {
      clearTimeout(segundaSalva)
      clearTimeout(fim)
    }
  }, [venda, onFim])

  if (!venda) return null

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 pulse-celebracao"
      aria-live="polite"
    >
      <Trophy size={56} strokeWidth={1.6} className="text-brand" aria-hidden />

      <p className="font-label text-[13px] uppercase tracking-[0.3em] text-success">
        Venda fechada
      </p>

      {venda.valor ? (
        <p className="font-heading font-extrabold tracking-tight text-t1 leading-none text-[76px] tabular-nums">
          {formatCurrencyFull(venda.valor)}
        </p>
      ) : null}

      {venda.leadNome && (
        <p className="font-heading font-bold text-2xl text-t2">{venda.leadNome}</p>
      )}
    </div>
  )
}
