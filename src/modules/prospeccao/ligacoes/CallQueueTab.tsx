import { useEffect, useState } from 'react'
import {
  Phone, SkipForward, Loader2, CheckCircle2, Inbox, AlertTriangle,
  History, Clock, ArrowRight, Target,
} from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { TransferCallLeadModal } from './TransferCallLeadModal'
import { useCallQueueStore } from '../../../store/useCallQueueStore'
import { formatPhone } from '../../../lib/formatters'
import { DAILY_TARGETS } from '../../../lib/metasConfig'
import { OUTCOMES_DISCADOR, OUTCOME_BY_VALUE, tempoRelativo, quandoVolta } from './config'
import type { CallCampaign, CallOutcome } from '../../../types'
import toast from 'react-hot-toast'

/**
 * O discador — a tela onde o trabalho acontece.
 *
 * Um lead por vez, botão grande, desfecho em um toque. O corretor não escolhe
 * em quem ligar: a fila escolhe. Foi desenhada para o celular, que é onde a
 * ligação de fato acontece.
 *
 * O kanban é a leitura do MESMO estado, para o gestor. Não é aqui.
 */

interface Props {
  campaign: CallCampaign
}

export function CallQueueTab({ campaign }: Props) {
  const {
    atual, logAtual, carregando, filaVazia, erro, contadores,
    puxarProximo, ligar, registrar, pular, carregarContadores, limpar,
  } = useCallQueueStore()

  const [notas,        setNotas]        = useState('')
  const [retornoOpen,  setRetornoOpen]  = useState(false)
  const [retornoAt,    setRetornoAt]    = useState('')
  const [salvando,     setSalvando]     = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)

  useEffect(() => {
    carregarContadores()
    return () => { limpar() }
  }, [campaign.id, carregarContadores, limpar])

  async function handlePuxar() {
    setNotas('')
    try { await puxarProximo(campaign.id) } catch { /* erro já no store */ }
  }

  async function handleLigar() {
    try {
      await ligar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível registrar a ligação')
    }
  }

  async function handleDesfecho(outcome: CallOutcome, callbackAt?: string) {
    if (!logAtual) return
    setSalvando(true)
    try {
      const status = await registrar(outcome, notas.trim() || undefined, callbackAt)
      const cfg = OUTCOME_BY_VALUE[outcome]
      toast.success(`Registrado: ${cfg.label}`)
      setNotas('')
      setRetornoOpen(false)
      setRetornoAt('')
      // Interessado fica na tela: o próximo passo é transferir para o funil,
      // e mandar o corretor procurar o lead de novo seria trabalho jogado fora.
      if (status !== 'interessado') await puxarProximo(campaign.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao registrar o desfecho')
    } finally {
      setSalvando(false)
    }
  }

  async function handlePular() {
    try {
      await pular()
      await puxarProximo(campaign.id)
    } catch {
      toast.error('Falha ao devolver o lead para a fila')
    }
  }

  // Uma ligação já saiu nesta sessão para este lead — seja aguardando desfecho,
  // seja já qualificada como interesse.
  const jaLigouAgora = Boolean(logAtual) || atual?.status === 'interessado'

  const metaDia   = DAILY_TARGETS.ligacoes
  const progresso = Math.min(100, Math.round((contadores.hoje / metaDia) * 100))
  const bateuMeta = contadores.hoje >= metaDia

  return (
    <div className="flex flex-col gap-5 max-w-2xl mx-auto w-full">

      {/* ── Meta do dia ───────────────────────────────────────────── */}
      <div className="rounded-[14px] border border-line bg-s2/40 px-4 py-3.5">
        <div className="flex items-center gap-2.5 mb-2.5">
          <Target size={15} className={bateuMeta ? 'text-success' : 'text-brand'} strokeWidth={1.6} />
          <span className="font-label text-[11px] font-bold uppercase tracking-[0.14em] text-t4">
            Ligações hoje
          </span>
          <span className={`ml-auto text-sm font-bold tabular-nums ${bateuMeta ? 'text-success' : 'text-t1'}`}>
            {contadores.hoje}<span className="text-t4 font-medium">/{metaDia}</span>
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-s3 overflow-hidden">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${bateuMeta ? 'bg-success' : 'bg-brand'}`}
            style={{ width: `${progresso}%` }}
          />
        </div>
        <div className="flex items-center gap-3 mt-2 text-[11px] text-t4">
          <span className="tabular-nums">{contadores.semana} na semana</span>
          <span className="text-t5">·</span>
          <span className="tabular-nums">{contadores.mes} no mês</span>
          {contadores.semDesfechoHoje > 0 && (
            <>
              <span className="text-t5">·</span>
              <span className="text-warning tabular-nums">
                {contadores.semDesfechoHoje} sem desfecho
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Erro ──────────────────────────────────────────────────── */}
      {erro && (
        <div className="flex items-start gap-2.5 rounded-[14px] border border-error-line bg-error-bg px-4 py-3">
          <AlertTriangle size={14} className="text-error flex-shrink-0 mt-0.5" strokeWidth={1.6} />
          <p className="text-sm text-error">{erro}</p>
        </div>
      )}

      {/* ── Nenhum lead na mão ────────────────────────────────────── */}
      {!atual && (
        <div className="flex flex-col items-center gap-4 rounded-[14px] border border-line bg-s2/40 px-6 py-12 text-center">
          <div className="w-12 h-12 rounded-[14px] bg-s3/60 flex items-center justify-center">
            {filaVazia
              ? <Inbox size={20} className="text-t4" strokeWidth={1.6} />
              : <Phone size={20} className="text-brand" strokeWidth={1.6} />}
          </div>

          {filaVazia ? (
            <>
              <p className="text-sm font-semibold text-t1">Ninguém disponível agora</p>
              <p className="text-sm text-t3 max-w-sm">
                Todos os leads elegíveis já foram trabalhados ou estão aguardando o
                próximo horário da cadência. Volte mais tarde — quem pediu retorno
                aparece automaticamente na hora marcada.
              </p>
            </>
          ) : (
            <p className="text-sm text-t3 max-w-sm">
              A fila decide em quem ligar: quem nunca foi tocado vem primeiro,
              quem levou ligação ou disparo recente vai para o fim.
            </p>
          )}

          <Button onClick={handlePuxar} disabled={carregando} className="gap-2 mt-1">
            {carregando
              ? <><Loader2 size={14} className="animate-spin" /> Buscando…</>
              : <><ArrowRight size={14} /> {filaVazia ? 'Tentar de novo' : 'Pegar próximo lead'}</>}
          </Button>
        </div>
      )}

      {/* ── O lead ────────────────────────────────────────────────── */}
      {atual && (
        <div className="rounded-[14px] border border-line surface-premium shadow-card overflow-hidden">

          {/* Identificação */}
          <div className="px-5 pt-5 pb-4 border-b border-line">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-[14px] bg-brand-tint border border-brand/25 flex items-center justify-center flex-shrink-0">
                <span className="text-base font-bold text-brand-text">
                  {atual.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-t1 truncate">{atual.name}</p>
                <p className="text-sm text-t3 tabular-nums">{formatPhone(atual.phone)}</p>
              </div>
              {/* Antes de discar mostra a tentativa QUE VEM; depois de discar,
                  a que acabou de ser feita. Somar +1 nos dois casos faria o
                  card anunciar uma ligação que não aconteceu. */}
              <div className="text-right flex-shrink-0">
                <span className="font-label text-[11px] uppercase tracking-[0.14em] text-t4 block">
                  {jaLigouAgora ? 'Tentativa' : 'Próxima'}
                </span>
                <span className="text-lg font-bold text-t1 tabular-nums">
                  {jaLigouAgora ? atual.attemptCount : atual.attemptCount + 1}
                  <span className="text-t4 text-sm font-medium">/{campaign.maxAttempts}</span>
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[11px] text-t4">
              {atual.lastCallAt && (
                <span className="flex items-center gap-1">
                  <History size={11} strokeWidth={1.6} /> última ligação {tempoRelativo(atual.lastCallAt)}
                </span>
              )}
              {atual.lastTouchAt && !atual.lastCallAt && (
                <span className="flex items-center gap-1">
                  <History size={11} strokeWidth={1.6} /> último toque {tempoRelativo(atual.lastTouchAt)}
                </span>
              )}
              {atual.status === 'retorno_agendado' && atual.nextAttemptAt && (
                <span className="flex items-center gap-1 text-info">
                  <Clock size={11} strokeWidth={1.6} /> retorno marcado — {quandoVolta(atual.nextAttemptAt)}
                </span>
              )}
              {atual.claimedUntil && (
                <span className="flex items-center gap-1">
                  reservado para você por {quandoVolta(atual.claimedUntil).replace('em ', '')}
                </span>
              )}
            </div>
          </div>

          {/* Histórico — o que já foi tentado com esta pessoa */}
          {atual.historico.length > 0 && (
            <div className="px-5 py-3 border-b border-line bg-s2/30">
              <p className="font-label text-[11px] font-bold uppercase tracking-[0.14em] text-t4 mb-2">
                Histórico
              </p>
              <ul className="flex flex-col gap-1.5 max-h-32 overflow-y-auto">
                {atual.historico.map(h => {
                  const cfg = OUTCOME_BY_VALUE[h.outcome]
                  const Icon = cfg.icon
                  return (
                    <li key={h.id} className="flex items-start gap-2 text-[13px]">
                      <Icon size={12} className={`${cfg.color} flex-shrink-0 mt-0.5`} strokeWidth={1.6} />
                      <span className="text-t3">
                        <span className="text-t2">{h.brokerName ?? 'Corretor'}</span>
                        {' · '}{cfg.short}
                        {h.notes && <span className="text-t4"> — {h.notes}</span>}
                      </span>
                      <span className="ml-auto text-[11px] text-t4 flex-shrink-0 tabular-nums">
                        {tempoRelativo(h.calledAt)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* Ação */}
          <div className="px-5 py-5 flex flex-col gap-4">
            {atual.status === 'interessado' ? (
              /* Qualificado: o próximo passo é sair da prospecção, não ligar de
                 novo. Segurar o lead aqui até virar visita o esconderia do
                 funil, do SLA e do Pulse. */
              <>
                <div className="flex items-center gap-2 rounded-[14px] border border-brand/25 bg-brand-tint px-3.5 py-2.5">
                  <CheckCircle2 size={14} className="text-brand-text flex-shrink-0" strokeWidth={1.6} />
                  <p className="text-[13px] text-brand-text">
                    Demonstrou interesse — hora de passar para o funil comercial.
                  </p>
                </div>
                <Button className="w-full gap-2 !py-3.5" onClick={() => setTransferOpen(true)}>
                  <ArrowRight size={15} /> Transferir para o funil
                </Button>
                <button
                  onClick={handlePuxar}
                  className="flex items-center justify-center gap-1.5 text-[13px] text-t4
                             hover:text-t2 transition-colors cursor-pointer py-1"
                >
                  <SkipForward size={13} strokeWidth={1.6} /> Deixar para depois e seguir a fila
                </button>
              </>
            ) : !logAtual ? (
              <>
                <button
                  onClick={handleLigar}
                  className="w-full flex items-center justify-center gap-2.5 rounded-[14px] bg-success
                             px-5 py-4 text-base font-semibold text-white transition-transform
                             active:scale-[0.99] cursor-pointer"
                >
                  <Phone size={19} strokeWidth={1.8} /> Ligar pelo WhatsApp
                </button>
                <p className="text-[11px] text-t4 text-center -mt-1">
                  Abre a conversa e já registra a ligação. Toque no ícone de telefone
                  dentro do WhatsApp para chamar.
                </p>
                <button
                  onClick={handlePular}
                  className="flex items-center justify-center gap-1.5 text-[13px] text-t4
                             hover:text-t2 transition-colors cursor-pointer py-1"
                >
                  <SkipForward size={13} strokeWidth={1.6} /> Pular — devolve para a fila
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 rounded-[14px] border border-success-line bg-success-bg px-3.5 py-2.5">
                  <CheckCircle2 size={14} className="text-success flex-shrink-0" strokeWidth={1.6} />
                  <p className="text-[13px] text-success">
                    Ligação registrada. Agora diga o que aconteceu.
                  </p>
                </div>

                <textarea
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  rows={2}
                  placeholder="O que o cliente falou? (opcional, vai junto para o funil)"
                  className="w-full bg-s3/50 border border-line rounded-[14px] px-3.5 py-2.5 text-sm
                             text-t1 placeholder:text-t4 focus:outline-none focus:ring-2
                             focus:ring-brand/25 resize-none"
                />

                <div className="grid grid-cols-2 gap-2">
                  {OUTCOMES_DISCADOR.map(o => {
                    const Icon = o.icon
                    return (
                      <button
                        key={o.value}
                        disabled={salvando}
                        onClick={() => o.value === 'pediu_retorno'
                          ? setRetornoOpen(true)
                          : handleDesfecho(o.value)}
                        className={`flex items-center gap-2 rounded-[14px] border px-3.5 py-3 text-[13px]
                                    font-medium transition-all cursor-pointer disabled:opacity-50
                                    ${o.bg} ${o.border} ${o.color} hover:brightness-110`}
                      >
                        <Icon size={15} strokeWidth={1.6} className="flex-shrink-0" />
                        <span className="truncate text-left">{o.label}</span>
                      </button>
                    )
                  })}
                </div>

                <button
                  onClick={() => handleDesfecho('caixa_postal')}
                  disabled={salvando}
                  className="text-[13px] text-t4 hover:text-t2 transition-colors cursor-pointer py-1"
                >
                  Caiu na caixa postal
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Retorno agendado ──────────────────────────────────────── */}
      <Modal
        isOpen={retornoOpen}
        onClose={() => setRetornoOpen(false)}
        title="Quando ligar de volta?"
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-t3">
            O lead volta para o topo da fila na hora marcada. Fora da janela útil
            (Seg–Sex 9h–18h, Sáb 9h–13h), ele entra no próximo horário válido.
          </p>
          <input
            type="datetime-local"
            value={retornoAt}
            onChange={e => setRetornoAt(e.target.value)}
            className="w-full bg-s3/50 border border-line rounded-[14px] px-3.5 py-3 text-sm
                       text-t1 focus:outline-none focus:ring-2 focus:ring-brand/25"
          />
          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => handleDesfecho('pediu_retorno')}
              disabled={salvando}
            >
              Sem hora definida
            </Button>
            <Button
              className="flex-1"
              disabled={salvando || !retornoAt}
              onClick={() => handleDesfecho('pediu_retorno', new Date(retornoAt).toISOString())}
            >
              Agendar
            </Button>
          </div>
        </div>
      </Modal>

      {atual && (
        <TransferCallLeadModal
          isOpen={transferOpen}
          onClose={() => setTransferOpen(false)}
          lead={atual}
          campaign={campaign}
          onDone={() => { void puxarProximo(campaign.id) }}
        />
      )}
    </div>
  )
}
