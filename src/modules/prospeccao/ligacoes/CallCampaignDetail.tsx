import { useEffect, useState } from 'react'
import {
  ArrowLeft, Phone, LayoutGrid, BarChart3, Pencil, Pause, Play, CheckCheck,
  ListPlus, Users, Check, Loader2, X,
} from 'lucide-react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { CallQueueTab } from './CallQueueTab'
import { CallKanbanTab } from './CallKanbanTab'
import { CallPerformanceTab } from './CallPerformanceTab'
import { CallCampaignForm } from './CallCampaignForm'
import { useCallCampaignsStore } from '../../../store/useCallCampaignsStore'
import { useLeadListsStore } from '../../../store/useLeadListsStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { CALL_STATUS_CONFIG } from './config'
import toast from 'react-hot-toast'

type Tab = 'fila' | 'quadro' | 'desempenho'

const TABS: { value: Tab; label: string; icon: typeof Phone }[] = [
  { value: 'fila',       label: 'Fila',       icon: Phone      },
  { value: 'quadro',     label: 'Quadro',     icon: LayoutGrid },
  { value: 'desempenho', label: 'Desempenho', icon: BarChart3  },
]

interface Props {
  campaignId: string
  onBack:     () => void
}

export function CallCampaignDetail({ campaignId, onBack }: Props) {
  const { campaigns, setStatus } = useCallCampaignsStore()
  const [tab,          setTab]          = useState<Tab>('fila')
  const [editOpen,     setEditOpen]     = useState(false)
  const [listasOpen,   setListasOpen]   = useState(false)
  const [equipeOpen,   setEquipeOpen]   = useState(false)

  const campaign = campaigns.find(c => c.id === campaignId)
  if (!campaign) return null

  const statusCfg = CALL_STATUS_CONFIG[campaign.status]

  function alternarStatus() {
    if (!campaign) return
    setStatus(campaign.id, campaign.status === 'active' ? 'paused' : 'active')
      .catch(() => toast.error('Falha ao alterar o status da campanha'))
  }

  return (
    <div className="flex flex-col min-h-screen">
      <div className="sticky top-0 z-10 nav-bg-blur border-b border-line px-6 py-4">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-t3 hover:text-t1 transition-colors cursor-pointer"
          >
            <ArrowLeft size={15} strokeWidth={1.6} /> Ligações
          </button>
          <span className="text-t5">/</span>
          <h1 className="text-sm font-semibold text-t1 truncate">{campaign.name}</h1>
          <span className={`text-[11px] font-medium px-2.5 py-1 rounded-lg border ${statusCfg.bg} ${statusCfg.color} ${statusCfg.border}`}>
            {statusCfg.label}
          </span>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setEquipeOpen(true)}
              className="flex items-center gap-1.5 rounded-[14px] border border-line bg-s3/50 px-3 py-2
                         text-[13px] text-t3 hover:text-t1 transition-colors cursor-pointer"
            >
              <Users size={13} strokeWidth={1.6} /> Equipe
            </button>
            <button
              onClick={() => setListasOpen(true)}
              className="flex items-center gap-1.5 rounded-[14px] border border-line bg-s3/50 px-3 py-2
                         text-[13px] text-t3 hover:text-t1 transition-colors cursor-pointer"
            >
              <ListPlus size={13} strokeWidth={1.6} /> Adicionar lista
            </button>
            <button
              onClick={() => setEditOpen(true)}
              className="p-2 rounded-[14px] hover:bg-s3/70 text-t4 hover:text-t2 transition-colors cursor-pointer"
              title="Editar campanha"
            >
              <Pencil size={14} strokeWidth={1.6} />
            </button>
            <button
              onClick={alternarStatus}
              className="p-2 rounded-[14px] hover:bg-s3/70 text-t4 hover:text-t2 transition-colors cursor-pointer"
              title={campaign.status === 'active' ? 'Pausar' : 'Reativar'}
            >
              {campaign.status === 'active'
                ? <Pause size={14} strokeWidth={1.6} />
                : <Play  size={14} strokeWidth={1.6} />}
            </button>
            {campaign.status !== 'finished' && (
              <button
                onClick={() => setStatus(campaign.id, 'finished')}
                className="p-2 rounded-[14px] hover:bg-success-bg text-t4 hover:text-success transition-colors cursor-pointer"
                title="Finalizar campanha"
              >
                <CheckCheck size={14} strokeWidth={1.6} />
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          {TABS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[14px] text-[13px] font-medium
                          border transition-all cursor-pointer
                ${tab === value
                  ? 'bg-brand-tint border-brand/40 text-brand-text'
                  : 'bg-s3/50 border-line text-t3 hover:text-t1'}`}
            >
              <Icon size={12} strokeWidth={1.6} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-6">
        {tab === 'fila'       && <CallQueueTab       campaign={campaign} />}
        {tab === 'quadro'     && <CallKanbanTab      campaign={campaign} />}
        {tab === 'desempenho' && <CallPerformanceTab campaignId={campaign.id} />}
      </div>

      <CallCampaignForm isOpen={editOpen} onClose={() => setEditOpen(false)} campaign={campaign} />
      <AddListsModal isOpen={listasOpen} onClose={() => setListasOpen(false)} campaignId={campaign.id} />
      <EquipeModal   isOpen={equipeOpen} onClose={() => setEquipeOpen(false)} campaignId={campaign.id} />
    </div>
  )
}

// ─── Adicionar listas a uma campanha existente ────────────────────────────────

function AddListsModal({ isOpen, onClose, campaignId }: {
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

  const ativas = lists.filter(l => l.status !== 'archived')

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
    <Modal isOpen={isOpen} onClose={onClose} title="Adicionar lista à fila" size="md">
      <div className="flex flex-col gap-4">
        <p className="text-[13px] text-t3">
          Quem já está na fila não entra de novo, e telefones marcados como inválidos
          ficam de fora. Adicionar a mesma lista duas vezes é seguro.
        </p>

        <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
          {ativas.map(l => {
            const selecionada = sel.has(l.id)
            const jaTem = jaNaFila.has(l.id)
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => setSel(prev => {
                  const n = new Set(prev)
                  if (n.has(l.id)) n.delete(l.id); else n.add(l.id)
                  return n
                })}
                className={`flex items-center gap-3 rounded-[14px] border p-3 text-left transition-all cursor-pointer
                  ${selecionada ? 'bg-brand-tint border-brand/40' : 'bg-s3/30 border-line hover:border-line-strong'}`}
              >
                <span className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border-2
                  ${selecionada ? 'bg-brand border-brand' : 'border-t5 bg-s3/50'}`}>
                  {selecionada && <Check size={11} strokeWidth={3} className="text-[var(--brand-btn-text)]" />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] font-medium truncate ${selecionada ? 'text-t1' : 'text-t2'}`}>
                    {l.name}
                  </p>
                  {jaTem && <p className="text-[11px] text-t4">já vinculada a esta campanha</p>}
                </div>
                <span className="text-[11px] font-semibold text-t3 tabular-nums flex-shrink-0">
                  {l.totalCount.toLocaleString('pt-BR')}
                </span>
              </button>
            )
          })}
          {ativas.length === 0 && (
            <p className="py-6 text-center text-sm text-t3">Nenhuma lista disponível.</p>
          )}
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button className="flex-1 gap-2" onClick={handleAdd} disabled={salvando || sel.size === 0}>
            {salvando ? <><Loader2 size={14} className="animate-spin" /> Importando…</> : 'Adicionar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Quem trabalha a fila ─────────────────────────────────────────────────────

function EquipeModal({ isOpen, onClose, campaignId }: {
  isOpen: boolean; onClose: () => void; campaignId: string
}) {
  const { campaigns, participants, addParticipant, removeParticipant } = useCallCampaignsStore()
  const { allProfiles } = useAuthStore()

  const campaign = campaigns.find(c => c.id === campaignId)
  const daCampanha = participants.filter(p => p.campaignId === campaignId)
  const jaDentro = new Set(daCampanha.map(p => p.brokerId))

  const disponiveis = allProfiles.filter(p =>
    p.active && !jaDentro.has(p.id) && p.id !== campaign?.ownerBrokerId)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Quem trabalha esta fila" size="sm">
      <div className="flex flex-col gap-4">
        <p className="text-[13px] text-t3">
          A fila é única e compartilhada. Quem puxa um lead o reserva por
          {' '}{campaign?.claimMinutes ?? 15} minutos, então dois corretores nunca ligam
          para o mesmo número ao mesmo tempo.
        </p>

        <div className="flex flex-col gap-2">
          {campaign?.ownerBrokerId && (
            <div className="flex items-center gap-2.5 rounded-[14px] border border-brand/25 bg-brand-tint px-3.5 py-2.5">
              <span className="w-6 h-6 rounded-full bg-brand flex items-center justify-center text-[11px]
                               font-bold text-[var(--brand-btn-text)] flex-shrink-0">
                {(allProfiles.find(p => p.id === campaign.ownerBrokerId)?.name ?? '?').charAt(0).toUpperCase()}
              </span>
              <span className="text-[13px] text-t1 flex-1 truncate">
                {allProfiles.find(p => p.id === campaign.ownerBrokerId)?.name ?? 'Responsável'}
              </span>
              <span className="font-label text-[11px] uppercase tracking-[0.14em] text-brand-text">responsável</span>
            </div>
          )}

          {daCampanha.map(p => (
            <div key={p.id} className="flex items-center gap-2.5 rounded-[14px] border border-line bg-s2/50 px-3.5 py-2.5">
              <span className="w-6 h-6 rounded-full bg-s3 flex items-center justify-center text-[11px]
                               font-bold text-t2 flex-shrink-0">
                {(allProfiles.find(x => x.id === p.brokerId)?.name ?? '?').charAt(0).toUpperCase()}
              </span>
              <span className="text-[13px] text-t1 flex-1 truncate">
                {allProfiles.find(x => x.id === p.brokerId)?.name ?? 'Corretor'}
              </span>
              <button
                onClick={() => removeParticipant(p.id).catch(() => toast.error('Falha ao remover'))}
                className="p-1 rounded-lg text-t4 hover:text-error hover:bg-error-bg transition-colors cursor-pointer"
                title="Remover da campanha"
              >
                <X size={13} strokeWidth={1.6} />
              </button>
            </div>
          ))}
        </div>

        {disponiveis.length > 0 && (
          <div>
            <p className="font-label text-[11px] font-bold uppercase tracking-[0.14em] text-t4 mb-2">
              Adicionar
            </p>
            <div className="flex flex-wrap gap-2">
              {disponiveis.map(p => (
                <button
                  key={p.id}
                  onClick={() => addParticipant(campaignId, p.id).catch(() => toast.error('Falha ao adicionar'))}
                  className="rounded-[14px] border border-line bg-s3/50 px-3 py-1.5 text-[13px]
                             text-t3 hover:text-t1 hover:border-brand/40 transition-colors cursor-pointer"
                >
                  + {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <Button variant="secondary" onClick={onClose}>Fechar</Button>
      </div>
    </Modal>
  )
}
