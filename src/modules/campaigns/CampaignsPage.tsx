import { useEffect, useState, lazy, Suspense } from 'react'
import {
  Megaphone, Pencil, Trash2, ArrowRight,
  Play, Pause, Zap, ArrowLeftRight, Plus, ChevronRight,
} from 'lucide-react'
import { Abas } from '../../components/shared/Abas'
import { PageLayout } from '../../components/layout/PageLayout'
import { ListContainer } from '../../components/ui/ListContainer'
import { FaixaNumeros } from '../../components/shared/visual'
import toast from 'react-hot-toast'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { EstadoTela } from '../../components/shared/EstadoTela'
import { EsqueletoLinhas } from '../../components/shared/Esqueleto'
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
  const { leads, load: loadLeads, esquecerCampanha, transferLeadsToBroker, loading: loadingLeads } = useCampaignLeadsStore()
  const { load: loadDisparos } = useDisparosStore()
  const brokers = allProfiles.filter(p => p.role === 'broker')

  const [selectedId,        setSelectedId]        = useState<string>('')
  const [pageTab,           setPageTab]           = useState<PageTab>('campanhas')
  const [createOpen,        setCreateOpen]        = useState(false)
  const [editCampaign,      setEditCampaign]      = useState<Campaign | undefined>()
  const [deleteCampaign,    setDeleteCampaign]    = useState<Campaign | undefined>()
  const [transferCampaign,  setTransferCampaign]  = useState<Campaign | undefined>()
  const [transferBrokerId,  setTransferBrokerId]  = useState<string>('')
  const [gravando,          setGravando]          = useState(false)

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

  // Banco primeiro: a campanha só some depois do delete confirmado. Os leads
  // dela saem do banco em cascata; aqui só são esquecidos da memória.
  async function handleDelete() {
    if (!deleteCampaign) return
    setGravando(true)
    try {
      await remove(deleteCampaign.id)
      esquecerCampanha(deleteCampaign.id)
      toast.success('Campanha excluída')
      setDeleteCampaign(undefined)
    } catch {
      // deleteOne já mostrou o erro; o modal fica aberto e a campanha na lista.
    } finally {
      setGravando(false)
    }
  }

  async function handleTransfer() {
    if (!transferCampaign) return
    const brokerId = transferBrokerId || null
    setGravando(true)
    try {
      await update(transferCampaign.id, { brokerId })
      await transferLeadsToBroker(transferCampaign.id, brokerId)
      toast.success('Campanha transferida')
      setTransferCampaign(undefined)
      setTransferBrokerId('')
    } catch {
      toast.error('A transferência não terminou. Confira o responsável e tente de novo.')
    } finally {
      setGravando(false)
    }
  }

  const totalLeads   = leads.length
  const totalActive  = campaigns.filter(c => c.status === 'active').length
  const totalContacted = leads.filter(l => l.firstContactAt).length
  const totalSales   = leads.filter(l => l.funnelStage === 'sale').length

  return (
    <PageLayout
      title="Campanhas"
      subtitle={erroCampanhas
        ? 'não foi possível ler as campanhas'
        : 'Prospecção ativa — listas frias e funil de conversão'}
      ctaLabel="Nova Campanha"
      onCta={() => setCreateOpen(true)}
      band={
        <Abas
          rotulo="Seções de campanhas"
          valor={pageTab}
          onChange={setPageTab}
          variante="sublinhado"
          abas={[
            { value: 'campanhas',   label: 'Campanhas',   icon: Megaphone, badge: campaigns.length || undefined },
            { value: 'performance', label: 'Performance', icon: Zap },
          ]}
        />
      }
    >
      {/* Barra de limite diário de disparos */}
      <div className="mb-4">
        <DailyLimitBar />
      </div>

      {/* Skeleton de carregamento inicial */}
      {isLoading && <EsqueletoLinhas linhas={4} />}

      {/* Conteúdo — oculto durante carregamento */}
      {!isLoading && <>


      {/* ── Aba Performance ── */}
      {pageTab === 'performance' && (
        <Suspense fallback={<div className="h-64 rounded-[18px] shimmer" aria-hidden />}><CampaignPerformanceTab leads={leads} /></Suspense>
      )}

      {/* ── Aba Campanhas ── */}
      {pageTab === 'campanhas' && <>

      {campaigns.length > 0 && (
        <FaixaNumeros className="mb-5" itens={[
          { rotulo: 'Campanhas ativas',    valor: totalActive.toLocaleString('pt-BR') },
          { rotulo: 'Leads na base',       valor: totalLeads.toLocaleString('pt-BR') },
          { rotulo: 'Leads acionados',     valor: totalContacted.toLocaleString('pt-BR'),
            nota: totalLeads > 0 ? `${Math.round(totalContacted / totalLeads * 100)}% da base` : undefined },
          { rotulo: 'Convertidos (venda)', valor: totalSales.toLocaleString('pt-BR'),
            tom: totalSales > 0 ? 'text-success' : undefined },
        ]} />
      )}

      {/* Campaign list */}
      <EstadoTela
        carregando={loadingCampaigns && allCampaigns.length === 0}
        erro={erroCampanhas}
        vazio={campaigns.length === 0}
        onTentarDeNovo={() => { void loadCampaigns() }}
        icone={Megaphone}
        titulo="Nenhuma *campanha* criada"
        descricao="Crie sua primeira campanha de prospecção ativa para organizar sua lista fria e acompanhar o funil."
        acao={
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus size={14} /> Nova campanha
          </Button>
        }
      >
        <ListContainer>
          {campaigns.map(c => {
            const campaignLeads = leads.filter(l => l.campaignId === c.id)
            const total         = campaignLeads.length

            const nPending     = campaignLeads.filter(l => l.funnelStage === 'new').length
            const nInterested  = campaignLeads.filter(l => l.funnelStage === 'attended').length
            const nScheduled   = campaignLeads.filter(l => l.funnelStage === 'scheduled').length
            const nTransferred = campaignLeads.filter(l => l.transferredAt).length

            const acionados    = total - nPending
            const reachRate    = total > 0 ? Math.round(acionados / total * 100) : 0
            const interestRate = acionados > 0 ? Math.round(nInterested / acionados * 100) : 0

            const statusCfg = STATUS_CONFIG[c.status]
            const ativa     = c.status === 'active'
            const brokerName = c.brokerId
              ? (allProfiles.find(p => p.id === c.brokerId)?.name ?? 'Corretor')
              : null

            return (
              <div key={c.id}
                className="lista-linha group flex items-center gap-4 px-5 py-3.5 border-b border-line last:border-0 transition-colors">
                <span className={`w-2 h-2 rounded-full shrink-0 ${ativa ? 'bg-success' : 'bg-t5'}`} aria-hidden />

                <button onClick={() => setSelectedId(c.id)}
                  className="flex-1 min-w-0 text-left cursor-pointer focus:outline-none focus-visible:underline">
                  <p className="text-[14.5px] font-semibold text-t1 truncate">{c.name}</p>
                  <p className="text-[12.5px] text-t4 truncate mt-0.5">
                    {statusCfg.label}
                    {isAdmin && brokerName && <> · {brokerName}</>}
                    {' · '}{total.toLocaleString('pt-BR')} {total === 1 ? 'lead' : 'leads'}
                  </p>
                </button>

                {/* O funil da campanha em números — só onde cabe. */}
                {total > 0 && (
                  <div className="hidden lg:flex items-center gap-6 shrink-0 tabular-nums">
                    <Metrica rotulo="Acionamento" valor={`${reachRate}%`} />
                    <Metrica rotulo="Interesse"   valor={`${interestRate}%`} />
                    <Metrica rotulo="Agendados"   valor={nScheduled.toLocaleString('pt-BR')} />
                    <Metrica rotulo="Transferidos" valor={nTransferred.toLocaleString('pt-BR')}
                             tom={nTransferred > 0 ? 'text-success' : undefined} />
                  </div>
                )}

                <div className="hidden sm:flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => setStatus(c.id, ativa ? 'paused' : 'active')}
                    aria-label={ativa ? 'Pausar campanha' : 'Reativar campanha'}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-s3/70 text-t4 hover:text-t2 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand/30">
                    {ativa ? <Pause size={14} strokeWidth={1.8} /> : <Play size={14} strokeWidth={1.8} />}
                  </button>
                  {isAdmin && (
                    <button onClick={() => { setTransferCampaign(c); setTransferBrokerId(c.brokerId ?? '') }}
                      aria-label="Transferir campanha"
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-s3/70 text-t4 hover:text-t2 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand/30">
                      <ArrowLeftRight size={14} strokeWidth={1.8} />
                    </button>
                  )}
                  <button onClick={() => setEditCampaign(c)} aria-label="Editar campanha"
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-s3/70 text-t4 hover:text-t2 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand/30">
                    <Pencil size={14} strokeWidth={1.8} />
                  </button>
                  <button onClick={() => setDeleteCampaign(c)} aria-label="Excluir campanha"
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-error-bg text-t4 hover:text-error transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-error/30">
                    <Trash2 size={14} strokeWidth={1.8} />
                  </button>
                </div>

                <Button variant="secondary" size="sm" onClick={() => setSelectedId(c.id)} className="gap-1.5 shrink-0 !hidden sm:!inline-flex">
                  Abrir <ArrowRight size={13} strokeWidth={1.8} aria-hidden />
                </Button>
                <ChevronRight size={16} strokeWidth={1.8} className="sm:hidden text-t4 shrink-0" aria-hidden />
              </div>
            )
          })}
        </ListContainer>
      </EstadoTela>

      </> /* fim aba campanhas */}

      </> /* fim !isLoading */}

      <CampaignForm isOpen={createOpen}        onClose={() => setCreateOpen(false)}    />
      <CampaignForm isOpen={Boolean(editCampaign)} onClose={() => setEditCampaign(undefined)} campaign={editCampaign} />

      <Modal isOpen={Boolean(deleteCampaign)} onClose={() => setDeleteCampaign(undefined)} title="Excluir campanha" size="sm">
        <p className="text-sm text-t3 mb-2">
          Excluir <span className="text-t1 font-medium">"{deleteCampaign?.name}"</span>?
        </p>
        <p className="text-[13px] text-error bg-error-bg border border-error-line rounded-xl px-3 py-2 mb-6">
          Todos os leads desta campanha também serão removidos permanentemente.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setDeleteCampaign(undefined)}>Cancelar</Button>
          <Button variant="danger"    className="flex-1" onClick={handleDelete} carregando={gravando}>Excluir tudo</Button>
        </div>
      </Modal>

      <Modal isOpen={Boolean(transferCampaign)} onClose={() => setTransferCampaign(undefined)} title="Transferir campanha" size="sm">
        <p className="text-sm text-t3 mb-4">
          Defina o responsável por <span className="text-t1 font-medium">"{transferCampaign?.name}"</span>:
        </p>
        <div className="flex flex-col gap-1.5 mb-6">
          <label htmlFor="campaignspage-314" className="rotulo-campo">Responsável</label>
          <select id="campaignspage-314"
            value={transferBrokerId}
            onChange={e => setTransferBrokerId(e.target.value)}
            className="campo w-full"
          >
            <option value="">Admin (sem corretor)</option>
            {brokers.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setTransferCampaign(undefined)}>Cancelar</Button>
          <Button variant="primary"   className="flex-1" onClick={handleTransfer} carregando={gravando}>Transferir</Button>
        </div>
      </Modal>
    </PageLayout>
  )
}

function Metrica({ rotulo, valor, tom }: { rotulo: string; valor: string; tom?: string }) {
  return (
    <div className="text-right min-w-[64px]">
      <p className={`text-[14px] font-semibold leading-tight ${tom ?? 'text-t1'}`}>{valor}</p>
      <p className="text-[11.5px] text-t4 leading-tight mt-0.5">{rotulo}</p>
    </div>
  )
}
