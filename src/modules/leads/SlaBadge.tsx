import { useEffect, useState } from 'react'
import { Timer } from 'lucide-react'
import { Lead } from '../../types'

/**
 * Relógio do SLA Meta Ads — exibe o prazo de 1º contato enquanto ele não for
 * registrado. O banco é a única fonte de verdade: sla_due_at e first_contact_at
 * são gerenciados por trigger/pg_cron; aqui apenas exibimos e re-renderizamos.
 */

export function slaActive(lead: Lead): boolean {
  return !!lead.slaDueAt && !lead.firstContactAt && !lead.discardReason
}

export interface SlaInfo {
  overdue:  boolean
  urgent:   boolean   // ≤ 5 min — janela do SLA
  text:     string    // ex.: "SLA 3 min" | "SLA vencido" | "SLA sáb 09:05"
  deadline: string    // data/hora completa para tooltip
}

function computeSlaInfo(lead: Lead): SlaInfo | null {
  if (!slaActive(lead)) return null
  const due    = new Date(lead.slaDueAt!)
  const msLeft = due.getTime() - Date.now()
  const deadline = due.toLocaleString('pt-BR', {
    weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })

  if (msLeft <= 0) return { overdue: true, urgent: true, text: 'SLA vencido', deadline }

  const minsLeft = Math.ceil(msLeft / 60_000)
  if (minsLeft <= 60) {
    return { overdue: false, urgent: minsLeft <= 5, text: `SLA ${minsLeft} min`, deadline }
  }
  // Fora do expediente o prazo cai na próxima janela útil — mostra o horário-alvo
  const sameDay = due.toDateString() === new Date().toDateString()
  const when = sameDay
    ? due.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : due.toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
  return { overdue: false, urgent: false, text: `SLA ${when}`, deadline }
}

/** Re-renderiza a cada 15s enquanto o SLA estiver ativo. */
export function useSlaInfo(lead: Lead): SlaInfo | null {
  const active = slaActive(lead)
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setTick(t => t + 1), 15_000)
    return () => clearInterval(id)
  }, [active])
  return computeSlaInfo(lead)
}

export function SlaBadge({ lead }: { lead: Lead }) {
  const info = useSlaInfo(lead)
  if (!info) return null

  const cls = info.overdue
    ? 'text-error bg-error-bg border-error-line animate-pulse'
    : info.urgent
      ? 'text-error bg-error-bg border-error-line'
      : 'text-warning bg-warning-bg border-warning-line'

  return (
    <span
      title={`Lead Meta Ads — registrar 1º contato até ${info.deadline}. Sem registro, o lead transfere automaticamente para o outro corretor.`}
      className={`inline-flex items-center gap-1 font-label text-[9px] font-semibold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-full border tabular-nums flex-shrink-0 ${cls}`}
    >
      <Timer size={9} strokeWidth={1.6} />
      {info.text}
    </span>
  )
}
