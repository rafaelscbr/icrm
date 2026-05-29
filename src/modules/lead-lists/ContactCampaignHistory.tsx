import { useEffect, useState } from 'react'
import { Megaphone, Database, MessageSquare, Clock } from 'lucide-react'
import { db } from '../../lib/db'
import { LeadListMember, LeadCampaignDispatch } from '../../types'
import { useLeadListsStore } from '../../store/useLeadListsStore'
import { useCampaignsStore } from '../../store/useCampaignsStore'

interface Props {
  contactId: string
}

export function ContactCampaignHistory({ contactId }: Props) {
  const { lists } = useLeadListsStore()
  const { campaigns } = useCampaignsStore()
  const [members,    setMembers]    = useState<LeadListMember[]>([])
  const [dispatches, setDispatches] = useState<LeadCampaignDispatch[]>([])
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    if (!contactId) return
    setLoading(true)
    Promise.all([
      db.leadListMembers.fetchForContact(contactId),
      db.dispatches.fetchForContact(contactId),
    ]).then(([m, d]) => {
      setMembers(m)
      setDispatches(d)
    }).finally(() => setLoading(false))
  }, [contactId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (members.length === 0 && dispatches.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-xs text-t4">Nenhum histórico de base de leads ou campanhas.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Listas */}
      {members.length > 0 && (
        <div>
          <p className="text-xs font-bold text-t4 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Database size={11} /> Listas importado
          </p>
          <div className="flex flex-col gap-2">
            {members.map(m => {
              const list = lists.find(l => l.id === m.listId)
              return (
                <div key={m.id} className="flex items-center gap-3 p-3 bg-s2/50 border border-line rounded-xl">
                  <div className="w-7 h-7 bg-blue-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Database size={12} className="text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-t1 truncate">{list?.name ?? 'Lista removida'}</p>
                    {m.importBatch && (
                      <p className="text-[10px] text-t4 truncate">{m.importBatch}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-t4 flex-shrink-0">
                    <Clock size={9} />
                    {new Date(m.importedAt).toLocaleDateString('pt-BR')}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Campanhas disparadas */}
      {dispatches.length > 0 && (
        <div>
          <p className="text-xs font-bold text-t4 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Megaphone size={11} /> Campanhas disparadas
          </p>
          <div className="flex flex-col gap-2">
            {dispatches.map(d => {
              const campaign = campaigns.find(c => c.id === d.campaignId)
              const list     = lists.find(l => l.id === d.listId)
              return (
                <div key={d.id} className="flex items-start gap-3 p-3 bg-s2/50 border border-line rounded-xl">
                  <div className="w-7 h-7 bg-indigo-500/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Megaphone size={12} className="text-indigo-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-t1 truncate">{campaign?.name ?? 'Campanha removida'}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                      {d.messageIndex !== undefined && (
                        <span className="flex items-center gap-0.5 text-[10px] text-t4">
                          <MessageSquare size={9} /> Mensagem {(d.messageIndex ?? 0) + 1}
                        </span>
                      )}
                      {list && (
                        <span className="flex items-center gap-0.5 text-[10px] text-t4">
                          <Database size={9} /> {list.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-[10px] text-t4">
                      {new Date(d.dispatchedAt).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
