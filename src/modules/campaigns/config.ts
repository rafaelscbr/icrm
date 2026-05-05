import { FunnelStage, LeadSituation } from '../../types'

export interface StageConfig {
  value:   FunnelStage
  label:   string
  short:   string
  color:   string
  bg:      string
  border:  string
  dot:     string
}

export const FUNNEL_STAGES: StageConfig[] = [
  { value: 'new',          label: 'Não Contactado',      short: 'Pendente',        color: 'text-slate-400',   bg: 'bg-slate-500/10',   border: 'border-slate-500/20',  dot: 'bg-slate-500'   },
  { value: 'sent',         label: '1ª Mensagem',         short: '1ª Msg',          color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20',   dot: 'bg-blue-500'    },
  { value: 'attended',     label: 'Demonstrou Interesse',short: 'Dem. Interesse',  color: 'text-cyan-400',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/20',   dot: 'bg-cyan-500'    },
  { value: 'scheduled',    label: 'Agendou Apresentação',short: 'Ag. Apresentação',color: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/20', dot: 'bg-violet-500'  },
  { value: 'presentation', label: 'Apresentação',        short: 'Apresentação',    color: 'text-indigo-400',  bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20', dot: 'bg-indigo-500'  },
  { value: 'proposal',     label: 'Proposta',            short: 'Proposta',        color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',  dot: 'bg-amber-400'   },
  { value: 'sale',         label: 'Venda',               short: 'Venda',           color: 'text-green-400',   bg: 'bg-green-500/10',   border: 'border-green-500/20',  dot: 'bg-green-500'   },
]

// Hex colors for SVG rendering (must match Tailwind colors above)
export const FUNNEL_COLORS: Record<string, string> = {
  new:          '#475569',
  sent:         '#3b82f6',
  attended:     '#06b6d4',
  scheduled:    '#8b5cf6',
  presentation: '#6366f1',
  proposal:     '#f59e0b',
  sale:         '#22c55e',
}

export interface SituationConfig {
  value:  LeadSituation
  label:  string
  short:  string
  color:  string
  bg:     string
}

export const SITUATION_CONFIG: SituationConfig[] = [
  { value: 'no_interest',   label: 'Sem Interesse',          short: 'Sem interesse',  color: 'text-orange-400', bg: 'bg-orange-500/10' },
  { value: 'stop_messages', label: 'Pediu para não receber', short: 'Não perturbe',   color: 'text-red-400',    bg: 'bg-red-500/10'    },
  { value: 'invalid',       label: 'Contato Inexistente',    short: 'Inexistente',    color: 'text-slate-400',  bg: 'bg-slate-500/10'  },
]

// Taxas de conversão sugeridas — benchmark outbound imobiliário brasileiro
// Representa: "% de leads nesta etapa que chegarão à venda"
export const DEFAULT_CONVERSION_RATES: Record<string, number> = {
  new:          1,   // lista fria, sem contato
  sent:         2,   // contactado, sem resposta ainda
  attended:     6,   // demonstrou interesse
  scheduled:    15,  // agendou visita
  presentation: 30,  // fez a apresentação
  proposal:     60,  // em negociação
  sale:         100, // venda confirmada
}

export const STATUS_CONFIG = {
  active:   { label: 'Ativa',      color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20'  },
  paused:   { label: 'Pausada',    color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20'  },
  finished: { label: 'Finalizada', color: 'text-slate-400',  bg: 'bg-slate-500/10',  border: 'border-slate-500/20'  },
}
