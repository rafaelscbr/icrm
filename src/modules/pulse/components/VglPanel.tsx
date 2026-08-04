import { Target, CalendarX } from 'lucide-react'
import { Painel, PainelTitulo } from './Primitives'
import { formatCurrency } from '../../../lib/formatters'
import type { PulseVgl } from '../types'

/**
 * Meta do mês e seca de vendas.
 *
 * É o único painel do Pulse que recebe o dourado da identidade — a regra do
 * sistema reserva o acento para dinheiro, meta e marca, e este é literalmente
 * os três. Card de operação (feed, radar, clima) fica sem, senão nada tem
 * destaque.
 *
 * "Dias sem venda" é desconfortável de propósito: é o número que mede o
 * resultado, não o esforço, e o único que ninguém coloca num painel.
 */

/** A partir daqui a seca deixa de ser normal e vira alerta. */
const DIAS_ALERTA = 7
const DIAS_GRAVE  = 15

function corDaSeca(dias: number | null): string {
  if (dias === null)        return 'var(--t4)'
  if (dias >= DIAS_GRAVE)   return 'var(--error)'
  if (dias >= DIAS_ALERTA)  return 'var(--warning)'
  return 'var(--success)'
}

export function VglPanel({ vgl }: { vgl: PulseVgl | null }) {
  if (!vgl) return null

  const pct = vgl.metaMes > 0
    ? Math.min(100, Math.round((vgl.realizadoMes / vgl.metaMes) * 100))
    : 0

  // Ritmo necessário para fechar o mês. Sem dias úteis restantes o número
  // perde sentido — o mês acabou.
  const porDia = vgl.diasUteisRestantes > 0
    ? vgl.faltaParaMeta / vgl.diasUteisRestantes
    : null

  const corSeca = corDaSeca(vgl.diasSemVenda)

  return (
    <Painel className="shrink-0 relative gold-edge gold-glow-tl">
      <PainelTitulo
        icon={Target}
        extra={
          <span className="font-label text-[10px] uppercase tracking-[0.14em] text-t4 tabular-nums">
            {pct}% da meta
          </span>
        }
      >
        VGL do mês
      </PainelTitulo>

      <div className="px-4 pb-3.5">
        {/* Realizado × meta */}
        <div className="flex items-baseline gap-2">
          <span className="font-heading font-extrabold tabular-nums leading-none text-[26px] text-brand tracking-tight">
            {formatCurrency(vgl.realizadoMes)}
          </span>
          <span className="font-label text-[10px] uppercase tracking-[0.12em] text-t4">
            de {formatCurrency(vgl.metaMes)}
          </span>
        </div>

        <div className="h-1.5 rounded-full bg-s3 overflow-hidden mt-2">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-[420ms]"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* O ritmo é o que transforma a meta em cobrança diária */}
        {porDia !== null && vgl.faltaParaMeta > 0 && (
          <p className="font-label text-[10px] uppercase tracking-[0.1em] text-t4 tabular-nums mt-2">
            faltam {formatCurrency(vgl.faltaParaMeta)} · {formatCurrency(porDia)} por dia útil
            <span className="text-t5"> · {vgl.diasUteisRestantes} dias</span>
          </p>
        )}

        {/* Seca de vendas */}
        <div className="mt-3 pt-2.5 border-t border-line/60 flex items-center gap-2.5">
          <CalendarX size={15} strokeWidth={1.6} style={{ color: corSeca }} aria-hidden />
          {vgl.diasSemVenda === null ? (
            <span className="font-label text-[11px] uppercase tracking-[0.1em] text-t4">
              nenhuma venda registrada
            </span>
          ) : (
            <>
              <span
                className="font-heading font-extrabold tabular-nums leading-none text-[26px] tracking-tight"
                style={{ color: corSeca }}
              >
                {vgl.diasSemVenda}
              </span>
              <span className="font-label text-[10px] uppercase tracking-[0.12em] text-t4 leading-tight">
                {vgl.diasSemVenda === 1 ? 'dia' : 'dias'}<br />sem venda
              </span>
            </>
          )}
        </div>
      </div>
    </Painel>
  )
}
