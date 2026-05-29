import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft, Pencil, LayoutGrid, List, BarChart3, Pause, Play, CheckCheck,
  TrendingUp, ListPlus, Check, Loader2,
} from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { CampaignForm } from './CampaignForm'
import { LeadsTab } from './LeadsTab'
import { KanbanTab } from './KanbanTab'
import { MetricsTab } from './MetricsTab'
import { ForecastTab } from './ForecastTab'
import { useCampaignsStore } from '../../store/useCampaignsStore'
import { useCampaignLeadsStore } from '../../store/useCampaignLeadsStore'
import { useLeadListsStore } from '../../store/useLeadListsStore'
import { db } from '../../lib/db'
import { generateId } from '../../lib/formatters'
import { supabase } from '../../lib/supabase'
import { STATUS_CONFIG } from './config'
import toast from 'react-hot-toast'

type Tab = 'leads' | 'kanban' | 'metrics' | 'forecast'

const TABS: { value: Tab; label: string; icon: typeof List }[] = [
  { value: 'leads',    label: 'Leads',       icon: List       },
  { value: 'kanban',   label: 'Kanban',       icon: LayoutGrid },
  { value: 'metrics',  label: 'Métricas',     icon: BarChart3  },
  { value: 'forecast', label: 'Previsão VGV', icon: TrendingUp },
]

// ─── Add lists modal ───────────────────────────────────────────────────────────

interface AddListsModalProps {
  isOpen:     boolean
  onClose:    () => void
  campaignId: string
}

function AddListsModal({ isOpen, onClose, campaignId }: AddListsModalProps) {
  const { lists, load: loadLists } = useLeadListsStore()
  const { addBulk } = useCampaignLeadsStore()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [saving,      setSaving]      = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setSelectedIds(new Set())
    setSaving(false)
    loadLists()
  }, [isOpen])

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
      const result = addBulk(contacts.map(c => ({ campaignId, name: c.name, phone: c.phone })))
      toast.success(`${result.added} lead${result.added !== 1 ? 's' : ''} adicionado${result.added !== 1 ? 's' : ''} à campanha!`)
      onClose()
    } catch {
      toast.error('Erro ao adicionar listas')
    } finally {
      setSaving(false)
    }
  }

  const activeLists = lists.filter(l => l.status !== 'archived')
  const totalLeads  = activeLists.filter(l => selectedIds.has(l.id)).reduce((a, l) => a + l.totalCount, 0)

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
              const selected = selectedIds.has(list.id)
              return (
                <button
                  key={list.id}
                  type="button"
                  onClick={() => toggle(list.id)}
                  className={`
                    flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all duration-150 cursor-pointer
                    ${selected
                      ? 'bg-indigo-500/10 border-indigo-500/50'
                      : 'bg-s3/30 border-line hover:border-line/80 hover:bg-s3/50'
                    }
                  `}
                >
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border-2 transition-all ${selected ? 'bg-indigo-500 border-indigo-500' : 'border-slate-600 bg-s3/50'}`}>
                    {selected && <Check size={11} strokeWidth={3} className="text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${selected ? 'text-t1' : 'text-t2'}`}>{list.name}</p>
                    {list.description && <p className="text-[11px] text-t5 truncate">{list.description}</p>}
                  </div>
                  <span className={`text-xs font-semibold tabular-nums px-2 py-1 rounded-lg ${selected ? 'bg-indigo-500/20 text-indigo-300' : 'bg-s3/70 text-t4'}`}>
                    {list.totalCount.toLocaleString()} leads
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {selectedIds.size > 0 && (
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
  const [editOpen,    setEditOpen]    = useState(false)
  const [addListOpen, setAddListOpen] = useState(false)

  const headerRef = useRef<HTMLDivElement>(null)
  const [headerH,  setHeaderH]  = useState(0)

  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setHeaderH(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => { loadLeads() }, [loadLeads])

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
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
          >
            <ArrowLeft size={15} /> Campanhas
          </button>
          <span className="text-slate-700">/</span>
          <h1 className="text-sm font-semibold text-slate-200 truncate">{campaign.name}</h1>

          <span className={`text-xs font-medium px-2.5 py-1 rounded-lg border ${statusCfg.bg} ${statusCfg.color} ${statusCfg.border}`}>
            {statusCfg.label}
          </span>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setAddListOpen(true)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 bg-s3/50 hover:bg-s3/70 border border-line rounded-xl px-3 py-2 transition-all cursor-pointer"
            >
              <ListPlus size={13} /> Adicionar lista
            </button>
            <button
              onClick={() => setEditOpen(true)}
              className="p-2 rounded-xl hover:bg-s3/70 text-slate-600 hover:text-slate-300 transition-colors cursor-pointer"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={toggleStatus}
              className="p-2 rounded-xl hover:bg-s3/70 text-slate-600 hover:text-slate-300 transition-colors cursor-pointer"
              title={campaign.status === 'active' ? 'Pausar' : 'Reativar'}
            >
              {campaign.status === 'active' ? <Pause size={14} /> : <Play size={14} />}
            </button>
            {campaign.status !== 'finished' && (
              <button
                onClick={() => setStatus(campaignId, 'finished')}
                className="p-2 rounded-xl hover:bg-green-500/10 text-slate-600 hover:text-green-400 transition-colors cursor-pointer"
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
                  : 'bg-s3/50 border-line text-slate-500 hover:text-slate-300'
                }`}
            >
              <Icon size={12} />
              {label}
              {value === 'leads' && (
                <span className={`ml-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full
                  ${tab === value ? 'bg-indigo-500/30 text-brand-text' : 'bg-s3/70 text-slate-500'}`}>
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
      </div>

      <CampaignForm isOpen={editOpen}    onClose={() => setEditOpen(false)}    campaign={campaign} />
      <AddListsModal isOpen={addListOpen} onClose={() => setAddListOpen(false)} campaignId={campaignId} />
    </div>
  )
}
