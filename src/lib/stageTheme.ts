import { LeadFunnelStage } from '../types'

/**
 * Fonte única de verdade para label e cores das etapas do funil de leads.
 * Consumida por LeadKanban, LeadModal, ContactModal, LeadsDashboard,
 * TransferToFunnelModal, FunnelStrip e DashboardPage —
 * nunca redefinir cores de etapa dentro de uma tela.
 *
 * A cor aqui é SEMÂNTICA, não decorativa. Ela codifica a temperatura comercial
 * do lead ao longo do funil, e não uma paleta de enfeite:
 *
 *   lead        neutro   — entrou, ninguém tocou ainda
 *   followup    azul     — em cadência, informativo
 *   atendimento azul+    — engajado, conversa real acontecendo
 *   visita      âmbar    — compromisso marcado, prazo a cumprir
 *   proposta    ouro     — momento de decisão, destaque estratégico da marca
 *   venda       verde    — ganho
 *
 * Os valores vivem em `--stage-*` (index.css), com variante de modo claro
 * escurecida para atingir ≥4.5:1 sobre papel. Alterar lá reflete no sistema
 * inteiro — inclusive no modo claro, sem precisar de override manual.
 *
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
  solidVar: string     // cor sólida para SVG/canvas, onde classe não serve
}

export const STAGE_THEME: Record<LeadFunnelStage, StageTheme> = {
  lead: {
    label: 'Lead', columnLabel: 'Leads',
    color:    'text-[var(--stage-lead)]',
    bg:       'bg-[var(--stage-lead-bg)]',
    border:   'border-[var(--stage-lead-line)]',
    headerBg: 'bg-[var(--stage-lead-bg)]',
    headerText: 'text-[var(--stage-lead)]',
    dot:      'bg-[var(--stage-lead)]',
    activeBg: 'bg-[var(--stage-lead-bg)]',
    solidVar: 'var(--stage-lead)',
  },
  followup: {
    label: 'Followup', columnLabel: 'Followup',
    color:    'text-[var(--stage-followup)]',
    bg:       'bg-[var(--stage-followup-bg)]',
    border:   'border-[var(--stage-followup-line)]',
    headerBg: 'bg-[var(--stage-followup-bg)]',
    headerText: 'text-[var(--stage-followup)]',
    dot:      'bg-[var(--stage-followup)]',
    activeBg: 'bg-[var(--stage-followup-bg)]',
    solidVar: 'var(--stage-followup)',
  },
  atendimento: {
    label: 'Atendimento', columnLabel: 'Atendimento',
    color:    'text-[var(--stage-atendimento)]',
    bg:       'bg-[var(--stage-atendimento-bg)]',
    border:   'border-[var(--stage-atendimento-line)]',
    headerBg: 'bg-[var(--stage-atendimento-bg)]',
    headerText: 'text-[var(--stage-atendimento)]',
    dot:      'bg-[var(--stage-atendimento)]',
    activeBg: 'bg-[var(--stage-atendimento-bg)]',
    solidVar: 'var(--stage-atendimento)',
  },
  visita: {
    label: 'Visita', columnLabel: 'Visita',
    color:    'text-[var(--stage-visita)]',
    bg:       'bg-[var(--stage-visita-bg)]',
    border:   'border-[var(--stage-visita-line)]',
    headerBg: 'bg-[var(--stage-visita-bg)]',
    headerText: 'text-[var(--stage-visita)]',
    dot:      'bg-[var(--stage-visita)]',
    activeBg: 'bg-[var(--stage-visita-bg)]',
    solidVar: 'var(--stage-visita)',
  },
  proposta: {
    label: 'Proposta', columnLabel: 'Proposta',
    color:    'text-[var(--stage-proposta)]',
    bg:       'bg-[var(--stage-proposta-bg)]',
    border:   'border-[var(--stage-proposta-line)]',
    headerBg: 'bg-[var(--stage-proposta-bg)]',
    headerText: 'text-[var(--stage-proposta)]',
    dot:      'bg-[var(--stage-proposta)]',
    activeBg: 'bg-[var(--stage-proposta-bg)]',
    solidVar: 'var(--stage-proposta)',
  },
  venda: {
    label: 'Venda', columnLabel: 'Venda',
    color:    'text-[var(--stage-venda)]',
    bg:       'bg-[var(--stage-venda-bg)]',
    border:   'border-[var(--stage-venda-line)]',
    headerBg: 'bg-[var(--stage-venda-bg)]',
    headerText: 'text-[var(--stage-venda)]',
    dot:      'bg-[var(--stage-venda)]',
    activeBg: 'bg-[var(--stage-venda-bg)]',
    solidVar: 'var(--stage-venda)',
  },
}

export const FUNNEL_STAGES: LeadFunnelStage[] = ['lead', 'followup', 'atendimento', 'visita', 'proposta', 'venda']
