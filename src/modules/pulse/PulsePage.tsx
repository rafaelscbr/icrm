import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Activity, WifiOff, AlertTriangle, Users, Radio, Filter, BarChart3 } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { useLeadPauseStore } from '../../store/useLeadPauseStore'
import { useSlaConfigStore } from '../../store/useSlaConfigStore'
import { pausaDe } from '../../lib/pausaLeads'
import { DAILY_TARGETS } from '../../lib/metasConfig'
import { localDateStr } from '../../lib/formatters'
import { usePulseStore } from './usePulseStore'
import { useKiosk, useRelogio, useTickLento, useAntiBurnIn, useEscalaTV } from './useKiosk'
import { useOntemAteAgora } from './useOntemAteAgora'
import { ResponseTimePanel } from './components/ResponseTimePanel'
import { SaleCelebration } from './components/SaleCelebration'
import { ClosingSummary } from './components/ClosingSummary'
import { PageBanner } from './components/PageBanner'
import {
  Bloco, FaixaAgora, FunilDesenhado, GraficoLeads, LegendaDaLinha, MetaDoMes, RegistrosAoVivo, mediaSemHoje,
} from './components/Sala'
import { useCarrossel, ROTACAO_MS } from './useCarrossel'
import { AlertasDaSala, PainelDaEquipe } from '../leads/PainelMonitor'
import type { LinhaEquipe } from '../leads/PainelMonitor'
import {
  alertasDaSala, atividadePorHora, janelaDoDia, recebidosHoje, velocidadeDeResposta,
} from '../leads/monitorLeads'
import { estaAtivo, fraseDoCorretor, haQuanto, prazoVencido } from '../leads/dashboardLeads'
import { destacar } from '../../components/shared/Destaque'

/**
 * iCRM Pulse — o coração da imobiliária em tempo real.
 *
 * Tela de quiosque: um iPad ligado 12h/dia que ninguém toca. Responde uma única
 * pergunta — "o que está acontecendo na minha imobiliária neste momento?".
 *
 * ARQUITETURA (não alterar sem reler):
 *
 *   • A rota vive FORA de AppRoutes, ao lado de /login. Isso é deliberado: se
 *     estivesse dentro, herdaria as 10 subscriptions e os stores pesados do
 *     App.tsx, e o iPad ficaria 12h segurando a base inteira de leads e
 *     contatos na memória sem precisar de nada disso.
 *
 *   • UMA leitura no banco por sessão (a RPC pulse_snapshot). Depois disso,
 *     só eventos realtime. Zero polling — foi polling que estourou o egress
 *     do Supabase em julho/2026.
 *
 *   • Nenhum timer toca a rede. O relógio (1s) e o tick lento (30s) são JS puro.
 *
 *   • Quando o socket cai, a tela DIZ que caiu. Nunca exibe número velho como
 *     se fosse ao vivo.
 *
 * SALA DE COMANDO (22/11/2026): o Dashboard de Leads foi absorvido aqui e
 * saiu do sistema. A tela é desenhada para uma TV num palco fixo de 1600×900
 * (useEscalaTV) e responde, sem rolar: o que está acontecendo AGORA — números
 * do momento, alertas por exceção, a equipe linha a linha, o feed, o funil,
 * a chegada de leads e o tempo de resposta. O que o Dashboard tirava da lista
 * inteira de leads em memória vem agregado da RPC pulse_sala (migração 102) e
 * se mantém pelo realtime — a regra de uma leitura por sessão continua.
 */

/** A partir daqui os dados na tela são velhos demais para serem chamados de "ao vivo". */
const LIMITE_DADO_VELHO_MS = 30 * 60 * 1000

function Relogio() {
  const agora = useRelogio()
  return (
    <div className="flex items-baseline gap-3">
      <span className="font-heading font-extrabold text-[28px] leading-none text-t1 tabular-nums tracking-tight">
        {agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
      <span className="font-label text-[11px] uppercase tracking-[0.14em] text-t4">
        {agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' })}
      </span>
    </div>
  )
}

function StatusConexao({ connection, desconectadoDesde, agora }: {
  connection: string
  desconectadoDesde: number | null
  agora: number
}) {
  const velho = desconectadoDesde !== null && agora - desconectadoDesde > LIMITE_DADO_VELHO_MS

  if (connection === 'loading') {
    return (
      <span className="font-label text-[13px] uppercase tracking-[0.16em] text-t4">
        Conectando
      </span>
    )
  }

  if (connection === 'live') {
    return (
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-success pulse-live-dot" aria-hidden />
        <span className="font-label text-[13px] uppercase tracking-[0.16em] text-success pulse-live">Ao vivo</span>
      </div>
    )
  }

  const congeladoDesde = desconectadoDesde
    ? new Date(desconectadoDesde).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className={`flex items-center gap-2 ${velho ? 'text-error' : 'text-warning'}`}>
      <WifiOff size={14} strokeWidth={1.6} aria-hidden />
      <span className="font-label text-[13px] uppercase tracking-[0.16em]">
        {velho && congeladoDesde ? `Sem conexão — congelado às ${congeladoDesde}` : 'Reconectando'}
      </span>
    </div>
  )
}

export function PulsePage() {
  const { user, isAdmin, loading, allProfiles, fetchAllProfiles } = useAuthStore()

  const {
    connection, erro, desconectadoDesde, dataReferencia, ultimoSnapshotAt,
    hoje, funil, tempos, vgl, celebracao, resumoOntem, sala, salaErro,
    corretores, brokerNames, feed,
    bootstrap, subscribe, podar, encerrarCelebracao, carregarResumoOntem,
  } = usePulseStore()
  const carregado = ultimoSnapshotAt !== null

  // Leituras pequenas, uma vez: quem está em pausa (relida quando alguém pausa
  // — ver o canal do store) e a agenda do expediente.
  const pausas        = useLeadPauseStore(s => s.pausas)
  const carregarPausas = useLeadPauseStore(s => s.carregar)
  const slaConfig     = useSlaConfigStore(s => s.config)
  const carregarSla   = useSlaConfigStore(s => s.load)

  const [agora, setAgora] = useState(() => Date.now())

  const tick = useCallback(() => {
    podar()
    setAgora(Date.now())
  }, [podar])

  useTickLento(tick)

  const onViradaDoDia = useCallback(() => {
    bootstrap('virada_dia')
  }, [bootstrap])

  useKiosk({ onViradaDoDia })
  const desloc = useAntiBurnIn()
  const palco = useEscalaTV()

  const { pagina, pausado, irPara, onTouchStart, onTouchEnd } = useCarrossel(2)

  // O balanço de ontem alimenta a régua "ontem" de cada corretor e a 2ª página.
  useEffect(() => {
    if (carregado) void carregarResumoOntem()
  }, [carregado, dataReferencia, carregarResumoOntem])

  const ontem = new Date(agora)
  ontem.setDate(ontem.getDate() - 1)

  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const antes = {
      html:       html.style.overflow,
      body:       body.style.overflow,
      overscroll: body.style.overscrollBehavior,
    }
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    body.style.overscrollBehavior = 'none'
    return () => {
      html.style.overflow = antes.html
      body.style.overflow = antes.body
      body.style.overscrollBehavior = antes.overscroll
    }
  }, [])

  useEffect(() => {
    if (!user || !isAdmin) return
    bootstrap('inicial')
    const unsub = subscribe()
    void carregarPausas()
    void carregarSla()
    if (allProfiles.length === 0) void fetchAllProfiles()
    return () => { unsub() }
  }, [user?.id, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  const { ateAgora, ontemDe } = useOntemAteAgora(carregado ? dataReferencia : null, resumoOntem, agora)

  // ── Quem aparece na sala: os corretores ativos; o admin só no dia em que atendeu.
  const quadros = useMemo(() => {
    const comAtividade = new Set(feed.map(e => e.brokerId).filter((x): x is string => !!x))
    const daEquipe = allProfiles.filter(p => p.active && p.role === 'broker').map(p => p.id)
    const admins = allProfiles.filter(p => p.active && p.role === 'admin' && comAtividade.has(p.id)).map(p => p.id)
    let ids = [...daEquipe, ...admins]
    if (ids.length === 0) ids = corretores.map(c => c.brokerId)
    const nome = (id: string) => allProfiles.find(p => p.id === id)?.name ?? brokerNames[id] ?? 'Corretor'
    return ids.map(id => ({
      id, nome: nome(id),
      resumo: corretores.find(c => c.brokerId === id),
      ultimaAt: feed.find(e => e.brokerId === id)?.at ?? corretores.find(c => c.brokerId === id)?.ultimaAtividadeAt ?? null,
      marcas: feed.filter(e => e.brokerId === id).map(e => ({ t: new Date(e.at).getTime(), tom: fraseDoCorretor(e).tone })),
    }))
  }, [allProfiles, feed, corretores, brokerNames])

  const nomes = useMemo(() => new Map(quadros.map(q => [q.id, q.nome.split(' ')[0]])), [quadros])
  const nomeDe = useCallback((id?: string | null) => (id ? quadros.find(q => q.id === id)?.nome ?? brokerNames[id] : undefined), [quadros, brokerNames])

  // A mesma janela de horas para todas as linhas: do expediente até agora.
  const janelaDia = useMemo(() => {
    const ids = new Set(quadros.map(q => q.id))
    return janelaDoDia(atividadePorHora(feed.filter(e => e.brokerId && ids.has(e.brokerId)), new Date(agora)), new Date(agora))
  }, [quadros, feed, agora])

  // ── Resposta aos leads HOJE: quem recebeu, quem cumpriu o prazo ─────────────
  const resposta = useMemo(() => {
    if (!sala) return null
    const inicio = new Date(agora); inicio.setHours(0, 0, 0, 0)
    // null do banco vira undefined, o formato do Lead que o cálculo espera
    const trilha = new Map(Object.entries(sala.trilha).map(([id, t]) => [id, {
      firstContactAt: t.firstContactAt ?? undefined,
      discardReason:  t.discardReason ?? undefined,
      closedAt:       t.closedAt ?? undefined,
    }]))
    return {
      recebidos: recebidosHoje(sala.atribuicoes, new Date(agora)),
      velocidade: velocidadeDeResposta(sala.atribuicoes, trilha, inicio.getTime(), agora, slaConfig?.schedule ?? null),
    }
  }, [sala, agora, slaConfig])

  const linhasEquipe = useMemo<LinhaEquipe[]>(() => quadros.map(q => {
    const ativo = estaAtivo(q.ultimaAt, agora)
    const rec = resposta?.recebidos.get(q.id)
    const v = resposta?.velocidade.linhas.find(l => l.brokerId === q.id)
    const meus = sala?.esperando.filter(l => l.brokerId === q.id) ?? []
    const o = ontemDe(q.id)
    return {
      id: q.id, nome: q.nome, ativo,
      status: ativo ? `Em atividade · ${haQuanto(q.ultimaAt!, agora)}` : q.ultimaAt ? `Última atividade ${haQuanto(q.ultimaAt, agora)}` : 'Sem atividade hoje',
      pausa: pausaDe(pausas, q.id, agora),
      marcas: q.marcas,
      producao: [
        { rotulo: 'Atend.',   hoje: q.resumo?.interacoesHoje ?? 0, ontem: o?.interacoes },
        { rotulo: 'Ligações', hoje: q.resumo?.ligacoesHoje ?? 0,   ontem: o?.ligacoes, meta: DAILY_TARGETS.ligacoes },
        { rotulo: 'Avanços',  hoje: q.resumo?.avancosHoje ?? 0,    ontem: o?.avancos },
        { rotulo: 'Visitas',  hoje: q.resumo?.visitasHoje ?? 0,    ontem: o?.visitas },
      ],
      leadsNovos: resposta ? rec?.daRoleta ?? 0 : null,
      herdados: (rec?.porTransferencia ?? 0) + (rec?.manual ?? 0),
      prazo: v ? { noPrazo: v.noPrazo, comDesfecho: v.noPrazo + v.foraDoPrazo + v.perdidos, perdidos: v.perdidos } : null,
      esperando: meus.length,
      vencidos: meus.filter(l => prazoVencido(l.slaDueAt, agora)).length,
    }
  }), [quadros, agora, resposta, sala, pausas, ontemDe])

  // ── Alertas por exceção ───────────────────────────────────────────────────
  const alertas = alertasDaSala({
    agora, agenda: slaConfig?.schedule ?? null,
    corretores: carregado ? quadros.filter(q => allProfiles.some(p => p.id === q.id && p.role === 'broker'))
      .map(q => ({ id: q.id, nome: q.nome, ultimaAtividadeAt: q.ultimaAt, emPausa: !!pausaDe(pausas, q.id, agora) })) : [],
    esperando: (sala?.esperando ?? []).map(l => ({ id: l.id, nome: l.nome, corretor: nomeDe(l.brokerId), slaDueAt: l.slaDueAt })),
  })

  // ── Números do momento ────────────────────────────────────────────────────
  const serie = sala?.leadsPorDia ?? []
  const media = mediaSemHoje(serie)
  const esperando = sala?.esperando ?? []
  const vencidosAgora = esperando.filter(l => prazoVencido(l.slaDueAt, agora)).length
  const atendimentosHoje = quadros.reduce((t, q) => t + (q.resumo?.interacoesHoje ?? 0), 0)
  const atendimentosOntem = resumoOntem ? quadros.reduce((t, q) => t + (ontemDe(q.id)?.interacoes ?? 0), 0) : null
  const prazoHoje = resposta?.velocidade.total ?? null
  const comDesfecho = prazoHoje ? prazoHoje.noPrazo + prazoHoje.foraDoPrazo + prazoHoje.perdidos : 0

  // O último sinal da equipe, no cabeçalho
  const ultimoEv = feed.find(e => e.brokerId && nomes.has(e.brokerId))

  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/" replace />

  if (connection === 'error') {
    return (
      <div className="pulse-viewport flex flex-col items-center justify-center gap-4 px-8 text-center" style={{ background: 'var(--page-bg)' }}>
        <AlertTriangle size={40} strokeWidth={1.6} className="text-error" aria-hidden />
        <h1 className="font-heading font-extrabold text-2xl text-t1">Não consegui carregar o Pulse</h1>
        <p className="text-t3 max-w-md">{erro}</p>
        <button
          onClick={() => bootstrap('inicial')}
          className="mt-2 rounded-[14px] border border-line px-5 py-2.5 text-t1 hover:bg-s2 transition-colors"
        >
          Tentar de novo
        </button>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 overflow-hidden pulse-fundo">
      <div
        className="pulse-antiburn pulse-palco absolute left-0 top-0 flex flex-col gap-3.5 p-5 select-none"
        style={{
          width: palco.largura, height: palco.altura,
          transformOrigin: '0 0',
          transform: `translate(${desloc.x}px, ${desloc.y}px) scale(${palco.escala})`,
        }}
      >
        {/* ── Cabeçalho ───────────────────────────────────────────────────────── */}
        <header className="shrink-0 flex items-center gap-5 px-1">
          <div className="flex items-center gap-2.5">
            <Activity size={24} strokeWidth={1.6} className="text-brand" aria-hidden />
            <h1 className="font-heading font-extrabold text-[22px] tracking-tight text-t1">
              iCRM <span className="text-brand">Pulse</span>
            </h1>
          </div>

          <div className="w-px h-7 bg-line" aria-hidden />
          <Relogio />

          {ultimoEv && (
            <p className="text-[14px] text-t3 truncate" key={ultimoEv.id}>
              Último registro <span className="text-t1 font-medium">{haQuanto(ultimoEv.at, agora)}</span>
              {ultimoEv.brokerId && <> · {nomes.get(ultimoEv.brokerId)}</>}
            </p>
          )}

          {/* Sem indicador ninguém descobre que existe uma 2ª página num
              quiosque que ninguém toca. */}
          <div className="ml-auto flex items-center gap-5">
            <div className="flex items-center gap-1.5" role="tablist" aria-label="Páginas do painel">
              {[0, 1].map(i => (
                <button
                  key={i}
                  role="tab"
                  aria-selected={pagina === i}
                  aria-label={['Ao vivo', 'Ontem'][i]}
                  onClick={() => irPara(i)}
                  className={`relative h-1.5 rounded-full overflow-hidden transition-all duration-[280ms] ${
                    pagina === i ? 'w-7 bg-brand/25' : 'w-1.5 bg-line-strong'
                  }`}
                >
                  {pagina === i && (
                    <span
                      key={`${pagina}-${pausado}`}
                      className={`absolute inset-0 rounded-full bg-brand ${pausado ? '' : 'pulse-dot-progresso'}`}
                      style={{ '--pulse-rotacao': `${ROTACAO_MS}ms` } as React.CSSProperties}
                      aria-hidden
                    />
                  )}
                </button>
              ))}
            </div>
            <StatusConexao connection={connection} desconectadoDesde={desconectadoDesde} agora={agora} />
          </div>
        </header>

        {/* ── Carrossel: [0] agora · [1] ontem ─────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <div
            className="flex h-full w-full transition-transform duration-[420ms] ease-out"
            style={{ transform: `translateX(-${pagina * 100}%)` }}
          >
            {/* Página 0 — a sala de comando */}
            <div className="w-full shrink-0 h-full flex flex-col gap-3.5 min-h-0">
              <AlertasDaSala alertas={alertas} />

              <FaixaAgora
                itens={[
                  {
                    rotulo: 'Leads hoje',
                    valor: sala ? serie[serie.length - 1]?.n ?? 0 : null,
                    nota: media === null ? undefined : `média de ${media.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} por dia`,
                  },
                  {
                    rotulo: 'Esperando 1º contato',
                    valor: sala ? esperando.length : null,
                    tom: vencidosAgora > 0 ? 'text-error' : esperando.length > 0 ? 'text-warning' : 'text-t1',
                    nota: !sala ? undefined : vencidosAgora > 0 ? `${vencidosAgora} com o prazo vencido`
                      : esperando.length > 0 ? 'todos dentro do prazo' : 'todo lead novo já foi chamado',
                  },
                  {
                    rotulo: 'Atendimentos hoje',
                    valor: carregado ? atendimentosHoje : null,
                    nota: atendimentosOntem === null ? undefined
                      : `${ateAgora ? 'ontem a esta hora' : 'ontem, o dia todo'}: ${atendimentosOntem.toLocaleString('pt-BR')}`,
                  },
                  {
                    rotulo: 'No prazo hoje',
                    valor: !prazoHoje || comDesfecho === 0 ? null : `${prazoHoje.noPrazo} de ${comDesfecho}`,
                    tom: prazoHoje && prazoHoje.perdidos > 0 ? 'text-warning' : 'text-t1',
                    nota: !prazoHoje ? undefined
                      : prazoHoje.perdidos > 0 ? `${prazoHoje.perdidos} ${prazoHoje.perdidos === 1 ? 'lead perdido' : 'leads perdidos'} por prazo`
                      : comDesfecho === 0 ? 'nenhum prazo venceu ou foi cumprido' : 'nenhum lead perdido por prazo',
                  },
                  {
                    rotulo: 'Visitas hoje',
                    valor: carregado ? hoje.visitasMarcadas : null,
                    tom: hoje.visitasMarcadas > 0 ? 'text-success' : 'text-t1',
                    nota: carregado ? `${hoje.vendasQtd} ${hoje.vendasQtd === 1 ? 'venda' : 'vendas'} hoje` : undefined,
                  },
                ]}
                destaque={<MetaDoMes vgl={vgl} />}
              />

              {salaErro && (
                <p className="shrink-0 flex items-center gap-2 rounded-[12px] border border-error-line bg-error-bg px-4 py-2 text-[13.5px] text-t1" role="alert">
                  <AlertTriangle size={15} strokeWidth={1.8} className="text-error" aria-hidden />
                  Não consegui ler leads por dia, quem espera o 1º contato e o prazo de hoje: {salaErro}
                </p>
              )}

              {/* Equipe agora — a linha de cada corretor, de ponta a ponta */}
              <section className="shrink-0 min-w-0">
                <div className="flex items-end justify-between gap-4 mb-2.5 px-1">
                  <h2 className="flex items-center gap-2.5 font-display text-[17px] font-bold tracking-[-0.015em] text-t1">
                    <span className="w-1 h-4 rounded-full bg-brand" aria-hidden />
                    <Users size={17} strokeWidth={1.6} className="text-t3" aria-hidden />
                    {destacar('Equipe *agora*')}
                  </h2>
                  <LegendaDaLinha ontem={!resumoOntem ? null : ateAgora ? '"ontem" conta até esta hora' : '"ontem" é o dia todo'} />
                </div>
                {!carregado ? (
                  <div className="bento h-[150px] shimmer" aria-busy="true" />
                ) : quadros.length === 0 ? (
                  <p className="text-[15px] text-t3 py-6">Nenhum corretor ativo para mostrar.</p>
                ) : (
                  <PainelDaEquipe linhas={linhasEquipe} de={janelaDia.de} ate={janelaDia.ate} agora={agora} />
                )}
              </section>

              {/* Ao vivo · funil · chegada e resposta */}
              <div className="flex-1 min-h-0 grid gap-3.5" style={{ gridTemplateColumns: '1.3fr 0.78fr 1fr' }}>
                <Bloco icon={Radio} titulo="Registros *ao vivo*">
                  <RegistrosAoVivo feed={feed} nomes={nomes} carregado={carregado} />
                </Bloco>

                <Bloco icon={Filter} titulo="Funil *agora*"
                  extra={<span className="font-label text-[11.5px] uppercase tracking-[0.14em] text-t4 tabular-nums">
                    {Object.values(funil).reduce((a, b) => a + b, 0).toLocaleString('pt-BR')} ativos
                  </span>}>
                  <FunilDesenhado porEtapa={funil} vendasNoMes={vgl ? vgl.vendasMes : null} />
                </Bloco>

                <div className="flex flex-col gap-3.5 min-h-0 min-w-0">
                  <Bloco icon={BarChart3} titulo="Leads por *dia*" className="flex-1"
                    extra={<span className="font-label text-[11.5px] uppercase tracking-[0.14em] text-t4">30 dias</span>}>
                    {sala ? <GraficoLeads serie={serie} /> : <div className="flex-1 m-4 rounded-[12px] shimmer" aria-busy="true" />}
                  </Bloco>
                  <ResponseTimePanel tempos={tempos} />
                </div>
              </div>
            </div>

            {/* Página 1 — ontem */}
            <div className="w-full shrink-0 h-full flex flex-col gap-3 min-h-0">
              {/* aoVoltar garante que o ao vivo está sempre a um toque, sem
                  depender de alguém adivinhar o gesto de deslize. */}
              <PageBanner tipo="ontem" data={ontem} aoVoltar={() => irPara(0)} />
              {resumoOntem && resumoOntem.data === localDateStr(ontem) ? (
                <ClosingSummary
                  hoje={resumoOntem.hoje}
                  destaques={resumoOntem.destaques}
                  corretores={resumoOntem.corretores}
                  vgl={vgl}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <span className="font-label text-[11px] uppercase tracking-[0.2em] text-t4">
                    Carregando o resumo de ontem
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <SaleCelebration venda={celebracao} onFim={encerrarCelebracao} />
    </div>
  )
}
