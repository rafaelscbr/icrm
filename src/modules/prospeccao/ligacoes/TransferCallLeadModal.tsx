import { useEffect, useState } from 'react'
import { ArrowRight, GitMerge, Loader2, Phone } from 'lucide-react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { useCallQueueStore } from '../../../store/useCallQueueStore'
import { useLeadsStore } from '../../../store/useLeadsStore'
import { formatPhone } from '../../../lib/formatters'
import type { CallCampaign, CallLogEntry } from '../../../types'
import toast from 'react-hot-toast'

/**
 * O mínimo que a transferência precisa saber sobre o lead — atendido tanto pelo
 * lead que está na mão do corretor (discador) quanto por um cartão do quadro.
 */
export interface TransferivelLead {
  id:         string
  name:       string
  phone:      string
  notes?:     string
  historico?: CallLogEntry[]
  /** nº de ligações já feitas, quando o histórico completo não veio junto */
  attemptCount?: number
}

/**
 * Passagem de bastão da prospecção para o funil comercial.
 *
 * Entra sempre em ATENDIMENTO: o lead já foi qualificado por telefone, então
 * "Lead" ou "Follow-up" seriam um passo atrás. A origem é própria
 * (prospecção · ligação) para o canal aparecer separado do disparo em toda
 * análise de funil.
 *
 * O histórico das ligações viaja junto — a RPC transforma cada registro numa
 * interação com a data original, então a linha do tempo do lead novo já nasce
 * contando as tentativas.
 */

interface Props {
  isOpen:   boolean
  onClose:  () => void
  lead:     TransferivelLead
  campaign: CallCampaign
  onDone?:  (leadId: string) => void
}

export function TransferCallLeadModal({ isOpen, onClose, lead, campaign, onDone }: Props) {
  const { transferir } = useCallQueueStore()
  const { leads, load: loadLeads } = useLeadsStore()

  const [ticket,  setTicket]  = useState('')
  const [produto, setProduto] = useState('')
  const [notas,   setNotas]   = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setTicket(campaign.averageTicket ? String(campaign.averageTicket) : '')
    setProduto(campaign.productName ?? '')
    setNotas(lead.notes ?? '')
    setSalvando(false)
  }, [isOpen, campaign, lead])

  // Mesmo telefone já no funil: não bloqueia (pode ser reentrada legítima),
  // mas quem transfere precisa saber antes de criar uma segunda entrada.
  const duplicado = leads.find(l =>
    l.phone.replace(/\D/g, '') === lead.phone.replace(/\D/g, '') && !l.discardedAt)

  const qtdLigacoes = lead.historico?.length ?? lead.attemptCount ?? 0

  async function handleTransfer() {
    setSalvando(true)
    try {
      const leadId = await transferir({
        queueId:     lead.id,
        ticket:      ticket ? Number(ticket.replace(/\D/g, '')) : undefined,
        notes:       notas.trim() || undefined,
        productName: produto.trim() || undefined,
      })
      await loadLeads()
      toast.success(`${lead.name} entrou no funil em Atendimento`)
      onClose()
      onDone?.(leadId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao transferir para o funil')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Transferir para o funil principal" size="md">
      <div className="flex flex-col gap-5">

        <div className="flex items-center gap-3 rounded-[14px] border border-line bg-s2/60 p-3.5">
          <div className="w-10 h-10 rounded-[14px] bg-brand-tint border border-brand/25 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-brand-text">{lead.name.charAt(0).toUpperCase()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-t1 truncate">{lead.name}</p>
            <p className="text-[13px] text-t3 tabular-nums">{formatPhone(lead.phone)}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <span className="font-label text-[11px] uppercase tracking-[0.14em] text-t4 block">Ligações</span>
            <span className="text-sm font-bold text-t1 tabular-nums">{qtdLigacoes}</span>
          </div>
        </div>

        {duplicado && (
          <div className="flex items-start gap-2.5 rounded-[14px] border border-warning-line bg-warning-bg px-3.5 py-3">
            <ArrowRight size={14} className="text-warning flex-shrink-0 mt-0.5" strokeWidth={1.6} />
            <p className="text-[13px] text-warning">
              Já existe um lead com este telefone no funil. Transferir cria uma segunda entrada.
            </p>
          </div>
        )}

        <div>
          <label className="font-label text-[11px] font-bold uppercase tracking-[0.14em] text-t4 block mb-2">
            Produto de interesse
          </label>
          <input
            type="text"
            value={produto}
            onChange={e => setProduto(e.target.value)}
            placeholder="Ex.: Porto Velas"
            className="w-full bg-s3/50 border border-line rounded-[14px] px-3.5 py-2.5 text-sm
                       text-t1 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/25"
          />
        </div>

        <div>
          <label className="font-label text-[11px] font-bold uppercase tracking-[0.14em] text-t4 block mb-2">
            Ticket médio
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-t3">R$</span>
            <input
              type="text"
              inputMode="numeric"
              value={ticket ? Number(ticket.replace(/\D/g, '')).toLocaleString('pt-BR') : ''}
              onChange={e => setTicket(e.target.value.replace(/\D/g, ''))}
              placeholder="0"
              className="w-full bg-s3/50 border border-line rounded-[14px] pl-10 pr-3.5 py-2.5 text-sm
                         text-t1 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/25 tabular-nums"
            />
          </div>
          <p className="text-[11px] text-t4 mt-1.5">Alimenta a previsão de VGL do funil.</p>
        </div>

        <div>
          <label className="font-label text-[11px] font-bold uppercase tracking-[0.14em] text-t4 block mb-2">
            Observações
          </label>
          <textarea
            value={notas}
            onChange={e => setNotas(e.target.value)}
            rows={2}
            placeholder="O que ficou combinado na ligação…"
            className="w-full bg-s3/50 border border-line rounded-[14px] px-3.5 py-2.5 text-sm
                       text-t1 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/25 resize-none"
          />
        </div>

        <div className="flex items-center gap-2 rounded-[14px] border border-brand/25 bg-brand-tint px-3.5 py-2.5">
          <Phone size={13} className="text-brand-text flex-shrink-0" strokeWidth={1.6} />
          <span className="text-[13px] text-t3">Prospecção · Ligação</span>
          <GitMerge size={12} className="text-t4 flex-shrink-0" strokeWidth={1.6} />
          <span className="text-[13px] font-semibold text-brand-text">Atendimento</span>
          <span className="ml-auto text-[11px] text-t4">
            {qtdLigacoes === 1 ? '1 ligação vai junto' : `${qtdLigacoes} ligações vão junto`}
          </span>
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button className="flex-1 gap-2" onClick={handleTransfer} disabled={salvando}>
            {salvando
              ? <><Loader2 size={14} className="animate-spin" /> Transferindo…</>
              : <><ArrowRight size={14} /> Transferir</>}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
