import { useEffect, useState } from 'react'
import {
  Phone, PhoneCall, BarChart3, Pause, Play, Pencil, Trash2, ArrowRight,
  AlertTriangle, Plus,
} from 'lucide-react'
import { PageLayout } from '../../../components/layout/PageLayout'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { EstadoTela } from '../../../components/shared/EstadoTela'
import { EsqueletoLinhas } from '../../../components/shared/Esqueleto'
import { Abas } from '../../../components/shared/Abas'
import { CallCampaignForm } from './CallCampaignForm'
import { CallCampaignDetail } from './CallCampaignDetail'
import { CallPerformanceTab } from './CallPerformanceTab'
import { LinhaMetaDia } from './LinhaMetaDia'
import { ListContainer } from '../../../components/ui/ListContainer'
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
 * trabalhar agora. Desde a v10 (01/11/2026) ela é uma linha, não um painel —
 * e as campanhas são lista, não cards: o que importa é o nome e "Abrir fila".
 */

type PageTab = 'campanhas' | 'desempenho'

export function LigacoesPage() {
  const { campaigns, participants, load, remove, setStatus, loading, erro } = useCallCampaignsStore()
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

  const ativas    = campaigns.filter(c => c.status === 'active')
  const primeira  = ativas[0] ?? campaigns[0]

  return (
    <PageLayout
      title="Ligações WhatsApp"
      subtitle="Prospecção ativa por telefone — fila compartilhada e cadência automática"
      ctaLabel="Nova campanha"
      onCta={() => setCriarOpen(true)}
      band={
        <Abas
          abas={[
            { value: 'campanhas'  as PageTab, label: 'Campanhas',  icon: PhoneCall },
            { value: 'desempenho' as PageTab, label: 'Desempenho', icon: BarChart3 },
          ]}
          valor={tab}
          onChange={setTab}
          rotulo="Seções de ligações"
          variante="sublinhado"
        />
      }
    >
      {/* ── Meta do dia — uma linha: número, barra, ritmo e o botão ───── */}
      <LinhaMetaDia
        className="mb-5"
        hoje={contadores.hoje} meta={DAILY_TARGETS.ligacoes}
        semana={contadores.semana} mes={contadores.mes} semDesfecho={contadores.semDesfechoHoje}
        acao={primeira && (
          <Button onClick={() => setSelecionada(primeira.id)} className="gap-2 shrink-0">
            <Phone size={14} strokeWidth={2} aria-hidden /> Ligar agora
          </Button>
        )}
      />

      {loading && campaigns.length === 0 && <EsqueletoLinhas linhas={4} />}

      {(!loading || campaigns.length > 0) && (
        <>

          {tab === 'desempenho' && <CallPerformanceTab />}

          {tab === 'campanhas' && (
            <EstadoTela
              carregando={loading && campaigns.length === 0}
              erro={erro}
              vazio={campaigns.length === 0}
              onTentarDeNovo={() => { void load().catch(() => {}) }}
              icone={Phone}
              titulo="Nenhuma campanha de ligação"
              descricao="Crie uma campanha, aponte para uma lista da Base de Leads e a fila monta sozinha — quem nunca foi tocado vem primeiro."
              acao={
                <Button onClick={() => setCriarOpen(true)} className="gap-2">
                  <Plus size={14} /> Nova campanha
                </Button>
              }
            >
              <ListContainer>
                {campaigns.map(c => {
                  const cfg     = CALL_STATUS_CONFIG[c.status]
                  const equipe  = participants.filter(p => p.campaignId === c.id).length
                    + (c.ownerBrokerId ? 1 : 0)
                  const souDono = c.ownerBrokerId === profile?.id
                  const podeEditar = isAdmin || souDono
                  const ativa = c.status === 'active'

                  return (
                    <div key={c.id}
                      className="lista-linha group flex items-center gap-4 px-5 py-3.5 border-b border-line last:border-0 transition-colors">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${ativa ? 'bg-success' : 'bg-t5'}`} aria-hidden />

                      <button onClick={() => setSelecionada(c.id)}
                        className="flex-1 min-w-0 text-left cursor-pointer focus:outline-none focus-visible:underline">
                        <p className="text-[14.5px] font-semibold text-t1 truncate">{c.name}</p>
                        <p className="text-[12.5px] text-t4 truncate mt-0.5">
                          {cfg.label}
                          {c.productName && <> · {c.productName}</>}
                          {' · '}{equipe} {equipe === 1 ? 'corretor' : 'corretores'}
                          {' · '}até {c.maxAttempts} tentativas
                          <span className="hidden md:inline"> · reserva {c.claimMinutes} min</span>
                        </p>
                      </button>

                      {podeEditar && (
                        <div className="hidden sm:flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100
                                        transition-opacity shrink-0">
                          <button
                            onClick={() => setStatus(c.id, ativa ? 'paused' : 'active')}
                            aria-label={ativa ? 'Pausar campanha' : 'Reativar campanha'}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-s3/70
                                       text-t4 hover:text-t2 transition-colors cursor-pointer
                                       focus:outline-none focus:ring-2 focus:ring-brand/30"
                          >
                            {ativa ? <Pause size={14} strokeWidth={1.8} /> : <Play size={14} strokeWidth={1.8} />}
                          </button>
                          <button
                            onClick={() => setEditando(c)}
                            aria-label="Editar campanha"
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-s3/70
                                       text-t4 hover:text-t2 transition-colors cursor-pointer
                                       focus:outline-none focus:ring-2 focus:ring-brand/30"
                          >
                            <Pencil size={14} strokeWidth={1.8} />
                          </button>
                          <button
                            onClick={() => setExcluindo(c)}
                            aria-label="Excluir campanha"
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-error-bg
                                       text-t4 hover:text-error transition-colors cursor-pointer
                                       focus:outline-none focus:ring-2 focus:ring-error/30"
                          >
                            <Trash2 size={14} strokeWidth={1.8} />
                          </button>
                        </div>
                      )}

                      <Button variant="secondary" size="sm" onClick={() => setSelecionada(c.id)} className="gap-1.5 shrink-0">
                        Abrir fila <ArrowRight size={13} strokeWidth={1.8} aria-hidden />
                      </Button>
                    </div>
                  )
                })}
              </ListContainer>
            </EstadoTela>
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
