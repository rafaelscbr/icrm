import { useEffect, useState } from 'react'
import {
  Phone, PhoneCall, BarChart3, Pause, Play, Pencil, Trash2, ArrowRight,
  Users, Calendar, Target, Sparkles, AlertTriangle, Repeat, Timer, Package,
} from 'lucide-react'
import { PageLayout } from '../../../components/layout/PageLayout'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { EmptyState } from '../../../components/ui/EmptyState'
import { CallCampaignForm } from './CallCampaignForm'
import { CallCampaignDetail } from './CallCampaignDetail'
import { CallPerformanceTab } from './CallPerformanceTab'
import { Painel, Rotulo, IconeTom, Barra, Chip } from './Primitivas'
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
 *
 * A meta do dia abre a tela porque é o número que decide se o corretor precisa
 * trabalhar agora. Tudo mais é consequência dela.
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
  const faltam    = Math.max(0, metaDia - contadores.hoje)
  const ativas    = campaigns.filter(c => c.status === 'active')
  const primeira  = ativas[0] ?? campaigns[0]

  return (
    <PageLayout
      title="Ligações WhatsApp"
      subtitle="Prospecção ativa por telefone — fila compartilhada e cadência automática"
      ctaLabel="Nova campanha"
      onCta={() => setCriarOpen(true)}
    >
      {/* ── Meta do dia — o hero da tela ──────────────────────────── */}
      <Painel dourado className="mb-5 px-5 py-4">
        <div className="flex items-center gap-4 flex-wrap">
          <IconeTom icon={bateuMeta ? Sparkles : Target} tom={bateuMeta ? 'sucesso' : 'marca'} tamanho="lg" />

          <div className="min-w-0 flex-1">
            <Rotulo>Suas ligações hoje</Rotulo>
            <div className="flex items-baseline gap-2 mt-1">
              <span className={`font-heading font-extrabold tabular-nums leading-none text-[38px]
                                tracking-tight ${bateuMeta ? 'text-success' : 'text-brand'}`}>
                {contadores.hoje}
              </span>
              <span className="font-label text-[13px] text-t4 tabular-nums">de {metaDia}</span>
            </div>
            <p className="text-[13px] text-t3 mt-1">
              {bateuMeta
                ? 'Meta batida — cada ligação daqui é lucro.'
                : `Faltam ${faltam} para o mínimo combinado do dia.`}
            </p>
          </div>

          {primeira && (
            <button
              onClick={() => setSelecionada(primeira.id)}
              className="flex items-center gap-2.5 rounded-[14px] px-5 py-3.5 shrink-0
                         grad-brand grad-brand-glow font-heading text-[15px] font-bold
                         transition-transform active:scale-[0.99] cursor-pointer min-h-[52px]
                         focus:outline-none focus:ring-2 focus:ring-brand/40"
            >
              <Phone size={18} strokeWidth={1.8} aria-hidden /> Ligar agora
            </button>
          )}
        </div>

        <div className="mt-3.5">
          <Barra pct={(contadores.hoje / metaDia) * 100} tom={bateuMeta ? 'sucesso' : 'marca'} altura={7} />
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2.5">
          <span className="text-[11px] text-t4 tabular-nums">{contadores.semana} na semana</span>
          <span className="text-t5" aria-hidden>·</span>
          <span className="text-[11px] text-t4 tabular-nums">{contadores.mes} no mês</span>
          {contadores.semDesfechoHoje > 0 && (
            <Chip icon={AlertTriangle} tom="atencao">
              {contadores.semDesfechoHoje} sem desfecho registrado
            </Chip>
          )}
        </div>
      </Painel>

      {loading && campaigns.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-brand/30 border-t-brand animate-spin" aria-hidden />
          <p className="text-sm text-t3">Carregando campanhas…</p>
        </div>
      )}

      {(!loading || campaigns.length > 0) && (
        <>
          <div
            className="flex items-center gap-1 mb-5 bg-s2/50 border border-line rounded-[14px] p-1 w-fit"
            role="tablist"
            aria-label="Seções"
          >
            {([
              { value: 'campanhas',  label: 'Campanhas',  icon: PhoneCall },
              { value: 'desempenho', label: 'Desempenho', icon: BarChart3 },
            ] as { value: PageTab; label: string; icon: typeof PhoneCall }[]).map(t => {
              const ativo = tab === t.value
              return (
                <button
                  key={t.value}
                  role="tab"
                  aria-selected={ativo}
                  onClick={() => setTab(t.value)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-[10px] text-[13px] font-semibold
                              transition-all cursor-pointer min-h-[40px]
                              focus:outline-none focus:ring-2 focus:ring-brand/30
                    ${ativo ? 'grad-brand' : 'text-t3 hover:text-t1'}`}
                >
                  <t.icon size={13} strokeWidth={1.7} aria-hidden /> {t.label}
                </button>
              )
            })}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {campaigns.map(c => {
                  const cfg     = CALL_STATUS_CONFIG[c.status]
                  const equipe  = participants.filter(p => p.campaignId === c.id).length
                    + (c.ownerBrokerId ? 1 : 0)
                  const souDono = c.ownerBrokerId === profile?.id
                  const podeEditar = isAdmin || souDono

                  return (
                    <Painel key={c.id} className="group flex flex-col">
                      {/* Cabeçalho */}
                      <div className="flex items-start gap-3 px-4 pt-4 pb-3">
                        <IconeTom icon={Phone} tom={c.status === 'active' ? 'marca' : 'neutro'} />

                        <div className="flex-1 min-w-0">
                          <h3 className="font-heading text-[15px] font-bold text-t1 truncate leading-tight">
                            {c.name}
                          </h3>
                          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                            <Chip tom={cfg.tom}>{cfg.label}</Chip>
                            {c.productName && (
                              <span className="inline-flex items-center gap-1 text-[11px] text-t4 truncate">
                                <Package size={10} strokeWidth={1.6} aria-hidden /> {c.productName}
                              </span>
                            )}
                          </div>
                        </div>

                        {podeEditar && (
                          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100
                                          transition-opacity shrink-0">
                            <button
                              onClick={() => setStatus(c.id, c.status === 'active' ? 'paused' : 'active')}
                              aria-label={c.status === 'active' ? 'Pausar campanha' : 'Reativar campanha'}
                              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-s3/70
                                         text-t4 hover:text-t2 transition-colors cursor-pointer
                                         focus:outline-none focus:ring-2 focus:ring-brand/30"
                            >
                              {c.status === 'active'
                                ? <Pause size={13} strokeWidth={1.6} />
                                : <Play  size={13} strokeWidth={1.6} />}
                            </button>
                            <button
                              onClick={() => setEditando(c)}
                              aria-label="Editar campanha"
                              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-s3/70
                                         text-t4 hover:text-t2 transition-colors cursor-pointer
                                         focus:outline-none focus:ring-2 focus:ring-brand/30"
                            >
                              <Pencil size={13} strokeWidth={1.6} />
                            </button>
                            <button
                              onClick={() => setExcluindo(c)}
                              aria-label="Excluir campanha"
                              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-error-bg
                                         text-t4 hover:text-error transition-colors cursor-pointer
                                         focus:outline-none focus:ring-2 focus:ring-error/30"
                            >
                              <Trash2 size={13} strokeWidth={1.6} />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Regras da fila, em linguagem de gente */}
                      <div className="px-4 pb-3 flex flex-wrap gap-x-3.5 gap-y-1.5">
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-t4">
                          <Users size={11} strokeWidth={1.6} aria-hidden />
                          {equipe} {equipe === 1 ? 'corretor' : 'corretores'}
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-t4">
                          <Repeat size={11} strokeWidth={1.6} aria-hidden />
                          até {c.maxAttempts} tentativas
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-t4">
                          <Timer size={11} strokeWidth={1.6} aria-hidden />
                          reserva {c.claimMinutes} min
                        </span>
                      </div>

                      {/* Ação principal — um clique para o trabalho */}
                      <div className="mt-auto px-3 pb-3">
                        <button
                          onClick={() => setSelecionada(c.id)}
                          className="w-full flex items-center justify-center gap-2 rounded-[12px]
                                     border border-brand/30 bg-brand-tint px-4 py-2.5 min-h-[44px]
                                     font-heading text-[13px] font-bold text-brand-text
                                     hover:brightness-115 transition-all cursor-pointer
                                     focus:outline-none focus:ring-2 focus:ring-brand/30"
                        >
                          <Phone size={13} strokeWidth={1.8} aria-hidden /> Abrir fila
                          <ArrowRight size={12} strokeWidth={1.8} aria-hidden />
                        </button>
                      </div>

                      <div className="px-4 pb-3 flex items-center gap-1.5">
                        <Calendar size={10} strokeWidth={1.6} className="text-t5" aria-hidden />
                        <span className="text-[11px] text-t5">
                          Criada em {new Date(c.createdAt).toLocaleDateString('pt-BR', {
                            day: '2-digit', month: 'short', year: 'numeric',
                          })}
                        </span>
                      </div>
                    </Painel>
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

      {/* Modal central é a exceção deliberada: exclusão é destrutiva e curta,
          e aqui o "pare tudo" é exatamente a intenção. */}
      <Modal isOpen={Boolean(excluindo)} onClose={() => setExcluindo(undefined)} title="Excluir campanha" size="sm">
        <p className="text-sm text-t3 mb-3">
          Excluir <span className="font-semibold text-t1">"{excluindo?.name}"</span>?
        </p>
        <div className="flex items-start gap-2.5 rounded-[14px] border border-error-line bg-error-bg px-3.5 py-3 mb-6">
          <AlertTriangle size={14} strokeWidth={1.6} className="text-error shrink-0 mt-0.5" aria-hidden />
          <p className="text-[13px] text-error">
            A fila e o histórico de ligações desta campanha são apagados junto. Os contatos na
            Base de Leads e os leads já transferidos para o funil não são afetados.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setExcluindo(undefined)}>
            Cancelar
          </Button>
          <Button variant="danger" className="flex-1" onClick={handleExcluir}>Excluir</Button>
        </div>
      </Modal>
    </PageLayout>
  )
}
