import { useEffect, useState } from 'react'
import { Trash2, Shield, TrendingUp, Database, AlertTriangle, Users } from 'lucide-react'
import { Modal }    from '../../components/ui/Modal'
import { Button }   from '../../components/ui/Button'
import { LeadList } from '../../types'
import { supabase } from '../../lib/supabase'

interface Props {
  list:    LeadList | undefined
  isOpen:  boolean
  onClose: () => void
  onConfirm: (listId: string, contactIdsToDelete: string[]) => Promise<void>
}

interface DeletePreview {
  totalInList:      number
  toDelete:         number
  keptInKanban:     number
  keptInOtherLists: number
  contactIds:       string[]   // IDs que serão deletados
}

async function fetchDeletePreview(listId: string): Promise<DeletePreview> {
  // 1. Todos os contatos desta lista
  const { data: members } = await supabase
    .from('lead_list_members')
    .select('contact_id')
    .eq('list_id', listId)

  if (!members || members.length === 0) {
    return { totalInList: 0, toDelete: 0, keptInKanban: 0, keptInOtherLists: 0, contactIds: [] }
  }

  const allIds = (members as { contact_id: string }[]).map(m => m.contact_id)

  // 2. Contatos protegidos por estarem no kanban principal (lead ativo, sem descarte)
  const { data: kanbanRows } = await supabase
    .from('leads')
    .select('contact_id')
    .in('contact_id', allIds)
    .is('discard_reason', null)
    .not('contact_id', 'is', null)

  const inKanban = new Set((kanbanRows ?? []).map((r: { contact_id: string }) => r.contact_id))

  // 3. Contatos protegidos por estarem em outra lista
  const CHUNK = 500
  const inOtherList = new Set<string>()

  for (let i = 0; i < allIds.length; i += CHUNK) {
    const chunk = allIds.slice(i, i + CHUNK)
    const { data: otherMembers } = await supabase
      .from('lead_list_members')
      .select('contact_id')
      .in('contact_id', chunk)
      .neq('list_id', listId)

    ;(otherMembers ?? []).forEach((r: { contact_id: string }) => inOtherList.add(r.contact_id))
  }

  // 4. Decidir quem deleta
  const toDelete:       string[] = []
  let   keptInKanban     = 0
  let   keptInOtherLists = 0

  for (const id of allIds) {
    if (inKanban.has(id)) {
      keptInKanban++
    } else if (inOtherList.has(id)) {
      keptInOtherLists++
    } else {
      toDelete.push(id)
    }
  }

  return {
    totalInList:      allIds.length,
    toDelete:         toDelete.length,
    keptInKanban,
    keptInOtherLists,
    contactIds:       toDelete,
  }
}

export function DeleteListModal({ list, isOpen, onClose, onConfirm }: Props) {
  const [preview,    setPreview]    = useState<DeletePreview | null>(null)
  const [loading,    setLoading]    = useState(false)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!list || !isOpen) { setPreview(null); return }
    setLoading(true)
    fetchDeletePreview(list.id)
      .then(setPreview)
      .finally(() => setLoading(false))
  }, [list?.id, isOpen])

  async function handleConfirm() {
    if (!list || !preview) return
    setConfirming(true)
    try {
      await onConfirm(list.id, preview.contactIds)
      onClose()
    } finally {
      setConfirming(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Excluir lista"
      size="sm"
    >
      <div className="flex flex-col gap-4">

        {/* Aviso */}
        <div className="flex items-start gap-3 p-3 bg-red-500/8 border border-red-500/20 rounded-xl">
          <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-t1">
              Excluir <span className="text-red-300">"{list?.name}"</span>?
            </p>
            <p className="text-xs text-t4 mt-0.5">
              Esta ação não pode ser desfeita.
            </p>
          </div>
        </div>

        {/* Preview de o que acontece */}
        {loading && (
          <div className="flex items-center gap-2 py-3 justify-center">
            <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-t4">Verificando contatos…</span>
          </div>
        )}

        {preview && !loading && (
          <div className="flex flex-col gap-2">
            {/* Total na lista */}
            <div className="flex items-center gap-2.5 px-3 py-2.5 bg-s2/50 border border-line rounded-xl">
              <Users size={13} className="text-t4 flex-shrink-0" />
              <p className="text-xs text-t3 flex-1">
                Total na lista
              </p>
              <span className="text-xs font-bold text-t1 tabular-nums">
                {preview.totalInList.toLocaleString('pt-BR')}
              </span>
            </div>

            {/* Serão deletados */}
            <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border
              ${preview.toDelete > 0
                ? 'bg-red-500/8 border-red-500/20'
                : 'bg-s2/30 border-line'
              }`}
            >
              <Trash2 size={13} className={preview.toDelete > 0 ? 'text-red-400' : 'text-t4'} />
              <p className="text-xs flex-1 text-t3">
                Contatos que serão <span className="font-semibold text-red-400">excluídos</span>
              </p>
              <span className={`text-xs font-bold tabular-nums ${preview.toDelete > 0 ? 'text-red-400' : 'text-t4'}`}>
                {preview.toDelete.toLocaleString('pt-BR')}
              </span>
            </div>

            {/* Protegidos pelo kanban */}
            {preview.keptInKanban > 0 && (
              <div className="flex items-center gap-2.5 px-3 py-2.5 bg-amber-500/8 border border-amber-500/20 rounded-xl">
                <TrendingUp size={13} className="text-amber-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-t3">
                    Mantidos — <span className="font-medium text-amber-400">no funil principal</span>
                  </p>
                </div>
                <span className="text-xs font-bold text-amber-400 tabular-nums">
                  {preview.keptInKanban.toLocaleString('pt-BR')}
                </span>
              </div>
            )}

            {/* Protegidos por outra lista */}
            {preview.keptInOtherLists > 0 && (
              <div className="flex items-center gap-2.5 px-3 py-2.5 bg-blue-500/8 border border-blue-500/20 rounded-xl">
                <Database size={13} className="text-blue-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-t3">
                    Mantidos — <span className="font-medium text-blue-400">em outra lista</span>
                  </p>
                </div>
                <span className="text-xs font-bold text-blue-400 tabular-nums">
                  {preview.keptInOtherLists.toLocaleString('pt-BR')}
                </span>
              </div>
            )}

            {/* Nenhum contato para deletar */}
            {preview.toDelete === 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-green-500/8 border border-green-500/20 rounded-xl">
                <Shield size={13} className="text-green-400 flex-shrink-0" />
                <p className="text-xs text-green-400">
                  Nenhum contato será excluído — todos estão protegidos.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Ações */}
        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={confirming}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            onClick={handleConfirm}
            disabled={loading || confirming}
          >
            {confirming ? (
              <span className="flex items-center gap-1.5">
                <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Excluindo…
              </span>
            ) : (
              `Excluir lista${preview && preview.toDelete > 0 ? ` e ${preview.toDelete.toLocaleString('pt-BR')} contatos` : ''}`
            )}
          </Button>
        </div>

      </div>
    </Modal>
  )
}
