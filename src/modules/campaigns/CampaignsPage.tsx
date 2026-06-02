import { useEffect, useState } from 'react'
import {
  Megaphone, Users, TrendingUp, Calendar, Pencil, Trash2, ArrowRight,
  Play, Pause, CheckCheck, BarChart3, Zap, ArrowLeftRight, UserCircle2
} from 'lucide-react'
import { PageLayout } from '../../components/layout/PageLayout'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { EmptyState } from '../../components/ui/EmptyState'
import { CampaignForm } from './CampaignForm'
import { CampaignDetail } from './CampaignDetail'
import { CampaignPerformanceTab } from './CampaignPerformanceTab'
import { DailyLimitBar } from './DailyLimitBar'
import { useCampaignsStore } from '../../store/useCampaignsStore'
import { useCampaignLeadsStore } from '../../store/useCampaignLeadsStore'
import { useAuthStore } from '../../store/useAuthStore'
import { Campaign } from '../../types'
import { STATUS_CONFIG } from './config'

type PageTab = 'campanhas' | 'performance'

export function CampaignsPage() {
  const { campaigns: allCampaigns, load: loadCampaigns, remove, setStatus, update } = useCampaignsStore()
  const { isAdmin, viewAsBrokerId, allProfiles } = useAuthStore()
  const campaigns = isAdmin && viewAsBrokerId ? allCampaigns.filter(c => c.brokerId === viewAsBrokerId) : allCampaigns
  const { leads, load: loadLeads, removeForCampaign, transferLeadsToBroker } = useCampaignLeadsStore()
  const brokers = allProfiles.filter(p => p.role === 'broker')

  const [selectedId,        setSelectedId]        = useState<string>('')
  const [pageTab,           setPageTab]           = useState<PageTab>('campanhas')
  const [createOpen,        setCreateOpen]        = useState(false)
  const [editCampaign,      setEditCampaign]      = useState<Campaign | undefined>()
  const [deleteCampaign,    setDeleteCampaign]    = useState<Campaign | undefined>()
  const [transferCampaign,  setTransferCampaign]  = useState<Campaign | undefined>()
  const [transferBrokerId,  setTransferBrokerId]  = useState<string>('')

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

  async function handleTransfer() {
    if (!transferCampaign) return
    const brokerId = transferBrokerId || null
    update(transferCampaign.id, { brokerId })
    await transferLeadsToBroker(transferCampaign.id, brokerId)
    setTransferCampaign(undefined)
    setTransferBrokerId('')
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
      <div className="mb-4">
        <DailyLimitBar />
      </div>

      {/* Abas principais */}
      <div className="flex items-center gap-1 mb-6 bg-s2/50 border border-line rounded-xl p-1 w-fit">
        {([
          { value: 'campanhas',   label: 'Campanhas',  icon: <Megaphone size={13} /> },
          { value: 'performance', label: 'Performance', icon: <Zap       size={13} /> },
        ] as { value: PageTab; label: string; icon: React.ReactNode }[]).map(t => (
          <button
            key={t.value}
            onClick={() => setPageTab(t.value)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all
              ${pageTab === t.value
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-300'}`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Aba Performance ── */}
      {pageTab === 'performance' && (
        <CampaignPerformanceTab leads={leads} />
      )}

      {/* ── Aba Campanhas ── */}
      {pageTab === 'campanhas' && <>

      {/* Overview stats */}
      {campaigns.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Campanhas ativas',   value: totalActive,    color: 'text-brand'  },
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
            const inFunnel      = campaignLeads.filter(l => ['attended','scheduled'].includes(l.funnelStage)).length
            const transferred   = campaignLeads.filter(l => l.transferredAt).length
            const contactRate   = campaignLeads.length > 0 ? Math.round(contacted / campaignLeads.length * 100) : 0
            const statusCfg     = STATUS_CONFIG[c.status]

            const brokerName = c.brokerId
              ? (allProfiles.find(p => p.id === c.brokerId)?.name ?? 'Corretor')
              : null

            return (
              <Card key={c.id} className="group flex flex-col gap-4 hover:border-brand/25 transition-all duration-200 border border-line">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 bg-brand-tint rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Megaphone size={15} className="text-brand" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-200 truncate">{c.name}</p>
                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusCfg.bg} ${statusCfg.color} ${statusCfg.border} border`}>
                          {statusCfg.label}
                        </span>
                        {isAdmin && brokerName && (
                          <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20">
                            <UserCircle2 size={9} /> {brokerName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={() => setStatus(c.id, c.status === 'active' ? 'paused' : 'active')}
                      className="p-1.5 rounded-lg hover:bg-s3/70 text-slate-600 hover:text-slate-300 transition-colors cursor-pointer"
                      title={c.status === 'active' ? 'Pausar' : 'Reativar'}>
                      {c.status === 'active' ? <Pause size={13} /> : <Play size={13} />}
                    </button>
                    {isAdmin && (
                      <button onClick={() => { setTransferCampaign(c); setTransferBrokerId(c.brokerId ?? '') }}
                        className="p-1.5 rounded-lg hover:bg-s3/70 text-slate-600 hover:text-violet-400 transition-colors cursor-pointer"
                        title="Transferir campanha">
                        <ArrowLeftRight size={13} />
                      </button>
                    )}
                    <button onClick={() => setEditCampaign(c)}
                      className="p-1.5 rounded-lg hover:bg-s3/70 text-slate-600 hover:text-slate-300 transition-colors cursor-pointer">
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
                    { icon: <Users size={11} />, label: 'Leads',        value: campaignLeads.length, color: 'text-slate-300'  },
                    { icon: <TrendingUp size={11} />, label: 'Acionados', value: `${contactRate}%`,   color: 'text-blue-400'   },
                    { icon: <CheckCheck size={11} />, label: 'Transferidos', value: transferred,       color: 'text-violet-400' },
                  ].map(s => (
                    <div key={s.label} className="flex flex-col items-center py-2 bg-s2/50 rounded-xl border border-line">
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
                    <div className="h-1.5 bg-s3/50 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
                        style={{ width: `${campaignLeads.length > 0 ? Math.round(inFunnel/campaignLeads.length*100) : 0}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* CTA */}
                <div className="flex gap-2 pt-1 border-t border-line">
                  <button
                    onClick={() => setSelectedId(c.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium text-brand hover:text-brand-text hover:bg-indigo-500/8 transition-all cursor-pointer"
                  >
                    <Users size={12} /> Ver Leads <ArrowRight size={11} />
                  </button>
                  <button
                    onClick={() => { setSelectedId(c.id) }}
                    className="flex items-center gap-1.5 py-2 px-3 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-300 hover:bg-s3/50 transition-all cursor-pointer"
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

      </> /* fim aba campanhas */}

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

      <Modal isOpen={Boolean(transferCampaign)} onClose={() => setTransferCampaign(undefined)} title="Transferir campanha" size="sm">
        <p className="text-sm text-slate-400 mb-4">
          Defina o responsável por <span className="text-slate-200 font-medium">"{transferCampaign?.name}"</span>:
        </p>
        <div className="flex flex-col gap-1.5 mb-6">
          <label className="text-xs font-semibold text-t3 uppercase tracking-wider">Responsável</label>
          <select
            value={transferBrokerId}
            onChange={e => setTransferBrokerId(e.target.value)}
            className="w-full bg-s3/50 border border-line rounded-xl px-4 py-3.5 text-sm text-t1 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all min-h-[48px] appearance-none"
          >
            <option value="">Admin (sem corretor)</option>
            {brokers.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setTransferCampaign(undefined)}>Cancelar</Button>
          <Button variant="primary"   className="flex-1" onClick={handleTransfer}>Transferir</Button>
        </div>
      </Modal>
    </PageLayout>
  )
}
