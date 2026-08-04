import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Activity, WifiOff, AlertTriangle } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { usePulseStore } from './usePulseStore'
import { usePulsePresence } from './usePulsePresence'
import { useKiosk, useRelogio, useTickLento, useAntiBurnIn } from './useKiosk'
import { calcClimate } from './climate'
import { KpiRail } from './components/KpiRail'
import { FunnelStrip } from './components/FunnelStrip'
import { LiveFeed } from './components/LiveFeed'
import { BrokerRadar } from './components/BrokerRadar'
import { DayChart } from './components/DayChart'
import { ClimateGauge } from './components/ClimateGauge'
import { ResponseTimePanel } from './components/ResponseTimePanel'
import { VglPanel } from './components/VglPanel'
import { SaleCelebration } from './components/SaleCelebration'
import { ClosingSummary } from './components/ClosingSummary'
import { useCarrossel, ROTACAO_MS } from './useCarrossel'
import { PageBanner } from './components/PageBanner'

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
      <span className="font-label text-[11px] uppercase tracking-[0.16em] text-t4">
        Conectando
      </span>
    )
  }

  if (connection === 'live') {
    return (
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-success pulse-live-dot" aria-hidden />
        <span className="font-label text-[11px] uppercase tracking-[0.16em] text-success pulse-live">Ao vivo</span>
      </div>
    )
  }

  const congeladoDesde = desconectadoDesde
    ? new Date(desconectadoDesde).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className={`flex items-center gap-2 ${velho ? 'text-error' : 'text-warning'}`}>
      <WifiOff size={14} strokeWidth={1.6} aria-hidden />
      <span className="font-label text-[11px] uppercase tracking-[0.16em]">
        {velho && congeladoDesde ? `Sem conexão — congelado às ${congeladoDesde}` : 'Reconectando'}
      </span>
    </div>
  )
}

export function PulsePage() {
  const { user, isAdmin, loading } = useAuthStore()

  const {
    connection, erro, desconectadoDesde,
    hoje, funil, negociacaoValor, gargalos, tempos, vgl, celebracao, resumoOntem,
    corretores, brokerNames, feed, porHora, recent,
    bootstrap, subscribe, podar, comissaoPrevista, encerrarCelebracao, carregarResumoOntem,
  } = usePulseStore()

  const online = usePulsePresence()

  // `agora` só avança a cada 30s — tempos relativos e clima não precisam de
  // precisão de segundo, e re-renderizar a árvore inteira 1×/s por 12h seria
  // desperdício puro. O relógio tem seu próprio componente isolado.
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

  // Três páginas, em ordem cronológica: [0] agora · [1] o dia · [2] ontem.
  // A página 0 é SEMPRE o ao vivo — nada a substitui por horário, para o
  // painel nunca ficar preso num resumo enquanto o dia ainda está acontecendo.
  const { pagina, pausado, irPara, onTouchStart, onTouchEnd } = useCarrossel(3)

  // O resumo de ontem só é buscado quando alguém realmente desliza até lá.
  useEffect(() => {
    if (pagina === 2) carregarResumoOntem()
  }, [pagina, carregarResumoOntem])

  const ontem = new Date(agora)
  ontem.setDate(ontem.getDate() - 1)

  // Trava a rolagem do documento enquanto o Pulse está montado. O container já
  // é `position: fixed`, mas sem isto o Safari ainda permite arrastar o body e
  // revelar uma faixa vazia. Restaurado no unmount para não afetar o resto do app.
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
    return () => { unsub() }
  }, [user?.id, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  // Temperatura do DIA — mede 24h, com peso maior no acumulado do que no
  // instante. `agora` continua nas deps só para o recálculo periódico.
  const clima = useMemo(() => calcClimate({
    atividade30min:     recent.length,
    interacoesHoje:     hoje.interacoes,
    leadsNovosHoje:     hoje.leadsNovos,
    corretoresOnline:   online.length,
    visitasHoje:        hoje.visitasMarcadas,
    vendasHoje:         hoje.vendasQtd,
    semAtendimentoHoje: gargalos.semAtendimentoHoje,
  }), [recent.length, hoje, online.length, gargalos.semAtendimentoHoje, agora])

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
    <div
      className="pulse-viewport pulse-antiburn flex flex-col gap-3 select-none"
      style={{
        background: 'var(--page-bg)',
        transform: `translate(${desloc.x}px, ${desloc.y}px)`,
      }}
    >
      {/* ── Cabeçalho ───────────────────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center gap-4 px-2">
        <div className="flex items-center gap-2.5">
          <Activity size={22} strokeWidth={1.6} className="text-brand" aria-hidden />
          <h1 className="font-heading font-extrabold text-xl tracking-tight text-t1">
            iCRM <span className="text-brand">Pulse</span>
          </h1>
        </div>

        <div className="w-px h-6 bg-line" aria-hidden />
        <Relogio />

        {/* Sem indicador ninguém descobre que existe uma 2ª página num
            quiosque que ninguém toca. */}
        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Páginas do painel">
            {[0, 1, 2].map(i => (
              <button
                key={i}
                role="tab"
                aria-selected={pagina === i}
                aria-label={['Ao vivo', 'Balanço do dia', 'Ontem'][i]}
                onClick={() => irPara(i)}
                className={`relative h-1.5 rounded-full overflow-hidden transition-all duration-[280ms] ${
                  pagina === i ? 'w-6 bg-brand/25' : 'w-1.5 bg-line-strong'
                }`}
              >
                {pagina === i && (
                  <span
                    // A key remonta o elemento a cada troca, reiniciando a
                    // animação da barra do zero.
                    key={`${pagina}-${pausado}`}
                    className={`absolute inset-0 rounded-full bg-brand ${
                      pausado ? '' : 'pulse-dot-progresso'
                    }`}
                    style={{ '--pulse-rotacao': `${ROTACAO_MS}ms` } as React.CSSProperties}
                    aria-hidden
                  />
                )}
              </button>
            ))}
          </div>
          <StatusConexao
            connection={connection}
            desconectadoDesde={desconectadoDesde}
            agora={agora}
          />
        </div>
      </header>

      {/* ── Carrossel: [0] hoje · [1] ontem ─────────────────────────────────
          O deslize horizontal só conta quando X domina Y — ver useCarrossel —,
          senão rolar o feed trocaria de página sem querer. */}
      <div
        className="flex-1 min-h-0 overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex h-full w-full transition-transform duration-[420ms] ease-out"
          style={{ transform: `translateX(-${pagina * 100}%)` }}
        >
          {/* Página 0 — hoje */}
          <div className="w-full shrink-0 h-full flex flex-col gap-3 min-h-0">
            <PageBanner tipo="ao_vivo" data={new Date(agora)} />
            {(
              <>
                <KpiRail
                  hoje={hoje}
                  corretoresOnline={online.length}
                  negociacaoValor={negociacaoValor}
                  comissaoPrevista={comissaoPrevista()}
                />

                <FunnelStrip funil={funil} />

                <div className="flex-1 min-h-0 grid grid-cols-[1.35fr_1fr] gap-3">
                  <div className="flex flex-col gap-3 min-h-0">
                    <LiveFeed feed={feed} brokerNames={brokerNames} className="flex-1 min-h-0" />
                    {/* Gráfico e tempo de resposta dividem a faixa de baixo para o
                        feed continuar sendo o maior elemento da tela. */}
                    <div className="shrink-0 grid grid-cols-2 gap-3 h-[clamp(130px,25%,175px)]">
                      <DayChart porHora={porHora} horaAtual={new Date(agora).getHours()} />
                      <ResponseTimePanel tempos={tempos} />
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 min-h-0">
                    <ClimateGauge clima={clima} />
                    <VglPanel vgl={vgl} />
                    <BrokerRadar
                      corretores={corretores}
                      online={online}
                      agora={agora}
                      className="flex-1 min-h-0"
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Página 1 — balanço do dia corrente */}
          <div className="w-full shrink-0 h-full flex flex-col gap-3 min-h-0">
            <PageBanner tipo="balanco" data={new Date(agora)} aoVoltar={() => irPara(0)} />
            <ClosingSummary hoje={hoje} corretores={corretores} vgl={vgl} />
          </div>

          {/* Página 2 — ontem */}
          <div className="w-full shrink-0 h-full flex flex-col gap-3 min-h-0">
            {/* aoVoltar garante que o ao vivo está sempre a um toque, sem
                depender de alguém adivinhar o gesto de deslize. */}
            <PageBanner tipo="ontem" data={ontem} aoVoltar={() => irPara(0)} />
            {resumoOntem ? (
              <ClosingSummary
                hoje={resumoOntem.hoje}
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

      <SaleCelebration venda={celebracao} onFim={encerrarCelebracao} />
    </div>
  )
}
