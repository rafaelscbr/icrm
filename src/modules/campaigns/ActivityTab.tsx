import { useEffect } from 'react'
import { MessageCircle, ArrowRight, GitMerge, UserCheck, Loader2, Activity } from 'lucide-react'
import { useCampaignActivityStore } from '../../store/useCampaignActivityStore'
import { CampaignActivity } from '../../types'

const ACTION_CONFIG: Record<CampaignActivity['actionType'], {
  icon: React.ReactNode; label: string; color: string; bg: string
}> = {
  dispatch:     { icon: <MessageCircle size={12} />, label: 'Disparou mensagem', color: 'text-green-400',  bg: 'bg-green-500/10'  },
  stage_change: { icon: <ArrowRight    size={12} />, label: 'Mudou etapa',       color: 'text-blue-400',   bg: 'bg-blue-500/10'   },
  transfer:     { icon: <GitMerge      size={12} />, label: 'Transferiu ao funil',color: 'text-violet-400', bg: 'bg-violet-500/10' },
  assignment:   { icon: <UserCheck     size={12} />, label: 'Delegou lead',      color: 'text-amber-400',  bg: 'bg-amber-500/10'  },
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60)   return 'agora'
  if (diff < 3600) return `${Math.floor(diff / 60)}min`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

interface ActivityTabProps {
  campaignId: string
}

export function ActivityTab({ campaignId }: ActivityTabProps) {
  const { loading, loadForCampaign, subscribe, getForCampaign } = useCampaignActivityStore()

  useEffect(() => { loadForCampaign(campaignId) }, [campaignId])
  useEffect(() => subscribe(campaignId), [campaignId])

  const list = getForCampaign(campaignId)

  if (loading && list.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="animate-spin text-slate-600" />
      </div>
    )
  }

  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="w-12 h-12 rounded-2xl bg-slate-500/10 flex items-center justify-center">
          <Activity size={20} className="text-slate-600" />
        </div>
        <p className="text-sm text-slate-500">Nenhuma atividade registrada ainda</p>
        <p className="text-xs text-slate-600">Os disparos e mudanças de etapa aparecerão aqui em tempo real</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      {list.map(activity => {
        const cfg = ACTION_CONFIG[activity.actionType]
        const meta = activity.metadata ?? {}

        return (
          <div key={activity.id}
            className="flex items-start gap-3 px-4 py-3 rounded-xl hover:bg-s2/50 transition-colors group">
            {/* Ícone */}
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${cfg.bg} ${cfg.color}`}>
              {cfg.icon}
            </div>

            {/* Conteúdo */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-medium text-slate-200">
                  {activity.brokerName ?? 'Sistema'}
                </span>
                <span className={`text-xs ${cfg.color}`}>{cfg.label}</span>
                {activity.leadName && (
                  <>
                    <span className="text-slate-600 text-xs">→</span>
                    <span className="text-xs text-slate-400 font-medium truncate max-w-[140px]">
                      {activity.leadName}
                    </span>
                  </>
                )}
              </div>

              {/* Detalhes por tipo */}
              {activity.actionType === 'dispatch' && meta.messageIndex !== undefined && (
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Mensagem {(meta.messageIndex as number) + 1}
                  {meta.message ? ` · "${String(meta.message).slice(0, 60)}${String(meta.message).length > 60 ? '…' : ''}"` : ''}
                </p>
              )}
              {activity.actionType === 'stage_change' && (
                <p className="text-[11px] text-slate-600 mt-0.5">
                  {String(meta.from)} → {String(meta.to)}
                </p>
              )}
              {activity.actionType === 'assignment' && (
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Atribuído a {String(meta.assignedTo ?? '—')}
                </p>
              )}
            </div>

            {/* Tempo */}
            <span className="text-[11px] text-slate-600 flex-shrink-0 mt-0.5">
              {timeAgo(activity.createdAt)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
