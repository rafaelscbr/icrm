import { useEffect, useState } from 'react'
import { Users, Plus, X, Crown, UserCheck } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { useCampaignParticipantsStore } from '../../store/useCampaignParticipantsStore'
import { useAuthStore } from '../../store/useAuthStore'
import toast from 'react-hot-toast'

interface ParticipantsManagerProps {
  campaignId: string
  /** Se true, mostra apenas os avatares (modo compacto para o header) */
  compact?: boolean
}

export function ParticipantsManager({ campaignId, compact = false }: ParticipantsManagerProps) {
  const { loadForCampaign, add, remove, getForCampaign } = useCampaignParticipantsStore()
  const { isAdmin, allProfiles } = useAuthStore()
  const [open, setOpen] = useState(false)

  useEffect(() => { loadForCampaign(campaignId) }, [campaignId])

  const list    = getForCampaign(campaignId)
  const brokers = allProfiles.filter(p => p.role === 'broker')
  const participating = new Set(list.map(p => p.brokerId))

  async function handleAdd(brokerId: string) {
    await add(campaignId, brokerId, 'collaborator')
    toast.success('Corretor adicionado à campanha')
  }

  async function handleRemove(id: string, name: string) {
    await remove(id)
    toast.success(`${name} removido da campanha`)
  }

  if (compact) {
    return (
      <button
        onClick={() => isAdmin && setOpen(true)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs transition-all
          ${isAdmin ? 'hover:border-violet-500/40 hover:bg-violet-500/8 cursor-pointer' : 'cursor-default'}
          ${list.length > 0 ? 'border-violet-500/25 bg-violet-500/8 text-violet-300' : 'border-line text-t3'}`}
        title={isAdmin ? 'Gerenciar participantes' : 'Participantes da campanha'}
      >
        <Users size={11} />
        <span>{list.length > 0 ? `${list.length} corretor${list.length > 1 ? 'es' : ''}` : 'Adicionar corretor'}</span>
      </button>
    )
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-line hover:border-violet-500/30 hover:bg-violet-500/8 text-t3 hover:text-violet-300 text-xs transition-all cursor-pointer"
      >
        <Users size={12} /> Participantes {list.length > 0 && `(${list.length})`}
      </button>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Participantes da campanha" size="sm">
        <div className="flex flex-col gap-4">
          {/* Participantes atuais */}
          {list.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-t3 uppercase tracking-wider">Participando agora</p>
              {list.map(p => {
                const profile = allProfiles.find(pr => pr.id === p.brokerId)
                return (
                  <div key={p.id} className="flex items-center gap-3 p-3 bg-s3/40 rounded-xl border border-line">
                    <div className="w-8 h-8 rounded-xl bg-violet-500/20 flex items-center justify-center text-sm font-bold text-violet-300 flex-shrink-0">
                      {profile?.name?.charAt(0).toUpperCase() ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-t1 truncate">{profile?.name ?? p.brokerId}</p>
                      <span className={`text-[10px] flex items-center gap-1 mt-0.5 ${p.role === 'owner' ? 'text-amber-400' : 'text-t3'}`}>
                        {p.role === 'owner' ? <><Crown size={9} /> Responsável</> : <><UserCheck size={9} /> Colaborador</>}
                      </span>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => handleRemove(p.id, profile?.name ?? '')}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-t4 hover:text-red-400 transition-colors cursor-pointer"
                        title="Remover"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Adicionar corretor */}
          {isAdmin && brokers.filter(b => !participating.has(b.id)).length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-t3 uppercase tracking-wider">Adicionar à campanha</p>
              {brokers.filter(b => !participating.has(b.id)).map(b => (
                <button
                  key={b.id}
                  onClick={() => handleAdd(b.id)}
                  className="flex items-center gap-3 p-3 bg-s3/30 hover:bg-s3/60 rounded-xl border border-line hover:border-violet-500/30 transition-all text-left cursor-pointer group"
                >
                  <div className="w-8 h-8 rounded-xl bg-slate-500/20 group-hover:bg-violet-500/20 flex items-center justify-center text-sm font-bold text-t3 group-hover:text-violet-300 flex-shrink-0 transition-colors">
                    {b.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm text-t3 group-hover:text-t1 transition-colors flex-1">{b.name}</span>
                  <Plus size={13} className="text-t4 group-hover:text-violet-400 transition-colors" />
                </button>
              ))}
            </div>
          )}

          {list.length === 0 && brokers.length === 0 && (
            <p className="text-sm text-t3 text-center py-4">Nenhum corretor cadastrado ainda</p>
          )}
        </div>
      </Modal>
    </>
  )
}
