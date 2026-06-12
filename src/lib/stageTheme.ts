import { LeadFunnelStage } from '../types'

/**
 * Fonte única de verdade para label e cores das etapas do funil de leads.
 * Consumida por LeadKanban, LeadModal, ContactModal e DashboardPage —
 * nunca redefinir cores de etapa dentro de uma tela.
 * Referência visual: LeadKanban.
 */
export interface StageTheme {
  label: string        // nome da etapa (singular)
  columnLabel: string  // título da coluna no kanban
  color: string        // texto
  bg: string           // fundo de chip
  border: string
  headerBg: string     // header de coluna do kanban
  headerText: string
  dot: string          // indicador circular
  activeBg: string     // etapa atual no pipeline do modal
}

export const STAGE_THEME: Record<LeadFunnelStage, StageTheme> = {
  lead:        { label: 'Lead',        columnLabel: 'Leads',       color: 'text-t2',         bg: 'bg-slate-500/8',   border: 'border-slate-500/20',  headerBg: 'bg-slate-500/15',  headerText: 'text-t1',         dot: 'bg-slate-400',  activeBg: 'bg-slate-500/25'  },
  followup:    { label: 'Followup',    columnLabel: 'Followup',    color: 'text-teal-300',   bg: 'bg-teal-500/8',    border: 'border-teal-500/20',   headerBg: 'bg-teal-500/12',   headerText: 'text-teal-200',   dot: 'bg-teal-400',   activeBg: 'bg-teal-500/25'   },
  atendimento: { label: 'Atendimento', columnLabel: 'Atendimento', color: 'text-violet-300', bg: 'bg-violet-500/8',  border: 'border-violet-500/20', headerBg: 'bg-violet-500/15', headerText: 'text-violet-200', dot: 'bg-violet-400', activeBg: 'bg-violet-500/25' },
  visita:      { label: 'Visita',      columnLabel: 'Visita',      color: 'text-amber-300',  bg: 'bg-amber-500/8',   border: 'border-amber-500/20',  headerBg: 'bg-amber-500/15',  headerText: 'text-amber-200',  dot: 'bg-amber-400',  activeBg: 'bg-amber-500/25'  },
  proposta:    { label: 'Proposta',    columnLabel: 'Proposta',    color: 'text-orange-300', bg: 'bg-orange-500/8',  border: 'border-orange-500/20', headerBg: 'bg-orange-500/15', headerText: 'text-orange-200', dot: 'bg-orange-400', activeBg: 'bg-orange-500/25' },
  venda:       { label: 'Venda',       columnLabel: 'Venda',       color: 'text-green-300',  bg: 'bg-green-500/8',   border: 'border-green-500/20',  headerBg: 'bg-green-500/15',  headerText: 'text-green-200',  dot: 'bg-green-400',  activeBg: 'bg-green-500/25'  },
}

export const FUNNEL_STAGES: LeadFunnelStage[] = ['lead', 'followup', 'atendimento', 'visita', 'proposta', 'venda']
