import { useEffect, useState } from 'react'
import { ArrowRight, GitMerge, Loader2, Phone, AlertTriangle, Package, Wallet } from 'lucide-react'
import { SidePanel } from '../../../components/ui/SidePanel'
import { Button } from '../../../components/ui/Button'
import { Rotulo, IconeTom, Dica } from './Primitivas'
import { useCallQueueStore } from '../../../store/useCallQueueStore'
import { useLeadsStore } from '../../../store/useLeadsStore'
import { formatPhone } from '../../../lib/formatters'
import { STAGE_THEME } from '../../../lib/stageTheme'
import type { CallCampaign, CallLogEntry } from '../../../types'
import toast from 'react-hot-toast'

/**
 * Passagem de bastão da prospecção para o funil comercial.
 *
 * Painel lateral, não modal: quem transfere quer continuar vendo a fila (ou o
 * quadro) atrás — é a mesma decisão, tomada com o contexto à vista.
 *
 * Entra sempre em ATENDIMENTO: o lead já foi qualificado por telefone, então
 * "Lead" ou "Follow-up" seriam um passo atrás. A origem é própria
 * (prospecção · ligação) para o canal aparecer separado do disparo em toda
 * análise de funil.
 */

/** O mínimo que a transferência precisa saber — atendido pelo lead na mão do
 *  corretor (discador) e por um cartão do quadro. */
export interface TransferivelLead {
  id:            string
  name:          string
  phone:         string
  notes?:        string
  historico?:    CallLogEntry[]
  /** nº de ligações já feitas, quando o histórico completo não veio junto */
  attemptCount?: number
}

interface Props {
  isOpen:   boolean
  onClose:  () => void
  lead:     TransferivelLead
  campaign: CallCampaign
  onDone?:  (leadId: string) => void
}

export function TransferCallLeadPanel({ isOpen, onClose, lead, campaign, onDone }: Props) {
  const { transferir } = useCallQueueStore()
  const { leads, load: loadLeads } = useLeadsStore()

  const [ticket,   setTicket]   = useState('')
  const [produto,  setProduto]  = useState('')
  const [notas,    setNotas]    = useState('')
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
  const atendimento = STAGE_THEME.atendimento

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
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title="Transferir para o funil"
      subtitle="Prospecção ativa · Ligação → Atendimento"
      size="md"
      footer={
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
      }
    >
      <div className="flex flex-col gap-5">

        {/* Quem está indo */}
        <div className="flex items-center gap-3.5 rounded-[14px] border border-line surface-premium px-4 py-3.5">
          <div
            className="w-11 h-11 rounded-[14px] grad-brand flex items-center justify-center
                       shrink-0 font-heading text-base font-extrabold"
            aria-hidden
          >
            {lead.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-heading text-[15px] font-bold text-t1 truncate">{lead.name}</p>
            <p className="text-[13px] text-t3 tabular-nums">{formatPhone(lead.phone)}</p>
          </div>
          <div className="text-right shrink-0">
            <Rotulo>Ligações</Rotulo>
            <p className="font-heading font-extrabold tabular-nums text-[22px] text-t1 leading-none mt-0.5">
              {qtdLigacoes}
            </p>
          </div>
        </div>

        {/* O caminho — o que vai acontecer, em uma linha */}
        <div className="flex items-center gap-2 rounded-[14px] border border-line bg-s2/50 px-3.5 py-3">
          <span className="inline-flex items-center gap-1.5 text-[13px] text-t3">
            <Phone size={13} strokeWidth={1.6} className="text-brand-text" aria-hidden />
            Prospecção
          </span>
          <GitMerge size={13} strokeWidth={1.6} className="text-t5 shrink-0" aria-hidden />
          <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5
                            text-[13px] font-semibold ${atendimento.bg} ${atendimento.border} ${atendimento.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${atendimento.dot}`} aria-hidden />
            Atendimento
          </span>
          <span className="ml-auto text-[11px] text-t4 text-right">
            {qtdLigacoes === 1 ? '1 ligação vai junto' : `${qtdLigacoes} ligações vão junto`}
          </span>
        </div>

        {duplicado && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-[14px] border border-warning-line bg-warning-bg px-3.5 py-3"
          >
            <AlertTriangle size={14} strokeWidth={1.6} className="text-warning shrink-0 mt-0.5" aria-hidden />
            <p className="text-[13px] text-warning">
              Já existe um lead com este telefone no funil, em
              {' '}<span className="font-semibold">{STAGE_THEME[duplicado.funnelStage].label}</span>.
              Transferir cria uma segunda entrada.
            </p>
          </div>
        )}

        <div>
          <label htmlFor="transf-produto" className="flex items-center gap-2 mb-2">
            <IconeTom icon={Package} tom="neutro" tamanho="sm" />
            <Rotulo>Produto de interesse</Rotulo>
          </label>
          <input
            id="transf-produto"
            type="text"
            value={produto}
            onChange={e => setProduto(e.target.value)}
            placeholder="Ex.: Porto Velas"
            className="w-full bg-s3/50 border border-line rounded-[14px] px-3.5 py-3 text-sm
                       text-t1 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>

        <div>
          <label htmlFor="transf-ticket" className="flex items-center gap-2 mb-2">
            <IconeTom icon={Wallet} tom="marca" tamanho="sm" />
            <Rotulo>Ticket médio</Rotulo>
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-t3" aria-hidden>R$</span>
            <input
              id="transf-ticket"
              type="text"
              inputMode="numeric"
              value={ticket ? Number(ticket.replace(/\D/g, '')).toLocaleString('pt-BR') : ''}
              onChange={e => setTicket(e.target.value.replace(/\D/g, ''))}
              placeholder="0"
              className="w-full bg-s3/50 border border-line rounded-[14px] pl-10 pr-3.5 py-3 text-sm
                         text-t1 placeholder:text-t4 focus:outline-none focus:ring-2
                         focus:ring-brand/30 tabular-nums"
            />
          </div>
          <p className="text-[11px] text-t4 mt-1.5">Alimenta a previsão de VGL do funil.</p>
        </div>

        <div>
          <label htmlFor="transf-notas" className="block mb-2">
            <Rotulo>Observações</Rotulo>
          </label>
          <textarea
            id="transf-notas"
            value={notas}
            onChange={e => setNotas(e.target.value)}
            rows={3}
            placeholder="O que ficou combinado na ligação…"
            className="w-full bg-s3/50 border border-line rounded-[14px] px-3.5 py-3 text-sm
                       text-t1 placeholder:text-t4 focus:outline-none focus:ring-2
                       focus:ring-brand/30 resize-none"
          />
        </div>

        <Dica>
          Cada ligação registrada vira uma interação no lead novo, com a data original —
          quem receber no funil já enxerga tudo que foi tentado.
        </Dica>
      </div>
    </SidePanel>
  )
}
