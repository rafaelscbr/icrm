import { useEffect, useState, lazy, Suspense } from 'react'
import {
  Megaphone, Users, Calendar, Pencil, Trash2, ArrowRight,
  Play, Pause, BarChart3, Zap, ArrowLeftRight, UserCircle2,
  Clock, MessageCircle, Flame, CalendarCheck, ArrowUpRight,
  Plus,
} from 'lucide-react'
import { Abas } from '../../components/shared/Abas'
import { PageLayout } from '../../components/layout/PageLayout'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { EstadoTela } from '../../components/shared/EstadoTela'
import { EsqueletoCards } from '../../components/shared/Esqueleto'
import { CampaignForm } from './CampaignForm'
import { CampaignDetail } from './CampaignDetail'
// Aba com gráfico: o ECharts só baixa quando a aba abre, não junto com a tela.
const CampaignPerformanceTab = lazy(() => import('./CampaignPerformanceTab').then(m => ({ default: m.CampaignPerformanceTab })))
import { DailyLimitBar } from './DailyLimitBar'
import { useCampaignsStore } from '../../store/useCampaignsStore'
import { useCampaignLeadsStore } from '../../store/useCampaignLeadsStore'
import { useDisparosStore } from '../../store/useDisparosStore'
import { useAuthStore } from '../../store/useAuthStore'
import { Campaign } from '../../types'
import { STATUS_CONFIG } from './config'

type PageTab = 'campanhas' | 'performance'

export function CampaignsPage() {
  const { campaigns: allCampaigns, load: loadCampaigns, remove, setStatus, update, loading: loadingCampaigns, erro: erroCampanhas } = useCampaignsStore()
  const { isAdmin, viewAsBrokerId, allProfiles } = useAuthStore()
  const campaigns = isAdmin && viewAsBrokerId ? allCampaigns.filter(c => c.brokerId === viewAsBrokerId) : allCampaigns
  const { leads, load: loadLeads, removeForCampaign, transferLeadsToBroker, loading: loadingLeads } = useCampaignLeadsStore()
  const { load: loadDisparos } = useDisparosStore()
  const brokers = allProfiles.filter(p => p.role === 'broker')

  const [selectedId,        setSelectedId]        = useState<string>('')
  const [pageTab,           setPageTab]           = useState<PageTab>('campanhas')
  const [createOpen,        setCreateOpen]        = useState(false)
  const [editCampaign,      setEditCampaign]      = useState<Campaign | undefined>()
  const [deleteCampaign,    setDeleteCampaign]    = useState<Campaign | undefined>()
  const [transferCampaign,  setTransferCampaign]  = useState<Campaign | undefined>()
  const [transferBrokerId,  setTransferBrokerId]  = useState<string>('')

  useEffect(() => { loadCampaigns(); loadLeads(); loadDisparos() }, [loadCampaigns, loadLeads, loadDisparos])

  const isLoading = loadingCampaigns || loadingLeads

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
      icon={Megaphone}
      iconTom="marca"
      title="Campanhas"
      subtitle={erroCampanhas
        ? 'não foi possível ler as campanhas'
        : 'Prospecção ativa — listas frias e funil de conversão'}
      ctaLabel="Nova Campanha"
      onCta={() => setCreateOpen(true)}
    >
      {/* Barra de limite diário de disparos */}
      <div className="mb-4">
        <DailyLimitBar />
      </div>

      {/* Skeleton de carregamento inicial */}
      {isLoading && <EsqueletoCards cards={3} colunas={3} />}

      {/* Conteúdo — oculto durante carregamento */}
      {!isLoading && <>

      {/* Abas principais — mesmo componente (e indicador deslizante) do resto do sistema */}
      <Abas
        className="mb-6"
        rotulo="Seções de campanhas"
        valor={pageTab}
        onChange={setPageTab}
        abas={[
          { value: 'campanhas',   label: 'Campanhas',   icon: Megaphone },
          { value: 'performance', label: 'Performance', icon: Zap },
        ]}
      />

      {/* ── Aba Performance ── */}
      {pageTab === 'performance' && (
        <Suspense fallback={<div className="h-64 rounded-[18px] shimmer" aria-hidden />}><CampaignPerformanceTab leads={leads} /></Suspense>
      )}

      {/* ── Aba Campanhas ── */}
      {pageTab === 'campanhas' && <>

      {/* Overview stats */}
      {campaigns.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Número é neutro: cor só quando há estado (venda > 0 = ganho). */}
          {[
            { label: 'Campanhas ativas',    value: totalActive,    color: 'text-t1' },
            { label: 'Leads na base',       value: totalLeads,     color: 'text-t1' },
            { label: 'Leads acionados',     value: totalContacted, color: 'text-t1' },
            { label: 'Convertidos (venda)', value: totalSales,     color: totalSales > 0 ? 'text-success' : 'text-t1' },
          ].map(s => (
            <Card key={s.label} className="!py-4">
              <p className="font-label text-[11px] font-semibold uppercase tracking-[0.12em] text-t4 mb-1.5">{s.label}</p>
              <p className={`font-display text-[26px] font-extrabold tabular-nums leading-none ${s.color}`}>{s.value.toLocaleString('pt-BR')}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Campaign list */}
      <EstadoTela
        carregando={loadingCampaigns && allCampaigns.length === 0}
        erro={erroCampanhas}
        vazio={campaigns.length === 0}
        onTentarDeNovo={() => { void loadCampaigns() }}
        icone={Megaphone}
        titulo="Nenhuma campanha criada"
        descricao="Crie sua primeira campanha de prospecção ativa para organizar sua lista fria e acompanhar o funil."
        acao={
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus size={14} /> Nova campanha
          </Button>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {campaigns.map(c => {
            const campaignLeads = leads.filter(l => l.campaignId === c.id)
            const total         = campaignLeads.length

            // Mini funil — contagens por etapa
            const nPending     = campaignLeads.filter(l => l.funnelStage === 'new').length
            const nApproached  = campaignLeads.filter(l => l.funnelStage === 'sent').length
            const nInterested  = campaignLeads.filter(l => l.funnelStage === 'attended').length
            const nScheduled   = campaignLeads.filter(l => l.funnelStage === 'scheduled').length
            const nTransferred = campaignLeads.filter(l => l.transferredAt).length

            // Taxas
            const reachRate    = total > 0 ? Math.round((total - nPending) / total * 100) : 0
            const interestRate = (total - nPending) > 0 ? Math.round(nInterested / (total - nPending) * 100) : 0

            const statusCfg = STATUS_CONFIG[c.status]

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
                      <p className="text-sm font-semibold text-t1 truncate">{c.name}</p>
                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                        <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${statusCfg.bg} ${statusCfg.color} ${statusCfg.border} border`}>
                          {statusCfg.label}
                        </span>
                        {isAdmin && brokerName && (
                          <span className="flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded bg-brand-tint text-brand-text border border-brand/25">
                            <UserCircle2 size={9} /> {brokerName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={() => setStatus(c.id, c.status === 'active' ? 'paused' : 'active')}
                      className="p-1.5 rounded-lg hover:bg-s3/70 text-t4 hover:text-t2 transition-colors cursor-pointer"
                      title={c.status === 'active' ? 'Pausar' : 'Reativar'}>
                      {c.status === 'active' ? <Pause size={13} /> : <Play size={13} />}
                    </button>
                    {isAdmin && (
                      <button onClick={() => { setTransferCampaign(c); setTransferBrokerId(c.brokerId ?? '') }}
                        className="p-1.5 rounded-lg hover:bg-s3/70 text-t4 hover:text-brand-text transition-colors cursor-pointer"
                        title="Transferir campanha">
                        <ArrowLeftRight size={13} />
                      </button>
                    )}
                    <button onClick={() => setEditCampaign(c)}
                      className="p-1.5 rounded-lg hover:bg-s3/70 text-t4 hover:text-t2 transition-colors cursor-pointer">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => setDeleteCampaign(c)}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-t4 hover:text-red-400 transition-colors cursor-pointer">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Mini funil */}
                {total > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-1">
                      {([
                        // Funil em tons neutros: a cor fica só no ícone e segue a
                        // temperatura (neutro → informação → marca → ganho).
                        { label: 'Pendentes',  value: nPending,    color: 'text-t4',         icon: <Clock         size={11} /> },
                        { label: 'Abordados',  value: nApproached, color: 'text-info',       icon: <MessageCircle size={11} /> },
                        { label: 'Interesse',  value: nInterested, color: 'text-info',       icon: <Flame         size={11} /> },
                        { label: 'Agendados',  value: nScheduled,  color: 'text-brand-text', icon: <CalendarCheck size={11} /> },
                        { label: 'Transf.',    value: nTransferred,color: 'text-success',    icon: <ArrowUpRight  size={11} /> },
                      ] as const).map(chip => (
                        <div
                          key={chip.label}
                          className="flex flex-col items-center gap-0.5 py-2 rounded-xl border border-line bg-s2/60 flex-1"
                        >
                          <span className={chip.color}>{chip.icon}</span>
                          <span className="text-[13px] font-bold tabular-nums leading-tight text-t1">{chip.value.toLocaleString('pt-BR')}</span>
                          <span className="text-[11px] text-t4 text-center leading-tight">{chip.label}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-t3">
                      <span>Acionamento <span className="text-t2 font-semibold tabular-nums">{reachRate}%</span></span>
                      <span className="text-t5">·</span>
                      <span>Interesse <span className="text-t2 font-semibold tabular-nums">{interestRate}%</span></span>
                    </div>
                  </div>
                )}

                {/* CTA */}
                <div className="flex gap-2 pt-1 border-t border-line">
                  <button
                    onClick={() => setSelectedId(c.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-t2 hover:text-t1 hover:bg-s2 transition-colors cursor-pointer"
                  >
                    <Users size={12} /> Ver Leads <ArrowRight size={11} />
                  </button>
                  <button
                    onClick={() => { setSelectedId(c.id) }}
                    className="flex items-center gap-1.5 py-2 px-3 rounded-xl text-xs font-medium text-t3 hover:text-t2 hover:bg-s3/50 transition-all cursor-pointer"
                  >
                    <BarChart3 size={12} />
                  </button>
                </div>

                {/* Date */}
                <div className="flex items-center gap-1.5 -mt-2">
                  <Calendar size={10} className="text-t5" />
                  <span className="text-[11px] text-t5">
                    Criada em {new Date(c.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </Card>
            )
          })}
        </div>
      </EstadoTela>

      </> /* fim aba campanhas */}

      </> /* fim !isLoading */}

      <CampaignForm isOpen={createOpen}        onClose={() => setCreateOpen(false)}    />
      <CampaignForm isOpen={Boolean(editCampaign)} onClose={() => setEditCampaign(undefined)} campaign={editCampaign} />

      <Modal isOpen={Boolean(deleteCampaign)} onClose={() => setDeleteCampaign(undefined)} title="Excluir campanha" size="sm">
        <p className="text-sm text-t3 mb-2">
          Excluir <span className="text-t1 font-medium">"{deleteCampaign?.name}"</span>?
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
        <p className="text-sm text-t3 mb-4">
          Defina o responsável por <span className="text-t1 font-medium">"{transferCampaign?.name}"</span>:
        </p>
        <div className="flex flex-col gap-1.5 mb-6">
          <label htmlFor="campaignspage-314" className="font-label text-[11px] font-bold uppercase tracking-[0.14em] text-t4">Responsável</label>
          <select id="campaignspage-314"
            value={transferBrokerId}
            onChange={e => setTransferBrokerId(e.target.value)}
            className="w-full bg-s3/50 border border-line rounded-xl px-4 py-3.5 text-sm text-t1 focus:outline-none focus:ring-2 focus:ring-brand/25 transition-all min-h-[48px] appearance-none"
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
