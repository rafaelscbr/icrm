import { useEffect, useState } from 'react'
import {
  Phone, SkipForward, Loader2, CheckCircle2, Inbox, AlertTriangle,
  History, Clock, ArrowRight, Target, Sparkles, Timer, Voicemail,
} from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { SidePanel } from '../../../components/ui/SidePanel'
import { TransferCallLeadPanel } from './TransferCallLeadPanel'
import { Painel, PainelTitulo, Rotulo, IconeTom, Barra, Dica, Chip, TOM } from './Primitivas'
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
 * ligação de fato acontece — daí o alvo de toque grande e a coluna única.
 *
 * O quadro é a leitura do MESMO estado, para o gestor. Não é aqui.
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
      toast.success(`Registrado: ${OUTCOME_BY_VALUE[outcome].label}`)
      setNotas(''); setRetornoOpen(false); setRetornoAt('')
      // Interessado fica na tela: o próximo passo é transferir, e mandar o
      // corretor procurar o lead de novo seria trabalho jogado fora.
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

  const metaDia      = DAILY_TARGETS.ligacoes
  const progresso    = Math.min(100, Math.round((contadores.hoje / metaDia) * 100))
  const bateuMeta    = contadores.hoje >= metaDia
  const faltam       = Math.max(0, metaDia - contadores.hoje)
  const jaLigouAgora = Boolean(logAtual) || atual?.status === 'interessado'
  const qualificado  = atual?.status === 'interessado'

  return (
    <div className="flex flex-col gap-4 max-w-2xl mx-auto w-full">

      {/* ── Meta do dia — o único bloco dourado da tela ───────────── */}
      <Painel dourado className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <IconeTom icon={bateuMeta ? Sparkles : Target} tom={bateuMeta ? 'sucesso' : 'marca'} />
          <div className="min-w-0 flex-1">
            <Rotulo>Ligações hoje</Rotulo>
            <p className="text-[13px] text-t3 mt-0.5">
              {bateuMeta
                ? 'Meta batida — cada ligação daqui é lucro.'
                : `Faltam ${faltam} para o mínimo do dia.`}
            </p>
          </div>
          <div className="text-right shrink-0">
            <span className={`font-heading font-extrabold tabular-nums leading-none text-[34px]
                              tracking-tight ${bateuMeta ? 'text-success' : 'text-brand'}`}>
              {contadores.hoje}
            </span>
            <span className="font-label text-[13px] text-t4 tabular-nums">/{metaDia}</span>
          </div>
        </div>

        <div className="mt-3">
          <Barra pct={progresso} tom={bateuMeta ? 'sucesso' : 'marca'} altura={7} />
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5">
          <span className="text-[11px] text-t4 tabular-nums">{contadores.semana} na semana</span>
          <span className="text-t5" aria-hidden>·</span>
          <span className="text-[11px] text-t4 tabular-nums">{contadores.mes} no mês</span>
          {contadores.semDesfechoHoje > 0 && (
            <Chip icon={AlertTriangle} tom="atencao">
              {contadores.semDesfechoHoje} sem desfecho
            </Chip>
          )}
        </div>
      </Painel>

      {erro && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-2.5 rounded-[14px] border border-error-line bg-error-bg px-4 py-3"
        >
          <AlertTriangle size={15} strokeWidth={1.6} className="text-error shrink-0 mt-0.5" aria-hidden />
          <p className="text-sm text-error">{erro}</p>
        </div>
      )}

      {/* ── Sem lead na mão ───────────────────────────────────────── */}
      {!atual && (
        <Painel className="px-6 py-12 flex flex-col items-center gap-4 text-center">
          <IconeTom icon={filaVazia ? Inbox : Phone} tom={filaVazia ? 'neutro' : 'marca'} tamanho="lg" />

          {filaVazia ? (
            <>
              <p className="font-heading text-base font-bold text-t1">Ninguém disponível agora</p>
              <p className="text-sm text-t3 max-w-sm leading-relaxed">
                Todos os leads elegíveis já foram trabalhados ou estão aguardando o próximo
                horário da cadência. Quem pediu retorno reaparece sozinho na hora marcada.
              </p>
            </>
          ) : (
            <>
              <p className="font-heading text-base font-bold text-t1">Pronto para começar</p>
              <p className="text-sm text-t3 max-w-sm leading-relaxed">
                A fila escolhe por você: quem nunca foi tocado vem primeiro, quem
                levou ligação ou disparo recente vai para o fim.
              </p>
            </>
          )}

          <Button onClick={handlePuxar} disabled={carregando} size="lg" className="gap-2 mt-1 !px-6">
            {carregando
              ? <><Loader2 size={15} className="animate-spin" /> Buscando…</>
              : <><ArrowRight size={15} /> {filaVazia ? 'Tentar de novo' : 'Pegar próximo lead'}</>}
          </Button>
        </Painel>
      )}

      {/* ── O lead ────────────────────────────────────────────────── */}
      {atual && (
        <Painel dourado={qualificado}>
          {/* Identificação */}
          <div className="px-5 pt-5 pb-4 border-b border-line">
            <div className="flex items-start gap-3.5">
              <div
                className="w-12 h-12 rounded-[14px] grad-brand flex items-center justify-center
                           shrink-0 font-heading text-lg font-extrabold"
                aria-hidden
              >
                {atual.name.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-heading text-[17px] font-bold text-t1 truncate leading-tight">
                  {atual.name}
                </p>
                <p className="text-sm text-t3 tabular-nums mt-0.5">{formatPhone(atual.phone)}</p>
              </div>

              <div className="text-right shrink-0">
                <Rotulo>{jaLigouAgora ? 'Tentativa' : 'Próxima'}</Rotulo>
                <p className="font-heading font-extrabold tabular-nums text-[24px] text-t1 leading-none mt-1">
                  {jaLigouAgora ? atual.attemptCount : atual.attemptCount + 1}
                  <span className="text-t4 text-sm font-medium">/{campaign.maxAttempts}</span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-3">
              {atual.lastCallAt && (
                <Chip icon={History} tom="neutro">última ligação {tempoRelativo(atual.lastCallAt)}</Chip>
              )}
              {!atual.lastCallAt && atual.lastTouchAt && (
                <Chip icon={History} tom="neutro">último toque {tempoRelativo(atual.lastTouchAt)}</Chip>
              )}
              {!atual.lastCallAt && !atual.lastTouchAt && (
                <Chip icon={Sparkles} tom="sucesso">nunca foi tocado</Chip>
              )}
              {atual.status === 'retorno_agendado' && atual.nextAttemptAt && (
                <Chip icon={Clock} tom="info">retorno — {quandoVolta(atual.nextAttemptAt)}</Chip>
              )}
              {atual.claimedUntil && (
                <Chip icon={Timer} tom="neutro">
                  reservado {quandoVolta(atual.claimedUntil).replace('em ', 'por ')}
                </Chip>
              )}
            </div>
          </div>

          {/* Histórico */}
          {atual.historico.length > 0 && (
            <div className="border-b border-line">
              <PainelTitulo icon={History} tom="neutro"
                extra={<Rotulo>{atual.historico.length} ligação{atual.historico.length > 1 ? 'ões' : ''}</Rotulo>}>
                Histórico deste contato
              </PainelTitulo>
              <ul className="px-4 pb-3 flex flex-col gap-2 max-h-40 overflow-y-auto">
                {atual.historico.map(h => {
                  const cfg = OUTCOME_BY_VALUE[h.outcome]
                  return (
                    <li key={h.id} className="flex items-start gap-2.5">
                      <IconeTom icon={cfg.icon} tom={cfg.tom} tamanho="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-t2 truncate">
                          <span className="font-semibold text-t1">{h.brokerName ?? 'Corretor'}</span>
                          {' · '}{cfg.short}
                        </p>
                        {h.notes && <p className="text-[11px] text-t4 line-clamp-2">{h.notes}</p>}
                      </div>
                      <span className="text-[11px] text-t4 shrink-0 tabular-nums pt-1">
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
            {qualificado ? (
              /* Qualificado: o próximo passo é sair da prospecção, não ligar de
                 novo. Segurar o lead aqui até virar visita o esconderia do
                 funil, do SLA e do Pulse. */
              <>
                <div className="flex items-center gap-2.5 rounded-[14px] border border-brand/25 bg-brand-tint px-3.5 py-3">
                  <CheckCircle2 size={15} strokeWidth={1.6} className="text-brand-text shrink-0" aria-hidden />
                  <p className="text-[13px] text-brand-text">
                    Demonstrou interesse — hora de passar para o funil comercial.
                  </p>
                </div>

                <button
                  onClick={() => setTransferOpen(true)}
                  className="w-full flex items-center justify-center gap-2.5 rounded-[14px] px-5 py-4
                             grad-brand grad-brand-glow font-heading text-base font-bold
                             transition-transform active:scale-[0.99] cursor-pointer min-h-[56px]
                             focus:outline-none focus:ring-2 focus:ring-brand/40"
                >
                  <ArrowRight size={19} strokeWidth={1.8} aria-hidden /> Transferir para o funil
                </button>

                <button
                  onClick={handlePuxar}
                  className="flex items-center justify-center gap-1.5 text-[13px] text-t4
                             hover:text-t2 transition-colors cursor-pointer py-2 min-h-[44px]"
                >
                  <SkipForward size={13} strokeWidth={1.6} aria-hidden /> Deixar para depois e seguir a fila
                </button>
              </>
            ) : !logAtual ? (
              <>
                <button
                  onClick={handleLigar}
                  className="w-full flex items-center justify-center gap-3 rounded-[14px] px-5 py-4
                             grad-call grad-call-glow font-heading text-[19px] font-bold
                             transition-transform active:scale-[0.99] cursor-pointer min-h-[60px]
                             focus:outline-none focus:ring-2 focus:ring-success/50"
                >
                  <Phone size={21} strokeWidth={1.9} aria-hidden /> Ligar pelo WhatsApp
                </button>

                <Dica>
                  Abre o <span className="font-semibold text-t2">seu WhatsApp</span> já na conversa
                  dela, sem mensagem nenhuma, e <span className="font-semibold text-t2">registra a
                  ligação</span>. É só tocar no ícone de telefone para chamar.
                </Dica>

                <button
                  onClick={handlePular}
                  className="flex items-center justify-center gap-1.5 text-[13px] text-t4
                             hover:text-t2 transition-colors cursor-pointer py-2 min-h-[44px]"
                >
                  <SkipForward size={13} strokeWidth={1.6} aria-hidden /> Pular — devolve para a fila
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2.5 rounded-[14px] border border-success-line bg-success-bg px-3.5 py-3">
                  <CheckCircle2 size={15} strokeWidth={1.6} className="text-success shrink-0" aria-hidden />
                  <p className="text-[13px] text-success">
                    Ligação registrada. Agora diga o que aconteceu.
                  </p>
                </div>

                <div>
                  <label htmlFor="notas-ligacao" className="sr-only">O que o cliente falou</label>
                  <textarea
                    id="notas-ligacao"
                    value={notas}
                    onChange={e => setNotas(e.target.value)}
                    rows={2}
                    placeholder="O que o cliente falou? (opcional — vai junto para o funil)"
                    className="w-full bg-s3/50 border border-line rounded-[14px] px-3.5 py-2.5 text-sm
                               text-t1 placeholder:text-t4 focus:outline-none focus:ring-2
                               focus:ring-brand/30 resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {OUTCOMES_DISCADOR.map(o => {
                    const t = TOM[o.tom]
                    return (
                      <button
                        key={o.value}
                        disabled={salvando}
                        title={o.efeito}
                        onClick={() => o.value === 'pediu_retorno'
                          ? setRetornoOpen(true)
                          : handleDesfecho(o.value)}
                        className={`flex flex-col items-start gap-1.5 rounded-[14px] border px-3.5 py-3
                                    text-left transition-all cursor-pointer min-h-[64px]
                                    disabled:opacity-40 disabled:cursor-not-allowed
                                    hover:brightness-115 active:scale-[0.98]
                                    focus:outline-none focus:ring-2 focus:ring-brand/30
                                    ${t.fundo} ${t.borda}`}
                      >
                        <o.icon size={17} strokeWidth={1.7} className={`${t.texto} shrink-0`} aria-hidden />
                        <span className={`text-[13px] font-semibold leading-tight ${t.texto}`}>
                          {o.label}
                        </span>
                      </button>
                    )
                  })}
                </div>

                <button
                  onClick={() => handleDesfecho('caixa_postal')}
                  disabled={salvando}
                  className="flex items-center justify-center gap-1.5 text-[13px] text-t4
                             hover:text-t2 transition-colors cursor-pointer py-2 min-h-[44px]"
                >
                  <Voicemail size={13} strokeWidth={1.6} aria-hidden /> Caiu na caixa postal
                </button>
              </>
            )}
          </div>
        </Painel>
      )}

      {/* ── Retorno agendado ──────────────────────────────────────── */}
      <SidePanel
        isOpen={retornoOpen}
        onClose={() => setRetornoOpen(false)}
        title="Quando ligar de volta?"
        subtitle={atual?.name}
        size="md"
        footer={
          <div className="flex gap-3">
            <Button
              variant="secondary" className="flex-1"
              onClick={() => handleDesfecho('pediu_retorno')} disabled={salvando}
            >
              Sem hora definida
            </Button>
            <Button
              className="flex-1 gap-2" disabled={salvando || !retornoAt}
              onClick={() => handleDesfecho('pediu_retorno', new Date(retornoAt).toISOString())}
            >
              <Clock size={14} /> Agendar
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <Dica tom="info">
            O lead volta para o <span className="font-semibold">topo da fila</span> na hora marcada.
            Fora da janela útil (Seg–Sex 9h–18h, Sáb 9h–13h), ele entra no próximo horário válido.
          </Dica>

          <div>
            <label htmlFor="retorno-at" className="block mb-2">
              <Rotulo>Data e hora do retorno</Rotulo>
            </label>
            <input
              id="retorno-at"
              type="datetime-local"
              value={retornoAt}
              onChange={e => setRetornoAt(e.target.value)}
              className="w-full bg-s3/50 border border-line rounded-[14px] px-3.5 py-3 text-sm
                         text-t1 focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            <p className="text-[11px] text-t4 mt-1.5">
              Sem hora definida, ele volta no próximo degrau da cadência.
            </p>
          </div>
        </div>
      </SidePanel>

      {atual && (
        <TransferCallLeadPanel
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
