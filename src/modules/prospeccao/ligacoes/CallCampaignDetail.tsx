import { useEffect, useState } from 'react'
import {
  ArrowLeft, Phone, LayoutGrid, BarChart3, Pencil, Pause, Play, CheckCheck,
  ListPlus, Users, Check, Loader2, X, Database, Crown, Timer,
} from 'lucide-react'
import { SidePanel } from '../../../components/ui/SidePanel'
import { Button } from '../../../components/ui/Button'
import { CallQueueTab } from './CallQueueTab'
import { CallKanbanTab } from './CallKanbanTab'
import { CallPerformanceTab } from './CallPerformanceTab'
import { CallCampaignForm } from './CallCampaignForm'
import { Rotulo, IconeTom, Dica, Chip, TOM } from './Primitivas'
import { useCallCampaignsStore } from '../../../store/useCallCampaignsStore'
import { useLeadListsStore } from '../../../store/useLeadListsStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { CALL_STATUS_CONFIG } from './config'
import toast from 'react-hot-toast'

type Tab = 'fila' | 'quadro' | 'desempenho'

const TABS: { value: Tab; label: string; icon: typeof Phone; dica: string }[] = [
  { value: 'fila',       label: 'Fila',       icon: Phone,      dica: 'Onde o trabalho acontece' },
  { value: 'quadro',     label: 'Quadro',     icon: LayoutGrid, dica: 'Onde a base emperrou' },
  { value: 'desempenho', label: 'Desempenho', icon: BarChart3,  dica: 'O que a operação está gerando' },
]

interface Props {
  campaignId: string
  onBack:     () => void
}

export function CallCampaignDetail({ campaignId, onBack }: Props) {
  const { campaigns, setStatus } = useCallCampaignsStore()
  const [tab,        setTab]        = useState<Tab>('fila')
  const [editOpen,   setEditOpen]   = useState(false)
  const [listasOpen, setListasOpen] = useState(false)
  const [equipeOpen, setEquipeOpen] = useState(false)

  const campaign = campaigns.find(c => c.id === campaignId)
  if (!campaign) return null

  const statusCfg = CALL_STATUS_CONFIG[campaign.status]
  const ativa     = campaign.status === 'active'

  function alternarStatus() {
    if (!campaign) return
    setStatus(campaign.id, ativa ? 'paused' : 'active')
      .catch(() => toast.error('Falha ao alterar o status da campanha'))
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Cabeçalho */}
      <div className="sticky top-0 z-10 nav-bg-blur border-b border-line px-5 sm:px-6 py-4">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-t3 hover:text-t1 transition-colors
                       cursor-pointer min-h-[40px] focus:outline-none focus:ring-2 focus:ring-brand/30 rounded-lg px-1"
          >
            <ArrowLeft size={15} strokeWidth={1.6} aria-hidden /> Ligações
          </button>
          <span className="text-t5" aria-hidden>/</span>

          <IconeTom icon={Phone} tom="marca" tamanho="sm" />
          <h1 className="font-heading text-[15px] font-bold text-t1 truncate">{campaign.name}</h1>
          <Chip tom={statusCfg.tom}>{statusCfg.label}</Chip>
          {campaign.productName && (
            <span className="text-[13px] text-t4 truncate hidden sm:inline">{campaign.productName}</span>
          )}

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setEquipeOpen(true)}
              className="flex items-center gap-1.5 rounded-[14px] border border-line bg-s3/50 px-3 py-2
                         text-[13px] text-t3 hover:text-t1 hover:border-line-strong transition-colors
                         cursor-pointer min-h-[40px] focus:outline-none focus:ring-2 focus:ring-brand/30"
            >
              <Users size={14} strokeWidth={1.6} aria-hidden /> Equipe
            </button>
            <button
              onClick={() => setListasOpen(true)}
              className="flex items-center gap-1.5 rounded-[14px] border border-line bg-s3/50 px-3 py-2
                         text-[13px] text-t3 hover:text-t1 hover:border-line-strong transition-colors
                         cursor-pointer min-h-[40px] focus:outline-none focus:ring-2 focus:ring-brand/30"
            >
              <ListPlus size={14} strokeWidth={1.6} aria-hidden /> Adicionar lista
            </button>
            <button
              onClick={() => setEditOpen(true)}
              aria-label="Editar campanha"
              title="Editar campanha"
              className="w-10 h-10 flex items-center justify-center rounded-[14px] hover:bg-s3/70
                         text-t4 hover:text-t2 transition-colors cursor-pointer
                         focus:outline-none focus:ring-2 focus:ring-brand/30"
            >
              <Pencil size={15} strokeWidth={1.6} />
            </button>
            <button
              onClick={alternarStatus}
              aria-label={ativa ? 'Pausar campanha' : 'Reativar campanha'}
              title={ativa ? 'Pausar' : 'Reativar'}
              className="w-10 h-10 flex items-center justify-center rounded-[14px] hover:bg-s3/70
                         text-t4 hover:text-t2 transition-colors cursor-pointer
                         focus:outline-none focus:ring-2 focus:ring-brand/30"
            >
              {ativa ? <Pause size={15} strokeWidth={1.6} /> : <Play size={15} strokeWidth={1.6} />}
            </button>
            {campaign.status !== 'finished' && (
              <button
                onClick={() => setStatus(campaign.id, 'finished')}
                aria-label="Finalizar campanha"
                title="Finalizar campanha"
                className="w-10 h-10 flex items-center justify-center rounded-[14px] hover:bg-success-bg
                           text-t4 hover:text-success transition-colors cursor-pointer
                           focus:outline-none focus:ring-2 focus:ring-brand/30"
              >
                <CheckCheck size={15} strokeWidth={1.6} />
              </button>
            )}
          </div>
        </div>

        {/* Abas com o que cada uma responde */}
        <div className="flex gap-2 mt-4 overflow-x-auto" role="tablist" aria-label="Seções da campanha">
          {TABS.map(({ value, label, icon: Icon, dica }) => {
            const ativo = tab === value
            return (
              <button
                key={value}
                role="tab"
                aria-selected={ativo}
                onClick={() => setTab(value)}
                title={dica}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-[14px] text-[13px] font-semibold
                            border transition-all cursor-pointer shrink-0 min-h-[40px]
                            focus:outline-none focus:ring-2 focus:ring-brand/30
                  ${ativo
                    ? 'grad-brand border-brand/40'
                    : 'bg-s3/50 border-line text-t3 hover:text-t1 hover:border-line-strong'}`}
              >
                <Icon size={13} strokeWidth={1.7} aria-hidden /> {label}
              </button>
            )
          })}
          <span className="hidden lg:flex items-center text-[11px] text-t4 pl-1">
            {TABS.find(t => t.value === tab)?.dica}
          </span>
        </div>
      </div>

      <div className="flex-1 p-5 sm:p-6">
        {tab === 'fila'       && <CallQueueTab       campaign={campaign} />}
        {tab === 'quadro'     && <CallKanbanTab      campaign={campaign} />}
        {tab === 'desempenho' && <CallPerformanceTab campaignId={campaign.id} />}
      </div>

      <CallCampaignForm isOpen={editOpen} onClose={() => setEditOpen(false)} campaign={campaign} />
      <AddListsPanel isOpen={listasOpen} onClose={() => setListasOpen(false)} campaignId={campaign.id} />
      <EquipePanel   isOpen={equipeOpen} onClose={() => setEquipeOpen(false)} campaignId={campaign.id} />
    </div>
  )
}

// ─── Adicionar listas a uma campanha existente ────────────────────────────────

function AddListsPanel({ isOpen, onClose, campaignId }: {
  isOpen: boolean; onClose: () => void; campaignId: string
}) {
  const { addLists, listIdsOf } = useCallCampaignsStore()
  const { lists, load } = useLeadListsStore()

  const [sel,      setSel]      = useState<Set<string>>(new Set())
  const [jaNaFila, setJaNaFila] = useState<Set<string>>(new Set())
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setSel(new Set()); setSalvando(false)
    void load()
    listIdsOf(campaignId).then(ids => setJaNaFila(new Set(ids))).catch(() => {})
  }, [isOpen, campaignId, load, listIdsOf])

  const ativas   = lists.filter(l => l.status !== 'archived')
  const totalSel = ativas.filter(l => sel.has(l.id)).reduce((a, l) => a + l.totalCount, 0)

  async function handleAdd() {
    if (sel.size === 0) { toast.error('Selecione ao menos uma lista'); return }
    setSalvando(true)
    try {
      const r = await addLists(campaignId, [...sel])
      toast.success(
        `${r.added.toLocaleString('pt-BR')} contatos entraram na fila` +
        (r.ignorados > 0 ? ` · ${r.ignorados} ignorados (telefone inválido)` : '')
      )
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao adicionar as listas')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title="Adicionar lista à fila"
      subtitle="Base de Leads → campanha"
      size="md"
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button className="flex-1 gap-2" onClick={handleAdd} disabled={salvando || sel.size === 0}>
            {salvando
              ? <><Loader2 size={14} className="animate-spin" /> Importando…</>
              : <><Database size={14} /> Adicionar</>}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Dica>
          Quem já está na fila não entra de novo, e telefones marcados como inválidos ficam
          de fora. Adicionar a mesma lista duas vezes é seguro.
        </Dica>

        <div className="flex flex-col gap-2">
          {ativas.map(l => {
            const selecionada = sel.has(l.id)
            const jaTem = jaNaFila.has(l.id)
            return (
              <button
                key={l.id}
                type="button"
                aria-pressed={selecionada}
                onClick={() => setSel(prev => {
                  const n = new Set(prev)
                  if (n.has(l.id)) n.delete(l.id); else n.add(l.id)
                  return n
                })}
                className={`flex items-center gap-3 rounded-[14px] border p-3.5 text-left transition-all
                            cursor-pointer min-h-[56px] focus:outline-none focus:ring-2 focus:ring-brand/30
                  ${selecionada
                    ? 'bg-brand-tint border-brand/40'
                    : 'bg-s3/30 border-line hover:border-line-strong'}`}
              >
                <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border-2
                  ${selecionada ? 'bg-brand border-brand' : 'border-t5 bg-s3/50'}`} aria-hidden>
                  {selecionada && <Check size={11} strokeWidth={3} className="text-[var(--brand-btn-text)]" />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] font-semibold truncate ${selecionada ? 'text-t1' : 'text-t2'}`}>
                    {l.name}
                  </p>
                  {jaTem && (
                    <span className="text-[11px] text-t4">já vinculada a esta campanha</span>
                  )}
                </div>
                <span className="font-heading text-[13px] font-bold text-t3 tabular-nums shrink-0">
                  {l.totalCount.toLocaleString('pt-BR')}
                </span>
              </button>
            )
          })}

          {ativas.length === 0 && (
            <p className="py-8 text-center text-sm text-t3">Nenhuma lista disponível.</p>
          )}
        </div>

        {sel.size > 0 && (
          <div className="flex items-center gap-3 rounded-[14px] border border-brand/25 bg-brand-tint px-3.5 py-3">
            <IconeTom icon={Users} tom="marca" tamanho="sm" />
            <p className="text-[13px] text-t2">
              até{' '}
              <span className="font-heading font-extrabold text-brand-text tabular-nums text-[15px]">
                {totalSel.toLocaleString('pt-BR')}
              </span>{' '}
              contatos entram na fila
            </p>
          </div>
        )}
      </div>
    </SidePanel>
  )
}

// ─── Quem trabalha a fila ─────────────────────────────────────────────────────

function EquipePanel({ isOpen, onClose, campaignId }: {
  isOpen: boolean; onClose: () => void; campaignId: string
}) {
  const { campaigns, participants, addParticipant, removeParticipant } = useCallCampaignsStore()
  const { allProfiles } = useAuthStore()

  const campaign   = campaigns.find(c => c.id === campaignId)
  const daCampanha = participants.filter(p => p.campaignId === campaignId)
  const jaDentro   = new Set(daCampanha.map(p => p.brokerId))

  const disponiveis = allProfiles.filter(p =>
    p.active && !jaDentro.has(p.id) && p.id !== campaign?.ownerBrokerId)

  const dono = allProfiles.find(p => p.id === campaign?.ownerBrokerId)

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title="Quem trabalha esta fila"
      subtitle="Fila única e compartilhada"
      size="md"
      footer={<Button variant="secondary" className="w-full" onClick={onClose}>Fechar</Button>}
    >
      <div className="flex flex-col gap-5">
        <Dica tom="info">
          Quem puxa um lead o reserva por{' '}
          <span className="font-semibold">{campaign?.claimMinutes ?? 15} minutos</span> — é o que
          impede dois corretores de ligarem para o mesmo número ao mesmo tempo.
        </Dica>

        <section className="flex flex-col gap-2">
          {dono && (
            <div className="flex items-center gap-3 rounded-[14px] border border-brand/25 bg-brand-tint px-3.5 py-3">
              <span
                className="w-8 h-8 rounded-full grad-brand flex items-center justify-center
                           shrink-0 font-heading text-[13px] font-extrabold"
                aria-hidden
              >
                {dono.name.charAt(0).toUpperCase()}
              </span>
              <span className="text-sm font-semibold text-t1 flex-1 truncate">{dono.name}</span>
              <Chip icon={Crown} tom="marca">responsável</Chip>
            </div>
          )}

          {daCampanha.map(p => {
            const perfil = allProfiles.find(x => x.id === p.brokerId)
            return (
              <div key={p.id} className="flex items-center gap-3 rounded-[14px] border border-line bg-s2/50 px-3.5 py-3">
                <span className="w-8 h-8 rounded-full bg-s3 flex items-center justify-center shrink-0
                                 font-heading text-[13px] font-bold text-t2" aria-hidden>
                  {(perfil?.name ?? '?').charAt(0).toUpperCase()}
                </span>
                <span className="text-sm text-t1 flex-1 truncate">{perfil?.name ?? 'Corretor'}</span>
                <button
                  onClick={() => removeParticipant(p.id).catch(() => toast.error('Falha ao remover'))}
                  aria-label={`Remover ${perfil?.name ?? 'corretor'} da campanha`}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-t4 hover:text-error
                             hover:bg-error-bg transition-colors cursor-pointer
                             focus:outline-none focus:ring-2 focus:ring-error/30"
                >
                  <X size={14} strokeWidth={1.8} />
                </button>
              </div>
            )
          })}

          {!dono && daCampanha.length === 0 && (
            <p className="py-6 text-center text-[13px] text-t4">
              Ninguém atribuído — a campanha ainda não tem quem trabalhe a fila.
            </p>
          )}
        </section>

        {disponiveis.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-2.5">
              <span className="w-1 h-3.5 rounded-full bg-info" aria-hidden />
              <Rotulo>Adicionar à fila</Rotulo>
            </div>
            <div className="flex flex-wrap gap-2">
              {disponiveis.map(p => (
                <button
                  key={p.id}
                  onClick={() => addParticipant(campaignId, p.id).catch(() => toast.error('Falha ao adicionar'))}
                  className={`flex items-center gap-2 rounded-[14px] border ${TOM.neutro.borda} bg-s3/50
                              px-3 py-2 text-[13px] text-t3 hover:text-t1 hover:border-brand/40
                              transition-colors cursor-pointer min-h-[40px]
                              focus:outline-none focus:ring-2 focus:ring-brand/30`}
                >
                  <Timer size={12} strokeWidth={1.6} aria-hidden /> {p.name}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </SidePanel>
  )
}
