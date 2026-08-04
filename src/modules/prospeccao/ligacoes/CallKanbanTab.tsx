import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, Clock, Lock, ArrowUpRight, Info } from 'lucide-react'
import { TransferCallLeadModal } from './TransferCallLeadModal'
import { useCallCampaignsStore } from '../../../store/useCallCampaignsStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { formatPhone } from '../../../lib/formatters'
import {
  CALL_STAGES, OUTCOME_BY_VALUE, CLOSE_REASON_LABEL, tempoRelativo, quandoVolta,
} from './config'
import type { CallBoard, CallBoardCard, CallCampaign } from '../../../types'
import toast from 'react-hot-toast'

/**
 * O quadro — leitura do MESMO estado que o discador opera.
 *
 * Não é operável de propósito: em ligação, arrastar cartão é trabalho manual
 * que o desfecho já faz sozinho e melhor. Aqui se responde "onde a base
 * emperrou": quantos na tentativa 3, quantos com retorno marcado, quantos
 * morreram e por quê.
 *
 * Carrega contagem + os primeiros cartões de cada coluna via RPC. Uma campanha
 * com 20 mil contatos não cabe no navegador e não deve caber no egress.
 */

const CARTOES_POR_COLUNA = 25

interface Props {
  campaign: CallCampaign
}

export function CallKanbanTab({ campaign }: Props) {
  const { loadBoard } = useCallCampaignsStore()
  const { allProfiles, profile } = useAuthStore()

  const [board,      setBoard]      = useState<CallBoard | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [transferindo, setTransferindo] = useState<CallBoardCard | undefined>()

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      setBoard(await loadBoard(campaign.id, CARTOES_POR_COLUNA))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao carregar o quadro')
    } finally {
      setCarregando(false)
    }
  }, [campaign.id, loadBoard])

  useEffect(() => { void carregar() }, [carregar])

  function nomeDe(brokerId?: string): string {
    if (!brokerId) return ''
    if (brokerId === profile?.id) return 'você'
    return allProfiles.find(p => p.id === brokerId)?.name ?? 'outro corretor'
  }

  if (carregando && !board) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 size={22} className="animate-spin text-brand" />
        <p className="text-sm text-t3">Carregando o quadro…</p>
      </div>
    )
  }

  const total = board?.total ?? 0

  return (
    <div className="flex flex-col gap-4">

      <div className="flex items-center gap-3">
        <p className="text-sm text-t3">
          <span className="font-semibold text-t1 tabular-nums">{total.toLocaleString('pt-BR')}</span> contatos na campanha
        </p>
        <button
          onClick={() => void carregar()}
          className="ml-auto flex items-center gap-1.5 rounded-[14px] border border-line bg-s3/50
                     px-3 py-2 text-[13px] text-t3 hover:text-t1 transition-colors cursor-pointer"
        >
          <RefreshCw size={13} strokeWidth={1.6} className={carregando ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      <div className="flex items-start gap-2 rounded-[14px] border border-line bg-s2/40 px-3.5 py-2.5">
        <Info size={13} className="text-t4 flex-shrink-0 mt-0.5" strokeWidth={1.6} />
        <p className="text-[13px] text-t4">
          Quem move o lead de coluna é o desfecho registrado na Fila — arrastar cartão
          aqui repetiria à mão o que o discador já faz. A única ação do quadro é a
          passagem de bastão: quem demonstrou interesse vai para o funil por aqui.
        </p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-3">
        {CALL_STAGES.map(stage => {
          const cartoes = (board?.cartoes ?? []).filter(c => c.status === stage.value)
          const qtd     = board?.contagem?.[stage.value] ?? 0
          const truncou = qtd > cartoes.length

          return (
            <div key={stage.value} className="flex flex-col gap-2 min-w-[260px] w-[260px] flex-shrink-0">
              <div className={`flex items-center gap-2 rounded-[14px] border px-3 py-2.5 ${stage.bg} ${stage.border}`}>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${stage.dot}`} aria-hidden />
                <span className={`text-[13px] font-semibold ${stage.color}`}>{stage.label}</span>
                <span className={`ml-auto text-sm font-bold tabular-nums ${stage.color}`}>
                  {qtd.toLocaleString('pt-BR')}
                </span>
              </div>

              <p className="px-1 text-[11px] text-t4 leading-snug">{stage.descricao}</p>

              <div className="flex flex-col gap-2">
                {cartoes.map(c => (
                  <Cartao
                    key={c.id}
                    card={c}
                    nomeDe={nomeDe}
                    onTransferir={c.status === 'interessado' ? () => setTransferindo(c) : undefined}
                  />
                ))}

                {qtd === 0 && (
                  <p className="px-1 py-3 text-[13px] text-t5 text-center">vazio</p>
                )}

                {truncou && (
                  <p className="px-1 py-2 text-[11px] text-t4 text-center">
                    + {(qtd - cartoes.length).toLocaleString('pt-BR')} não exibidos
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {transferindo && (
        <TransferCallLeadModal
          isOpen
          onClose={() => setTransferindo(undefined)}
          lead={{
            id:           transferindo.id,
            name:         transferindo.name,
            phone:        transferindo.phone,
            notes:        transferindo.notes,
            attemptCount: transferindo.attemptCount,
          }}
          campaign={campaign}
          onDone={() => { setTransferindo(undefined); void carregar() }}
        />
      )}
    </div>
  )
}

function Cartao({ card, nomeDe, onTransferir }: {
  card: CallBoardCard
  nomeDe: (id?: string) => string
  /** só existe na coluna "demonstrou interesse" */
  onTransferir?: () => void
}) {
  const desfecho = card.lastOutcome ? OUTCOME_BY_VALUE[card.lastOutcome] : null
  const reservado = card.claimedUntil && new Date(card.claimedUntil) > new Date()

  return (
    <div className="rounded-[14px] border border-line bg-s2/50 px-3 py-2.5 flex flex-col gap-1.5">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-t1 truncate">{card.name}</p>
          <p className="text-[11px] text-t4 tabular-nums">{formatPhone(card.phone)}</p>
        </div>
        {card.attemptCount > 0 && (
          <span className="flex-shrink-0 rounded-lg border border-line bg-s3/60 px-1.5 py-0.5
                           text-[11px] font-semibold text-t3 tabular-nums">
            {card.attemptCount}ª
          </span>
        )}
      </div>

      {desfecho && (
        <div className="flex items-center gap-1.5">
          <desfecho.icon size={11} className={`${desfecho.color} flex-shrink-0`} strokeWidth={1.6} />
          <span className="text-[11px] text-t3 truncate">{desfecho.short}</span>
          {card.lastCallAt && (
            <span className="ml-auto text-[11px] text-t4 flex-shrink-0">{tempoRelativo(card.lastCallAt)}</span>
          )}
        </div>
      )}

      {card.status === 'retorno_agendado' && card.nextAttemptAt && (
        <div className="flex items-center gap-1.5 text-[11px] text-info">
          <Clock size={11} strokeWidth={1.6} className="flex-shrink-0" />
          {quandoVolta(card.nextAttemptAt)}
        </div>
      )}

      {card.status === 'tentativa' && card.nextAttemptAt && (
        <div className="flex items-center gap-1.5 text-[11px] text-t4">
          <Clock size={11} strokeWidth={1.6} className="flex-shrink-0" />
          volta {quandoVolta(card.nextAttemptAt)}
        </div>
      )}

      {card.status === 'encerrado' && card.closeReason && (
        <span className="text-[11px] text-t4">{CLOSE_REASON_LABEL[card.closeReason] ?? card.closeReason}</span>
      )}

      {card.status === 'transferido' && (
        <div className="flex items-center gap-1.5 text-[11px] text-success">
          <ArrowUpRight size={11} strokeWidth={1.6} className="flex-shrink-0" /> no funil principal
        </div>
      )}

      {reservado && (
        <div className="flex items-center gap-1.5 text-[11px] text-warning">
          <Lock size={11} strokeWidth={1.6} className="flex-shrink-0" />
          com {nomeDe(card.claimedBy)} agora
        </div>
      )}

      {card.notes && (
        <p className="text-[11px] text-t4 line-clamp-2">{card.notes}</p>
      )}

      {onTransferir && (
        <button
          onClick={onTransferir}
          className="mt-0.5 flex items-center justify-center gap-1.5 rounded-lg border border-brand/40
                     bg-brand-tint px-2 py-1.5 text-[11px] font-semibold text-brand-text
                     hover:brightness-110 transition-all cursor-pointer"
        >
          <ArrowUpRight size={11} strokeWidth={1.8} /> Transferir para o funil
        </button>
      )}
    </div>
  )
}
