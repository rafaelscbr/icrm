import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft, Pencil, LayoutGrid, List, BarChart3, Pause, Play, CheckCheck,
  TrendingUp, ListPlus, Check, Loader2, MessageSquare, AlertTriangle, Shuffle,
} from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { CampaignForm } from './CampaignForm'
import { LeadsTab } from './LeadsTab'
import { KanbanTab } from './KanbanTab'
import { MetricsTab } from './MetricsTab'
import { ForecastTab } from './ForecastTab'
import { ActivityTab } from './ActivityTab'
import { ParticipantsManager } from './ParticipantsManager'
import { EditMessagesModal } from './EditMessagesModal'
import { useCampaignsStore } from '../../store/useCampaignsStore'
import { useCampaignLeadsStore } from '../../store/useCampaignLeadsStore'
import { useLeadListsStore } from '../../store/useLeadListsStore'
import { db } from '../../lib/db'
import { generateId } from '../../lib/formatters'
import { supabase } from '../../lib/supabase'
import { STATUS_CONFIG } from './config'
import toast from 'react-hot-toast'

type Tab = 'leads' | 'kanban' | 'metrics' | 'forecast' | 'activity'

const TABS: { value: Tab; label: string; icon: typeof List }[] = [
  { value: 'leads',    label: 'Leads',       icon: List       },
  { value: 'kanban',   label: 'Kanban',       icon: LayoutGrid },
  { value: 'metrics',  label: 'Métricas',     icon: BarChart3  },
  { value: 'forecast', label: 'Previsão VGV', icon: TrendingUp },
  { value: 'activity', label: 'Atividade',    icon: CheckCheck },
]

// ─── Add lists modal ───────────────────────────────────────────────────────────

interface AddListsModalProps {
  isOpen:     boolean
  onClose:    () => void
  campaignId: string
}

// Fisher-Yates shuffle — ordem aleatória única por campanha para evitar conflitos
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function AddListsModal({ isOpen, onClose, campaignId }: AddListsModalProps) {
  const { lists, load: loadLists }   = useLeadListsStore()
  const { addBulk }                  = useCampaignLeadsStore()
  const { campaigns }                = useCampaignsStore()
  const [selectedIds,       setSelectedIds]       = useState<Set<string>>(new Set())
  const [saving,            setSaving]            = useState(false)
  const [conflictListIds,   setConflictListIds]   = useState<Set<string>>(new Set())
  // listId → nomes das campanhas que já a utilizam
  const [conflictCampaignNames, setConflictCampaignNames] = useState<Map<string, string[]>>(new Map())

  useEffect(() => {
    if (!isOpen) return
    setSelectedIds(new Set())
    setSaving(false)
    loadLists()
    // Detecta quais listas já estão em outras campanhas + quais são elas
    db.campaignLists.fetchAll()
      .then(all => {
        const others = all.filter(cl => cl.campaignId !== campaignId)
        setConflictListIds(new Set(others.map(cl => cl.listId)))

        // Mapeia listId → nomes das campanhas
        const nameMap = new Map<string, string[]>()
        for (const cl of others) {
          const campName = campaigns.find(c => c.id === cl.campaignId)?.name ?? cl.campaignId
          const prev = nameMap.get(cl.listId) ?? []
          if (!prev.includes(campName)) nameMap.set(cl.listId, [...prev, campName])
        }
        setConflictCampaignNames(nameMap)
      })
      .catch(() => {})
  }, [isOpen, campaignId]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleAdd() {
    if (selectedIds.size === 0) { toast.error('Selecione ao menos uma lista'); return }
    setSaving(true)
    try {
      const listIds = [...selectedIds]
      const now = new Date().toISOString()

      for (const listId of listIds) {
        await db.campaignLists.upsert({ id: generateId(), campaignId, listId, addedAt: now })
      }

      const CHUNK = 500
      const allContactIds: string[] = []
      for (const listId of listIds) {
        const members = await db.leadListMembers.fetchForList(listId)
        allContactIds.push(...members.map(m => m.contactId))
      }
      const uniqueIds = [...new Set(allContactIds)]
      const contacts: { name: string; phone: string }[] = []
      for (let i = 0; i < uniqueIds.length; i += CHUNK) {
        const chunk = uniqueIds.slice(i, i + CHUNK)
        const { data } = await supabase.from('contacts').select('name, phone').in('id', chunk)
        if (data) contacts.push(...(data as { name: string; phone: string }[]))
      }

      // Leads herdam o broker_id da campanha — garante que o corretor possa atualizar
      const campaignBrokerId = campaigns.find(c => c.id === campaignId)?.brokerId

      // Embaralha SEMPRE — evita que mesmos leads apareçam no topo em todas as campanhas
      // (listas reutilizadas ou não, a ordem nunca deve ser a mesma da lista original)
      const ordered = shuffleArray(contacts)
      const result  = await addBulk(ordered.map(c => ({
        campaignId,
        name:     c.name,
        phone:    c.phone,
        brokerId: campaignBrokerId ?? undefined,
      })))

      toast.success(`${result.added} lead${result.added !== 1 ? 's' : ''} importado${result.added !== 1 ? 's' : ''} em ordem embaralhada!`)
      onClose()
    } catch {
      toast.error('Erro ao adicionar listas')
    } finally {
      setSaving(false)
    }
  }

  const activeLists   = lists.filter(l => l.status !== 'archived')
  const totalLeads    = activeLists.filter(l => selectedIds.has(l.id)).reduce((a, l) => a + l.totalCount, 0)
  const selectedConflicts = [...selectedIds].filter(id => conflictListIds.has(id)).length

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Adicionar lista de leads" size="md">
      <div className="flex flex-col gap-4">
        <p className="text-xs text-t4">Selecione uma ou mais listas da Base de Leads para adicionar à campanha.</p>

        {activeLists.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-t3">Nenhuma lista disponível</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
            {activeLists.map(list => {
              const selected   = selectedIds.has(list.id)
              const inConflict = conflictListIds.has(list.id)
              return (
                <button
                  key={list.id}
                  type="button"
                  onClick={() => toggle(list.id)}
                  className={`
                    flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all duration-150 cursor-pointer
                    ${selected
                      ? inConflict
                        ? 'bg-amber-500/8 border-amber-500/50'
                        : 'bg-indigo-500/10 border-indigo-500/50'
                      : 'bg-s3/30 border-line hover:border-line/80 hover:bg-s3/50'
                    }
                  `}
                >
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border-2 transition-all
                    ${selected
                      ? inConflict ? 'bg-amber-500 border-amber-500' : 'bg-indigo-500 border-indigo-500'
                      : 'border-slate-600 bg-s3/50'}`}>
                    {selected && <Check size={11} strokeWidth={3} className="text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium truncate ${selected ? 'text-t1' : 'text-t2'}`}>{list.name}</p>
                      {inConflict && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25 flex-shrink-0">
                          <AlertTriangle size={9} /> Em outra campanha
                        </span>
                      )}
                    </div>
                    {list.description && <p className="text-[11px] text-t5 truncate">{list.description}</p>}
                  </div>
                  <span className={`text-xs font-semibold tabular-nums px-2 py-1 rounded-lg flex-shrink-0
                    ${selected
                      ? inConflict ? 'bg-amber-500/20 text-amber-300' : 'bg-indigo-500/20 text-indigo-300'
                      : 'bg-s3/70 text-t4'}`}>
                    {list.totalCount.toLocaleString()} leads
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Aviso de conflito — com nomes das campanhas */}
        {selectedConflicts > 0 && (
          <div className="flex flex-col gap-2 bg-amber-500/8 border border-amber-500/20 rounded-xl px-3 py-2.5">
            <div className="flex items-start gap-2.5">
              <Shuffle size={13} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-400 leading-relaxed">
                <span className="font-bold">{selectedConflicts} lista{selectedConflicts > 1 ? 's' : ''}</span> já
                {selectedConflicts > 1 ? ' estão' : ' está'} em uso em outras campanhas:
              </p>
            </div>
            {[...selectedIds].filter(id => conflictListIds.has(id)).map(listId => {
              const campNames = conflictCampaignNames.get(listId) ?? []
              const listName  = activeLists.find(l => l.id === listId)?.name ?? '—'
              return campNames.length > 0 ? (
                <div key={listId} className="ml-5 text-[11px] text-amber-300/80">
                  <span className="font-medium">{listName}</span>
                  {' → '}{campNames.join(', ')}
                </div>
              ) : null
            })}
            <p className="text-xs text-amber-400/70 ml-5">
              Os leads serão importados em <span className="font-bold">ordem embaralhada</span> para evitar abordagens duplicadas.
            </p>
          </div>
        )}

        {selectedIds.size > 0 && selectedConflicts === 0 && (
          <div className="flex items-center gap-2 bg-green-500/8 border border-green-500/20 rounded-xl px-3 py-2.5">
            <Check size={13} className="text-green-400 flex-shrink-0" />
            <p className="text-xs text-green-400">
              <span className="font-bold">{selectedIds.size}</span> lista{selectedIds.size !== 1 ? 's' : ''} · <span className="font-bold">{totalLeads.toLocaleString()}</span> leads
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button className="flex-1 gap-2" onClick={handleAdd} disabled={saving || selectedIds.size === 0}>
            {saving ? <><Loader2 size={14} className="animate-spin" /> Importando…</> : 'Adicionar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────

interface CampaignDetailProps {
  campaignId: string
  onBack: () => void
}

export function CampaignDetail({ campaignId, onBack }: CampaignDetailProps) {
  const { campaigns, setStatus } = useCampaignsStore()
  const { leads, load: loadLeads, backfillMessageIndex } = useCampaignLeadsStore()

  const [tab,         setTab]         = useState<Tab>('leads')
  const [editOpen,     setEditOpen]     = useState(false)
  const [msgEditOpen,  setMsgEditOpen]  = useState(false)
  const [addListOpen,  setAddListOpen]  = useState(false)

  const headerRef = useRef<HTMLDivElement>(null)
  const [headerH,  setHeaderH]  = useState(0)

  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setHeaderH(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Carrega leads frescos ao abrir cada campanha
  useEffect(() => { loadLeads() }, [campaignId])

  // Polling: recarrega do banco a cada 15s — garante que admin e corretor
  // veem sempre o mesmo dado, sem depender de websockets ou realtime channels
  useEffect(() => {
    const interval = setInterval(() => {
      useCampaignLeadsStore.getState().load()
    }, 15_000)
    return () => clearInterval(interval)
  }, [campaignId])

  // Recarrega ao voltar para a aba — delay de 2 s para garantir que o upsert
  // do último disparo já chegou ao banco antes de sincronizar (evita race condition)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    function onVisible() {
      if (document.visibilityState === 'visible') {
        timer = setTimeout(() => useCampaignLeadsStore.getState().load(), 2000)
      } else {
        if (timer) { clearTimeout(timer); timer = null }
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      if (timer) clearTimeout(timer)
    }
  }, [])

  const campaign = campaigns.find(c => c.id === campaignId)

  const backfillDone = useRef(false)
  useEffect(() => {
    if (backfillDone.current || !campaign || leads.length === 0) return
    backfillDone.current = true
    backfillMessageIndex(campaign)
  }, [campaign, leads, backfillMessageIndex])

  if (!campaign) return null

  const campaignLeads = leads.filter(l => l.campaignId === campaignId)
  const statusCfg     = STATUS_CONFIG[campaign.status]

  function toggleStatus() {
    if (!campaign) return
    if (campaign.status === 'active')   setStatus(campaignId, 'paused')
    if (campaign.status === 'paused')   setStatus(campaignId, 'active')
    if (campaign.status === 'finished') setStatus(campaignId, 'active')
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div ref={headerRef} className="sticky top-0 z-10 nav-bg-blur border-b border-line px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-t3 hover:text-t2 transition-colors cursor-pointer"
          >
            <ArrowLeft size={15} /> Campanhas
          </button>
          <span className="text-t5">/</span>
          <h1 className="text-sm font-semibold text-t1 truncate">{campaign.name}</h1>

          <span className={`text-xs font-medium px-2.5 py-1 rounded-lg border ${statusCfg.bg} ${statusCfg.color} ${statusCfg.border}`}>
            {statusCfg.label}
          </span>

          <div className="ml-auto flex items-center gap-2">
            <ParticipantsManager campaignId={campaignId} compact />
            <button
              onClick={() => setAddListOpen(true)}
              className="flex items-center gap-1.5 text-xs text-t3 hover:text-t1 bg-s3/50 hover:bg-s3/70 border border-line rounded-xl px-3 py-2 transition-all cursor-pointer"
            >
              <ListPlus size={13} /> Adicionar lista
            </button>
            <button
              onClick={() => setMsgEditOpen(true)}
              className="flex items-center gap-1.5 text-xs text-t3 hover:text-green-300 bg-s3/50 hover:bg-green-500/10 border border-line hover:border-green-500/25 rounded-xl px-3 py-2 transition-all cursor-pointer"
              title="Editar mensagens da campanha"
            >
              <MessageSquare size={13} /> Mensagens
            </button>
            <button
              onClick={() => setEditOpen(true)}
              className="p-2 rounded-xl hover:bg-s3/70 text-t4 hover:text-t2 transition-colors cursor-pointer"
              title="Editar campanha"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={toggleStatus}
              className="p-2 rounded-xl hover:bg-s3/70 text-t4 hover:text-t2 transition-colors cursor-pointer"
              title={campaign.status === 'active' ? 'Pausar' : 'Reativar'}
            >
              {campaign.status === 'active' ? <Pause size={14} /> : <Play size={14} />}
            </button>
            {campaign.status !== 'finished' && (
              <button
                onClick={() => setStatus(campaignId, 'finished')}
                className="p-2 rounded-xl hover:bg-green-500/10 text-t4 hover:text-green-400 transition-colors cursor-pointer"
                title="Finalizar campanha"
              >
                <CheckCheck size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mt-4">
          {TABS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer
                ${tab === value
                  ? 'bg-brand-tint border-brand/40 text-brand-text'
                  : 'bg-s3/50 border-line text-t3 hover:text-t2'
                }`}
            >
              <Icon size={12} />
              {label}
              {value === 'leads' && (
                <span className={`ml-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full
                  ${tab === value ? 'bg-indigo-500/30 text-brand-text' : 'bg-s3/70 text-t3'}`}>
                  {campaignLeads.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6">
        {tab === 'leads'    && <LeadsTab    leads={campaignLeads} campaign={campaign} stickyTop={headerH} />}
        {tab === 'kanban'   && <KanbanTab   leads={campaignLeads} campaign={campaign} />}
        {tab === 'metrics'  && <MetricsTab  leads={campaignLeads} campaign={campaign} />}
        {tab === 'forecast' && <ForecastTab leads={campaignLeads} campaign={campaign} />}
        {tab === 'activity' && <ActivityTab campaignId={campaignId} />}
      </div>

      <CampaignForm isOpen={editOpen}    onClose={() => setEditOpen(false)}    campaign={campaign} />
      <EditMessagesModal isOpen={msgEditOpen} onClose={() => setMsgEditOpen(false)} campaign={campaign} />
      <AddListsModal isOpen={addListOpen} onClose={() => setAddListOpen(false)} campaignId={campaignId} />
    </div>
  )
}
