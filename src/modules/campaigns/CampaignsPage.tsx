import { useEffect, useState } from 'react'
import {
  Megaphone, Users, TrendingUp, Calendar, Pencil, Trash2, ArrowRight,
  Play, Pause, CheckCheck, BarChart3
} from 'lucide-react'
import { PageLayout } from '../../components/layout/PageLayout'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { EmptyState } from '../../components/ui/EmptyState'
import { CampaignForm } from './CampaignForm'
import { CampaignDetail } from './CampaignDetail'
import { DailyLimitBar } from './DailyLimitBar'
import { useCampaignsStore } from '../../store/useCampaignsStore'
import { useCampaignLeadsStore } from '../../store/useCampaignLeadsStore'
import { Campaign } from '../../types'
import { STATUS_CONFIG } from './config'

export function CampaignsPage() {
  const { campaigns, load: loadCampaigns, remove, setStatus } = useCampaignsStore()
  const { leads, load: loadLeads, removeForCampaign } = useCampaignLeadsStore()

  const [selectedId,   setSelectedId]   = useState<string>('')
  const [createOpen,   setCreateOpen]   = useState(false)
  const [editCampaign, setEditCampaign] = useState<Campaign | undefined>()
  const [deleteCampaign, setDeleteCampaign] = useState<Campaign | undefined>()

  useEffect(() => { loadCampaigns(); loadLeads() }, [loadCampaigns, loadLeads])

  // Show detail view
  if (selectedId) {
    return (
      <CampaignDetail
        campaignId={selectedId}
        onBack={() => setSelectedId('')}
      />
    )
  }

  function handleDelete() {
    if (!deleteCampaign) return
    removeForCampaign(deleteCampaign.id)
    remove(deleteCampaign.id)
    setDeleteCampaign(undefined)
  }

  const totalLeads   = leads.length
  const totalActive  = campaigns.filter(c => c.status === 'active').length
  const totalContacted = leads.filter(l => l.firstContactAt).length
  const totalSales   = leads.filter(l => l.funnelStage === 'sale').length

  return (
    <PageLayout
      title="Campanhas"
      subtitle="Prospecção ativa — listas frias e funil de conversão"
      ctaLabel="Nova Campanha"
      onCta={() => setCreateOpen(true)}
    >
      {/* Barra de limite diário de disparos */}
      <div className="mb-6">
        <DailyLimitBar />
      </div>

      {/* Overview stats */}
      {campaigns.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Campanhas ativas',   value: totalActive,    color: 'text-indigo-400'  },
            { label: 'Leads na base',      value: totalLeads,     color: 'text-blue-400'    },
            { label: 'Leads acionados',    value: totalContacted, color: 'text-cyan-400'    },
            { label: 'Convertidos (venda)',value: totalSales,     color: 'text-green-400'   },
          ].map(s => (
            <Card key={s.label} className="!py-4">
              <p className="text-xs text-slate-600 mb-1">{s.label}</p>
              <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Campaign list */}
      {campaigns.length === 0 ? (
        <EmptyState
          icon={<Megaphone size={24} />}
          title="Nenhuma campanha criada"
          description="Crie sua primeira campanha de prospecção ativa para organizar sua lista fria e acompanhar o funil."
          ctaLabel="Nova Campanha"
          onCta={() => setCreateOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {campaigns.map(c => {
            const campaignLeads = leads.filter(l => l.campaignId === c.id)
            const contacted     = campaignLeads.filter(l => l.firstContactAt).length
            const inFunnel      = campaignLeads.filter(l => ['attended','presentation','proposal','sale'].includes(l.funnelStage)).length
            const sales         = campaignLeads.filter(l => l.funnelStage === 'sale').length
            const contactRate   = campaignLeads.length > 0 ? Math.round(contacted / campaignLeads.length * 100) : 0
            const statusCfg     = STATUS_CONFIG[c.status]

            return (
              <Card key={c.id} className="group flex flex-col gap-4 hover:border-indigo-500/20 transition-all duration-200 border border-white/5">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 bg-indigo-500/15 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Megaphone size={15} className="text-indigo-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-200 truncate">{c.name}</p>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusCfg.bg} ${statusCfg.color} ${statusCfg.border} border`}>
                        {statusCfg.label}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={() => setStatus(c.id, c.status === 'active' ? 'paused' : 'active')}
                      className="p-1.5 rounded-lg hover:bg-white/8 text-slate-600 hover:text-slate-300 transition-colors cursor-pointer"
                      title={c.status === 'active' ? 'Pausar' : 'Reativar'}>
                      {c.status === 'active' ? <Pause size={13} /> : <Play size={13} />}
                    </button>
                    <button onClick={() => setEditCampaign(c)}
                      className="p-1.5 rounded-lg hover:bg-white/8 text-slate-600 hover:text-slate-300 transition-colors cursor-pointer">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => setDeleteCampaign(c)}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-colors cursor-pointer">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { icon: <Users size={11} />, label: 'Leads',      value: campaignLeads.length, color: 'text-slate-300' },
                    { icon: <TrendingUp size={11} />, label: 'Acionados', value: `${contactRate}%`,   color: 'text-blue-400'  },
                    { icon: <CheckCheck size={11} />, label: 'Vendas',    value: sales,               color: 'text-green-400' },
                  ].map(s => (
                    <div key={s.label} className="flex flex-col items-center py-2 bg-white/3 rounded-xl border border-white/5">
                      <span className="text-slate-600 mb-1">{s.icon}</span>
                      <span className={`text-sm font-bold tabular-nums ${s.color}`}>{s.value}</span>
                      <span className="text-[10px] text-slate-600">{s.label}</span>
                    </div>
                  ))}
                </div>

                {/* Progress bar */}
                {campaignLeads.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">Avanço no funil</span>
                      <span className="text-slate-500 tabular-nums">{inFunnel}/{campaignLeads.length}</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
                        style={{ width: `${campaignLeads.length > 0 ? Math.round(inFunnel/campaignLeads.length*100) : 0}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* CTA */}
                <div className="flex gap-2 pt-1 border-t border-white/5">
                  <button
                    onClick={() => setSelectedId(c.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/8 transition-all cursor-pointer"
                  >
                    <Users size={12} /> Ver Leads <ArrowRight size={11} />
                  </button>
                  <button
                    onClick={() => { setSelectedId(c.id) }}
                    className="flex items-center gap-1.5 py-2 px-3 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all cursor-pointer"
                  >
                    <BarChart3 size={12} />
                  </button>
                </div>

                {/* Date */}
                <div className="flex items-center gap-1.5 -mt-2">
                  <Calendar size={10} className="text-slate-700" />
                  <span className="text-[10px] text-slate-700">
                    Criada em {new Date(c.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <CampaignForm isOpen={createOpen}        onClose={() => setCreateOpen(false)}    />
      <CampaignForm isOpen={Boolean(editCampaign)} onClose={() => setEditCampaign(undefined)} campaign={editCampaign} />

      <Modal isOpen={Boolean(deleteCampaign)} onClose={() => setDeleteCampaign(undefined)} title="Excluir campanha" size="sm">
        <p className="text-sm text-slate-400 mb-2">
          Excluir <span className="text-slate-200 font-medium">"{deleteCampaign?.name}"</span>?
        </p>
        <p className="text-xs text-red-400/80 bg-red-500/8 border border-red-500/15 rounded-xl px-3 py-2 mb-6">
          Todos os leads desta campanha também serão removidos permanentemente.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setDeleteCampaign(undefined)}>Cancelar</Button>
          <Button variant="danger"    className="flex-1" onClick={handleDelete}>Excluir tudo</Button>
        </div>
      </Modal>
    </PageLayout>
  )
}
