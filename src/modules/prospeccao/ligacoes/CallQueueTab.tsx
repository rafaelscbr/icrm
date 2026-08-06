import { useEffect, useRef, useState } from 'react'
import {
  Phone, SkipForward, Loader2, CheckCircle2, Inbox, AlertTriangle,
  History, Clock, ArrowRight, Target, Sparkles, Timer, MessageCircle, Search,
} from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { SidePanel } from '../../../components/ui/SidePanel'
import { TransferCallLeadPanel } from './TransferCallLeadPanel'
import { Painel, PainelTitulo, Rotulo, IconeTom, Barra, Dica, Chip, TOM } from './Primitivas'
import { useCallQueueStore } from '../../../store/useCallQueueStore'
import { formatPhone, abrirWhatsApp } from '../../../lib/formatters'
import { DAILY_TARGETS } from '../../../lib/metasConfig'
import {
  OUTCOMES_POR_GRUPO, OUTCOME_BY_VALUE, CALL_STAGE_BY_VALUE, tempoRelativo, quandoVolta,
} from './config'
import type { CallCampaign, CallOutcome, CallBoardCard } from '../../../types'
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
    atual, logAtual, carregando, filaVazia, erro, contadores, origemAtual,
    puxarProximo, ligar, registrar, pular, carregarContadores, limpar,
  } = useCallQueueStore()

  const [notas,        setNotas]        = useState('')
  const [retornoOpen,  setRetornoOpen]  = useState(false)
  const [retornoAt,    setRetornoAt]    = useState('')
  const [salvando,     setSalvando]     = useState(false)
  const [ligando,      setLigando]      = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)

  useEffect(() => {
    carregarContadores()
    return () => { limpar() }
  }, [campaign.id, carregarContadores, limpar])

  async function handlePuxar() {
    setNotas('')
    try { await puxarProximo(campaign.id) } catch { /* erro já no store */ }
  }

  /**
   * O registro da tentativa acontece UMA vez.
   *
   * O botão some sozinho quando `logAtual` chega, mas isso só acontece depois
   * da resposta do banco. Nesse intervalo — que num 4G ruim é meio segundo —
   * dois toques viravam duas linhas em call_logs: meta do dia inflada e a
   * régua da campanha contando duas tentativas onde houve uma. A trava é local
   * porque o problema é local: são dois cliques do MESMO corretor no mesmo
   * botão. Corretores diferentes no mesmo lead já são impedidos pela reserva
   * da fila, no banco.
   */
  async function handleLigar() {
    if (ligando) return
    setLigando(true)
    try {
      await ligar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível registrar a tentativa')
    } finally {
      setLigando(false)
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
            <Rotulo>Tentativas hoje</Rotulo>
            <p className="text-[13px] text-t3 mt-0.5">
              {bateuMeta
                ? 'Meta batida — cada tentativa daqui é lucro.'
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

          <BuscaLead campaign={campaign} />
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
              {/* Veio fora da ordem: o corretor precisa saber que ele mesmo
                  pediu este lead, senão parece que a fila entregou errado —
                  ainda mais quando o retorno estava marcado para outro dia. */}
              {origemAtual === 'manual' && (
                <Chip icon={Search} tom="marca">você pediu este lead</Chip>
              )}
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
                {/* "Tentativa", não "ligar": o sistema não observa a chamada,
                    observa este clique. Prometer no botão o que o registro não
                    consegue provar é como o relatório começa a mentir. */}
                <button
                  onClick={handleLigar}
                  disabled={ligando}
                  className="w-full flex items-center justify-center gap-3 rounded-[14px] px-5 py-4
                             grad-call grad-call-glow font-heading text-[19px] font-bold
                             transition-transform active:scale-[0.99] cursor-pointer min-h-[60px]
                             disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100
                             focus:outline-none focus:ring-2 focus:ring-success/50"
                >
                  {ligando
                    ? <><Loader2 size={21} className="animate-spin" aria-hidden /> Registrando…</>
                    : <><Phone size={21} strokeWidth={1.9} aria-hidden /> Tentativa de ligação</>}
                </button>

                <Dica>
                  Abre o <span className="font-semibold text-t2">seu WhatsApp</span> já na conversa
                  dela, sem mensagem nenhuma, e <span className="font-semibold text-t2">registra a
                  tentativa</span>. É só tocar no ícone de telefone para chamar.
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
                    Tentativa registrada. Agora diga o que aconteceu.
                  </p>
                </div>

                {/*
                  Reabrir a conversa — SEM gravar nada.

                  Abrir o WhatsApp falha de um jeito que o sistema não enxerga:
                  o app não estava instalado, o link caiu na web e o corretor
                  fechou sem querer, o celular voltou para o navegador sozinho.
                  Até agora, quando isso acontecia a tela já tinha trocado para
                  os botões de desfecho e não havia caminho de volta — restava
                  registrar um desfecho falso ou procurar o contato na mão.

                  A tentativa JÁ está registrada; este botão não toca no banco.
                  Chamar `ligar()` de novo criaria uma segunda linha em
                  call_logs, inflaria a meta do dia e faria a régua da campanha
                  contar duas tentativas onde houve uma. É por isso que ele usa
                  `abrirWhatsApp` direto, e não a ação do discador.
                */}
                <button
                  onClick={() => atual && abrirWhatsApp(atual.phone)}
                  className="flex items-center justify-center gap-2 rounded-[14px] px-4 py-2.5
                             border border-success-line bg-success-bg text-success
                             text-[13px] font-semibold transition-all cursor-pointer min-h-[44px]
                             hover:brightness-110 active:scale-[0.99]
                             focus:outline-none focus:ring-2 focus:ring-success/40"
                  title="Abre a conversa de novo sem registrar outra tentativa"
                >
                  <MessageCircle size={15} strokeWidth={1.7} aria-hidden />
                  Abrir o WhatsApp de novo
                  <span className="font-label text-[11px] font-normal opacity-70">
                    · não conta nova tentativa
                  </span>
                </button>

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

                {/* A botoeira em grupos.
                    Eram dez opções soltas numa grade — o corretor relia todas a
                    cada ligação para achar a única que servia. Agrupadas, ele
                    decide primeiro O QUE ACONTECEU (falou? não falou? nem
                    chegou a ligar?) e só então escolhe entre duas ou quatro.
                    É a mesma divisão que os relatórios usam, de propósito: o
                    que o corretor aperta é o que o gestor lê. */}
                {OUTCOMES_POR_GRUPO.map(g => (
                  <fieldset key={g.value} className="border-0 p-0 m-0 min-w-0">
                    <legend className="flex items-baseline gap-2 mb-2 w-full">
                      <Rotulo>{g.titulo}</Rotulo>
                      <span className="text-[11px] text-t4 truncate">{g.descricao}</span>
                    </legend>
                    <div className="grid grid-cols-2 gap-2.5">
                      {g.opcoes.map(o => {
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
                  </fieldset>
                ))}

                <Dica>
                  O grupo <span className="font-semibold text-t2">Não foi possível ligar</span> não
                  conta para a meta do dia — número morto não é trabalho feito. O esforço aparece
                  no desempenho como qualidade da base, que é problema de quem monta a lista.
                </Dica>
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

// ─── Achar um lead específico ─────────────────────────────────────────────────

/**
 * A porta para falar com quem já respondeu fora da ordem.
 *
 * Fica embaixo do "Pegar próximo lead", menor e sem cor: a fila continua sendo
 * o caminho principal, e é ela que garante que a base seja trabalhada inteira.
 * Isto aqui é a exceção — o lead que ligou de volta antes da hora, a pessoa que
 * o corretor encontrou numa visita.
 *
 * A busca roda no banco e devolve no máximo oito. Uma campanha tem dezenas de
 * milhares de contatos: filtrar no navegador exigiria baixar a fila inteira, o
 * padrão que já custou um incidente de egress neste projeto.
 */
function BuscaLead({ campaign }: { campaign: CallCampaign }) {
  const { buscar, pegarEspecifico } = useCallQueueStore()

  const [aberto,     setAberto]     = useState(false)
  const [termo,      setTermo]      = useState('')
  const [resultados, setResultados] = useState<CallBoardCard[]>([])
  const [buscando,   setBuscando]   = useState(false)
  const [buscou,     setBuscou]     = useState(false)
  const campoRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (aberto) campoRef.current?.focus() }, [aberto])

  // Espera o corretor parar de digitar. Sem isto, "Maria" dispara cinco
  // consultas — quatro delas para prefixos que ninguém queria ver.
  useEffect(() => {
    if (!aberto) return
    const t = window.setTimeout(async () => {
      const q = termo.trim()
      if (q.length < 3) { setResultados([]); setBuscou(false); return }
      setBuscando(true)
      try {
        setResultados(await buscar(campaign.id, q))
        setBuscou(true)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Falha ao procurar o lead')
      } finally {
        setBuscando(false)
      }
    }, 350)
    return () => window.clearTimeout(t)
  }, [termo, aberto, campaign.id, buscar])

  async function handlePegar(card: CallBoardCard) {
    try {
      await pegarEspecifico(card.id)
      toast.success(`${card.name} está na sua mão`)
      setAberto(false); setTermo(''); setResultados([])
    } catch (err) {
      // A recusa da reserva é informação, não falha: diz com quem o lead está.
      toast.error(err instanceof Error ? err.message : 'Não foi possível pegar este lead')
    }
  }

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="flex items-center justify-center gap-1.5 text-[13px] text-t4
                   hover:text-t2 transition-colors cursor-pointer py-2 min-h-[44px]"
      >
        <Search size={13} strokeWidth={1.6} aria-hidden />
        Já falei com alguém? Procurar o lead
      </button>
    )
  }

  return (
    <div className="w-full max-w-sm flex flex-col gap-2 mt-1">
      <label htmlFor="busca-lead" className="sr-only">Procurar lead por nome ou telefone</label>
      {/* Foco por ref, não por `autoFocus`: o atributo dispara antes de o
          leitor de tela anunciar o que apareceu, e a pessoa fica digitando num
          campo que ela não sabe que existe. */}
      <input
        id="busca-lead"
        ref={campoRef}
        value={termo}
        onChange={e => setTermo(e.target.value)}
        placeholder="Nome ou telefone do lead"
        className="w-full bg-s3/50 border border-line rounded-[14px] px-3.5 py-3 text-sm
                   text-t1 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/30"
      />

      {buscando && (
        <p className="flex items-center justify-center gap-1.5 text-[13px] text-t4 py-2">
          <Loader2 size={13} className="animate-spin" aria-hidden /> Procurando…
        </p>
      )}

      {!buscando && buscou && resultados.length === 0 && (
        <p className="text-[13px] text-t4 text-center py-2">
          Ninguém com esse nome ou telefone nesta campanha.
        </p>
      )}

      <ul className="flex flex-col gap-1.5">
        {resultados.map(r => {
          const stage = CALL_STAGE_BY_VALUE[r.status]
          const fora  = r.status === 'encerrado' || r.status === 'transferido'
          return (
            <li key={r.id}>
              <button
                onClick={() => handlePegar(r)}
                disabled={fora}
                title={fora ? `Lead ${stage?.label.toLowerCase()} — não volta para a fila` : undefined}
                className="w-full text-left rounded-[12px] border border-line bg-s2/50 px-3 py-2.5
                           transition-colors cursor-pointer hover:border-line-strong hover:bg-s2
                           disabled:opacity-45 disabled:cursor-not-allowed
                           focus:outline-none focus:ring-2 focus:ring-brand/30"
              >
                <span className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-t1 truncate flex-1 min-w-0">
                    {r.name}
                  </span>
                  {stage && (
                    <span className={`font-label text-[11px] uppercase tracking-[0.08em] shrink-0
                                      ${TOM[stage.tom].texto}`}>
                      {stage.short}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] text-t4 tabular-nums">{formatPhone(r.phone)}</span>
                  {r.status === 'retorno_agendado' && r.nextAttemptAt && (
                    <span className="text-[11px] text-info">retorno {quandoVolta(r.nextAttemptAt)}</span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <button
        onClick={() => { setAberto(false); setTermo(''); setResultados([]); setBuscou(false) }}
        className="text-[13px] text-t4 hover:text-t2 transition-colors cursor-pointer py-2 min-h-[44px]"
      >
        Cancelar
      </button>
    </div>
  )
}
