import { useEffect, useState } from 'react'
import {
  Phone, PhoneCall, BarChart3, Pause, Play, Pencil, Trash2, ArrowRight,
  UserCircle2, Calendar, Target,
} from 'lucide-react'
import { PageLayout } from '../../../components/layout/PageLayout'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { EmptyState } from '../../../components/ui/EmptyState'
import { CallCampaignForm } from './CallCampaignForm'
import { CallCampaignDetail } from './CallCampaignDetail'
import { CallPerformanceTab } from './CallPerformanceTab'
import { useCallCampaignsStore } from '../../../store/useCallCampaignsStore'
import { useCallQueueStore } from '../../../store/useCallQueueStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { DAILY_TARGETS } from '../../../lib/metasConfig'
import { CALL_STATUS_CONFIG } from './config'
import type { CallCampaign } from '../../../types'
import toast from 'react-hot-toast'

/**
 * Prospecção Ativa · Ligação WhatsApp.
 *
 * Módulo irmão do Disparo. A diferença de operação é grande o bastante para
 * justificar telas próprias: em disparo o corretor escolhe quem abordar, em
 * ligação a fila escolhe por ele — um lead por vez, um desfecho por ligação.
 */

type PageTab = 'campanhas' | 'desempenho'

export function LigacoesPage() {
  const { campaigns, participants, load, remove, setStatus, loading } = useCallCampaignsStore()
  const { contadores, carregarContadores } = useCallQueueStore()
  const { isAdmin, profile } = useAuthStore()

  const [selecionada, setSelecionada] = useState('')
  const [tab,         setTab]         = useState<PageTab>('campanhas')
  const [criarOpen,   setCriarOpen]   = useState(false)
  const [editando,    setEditando]    = useState<CallCampaign | undefined>()
  const [excluindo,   setExcluindo]   = useState<CallCampaign | undefined>()

  useEffect(() => {
    load().catch(() => toast.error('Falha ao carregar as campanhas de ligação'))
    carregarContadores()
  }, [load, carregarContadores])

  if (selecionada) {
    return <CallCampaignDetail campaignId={selecionada} onBack={() => { setSelecionada(''); void load() }} />
  }

  async function handleExcluir() {
    if (!excluindo) return
    try {
      await remove(excluindo.id)
      toast.success('Campanha excluída')
    } catch {
      toast.error('Falha ao excluir a campanha')
    } finally {
      setExcluindo(undefined)
    }
  }

  const metaDia   = DAILY_TARGETS.ligacoes
  const bateuMeta = contadores.hoje >= metaDia
  const ativas    = campaigns.filter(c => c.status === 'active')

  return (
    <PageLayout
      title="Ligações WhatsApp"
      subtitle="Prospecção ativa por telefone — fila compartilhada e cadência automática"
      ctaLabel="Nova campanha"
      onCta={() => setCriarOpen(true)}
    >
      {/* Meta do dia — o número que o corretor precisa ver antes de tudo */}
      <div className="mb-5 rounded-[14px] border border-line bg-s2/40 px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <Target size={15} className={bateuMeta ? 'text-success' : 'text-brand'} strokeWidth={1.6} />
          <span className="font-label text-[11px] font-bold uppercase tracking-[0.14em] text-t4">
            Suas ligações hoje
          </span>
          <span className={`ml-auto text-sm font-bold tabular-nums ${bateuMeta ? 'text-success' : 'text-t1'}`}>
            {contadores.hoje}<span className="text-t4 font-medium">/{metaDia}</span>
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-s3 overflow-hidden mt-2.5">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${bateuMeta ? 'bg-success' : 'bg-brand'}`}
            style={{ width: `${Math.min(100, (contadores.hoje / metaDia) * 100)}%` }}
          />
        </div>
        <p className="text-[11px] text-t4 mt-2">
          Mínimo combinado: {metaDia} ligações por dia, por corretor.
          {contadores.semDesfechoHoje > 0 && (
            <span className="text-warning"> · {contadores.semDesfechoHoje} ainda sem desfecho registrado</span>
          )}
        </p>
      </div>

      {loading && campaigns.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
          <p className="text-sm text-t3">Carregando campanhas…</p>
        </div>
      )}

      {(!loading || campaigns.length > 0) && (
        <>
          <div className="flex items-center gap-1 mb-6 bg-s2/50 border border-line rounded-[14px] p-1 w-fit">
            {([
              { value: 'campanhas',  label: 'Campanhas',  icon: <PhoneCall size={13} strokeWidth={1.6} /> },
              { value: 'desempenho', label: 'Desempenho', icon: <BarChart3 size={13} strokeWidth={1.6} /> },
            ] as { value: PageTab; label: string; icon: React.ReactNode }[]).map(t => (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all cursor-pointer
                  ${tab === t.value ? 'bg-brand text-[var(--brand-btn-text)]' : 'text-t3 hover:text-t1'}`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {tab === 'desempenho' && <CallPerformanceTab />}

          {tab === 'campanhas' && (
            campaigns.length === 0 ? (
              <EmptyState
                icon={<Phone size={24} />}
                title="Nenhuma campanha de ligação"
                description="Crie uma campanha, aponte para uma lista da Base de Leads e a fila monta sozinha — quem nunca foi tocado vem primeiro."
                ctaLabel="Nova campanha"
                onCta={() => setCriarOpen(true)}
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {campaigns.map(c => {
                  const cfg     = CALL_STATUS_CONFIG[c.status]
                  const equipe  = participants.filter(p => p.campaignId === c.id).length
                    + (c.ownerBrokerId ? 1 : 0)
                  const souDono = c.ownerBrokerId === profile?.id

                  return (
                    <Card key={c.id} className="group flex flex-col gap-4 border border-line hover:border-brand/25 transition-all">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="w-9 h-9 rounded-[14px] bg-brand-tint flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Phone size={15} className="text-brand" strokeWidth={1.6} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-t1 truncate">{c.name}</p>
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                                {cfg.label}
                              </span>
                              {c.productName && (
                                <span className="text-[11px] text-t4 truncate">{c.productName}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {(isAdmin || souDono) && (
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <button
                              onClick={() => setStatus(c.id, c.status === 'active' ? 'paused' : 'active')}
                              className="p-1.5 rounded-lg hover:bg-s3/70 text-t4 hover:text-t2 transition-colors cursor-pointer"
                              title={c.status === 'active' ? 'Pausar' : 'Reativar'}
                            >
                              {c.status === 'active'
                                ? <Pause size={13} strokeWidth={1.6} />
                                : <Play  size={13} strokeWidth={1.6} />}
                            </button>
                            <button
                              onClick={() => setEditando(c)}
                              className="p-1.5 rounded-lg hover:bg-s3/70 text-t4 hover:text-t2 transition-colors cursor-pointer"
                            >
                              <Pencil size={13} strokeWidth={1.6} />
                            </button>
                            <button
                              onClick={() => setExcluindo(c)}
                              className="p-1.5 rounded-lg hover:bg-error-bg text-t4 hover:text-error transition-colors cursor-pointer"
                            >
                              <Trash2 size={13} strokeWidth={1.6} />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-t4">
                        <span className="flex items-center gap-1">
                          <UserCircle2 size={11} strokeWidth={1.6} /> {equipe} na equipe
                        </span>
                        <span className="text-t5">·</span>
                        <span>até {c.maxAttempts} tentativas</span>
                        <span className="text-t5">·</span>
                        <span>reserva {c.claimMinutes} min</span>
                      </div>

                      <div className="flex gap-2 pt-1 border-t border-line">
                        <button
                          onClick={() => setSelecionada(c.id)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[14px]
                                     text-[13px] font-medium text-brand hover:text-brand-text
                                     hover:bg-brand-tint transition-all cursor-pointer"
                        >
                          <Phone size={12} strokeWidth={1.6} /> Abrir fila <ArrowRight size={11} strokeWidth={1.6} />
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 -mt-2">
                        <Calendar size={10} className="text-t5" strokeWidth={1.6} />
                        <span className="text-[11px] text-t5">
                          Criada em {new Date(c.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )
          )}

          {tab === 'campanhas' && ativas.length === 0 && campaigns.length > 0 && (
            <p className="mt-5 text-[13px] text-t4">
              Nenhuma campanha ativa — reative uma para voltar a puxar leads da fila.
            </p>
          )}
        </>
      )}

      <CallCampaignForm isOpen={criarOpen} onClose={() => setCriarOpen(false)} />
      <CallCampaignForm
        isOpen={Boolean(editando)}
        onClose={() => setEditando(undefined)}
        campaign={editando}
      />

      <Modal isOpen={Boolean(excluindo)} onClose={() => setExcluindo(undefined)} title="Excluir campanha" size="sm">
        <p className="text-sm text-t3 mb-2">
          Excluir <span className="text-t1 font-medium">"{excluindo?.name}"</span>?
        </p>
        <p className="text-[13px] text-error bg-error-bg border border-error-line rounded-[14px] px-3.5 py-2.5 mb-6">
          A fila e o histórico de ligações desta campanha são apagados junto. Os contatos
          na Base de Leads e os leads já transferidos para o funil não são afetados.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setExcluindo(undefined)}>Cancelar</Button>
          <Button variant="danger" className="flex-1" onClick={handleExcluir}>Excluir</Button>
        </div>
      </Modal>
    </PageLayout>
  )
}
