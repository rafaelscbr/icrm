import { useEffect, useState } from 'react'
import {
  ArrowLeft, Upload, Pencil, LayoutGrid, List, BarChart3, Pause, Play, CheckCheck
} from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { CampaignForm } from './CampaignForm'
import { XlsxImport } from './XlsxImport'
import { LeadsTab } from './LeadsTab'
import { KanbanTab } from './KanbanTab'
import { MetricsTab } from './MetricsTab'
import { useCampaignsStore } from '../../store/useCampaignsStore'
import { useCampaignLeadsStore } from '../../store/useCampaignLeadsStore'
import { STATUS_CONFIG } from './config'

type Tab = 'leads' | 'kanban' | 'metrics'

interface CampaignDetailProps {
  campaignId: string
  onBack: () => void
}

const TABS: { value: Tab; label: string; icon: typeof List }[] = [
  { value: 'leads',   label: 'Leads',      icon: List       },
  { value: 'kanban',  label: 'Kanban',      icon: LayoutGrid },
  { value: 'metrics', label: 'Métricas',    icon: BarChart3  },
]

export function CampaignDetail({ campaignId, onBack }: CampaignDetailProps) {
  const { campaigns, setStatus } = useCampaignsStore()
  const { leads, load: loadLeads } = useCampaignLeadsStore()

  const [tab,          setTab]          = useState<Tab>('leads')
  const [editOpen,     setEditOpen]     = useState(false)
  const [importOpen,   setImportOpen]   = useState(false)

  useEffect(() => { loadLeads() }, [loadLeads])

  const campaign = campaigns.find(c => c.id === campaignId)
  if (!campaign) return null

  const campaignLeads = leads.filter(l => l.campaignId === campaignId)
  const statusCfg     = STATUS_CONFIG[campaign.status]

  function toggleStatus() {
    if (!campaign) return
    if (campaign.status === 'active')   setStatus(campaignId, 'paused')
    if (campaign.status === 'paused')   setStatus(campaignId, 'active')
    if (campaign.status === 'finished') setStatus(campaignId, 'active')
  }

  function handleFinish() {
    setStatus(campaignId, 'finished')
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header bar */}
      <div className="sticky top-0 z-10 bg-[#0F1117]/95 backdrop-blur border-b border-white/7 px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
          >
            <ArrowLeft size={15} /> Campanhas
          </button>
          <span className="text-slate-700">/</span>
          <h1 className="text-sm font-semibold text-slate-200 truncate">{campaign.name}</h1>

          {/* Status badge */}
          <span className={`text-xs font-medium px-2.5 py-1 rounded-lg border ${statusCfg.bg} ${statusCfg.color} ${statusCfg.border}`}>
            {statusCfg.label}
          </span>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3 py-2 transition-all cursor-pointer"
            >
              <Upload size={13} /> Importar XLSX
            </button>
            <button
              onClick={() => setEditOpen(true)}
              className="p-2 rounded-xl hover:bg-white/8 text-slate-600 hover:text-slate-300 transition-colors cursor-pointer"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={toggleStatus}
              className="p-2 rounded-xl hover:bg-white/8 text-slate-600 hover:text-slate-300 transition-colors cursor-pointer"
              title={campaign.status === 'active' ? 'Pausar' : 'Reativar'}
            >
              {campaign.status === 'active' ? <Pause size={14} /> : <Play size={14} />}
            </button>
            {campaign.status !== 'finished' && (
              <button
                onClick={handleFinish}
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
                  ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                  : 'bg-white/5 border-white/10 text-slate-500 hover:text-slate-300'
                }`}
            >
              <Icon size={12} />
              {label}
              {value === 'leads' && (
                <span className={`ml-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full
                  ${tab === value ? 'bg-indigo-500/30 text-indigo-300' : 'bg-white/8 text-slate-500'}`}>
                  {campaignLeads.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6">
        {tab === 'leads'   && <LeadsTab  leads={campaignLeads} campaign={campaign} />}
        {tab === 'kanban'  && <KanbanTab leads={campaignLeads} campaign={campaign} />}
        {tab === 'metrics' && <MetricsTab leads={campaignLeads} />}
      </div>

      <CampaignForm isOpen={editOpen}   onClose={() => setEditOpen(false)}   campaign={campaign} />

      {/* Import modal */}
      <Modal isOpen={importOpen} onClose={() => setImportOpen(false)} title="Importar Lista XLSX" size="lg">
        <XlsxImport
          campaignId={campaignId}
          onDone={() => setImportOpen(false)}
        />
      </Modal>
    </div>
  )
}
