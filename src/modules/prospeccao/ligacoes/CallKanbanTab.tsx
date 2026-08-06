import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, Clock, Lock, ArrowUpRight, Users, PhoneCall } from 'lucide-react'
import { TransferCallLeadPanel } from './TransferCallLeadPanel'
import { IconeTom, Dica, Chip, TOM } from './Primitivas'
import { useCallCampaignsStore } from '../../../store/useCallCampaignsStore'
import { useCallQueueStore } from '../../../store/useCallQueueStore'
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
 * Não é arrastável de propósito: em ligação, mover cartão à mão repetiria o que
 * o desfecho já faz sozinho e melhor. Aqui se responde "onde a base emperrou":
 * quantos na tentativa 3, quantos com retorno marcado, quantos morreram e por
 * quê. A única ação é a passagem de bastão de quem demonstrou interesse.
 *
 * Carrega contagem + os primeiros cartões de cada coluna via RPC. Uma campanha
 * com 20 mil contatos não cabe no navegador e não deve caber no egress.
 */

const CARTOES_POR_COLUNA = 25

interface Props {
  campaign: CallCampaign
  /**
   * Leva o corretor para a aba Fila com o lead já na mão.
   *
   * O quadro não registra desfecho — quem registra é o discador, sempre. Este
   * atalho só muda COMO o lead chega lá: em vez de esperar a fila oferecer, o
   * corretor pede aquele com quem acabou de falar.
   */
  onFalarAgora?: () => void
}

export function CallKanbanTab({ campaign, onFalarAgora }: Props) {
  const { loadBoard } = useCallCampaignsStore()
  const { pegarEspecifico } = useCallQueueStore()
  const { allProfiles, profile } = useAuthStore()

  const [board,        setBoard]        = useState<CallBoard | null>(null)
  const [carregando,   setCarregando]   = useState(true)
  const [transferindo, setTransferindo] = useState<CallBoardCard | undefined>()
  const [pegando,      setPegando]      = useState<string | null>(null)

  async function handleFalarAgora(card: CallBoardCard) {
    setPegando(card.id)
    try {
      await pegarEspecifico(card.id)
      toast.success(`${card.name} está na sua mão — registre o que aconteceu`)
      onFalarAgora?.()
    } catch (err) {
      // A recusa da reserva não é falha do sistema: é a fila fazendo o
      // trabalho dela. A mensagem do banco diz com quem o lead está.
      toast.error(err instanceof Error ? err.message : 'Não foi possível pegar este lead')
    } finally {
      setPegando(null)
    }
  }

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
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 size={24} className="animate-spin text-brand" aria-hidden />
        <p className="text-sm text-t3">Carregando o quadro…</p>
      </div>
    )
  }

  const total       = board?.total ?? 0
  const interessados = board?.contagem?.interessado ?? 0

  return (
    <div className="flex flex-col gap-4">

      {/* Cabeçalho da visão */}
      <div className="flex flex-wrap items-center gap-3">
        <IconeTom icon={Users} tom="neutro" />
        <div className="min-w-0">
          <p className="font-heading text-[15px] font-bold text-t1 leading-tight">
            {total.toLocaleString('pt-BR')} contatos na campanha
          </p>
          <p className="text-[11px] text-t4">
            {CARTOES_POR_COLUNA} primeiros de cada coluna — a fila completa vive no banco
          </p>
        </div>

        <button
          onClick={() => void carregar()}
          className="ml-auto flex items-center gap-1.5 rounded-[14px] border border-line bg-s3/50
                     px-3.5 py-2.5 text-[13px] text-t3 hover:text-t1 hover:border-line-strong
                     transition-colors cursor-pointer min-h-[44px]
                     focus:outline-none focus:ring-2 focus:ring-brand/30"
        >
          <RefreshCw size={14} strokeWidth={1.6} className={carregando ? 'animate-spin' : ''} aria-hidden />
          Atualizar
        </button>
      </div>

      {interessados > 0 ? (
        <Dica tom="marca">
          <span className="font-semibold">
            {interessados} {interessados === 1 ? 'lead qualificado' : 'leads qualificados'}
          </span>{' '}
          esperando passagem para o funil — o botão está no cartão.
        </Dica>
      ) : (
        <Dica>
          O quadro é leitura: quem move o lead de coluna é o desfecho registrado na Fila.
          Daqui você transfere quem demonstrou interesse, ou puxa para a Fila alguém
          com quem já falou fora da ordem.
        </Dica>
      )}

      {/* Colunas */}
      <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1">
        {CALL_STAGES.map(stage => {
          const cartoes = (board?.cartoes ?? []).filter(c => c.status === stage.value)
          const qtd     = board?.contagem?.[stage.value] ?? 0
          const truncou = qtd > cartoes.length
          const t       = TOM[stage.tom]

          return (
            <section
              key={stage.value}
              className="flex flex-col min-w-[272px] w-[272px] shrink-0 rounded-[14px] kanban-col
                         border border-line overflow-hidden"
              aria-label={`${stage.label} — ${qtd} contatos`}
            >
              {/* Cabeçalho colorido da coluna */}
              <header className={`px-3.5 py-3 border-b ${t.borda} ${t.fundo}`}>
                <div className="flex items-center gap-2">
                  <stage.icon size={15} strokeWidth={1.7} className={t.texto} aria-hidden />
                  <h3 className={`font-label text-[11px] font-bold uppercase tracking-[0.14em] ${t.texto}`}>
                    {stage.label}
                  </h3>
                  <span className={`ml-auto font-heading font-extrabold tabular-nums text-[20px]
                                    leading-none ${t.texto}`}>
                    {qtd.toLocaleString('pt-BR')}
                  </span>
                </div>
                <p className="text-[11px] text-t4 leading-snug mt-1.5">{stage.descricao}</p>
              </header>

              <div className="flex flex-col gap-2 p-2.5">
                {cartoes.map(c => (
                  <Cartao
                    key={c.id}
                    card={c}
                    nomeDe={nomeDe}
                    onTransferir={c.status === 'interessado' ? () => setTransferindo(c) : undefined}
                    /* Só quem ainda está em jogo. Encerrado e transferido não
                       voltam para a fila — o banco recusa, e oferecer um botão
                       que sempre dá erro é pior que não ter botão. */
                    onFalarAgora={
                      c.status === 'fila' || c.status === 'tentativa' || c.status === 'retorno_agendado'
                        ? () => handleFalarAgora(c)
                        : undefined
                    }
                    pegando={pegando === c.id}
                  />
                ))}

                {qtd === 0 && (
                  <p className="py-6 text-center text-[13px] text-t5">nenhum lead aqui</p>
                )}

                {truncou && (
                  <p className="py-2 text-center text-[11px] text-t4">
                    + {(qtd - cartoes.length).toLocaleString('pt-BR')} não exibidos
                  </p>
                )}
              </div>
            </section>
          )
        })}
      </div>

      {transferindo && (
        <TransferCallLeadPanel
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

function Cartao({ card, nomeDe, onTransferir, onFalarAgora, pegando }: {
  card: CallBoardCard
  nomeDe: (id?: string) => string
  /** só existe na coluna "demonstrou interesse" */
  onTransferir?: () => void
  /** só nas colunas em que o lead ainda está em jogo */
  onFalarAgora?: () => void
  pegando?: boolean
}) {
  const desfecho  = card.lastOutcome ? OUTCOME_BY_VALUE[card.lastOutcome] : null
  const reservado = card.claimedUntil && new Date(card.claimedUntil) > new Date()

  // Mesma regra do funil e dos disparos: só quem pede ação carrega superfície.
  // Aqui "pede ação" é o lead pronto para transferir, ou o retorno que já
  // venceu — o resto é acompanhamento e recolhe.
  const venceu = !!card.nextAttemptAt && new Date(card.nextAttemptAt) <= new Date()
  const pedeAcao = !!onTransferir || venceu

  return (
    <article className={`rounded-[12px] border px-3 py-2.5 flex flex-col gap-2 transition-colors
      ${pedeAcao ? 'kanban-card shadow-card' : 'bg-s2/50 border-line/70'}`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-t1 truncate">{card.name}</p>
          <p className="text-[11px] text-t4 tabular-nums">{formatPhone(card.phone)}</p>
        </div>
        {card.attemptCount > 0 && (
          <span
            className="shrink-0 rounded-lg border border-line bg-s2 px-1.5 py-0.5
                       font-heading text-[12px] font-bold text-t2 tabular-nums"
            title={`${card.attemptCount} tentativa(s)`}
          >
            {card.attemptCount}ª
          </span>
        )}
      </div>

      {desfecho && (
        <div className="flex items-center gap-1.5 min-w-0">
          <desfecho.icon size={12} strokeWidth={1.7} className={`${TOM[desfecho.tom].texto} shrink-0`} aria-hidden />
          <span className="text-[11px] text-t3 truncate">{desfecho.short}</span>
          {card.lastCallAt && (
            <span className="ml-auto text-[11px] text-t4 shrink-0">{tempoRelativo(card.lastCallAt)}</span>
          )}
        </div>
      )}

      {card.status === 'retorno_agendado' && card.nextAttemptAt && (
        <Chip icon={Clock} tom="info">{quandoVolta(card.nextAttemptAt)}</Chip>
      )}

      {card.status === 'tentativa' && card.nextAttemptAt && (
        <span className="flex items-center gap-1.5 text-[11px] text-t4">
          <Clock size={11} strokeWidth={1.6} className="shrink-0" aria-hidden />
          volta {quandoVolta(card.nextAttemptAt)}
        </span>
      )}

      {card.status === 'encerrado' && card.closeReason && (
        <span className="text-[11px] text-t4">
          {CLOSE_REASON_LABEL[card.closeReason] ?? card.closeReason}
        </span>
      )}

      {card.status === 'transferido' && (
        <Chip icon={ArrowUpRight} tom="sucesso">no funil principal</Chip>
      )}

      {reservado && (
        <Chip icon={Lock} tom="atencao">com {nomeDe(card.claimedBy)} agora</Chip>
      )}

      {card.notes && (
        <p className="text-[11px] text-t4 line-clamp-2 leading-snug">{card.notes}</p>
      )}

      {onTransferir && (
        <button
          onClick={onTransferir}
          className="mt-0.5 flex items-center justify-center gap-1.5 rounded-[10px] px-2.5 py-2
                     grad-brand font-heading text-[12px] font-bold
                     transition-transform active:scale-[0.98] cursor-pointer min-h-[40px]
                     focus:outline-none focus:ring-2 focus:ring-brand/40"
        >
          <ArrowUpRight size={13} strokeWidth={2} aria-hidden /> Transferir para o funil
        </button>
      )}

      {/* Discreto de propósito: a fila continua sendo o caminho principal, e é
          ela que garante a base trabalhada por inteiro. Isto é a exceção — o
          lead que ligou de volta antes da hora. */}
      {onFalarAgora && (
        <button
          onClick={onFalarAgora}
          disabled={pegando}
          className="mt-0.5 flex items-center justify-center gap-1.5 rounded-[10px] px-2.5 py-2
                     border border-line bg-s3/40 text-[12px] font-semibold text-t3
                     transition-colors cursor-pointer min-h-[40px]
                     hover:text-t1 hover:border-line-strong
                     disabled:opacity-50 disabled:cursor-not-allowed
                     focus:outline-none focus:ring-2 focus:ring-brand/30"
          title="Traz este lead para a Fila, na sua mão, para você registrar o que aconteceu"
        >
          {pegando
            ? <><Loader2 size={13} className="animate-spin" aria-hidden /> Pegando…</>
            : <><PhoneCall size={13} strokeWidth={1.8} aria-hidden /> Já falei com este lead</>}
        </button>
      )}
    </article>
  )
}
