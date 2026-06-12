import { useEffect, useState } from 'react'
import {
  Trash2, TrendingUp, Database, Megaphone,
  AlertTriangle, UserX, Shield, ChevronRight,
} from 'lucide-react'
import { Modal }   from '../../components/ui/Modal'
import { Button }  from '../../components/ui/Button'
import { supabase } from '../../lib/supabase'

interface Props {
  contactId:   string
  contactName: string
  listId:      string
  listName:    string
  isOpen:      boolean
  onClose:     () => void
  onDone:      () => void  // recarrega a lista após ação
}

interface LeadStatus {
  // Funil principal
  inFunnel:     boolean
  funnelStage?: string
  // Outras listas
  otherLists:   { id: string; name: string }[]
  // Campanhas
  campaigns:    { id: string; name: string; stage: string }[]
}

const FUNNEL_LABELS: Record<string, string> = {
  lead: 'Lead', followup: 'Followup', atendimento: 'Atendimento',
  visita: 'Visita', proposta: 'Proposta', venda: 'Venda',
}

const CAMPAIGN_STAGE_LABELS: Record<string, string> = {
  new: 'Novo', sent: 'Enviado', attended: 'Atendido',
  scheduled: 'Agendado', presentation: 'Apresentação', proposal: 'Proposta', sale: 'Venda',
}

async function fetchLeadStatus(
  contactId: string,
  contactPhone: string,
  currentListId: string
): Promise<LeadStatus> {
  const [funnelRes, listsRes, campaignRes] = await Promise.all([
    // Funil principal
    supabase.from('leads')
      .select('funnel_stage')
      .eq('contact_id', contactId)
      .is('discard_reason', null)
      .limit(1)
      .maybeSingle(),

    // Outras listas
    supabase.from('lead_list_members')
      .select('list_id, lead_lists(name)')
      .eq('contact_id', contactId)
      .neq('list_id', currentListId),

    // Campanhas (por phone, pois campaign_leads não tem contact_id)
    supabase.from('campaign_leads')
      .select('campaign_id, funnel_stage, campaigns(name)')
      .eq('phone', contactPhone),
  ])

  const otherLists = ((listsRes.data ?? []) as unknown as {
    list_id: string
    lead_lists: { name: string } | null
  }[]).map(r => ({ id: r.list_id, name: r.lead_lists?.name ?? 'Lista removida' }))

  const campaigns = ((campaignRes.data ?? []) as unknown as {
    campaign_id: string
    funnel_stage: string
    campaigns: { name: string } | null
  }[]).map(r => ({
    id:    r.campaign_id,
    name:  r.campaigns?.name ?? 'Campanha removida',
    stage: CAMPAIGN_STAGE_LABELS[r.funnel_stage] ?? r.funnel_stage,
  }))

  return {
    inFunnel:     Boolean(funnelRes.data),
    funnelStage:  funnelRes.data?.funnel_stage,
    otherLists,
    campaigns,
  }
}

type Action = 'list_only' | 'all_lists' | 'delete_contact'

export function DeleteLeadFromListModal({
  contactId, contactName, listId, listName,
  isOpen, onClose, onDone,
}: Props) {
  const [status,   setStatus]   = useState<LeadStatus | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [running,  setRunning]  = useState(false)

  useEffect(() => {
    if (!isOpen || !contactId) return
    setStatus(null)
    setLoading(true)
    ;(async () => {
      try {
        const { data } = await supabase.from('contacts').select('phone').eq('id', contactId).single()
        const p = data?.phone ?? ''
        const s = await fetchLeadStatus(contactId, p, listId)
        setStatus(s)
      } catch {
        setStatus({ inFunnel: false, otherLists: [], campaigns: [] })
      } finally {
        setLoading(false)
      }
    })()
  }, [isOpen, contactId, listId])

  async function execute(action: Action) {
    setRunning(true)
    try {
      if (action === 'list_only') {
        // Remove só o vínculo desta lista
        await supabase.from('lead_list_members')
          .delete().eq('contact_id', contactId).eq('list_id', listId)

      } else if (action === 'all_lists') {
        // Remove vínculos de todas as listas
        await supabase.from('lead_list_members')
          .delete().eq('contact_id', contactId)

      } else if (action === 'delete_contact') {
        // Apaga o contato (cascade remove lead_list_members)
        await supabase.from('contacts').delete().eq('id', contactId)
      }

      onDone()
      onClose()
    } catch (err: unknown) {
      console.error('[delete lead from list]', err)
    } finally {
      setRunning(false)
    }
  }

  const funnelLabel = FUNNEL_LABELS[status?.funnelStage ?? ''] ?? status?.funnelStage

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Remover lead" size="sm">
      <div className="flex flex-col gap-4">

        {/* Nome */}
        <div className="flex items-center gap-3 pb-1 border-b border-line">
          <div className="w-8 h-8 rounded-full bg-s3/60 border border-line flex items-center justify-center text-xs font-bold text-t3 flex-shrink-0">
            {contactName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-t1">{contactName}</p>
            <p className="text-xs text-t4">da lista "{listName}"</p>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-4">
            <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-t4">Verificando situação do lead…</span>
          </div>
        )}

        {/* Status do lead */}
        {status && !loading && (
          <div className="flex flex-col gap-2">

            {/* No funil — alerta vermelho */}
            {status.inFunnel && (
              <div className="flex items-start gap-2.5 px-3 py-2.5 bg-red-500/8 border border-red-500/20 rounded-xl">
                <TrendingUp size={13} className="text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-red-400">Ativo no funil principal</p>
                  <p className="text-xs text-t4">Etapa: {funnelLabel}</p>
                </div>
              </div>
            )}

            {/* Em outras listas */}
            {status.otherLists.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-[11px] font-semibold text-t4 uppercase tracking-wider flex items-center gap-1">
                  <Database size={9} /> Em outras listas ({status.otherLists.length})
                </p>
                {status.otherLists.map(l => (
                  <div key={l.id} className="flex items-center gap-2 px-3 py-2 bg-s3/50 border border-blue-500/20 rounded-xl">
                    <Database size={11} className="text-blue-400 flex-shrink-0" />
                    <p className="text-xs text-t2 truncate">{l.name}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Em campanhas */}
            {status.campaigns.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-[11px] font-semibold text-t4 uppercase tracking-wider flex items-center gap-1">
                  <Megaphone size={9} /> Em campanhas ({status.campaigns.length})
                </p>
                {status.campaigns.map(c => (
                  <div key={c.id} className="flex items-center gap-2 px-3 py-2 bg-violet-500/8 border border-violet-500/20 rounded-xl">
                    <Megaphone size={11} className="text-violet-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-t2 truncate">{c.name}</p>
                      <p className="text-xs text-t4">Etapa: {c.stage}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Nenhuma atividade */}
            {!status.inFunnel && status.otherLists.length === 0 && status.campaigns.length === 0 && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-green-500/8 border border-green-500/20 rounded-xl">
                <Shield size={12} className="text-green-400" />
                <p className="text-xs text-green-400">Sem atividade em outros lugares</p>
              </div>
            )}
          </div>
        )}

        {/* Ações */}
        {status && !loading && (
          <div className="flex flex-col gap-2 pt-1 border-t border-line">
            <p className="text-[11px] font-semibold text-t4 uppercase tracking-wider mb-0.5">
              O que deseja fazer?
            </p>

            {/* Remover só desta lista */}
            <ActionButton
              icon={<Database size={13} className="text-amber-400" />}
              title="Remover desta lista"
              subtitle="O contato permanece em outros lugares"
              onClick={() => execute('list_only')}
              loading={running}
              variant="warning"
            />

            {/* Remover de todas as listas */}
            {status.otherLists.length > 0 && (
              <ActionButton
                icon={<Trash2 size={13} className="text-red-400" />}
                title={`Remover de todas as listas (${status.otherLists.length + 1})`}
                subtitle="Remove desta e das outras listas, mantém o contato"
                onClick={() => execute('all_lists')}
                loading={running}
                variant="danger-soft"
              />
            )}

            {/* Excluir contato — só se não estiver no funil */}
            {!status.inFunnel ? (
              <ActionButton
                icon={<UserX size={13} className="text-red-500" />}
                title="Excluir contato completamente"
                subtitle="Remove o contato e todos os vínculos"
                onClick={() => execute('delete_contact')}
                loading={running}
                variant="danger"
              />
            ) : (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-s2/30 border border-line/50 rounded-xl opacity-50">
                <AlertTriangle size={12} className="text-t4 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-t4">
                  Excluir contato indisponível — lead ativo no funil principal
                </p>
              </div>
            )}
          </div>
        )}

        <Button variant="secondary" className="w-full" onClick={onClose} disabled={running}>
          Cancelar
        </Button>
      </div>
    </Modal>
  )
}

// ─── Sub-componente botão de ação ──────────────────────────────────────────────
function ActionButton({
  icon, title, subtitle, onClick, loading, variant,
}: {
  icon:     React.ReactNode
  title:    string
  subtitle: string
  onClick:  () => void
  loading:  boolean
  variant:  'warning' | 'danger-soft' | 'danger'
}) {
  const styles = {
    warning:     'bg-amber-500/8  border-amber-500/20  hover:bg-amber-500/15  hover:border-amber-500/35',
    'danger-soft':'bg-red-500/8   border-red-500/15    hover:bg-red-500/15    hover:border-red-500/30',
    danger:      'bg-red-500/10  border-red-500/20    hover:bg-red-500/20    hover:border-red-500/40',
  }

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border text-left transition-all group disabled:opacity-50 ${styles[variant]}`}
    >
      <div className="flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-t1 group-hover:text-white transition-colors">{title}</p>
        <p className="text-xs text-t4 mt-0.5">{subtitle}</p>
      </div>
      <ChevronRight size={12} className="text-t4 group-hover:text-t2 transition-colors flex-shrink-0" />
    </button>
  )
}
