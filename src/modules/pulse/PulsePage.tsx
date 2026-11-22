import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Activity, WifiOff, AlertTriangle } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { useLeadPauseStore } from '../../store/useLeadPauseStore'
import { useSlaConfigStore } from '../../store/useSlaConfigStore'
import { pausaDe } from '../../lib/pausaLeads'
import { DAILY_TARGETS } from '../../lib/metasConfig'
import { usePulseStore } from './usePulseStore'
import { useKiosk, useRelogio, useTickLento, useAntiBurnIn, useEscalaTV } from './useKiosk'
import { SaleCelebration } from './components/SaleCelebration'
import {
  AoVivo, BarraDoPrazo, ChegadaDeLeads, EquipeAgora, FilaPrimeiroContato, FunilVivo, LegendaDoDia,
  MetaDoMes, NumerosDoMomento, Painel, PontosDaFila, Resposta, mediaSemHoje, urgenciaDe,
} from './components/Sala'
import type { Corretor } from './components/Sala'
import { AlertasDaSala } from '../leads/PainelMonitor'
import {
  alertasDaSala, atividadePorHora, janelaDoDia, recebidosHoje, velocidadeDeResposta,
} from '../leads/monitorLeads'
import { estaAtivo, fraseDoCorretor, haQuanto } from '../leads/dashboardLeads'

/**
 * iCRM Pulse — a imobiliária em tempo real, numa TV.
 *
 * Responde uma pergunta só: "o que está acontecendo AGORA, hoje?". Não há
 * página de ontem nem carrossel (22/11/2026): a tela é o dia de hoje, inteiro,
 * sem rolar.
 *
 * ARQUITETURA (não alterar sem reler):
 *
 *   • A rota vive FORA de AppRoutes, ao lado de /login. Se estivesse dentro,
 *     herdaria as 10 subscriptions e os stores pesados do App.tsx.
 *
 *   • UMA leitura no banco por sessão (pulse_snapshot + pulse_vgl +
 *     pulse_sala, juntas). Depois disso, só eventos realtime de INSERT. Zero
 *     polling — foi polling que estourou o egress do Supabase em julho/2026.
 *
 *   • Nenhum timer toca a rede. O relógio (1s) e o tick lento (30s) são JS puro.
 *
 *   • Quando o socket cai, a tela DIZ que caiu. Nunca exibe número velho como
 *     se fosse ao vivo.
 *
 * DESENHO: palco fixo de 1600×900 escalado para a tela (useEscalaTV). Moldura
 * quieta e cor viva só nos dados — ver components/Sala.tsx.
 */

/** A partir daqui os dados na tela são velhos demais para serem chamados de "ao vivo". */
const LIMITE_DADO_VELHO_MS = 30 * 60 * 1000

function Relogio() {
  const agora = useRelogio()
  const hm = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const s = String(agora.getSeconds()).padStart(2, '0')
  return (
    <div className="flex items-baseline gap-4">
      <span className="font-display font-extrabold text-[40px] leading-none text-t1 tabular-nums tracking-[-0.04em]">
        {hm}<span className="text-t4 text-[26px] tracking-[-0.02em]">:{s}</span>
      </span>
      <span className="text-[16px] text-t3 first-letter:uppercase">
        {agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
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
    return <span className="text-[16px] text-t3">Conectando…</span>
  }

  if (connection === 'live') {
    return (
      <span className="inline-flex items-center gap-2.5 rounded-full px-4 h-10" style={{ background: 'color-mix(in srgb, var(--v-ok) 12%, var(--surface))' }}>
        <span className="w-3 h-3 rounded-full pulse-live-dot" style={{ background: 'var(--v-ok)' }} aria-hidden />
        <span className="text-[16px] font-semibold text-success">Ao vivo</span>
      </span>
    )
  }

  const congeladoDesde = desconectadoDesde
    ? new Date(desconectadoDesde).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <span className={`inline-flex items-center gap-2 text-[16px] font-semibold ${velho ? 'text-error' : 'text-warning'}`}>
      <WifiOff size={18} strokeWidth={1.8} aria-hidden />
      {velho && congeladoDesde ? `Sem conexão — números congelados às ${congeladoDesde}` : 'Reconectando…'}
    </span>
  )
}

export function PulsePage() {
  const { user, isAdmin, loading, allProfiles, fetchAllProfiles } = useAuthStore()

  const {
    connection, erro, desconectadoDesde, ultimoSnapshotAt,
    hoje, funil, tempos, vgl, celebracao, sala, salaErro,
    corretores, brokerNames, feed,
    bootstrap, subscribe, podar, encerrarCelebracao,
  } = usePulseStore()
  const carregado = ultimoSnapshotAt !== null

  // Leituras pequenas, uma vez: quem está em pausa (relida quando alguém pausa
  // — ver o canal do store) e a agenda do expediente (prazo do 1º contato).
  const pausas         = useLeadPauseStore(s => s.pausas)
  const carregarPausas = useLeadPauseStore(s => s.carregar)
  const slaConfig      = useSlaConfigStore(s => s.config)
  const carregarSla    = useSlaConfigStore(s => s.load)

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

  const equipe = useMemo<Corretor[]>(() => quadros.map(q => {
    const ativo = estaAtivo(q.ultimaAt, agora)
    const rec = resposta?.recebidos.get(q.id)
    return {
      id: q.id, nome: q.nome, ativo,
      status: ativo ? `Em atividade · ${haQuanto(q.ultimaAt!, agora)}` : q.ultimaAt ? `Última atividade ${haQuanto(q.ultimaAt, agora)}` : 'Sem atividade hoje',
      pausa: pausaDe(pausas, q.id, agora),
      marcas: q.marcas,
      atend: q.resumo?.interacoesHoje ?? 0,
      ligacoes: q.resumo?.ligacoesHoje ?? 0,
      metaLigacoes: DAILY_TARGETS.ligacoes,
      avancos: q.resumo?.avancosHoje ?? 0,
      visitas: q.resumo?.visitasHoje ?? 0,
      leads: resposta ? rec?.daRoleta ?? 0 : null,
      herdados: (rec?.porTransferencia ?? 0) + (rec?.manual ?? 0),
    }
  }), [quadros, agora, resposta, pausas])

  // ── Alertas por exceção ───────────────────────────────────────────────────
  const fila = useMemo(
    () => (sala?.esperando ?? []).map(l => ({ id: l.id, nome: l.nome, corretor: nomeDe(l.brokerId), slaDueAt: l.slaDueAt })),
    [sala, nomeDe],
  )
  const alertas = alertasDaSala({
    agora, agenda: slaConfig?.schedule ?? null,
    corretores: carregado ? quadros.filter(q => allProfiles.some(p => p.id === q.id && p.role === 'broker'))
      .map(q => ({ id: q.id, nome: q.nome, ultimaAtividadeAt: q.ultimaAt, emPausa: !!pausaDe(pausas, q.id, agora) })) : [],
    esperando: fila,
  })

  // ── Números do momento ────────────────────────────────────────────────────
  const serie = sala?.leadsPorDia ?? []
  const media = mediaSemHoje(serie)
  const prazoMin = slaConfig?.minutes ?? tempos.primeiroContato.slaMin ?? null
  const urgencias = fila.map(f => urgenciaDe(f.slaDueAt, agora, prazoMin).urgencia)
    .sort((a, b) => ['risco', 'alerta', 'ok', 'parado'].indexOf(a) - ['risco', 'alerta', 'ok', 'parado'].indexOf(b))
  const vencidos = urgencias.filter(u => u === 'risco').length
  const correndo = urgencias.filter(u => u === 'ok' || u === 'alerta').length
  const atendimentosHoje = equipe.reduce((t, c) => t + c.atend, 0)
  const ativosAgora = equipe.filter(c => c.ativo && !c.pausa).length
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
        className="pulse-antiburn absolute left-0 top-0 flex flex-col gap-4 px-7 py-6 select-none"
        style={{
          width: palco.largura, height: palco.altura,
          transformOrigin: '0 0',
          transform: `translate(${desloc.x}px, ${desloc.y}px) scale(${palco.escala})`,
        }}
      >
        {/* ── Cabeçalho: a marca, a hora, o pulso ─────────────────────────────── */}
        <header className="shrink-0 flex items-center gap-7">
          <h1 className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-[13px] bg-brand-fill" aria-hidden>
              <Activity size={24} strokeWidth={2} className="text-brand-fill-text" />
            </span>
            <span className="leading-tight">
              <span className="block font-display text-[24px] font-extrabold tracking-[-0.03em] text-t1">Pulse</span>
              <span className="block text-[14px] text-t3">Souza Imobiliária</span>
            </span>
          </h1>
          <span className="h-10 w-px bg-line" aria-hidden />
          <Relogio />
          <div className="ml-auto flex items-center gap-5">
            {ultimoEv && (
              <p className="text-[16px] text-t3 truncate" key={ultimoEv.id}>
                Último registro <span className="text-t1 font-semibold">{haQuanto(ultimoEv.at, agora)}</span>
                {ultimoEv.brokerId && <> · {nomes.get(ultimoEv.brokerId)}</>}
              </p>
            )}
            <StatusConexao connection={connection} desconectadoDesde={desconectadoDesde} agora={agora} />
          </div>
        </header>

        {alertas.length > 0 && <div className="shrink-0"><AlertasDaSala alertas={alertas} /></div>}
        {salaErro && (
          <p className="shrink-0 flex items-center gap-2 rounded-[12px] border border-error-line bg-error-bg px-4 py-2.5 text-[15px] text-t1" role="alert">
            <AlertTriangle size={16} strokeWidth={1.8} className="text-error" aria-hidden />
            Não consegui ler a fila do 1º contato e a chegada de leads: {salaErro}
          </p>
        )}

        {/* ── Os números do momento ─────────────────────────────────────────── */}
        <NumerosDoMomento
          itens={[
            {
              rotulo: 'Leads hoje',
              valor: sala ? serie[serie.length - 1]?.n ?? 0 : null,
              nota: media === null ? undefined : `média de ${media.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} por dia`,
            },
            {
              rotulo: 'Na fila',
              valor: sala ? fila.length : null,
              tom: vencidos > 0 ? 'text-error' : correndo > 0 ? 'text-warning' : fila.length > 0 ? 'text-t1' : 'text-success',
              marca: sala ? <PontosDaFila urgencias={urgencias} /> : undefined,
              nota: !sala ? undefined : vencidos > 0 ? `${vencidos} com o prazo vencido`
                : correndo > 0 ? `${correndo} com o prazo correndo`
                : fila.length > 0 ? 'parados até o expediente' : 'todo lead novo já foi chamado',
            },
            {
              rotulo: 'No prazo hoje',
              valor: !prazoHoje || comDesfecho === 0 ? null : `${prazoHoje.noPrazo}/${comDesfecho}`,
              tom: prazoHoje && prazoHoje.perdidos > 0 ? 'text-warning' : comDesfecho > 0 ? 'text-success' : 'text-t1',
              marca: prazoHoje ? <BarraDoPrazo noPrazo={prazoHoje.noPrazo} fora={prazoHoje.foraDoPrazo} perdidos={prazoHoje.perdidos} /> : undefined,
              nota: !prazoHoje ? undefined
                : prazoHoje.perdidos > 0 ? `${prazoHoje.perdidos} ${prazoHoje.perdidos === 1 ? 'lead perdido' : 'leads perdidos'} por prazo`
                : comDesfecho === 0 ? 'nenhum prazo fechou hoje' : 'nenhum perdido por prazo',
            },
            {
              rotulo: 'Atendimentos',
              valor: carregado ? atendimentosHoje : null,
              nota: carregado ? `${ativosAgora} ${ativosAgora === 1 ? 'corretor ativo' : 'corretores ativos'} agora` : undefined,
            },
            {
              rotulo: 'Visitas',
              valor: carregado ? hoje.visitasMarcadas : null,
              tom: hoje.visitasMarcadas > 0 ? 'text-success' : 'text-t1',
              nota: carregado ? `${hoje.vendasQtd} ${hoje.vendasQtd === 1 ? 'venda' : 'vendas'} hoje` : undefined,
            },
          ]}
          meta={<MetaDoMes vgl={vgl} />}
        />

        {/* ── A equipe, de ponta a ponta: a linha do dia precisa de largura ── */}
        <Painel titulo="Equipe agora" extra={<LegendaDoDia />} className="shrink-0">
          <div style={{ height: 34 + Math.max(equipe.length, 1) * 74 }} className="flex flex-col">
            {!carregado ? <div className="mx-6 flex-1 mb-6 rounded-[12px] shimmer" aria-busy="true" />
              : equipe.length === 0 ? <p className="px-6 text-[16px] text-t3">Nenhum corretor ativo.</p>
              : <EquipeAgora corretores={equipe} de={janelaDia.de} ate={janelaDia.ate} agora={agora} />}
          </div>
        </Painel>

        {/* ── A fila · o que acabou de acontecer · o funil · a chegada ──────── */}
        <div className="flex-1 min-h-0 grid gap-4" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.15fr) minmax(0, 0.8fr) minmax(0, 1fr)' }}>
          <Painel titulo="Fila do 1º contato" extra={prazoMin ? `prazo de ${prazoMin} min` : undefined}>
            {sala ? <FilaPrimeiroContato fila={fila} agora={agora} prazoMin={prazoMin} />
              : <div className="mx-6 flex-1 mb-6 rounded-[12px] shimmer" aria-busy="true" />}
          </Painel>
          <Painel titulo="Acabou de acontecer">
            <AoVivo feed={feed} nomes={nomes} carregado={carregado} />
          </Painel>
          <Painel titulo="Funil agora" extra={`${Object.values(funil).reduce((a, b) => a + b, 0).toLocaleString('pt-BR')} leads ativos`}>
            <FunilVivo porEtapa={funil} vendasNoMes={vgl ? vgl.vendasMes : null} />
          </Painel>
          <Painel titulo="Chegada de leads" extra="últimos 30 dias">
            {sala ? <ChegadaDeLeads serie={serie} /> : <div className="mx-6 flex-1 rounded-[12px] shimmer" aria-busy="true" />}
            <Resposta tempos={tempos} />
          </Painel>
        </div>
      </div>

      <SaleCelebration venda={celebracao} onFim={encerrarCelebracao} />
    </div>
  )
}
