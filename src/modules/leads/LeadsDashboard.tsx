import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import type { Lead, LeadFunnelStage } from '../../types'
import { STAGE_THEME } from '../../lib/stageTheme'
import { useAdminView } from '../../hooks/useAdminView'
import { useAuthStore } from '../../store/useAuthStore'
import { usePulseStore } from '../pulse/usePulseStore'
import { useLeadPauseStore } from '../../store/useLeadPauseStore'
import { useSlaConfigStore } from '../../store/useSlaConfigStore'
import { useLeadConfigStore } from '../../store/useLeadConfigStore'
import { pausaDe } from '../../lib/pausaLeads'
import { agruparFeed, horaCurta } from '../pulse/pulseEvents'
import type { PulseTone } from '../pulse/pulseEvents'
import type { PulseEvent } from '../pulse/types'
import { destacar } from '../../components/shared/Destaque'
import { FaixaNumeros, Segmentado } from '../../components/shared/visual'
import { Grafico, eixoCategoria, eixoValor, resolverCor } from '../../components/charts/Grafico'
import type { CoresGrafico } from '../../components/charts/Grafico'
import {
  ETAPAS_FUNIL, ORIGEM, atencao, estaAtivo, fraseDoCorretor, funilAgora, haQuanto, leadsPorDia,
  mediaSemHoje, prazoVencido, rotuloDia, DIAS_ESFRIANDO,
} from './dashboardLeads'
import {
  alertasDaSala, atividadePorHora, inicioDoPeriodo, janelaDoDia, producaoAte, qualidadePorOrigem,
  recebidosHoje, velocidadeDeResposta,
} from './monitorLeads'
import type { PeriodoMonitor, Producao } from './monitorLeads'
import { useMonitorLeads, useRegistrosDeOntem } from './useMonitorLeads'
import {
  AlertasDaSala, NumeroVivo, PainelDaEquipe, QualidadePorOrigem, Relogio, VelocidadeDeResposta,
} from './PainelMonitor'
import { DAILY_TARGETS } from '../../lib/metasConfig'
import type { LinhaEquipe } from './PainelMonitor'

/**
 * Leads › Dashboard — enxuto em 16/11/2026.
 *
 * Sala de comando: o que está acontecendo AGORA, sem precisar rolar nem abrir
 * nada. De cima para baixo, e nada repetido entre as partes:
 *   1. Agora      — cinco números do momento (chegada, espera, produção, prazo).
 *   2. Alertas    — só o que saiu do esperado agora (prazo vencido, corretor
 *                   parado no expediente); sem alerta, a faixa não existe.
 *   3. Equipe     — um PAINEL, uma linha por corretor: luz de estado (ativo,
 *                   parado, em pausa), a linha do dia (cada registro na hora em
 *                   que aconteceu, com o cursor do agora) e os números lado a
 *                   lado, com a meta (onde existe) e ontem ATÉ ESTA HORA.
 *   4. Ao vivo    — os registros da equipe num feed só, com filtro por
 *                   corretor; ao lado, compactos, leads por dia e o funil.
 *   5. Análise    — velocidade de resposta e qualidade por origem, por período.
 *
 * O que saiu, a pedido do Rafael: "próximo lead de" (e a leitura das roletas que
 * só existia para isso), o bloco separado "Roleta ao vivo" (o estado de cada
 * corretor foi para o quadro dele) e "Pede atenção" — as listas moram no
 * Kanban e na aba Followup; aqui ficam só as contagens, na faixa do topo.
 *
 * De onde vem cada coisa — e por que isso não pesa no banco:
 *   • Gráfico, funil, contagens e qualidade: dos leads que o `useLeadsStore` JÁ
 *     tem em memória (uma carga por sessão + realtime). Zero requisição nova.
 *   • Atividade dos corretores: do `usePulseStore` — UMA leitura agregada ao
 *     abrir (pulse_snapshot) e depois só INSERT pelo realtime, com listas de
 *     teto fixo. Ontem é uma chamada por sessão (pulse_resumo_dia).
 *   • Prazo de resposta: `useMonitorLeads` — uma leitura da trilha de
 *     distribuição ao abrir e depois só as linhas novas, quando um lead muda
 *     de mão.
 *   • Nenhum setInterval toca a rede: o único relógio da tela só reescreve
 *     "há 3 min" a cada 30 s, em JS puro.
 *
 * Escopo: o modelo de visão do admin (imobiliária · meu desempenho · corretor);
 * corretor comum vê só o próprio — a RPC e o realtime já respeitam a RLS.
 */

interface Props {
  leads: Lead[]
}

type Janela = '14' | '30' | '90'

/** Ícone do evento dentro de um disco tingido pelo tom — cor sempre com ícone. */
const TOM_DISCO: Record<PulseTone, string> = {
  neutral: 'bg-s2 text-t3',
  good:    'bg-info-bg text-info',
  warn:    'bg-warning-bg text-warning',
  win:     'bg-success-bg text-success',
}

/** Snapshot mais velho que isto é refeito ao abrir a aba (fora dela não há escuta). */
const SNAPSHOT_FRESCO_MS = 60_000
const LINHAS_AO_VIVO = 80
const DIA_MS = 86_400_000

export function LeadsDashboard({ leads }: Props) {
  const { effectiveBrokerId, isGlobalView } = useAdminView()
  const { isAdmin, profile, allProfiles, fetchAllProfiles } = useAuthStore()

  // Quem pausou o recebimento de leads: o admin recebe a de todos, o corretor
  // só a própria. Uma leitura pequena ao abrir a tela.
  const pausas         = useLeadPauseStore(s => s.pausas)
  const carregarPausas = useLeadPauseStore(s => s.carregar)
  useEffect(() => { void carregarPausas() }, [carregarPausas])
  const connection  = usePulseStore(s => s.connection)
  const erroPulso   = usePulseStore(s => s.erro)
  const carregado   = usePulseStore(s => s.ultimoSnapshotAt !== null)
  const feed        = usePulseStore(s => s.feed)
  const corretores  = usePulseStore(s => s.corretores)
  const brokerNames = usePulseStore(s => s.brokerNames)

  const resumoOntem = usePulseStore(s => s.resumoOntem)

  const [janela, setJanela] = useState<Janela>('30')
  const [periodo, setPeriodo] = useState<PeriodoMonitor>('hoje')
  const [agora, setAgora] = useState(() => Date.now())

  // Trilha de distribuição: quem recebeu cada lead e o que aconteceu com o prazo.
  const monitor = useMonitorLeads(leads)
  const slaConfig = useSlaConfigStore(s => s.config)
  const carregarSla = useSlaConfigStore(s => s.load)
  useEffect(() => { void carregarSla() }, [carregarSla])
  const itensConfig = useLeadConfigStore(s => s.items)

  // Ontem, para comparar a produção: uma chamada por sessão, depois do snapshot.
  useEffect(() => {
    if (carregado) void usePulseStore.getState().carregarResumoOntem()
  }, [carregado])

  // Uma leitura ao abrir + escuta só de INSERT enquanto a aba está aberta.
  useEffect(() => {
    const s = usePulseStore.getState()
    if (!s.ultimoSnapshotAt || Date.now() - s.ultimoSnapshotAt > SNAPSHOT_FRESCO_MS) void s.bootstrap('inicial')
    return s.subscribe()
  }, [])

  // Relógio local: só para "há 3 min" e para o prazo vencido. Não toca a rede.
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => { if (isAdmin && allProfiles.length === 0) void fetchAllProfiles() }, [isAdmin, allProfiles.length, fetchAllProfiles])

  const dias = Number(janela)
  const serie  = useMemo(() => leadsPorDia(leads, dias, new Date(agora)), [leads, dias, agora])
  const funil  = useMemo(() => funilAgora(leads, new Date(agora)), [leads, agora])
  const alerta = useMemo(() => atencao(leads, agora), [leads, agora])

  const media = mediaSemHoje(serie)

  const nomeCorretor = useCallback(
    (id?: string | null) => (id
      ? allProfiles.find(p => p.id === id)?.name ?? brokerNames[id] ?? (id === profile?.id ? profile.name : undefined)
      : undefined),
    [allProfiles, brokerNames, profile],
  )

  // ── Ontem ATÉ ESTA HORA ───────────────────────────────────────────────────
  // Comparar meio dia de hoje com o dia inteiro de ontem é injusto. A tela lê os
  // registros de ontem uma vez e conta só o que já tinha acontecido até esta
  // mesma hora. Prova antes de usar: a soma do dia inteiro contada aqui tem de
  // bater com o que o banco calculou (pulse_resumo_dia). Se não bater — regra
  // mudou no banco, leitura parcial —, volta para o dia inteiro e a legenda diz.
  const registrosDeOntem = useRegistrosDeOntem(carregado)
  const ontemAteAgora = useMemo<Map<string, Producao> | null>(() => {
    if (!registrosDeOntem || !resumoOntem) return null
    const cheio = producaoAte(registrosDeOntem, Infinity)
    const confere = resumoOntem.corretores.every(c => {
      const p = cheio.get(c.brokerId)
      return (p?.interacoes ?? 0) === c.interacoesHoje && (p?.ligacoes ?? 0) === c.ligacoesHoje
        && (p?.avancos ?? 0) === (c.avancosHoje ?? 0) && (p?.visitas ?? 0) === c.visitasHoje
    })
    return confere ? producaoAte(registrosDeOntem, agora - DIA_MS) : null
  }, [registrosDeOntem, resumoOntem, agora])

  /** A régua de ontem para um corretor: até esta hora se a prova passou, senão o dia inteiro. */
  const ontemDe = useCallback((id: string): Producao | undefined => {
    if (ontemAteAgora) return ontemAteAgora.get(id) ?? { interacoes: 0, ligacoes: 0, avancos: 0, visitas: 0 }
    const c = resumoOntem?.corretores.find(x => x.brokerId === id)
    return c ? { interacoes: c.interacoesHoje, ligacoes: c.ligacoesHoje, avancos: c.avancosHoje ?? 0, visitas: c.visitasHoje } : undefined
  }, [ontemAteAgora, resumoOntem])

  // Quem aparece no painel
  const quadros = useMemo(() => {
    const nome = (id: string) => nomeCorretor(id) ?? 'Corretor'
    let ids: string[]
    if (!isGlobalView) {
      ids = effectiveBrokerId ? [effectiveBrokerId] : []
    } else {
      const comAtividade = new Set(feed.map(e => e.brokerId).filter((x): x is string => !!x))
      const daEquipe = allProfiles.filter(p => p.active && p.role === 'broker').map(p => p.id)
      // Admin só ganha quadro no dia em que ele mesmo atendeu.
      const admins = allProfiles.filter(p => p.active && p.role === 'admin' && comAtividade.has(p.id)).map(p => p.id)
      ids = [...daEquipe, ...admins]
      if (ids.length === 0) ids = corretores.map(c => c.brokerId)
    }
    return ids.map(id => ({
      id, nome: nome(id),
      resumo: corretores.find(c => c.brokerId === id),
      ultimaAt: feed.find(e => e.brokerId === id)?.at ?? corretores.find(c => c.brokerId === id)?.ultimaAtividadeAt ?? null,
      // um traço por registro, na hora exata — a linha do dia
      marcas: feed.filter(e => e.brokerId === id).map(e => ({ t: new Date(e.at).getTime(), tom: fraseDoCorretor(e).tone })),
      ontem: ontemDe(id),
    }))
  }, [isGlobalView, effectiveBrokerId, allProfiles, nomeCorretor, feed, corretores, ontemDe])

  // A mesma janela de horas para todas as linhas: do expediente até agora,
  // esticando se alguém trabalhou antes ou depois.
  const janelaDia = useMemo(() => {
    const ids = new Set(quadros.map(q => q.id))
    return janelaDoDia(atividadePorHora(feed.filter(e => e.brokerId && ids.has(e.brokerId)), new Date(agora)), new Date(agora))
  }, [quadros, feed, agora])

  // ── Resposta aos leads HOJE, por corretor (vai dentro do quadro de cada um) ──
  const hoje = useMemo(() => {
    const inicio = inicioDoPeriodo('hoje', new Date(agora))
    const recebidos = monitor.atribuicoes ? recebidosHoje(monitor.atribuicoes, new Date(agora)) : null
    const v = monitor.atribuicoes
      ? velocidadeDeResposta(monitor.atribuicoes, new Map(leads.map(l => [l.id, l])), inicio, agora, slaConfig?.schedule ?? null)
      : null
    return { recebidos, velocidade: v }
  }, [monitor.atribuicoes, leads, agora, slaConfig])

  const esperaDe = useCallback((id: string) => {
    const meus = alerta.aguardandoPrimeiroContato.filter(l => l.brokerId === id)
    const vencidos = meus.filter(l => prazoVencido(l.slaDueAt!, agora)).length
    return { esperando: meus.length, vencidos }
  }, [alerta, agora])

  const linhasEquipe = useMemo<LinhaEquipe[]>(() => quadros.map(q => {
    const ultima = q.ultimaAt
    const ativo = estaAtivo(ultima, agora)
    const rec = hoje.recebidos?.get(q.id)
    const v = hoje.velocidade?.linhas.find(l => l.brokerId === q.id)
    const esp = esperaDe(q.id)
    return {
      id: q.id, nome: q.nome, ativo,
      status: ativo ? `Em atividade · ${haQuanto(ultima!, agora)}` : ultima ? `Última atividade ${haQuanto(ultima, agora)}` : 'Sem atividade hoje',
      pausa: pausaDe(pausas, q.id, agora),
      marcas: q.marcas,
      producao: [
        { rotulo: 'Atend.',   hoje: q.resumo?.interacoesHoje ?? 0, ontem: q.ontem?.interacoes },
        // a única meta diária por corretor que a casa tem combinada (metasConfig)
        { rotulo: 'Ligações', hoje: q.resumo?.ligacoesHoje ?? 0,   ontem: q.ontem?.ligacoes, meta: DAILY_TARGETS.ligacoes },
        { rotulo: 'Avanços',  hoje: q.resumo?.avancosHoje ?? 0,    ontem: q.ontem?.avancos },
        { rotulo: 'Visitas',  hoje: q.resumo?.visitasHoje ?? 0,    ontem: q.ontem?.visitas },
      ],
      leadsNovos: hoje.recebidos ? rec?.daRoleta ?? 0 : null,
      herdados: (rec?.porTransferencia ?? 0) + (rec?.manual ?? 0),
      prazo: v ? { noPrazo: v.noPrazo, comDesfecho: v.noPrazo + v.foraDoPrazo + v.perdidos, perdidos: v.perdidos } : null,
      esperando: esp.esperando, vencidos: esp.vencidos,
    }
  }), [quadros, agora, hoje, esperaDe, pausas])

  // ── Análise por período: velocidade de resposta e qualidade por origem ────
  const desde = useMemo(() => inicioDoPeriodo(periodo, new Date(agora)), [periodo, agora])
  const velocidade = useMemo(() => {
    if (!monitor.atribuicoes) return null
    const porId = new Map(leads.map(l => [l.id, l]))
    const v = velocidadeDeResposta(monitor.atribuicoes, porId, desde, agora, slaConfig?.schedule ?? null)
    // Fora da visão global, só a linha de quem está sendo olhado.
    if (!isGlobalView) {
      const minha = v.linhas.filter(l => l.brokerId === effectiveBrokerId)
      return { linhas: minha, total: minha[0] ?? v.total }
    }
    return v
  }, [monitor.atribuicoes, leads, desde, agora, slaConfig, isGlobalView, effectiveBrokerId])

  const origens = useMemo(() => qualidadePorOrigem(leads, desde), [leads, desde])
  const rotuloOrigem = useCallback(
    (slug: string) => itensConfig.find(i => i.type === 'origin' && i.slug === slug)?.label ?? ORIGEM[slug] ?? slug,
    [itensConfig],
  )
  const rotuloMotivo = useCallback(
    (slug: string) => itensConfig.find(i => i.type === 'discard_reason' && i.slug === slug)?.label ?? slug.replace(/_/g, ' '),
    [itensConfig],
  )


  // ── Barra de comando: o último registro de quem está na tela ──────────────
  const idsNaTela = new Set(quadros.map(q => q.id))
  const ultimoEv = feed.find(e => e.brokerId && idsNaTela.has(e.brokerId))
  const ultimoSinal = ultimoEv ? { id: ultimoEv.id, at: ultimoEv.at, quem: nomeCorretor(ultimoEv.brokerId)?.split(' ')[0] } : null

  // ── Alertas por exceção ──────────────────────────────────────────────────
  const alertas = alertasDaSala({
    agora, agenda: slaConfig?.schedule ?? null,
    corretores: carregado ? quadros.map(q => ({ id: q.id, nome: q.nome, ultimaAtividadeAt: q.ultimaAt, emPausa: !!pausaDe(pausas, q.id, agora) })) : [],
    esperando: alerta.aguardandoPrimeiroContato.map(l => ({ id: l.id, nome: l.name, corretor: nomeCorretor(l.brokerId), slaDueAt: l.slaDueAt! })),
  })

  // ── Faixa do topo: o momento em cinco números ────────────────────────────
  const leadsHoje = serie[serie.length - 1]?.n ?? 0
  const vencidosAgora = alerta.aguardandoPrimeiroContato.filter(l => prazoVencido(l.slaDueAt!, agora)).length
  const atendimentosHoje = quadros.reduce((t, q) => t + (q.resumo?.interacoesHoje ?? 0), 0)
  const atendimentosOntem = resumoOntem ? quadros.reduce((t, q) => t + (q.ontem?.interacoes ?? 0), 0) : null
  const rotuloOntem = ontemAteAgora ? 'ontem a esta hora' : 'ontem, o dia todo'
  const prazoHoje = !hoje.velocidade ? null
    : isGlobalView ? hoje.velocidade.total
    : hoje.velocidade.linhas.find(l => l.brokerId === effectiveBrokerId) ?? null
  const comDesfechoHoje = prazoHoje ? prazoHoje.noPrazo + prazoHoje.foraDoPrazo + prazoHoje.perdidos : 0

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* ── Barra de comando: ao vivo, a hora e o último sinal da equipe ─────── */}
      <div className="flex items-center justify-between gap-x-4 gap-y-2 flex-wrap">
        <div className="flex items-center gap-4">
          <Conexao estado={connection} carregado={carregado} />
          <Relogio />
        </div>
        {ultimoSinal && (
          <p className="text-[12.5px] text-t3 truncate" key={ultimoSinal.id}>
            Último registro <span className="text-t1 font-medium">{haQuanto(ultimoSinal.at, agora)}</span>
            {ultimoSinal.quem && <> · {ultimoSinal.quem}</>}
          </p>
        )}
      </div>

      <AlertasDaSala alertas={alertas} />

      <FaixaNumeros itens={[
        {
          rotulo: 'Leads hoje',
          valor: <NumeroVivo valor={leadsHoje} />,
          nota: media === null ? undefined : `média de ${media.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} por dia`,
        },
        {
          rotulo: 'Esperando 1º contato',
          valor: <NumeroVivo valor={alerta.aguardandoPrimeiroContato.length} />,
          tom: vencidosAgora > 0 ? 'text-error' : alerta.aguardandoPrimeiroContato.length > 0 ? 'text-warning' : 'text-t1',
          nota: vencidosAgora > 0 ? `${vencidosAgora} com o prazo vencido`
            : alerta.aguardandoPrimeiroContato.length > 0 ? 'todos dentro do prazo' : 'todo lead novo já foi chamado',
        },
        {
          rotulo: 'Atendimentos hoje',
          valor: carregado ? <NumeroVivo valor={atendimentosHoje} /> : '—',
          nota: atendimentosOntem === null ? undefined : `${rotuloOntem}: ${atendimentosOntem.toLocaleString('pt-BR')}`,
        },
        {
          rotulo: 'No prazo hoje',
          valor: !prazoHoje || comDesfechoHoje === 0 ? '—' : <NumeroVivo valor={`${prazoHoje.noPrazo} de ${comDesfechoHoje}`} />,
          tom: prazoHoje && prazoHoje.perdidos > 0 ? 'text-warning' : 'text-t1',
          nota: !prazoHoje ? undefined
            : prazoHoje.perdidos > 0 ? `${prazoHoje.perdidos} ${prazoHoje.perdidos === 1 ? 'lead perdido' : 'leads perdidos'} por prazo`
            : comDesfechoHoje === 0 ? 'nenhum prazo venceu ou foi cumprido' : 'nenhum lead perdido por prazo',
        },
        {
          rotulo: `Sem contato há ${DIAS_ESFRIANDO} dias ou mais`,
          valor: <NumeroVivo valor={alerta.esfriando.length} />,
          nota: 'em atendimento, visita ou proposta',
        },
      ]} />

      {monitor.erro && <AvisoDeAtraso erro={monitor.erro} temDados={monitor.atribuicoes !== null} onTentar={() => void monitor.recarregar()} />}


      {/* ── Equipe agora: o painel ──────────────────────────────────────────── */}
      <section>
        <div className="flex items-end justify-between gap-x-4 gap-y-1 flex-wrap">
          <Titulo>Equipe *agora*</Titulo>
          <LegendaDaLinha ontem={!resumoOntem ? null : ontemAteAgora ? '"ontem" conta até esta hora' : '"ontem" é o dia todo'} />
        </div>

        {erroPulso && !carregado ? (
          <div className="flex items-start gap-3 rounded-[14px] border border-error-line bg-error-bg px-4 py-3.5" role="alert">
            <AlertTriangle size={16} strokeWidth={1.8} className="text-error flex-shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-error">Não foi possível carregar a atividade da equipe</p>
              <p className="text-[13px] text-t2 mt-0.5 break-words">{erroPulso}</p>
            </div>
            <button type="button" onClick={() => void usePulseStore.getState().bootstrap('inicial')}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] text-[13px] font-semibold text-error hover:bg-surface cursor-pointer flex-shrink-0">
              <RefreshCw size={14} strokeWidth={1.8} aria-hidden /> Tentar de novo
            </button>
          </div>
        ) : !carregado ? (
          <div className="bento h-[220px] animate-pulse" aria-busy="true" />
        ) : quadros.length === 0 ? (
          <p className="text-[14px] text-t3 py-6">Nenhum corretor ativo para mostrar.</p>
        ) : (
          <PainelDaEquipe linhas={linhasEquipe} de={janelaDia.de} ate={janelaDia.ate} agora={agora} />
        )}
      </section>

      {/* ── Ao vivo (feed único) + chegada compacta (leads por dia e funil) ──── */}
      <div className="mt-3 grid grid-cols-1 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-5">
        <RegistrosAoVivo corretores={quadros} feed={feed} carregado={carregado} />

        <div className="flex flex-col gap-5 min-w-0">
          <section className="bento p-5 min-w-0">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <Titulo>Leads por *dia*</Titulo>
              <Segmentado
                rotulo="Janela do gráfico"
                valor={janela}
                onChange={setJanela}
                opcoes={[
                  { value: '14' as const, label: '14 dias' },
                  { value: '30' as const, label: '30 dias' },
                  { value: '90' as const, label: '90 dias' },
                ]}
              />
            </div>
            <GraficoLeads serie={serie} media={media} altura={176} />
          </section>

          <section className="bento p-5 min-w-0 flex flex-col">
            <Titulo descricao={`${funil.ativos.toLocaleString('pt-BR')} leads ativos.`}>Funil *agora*</Titulo>
            <FunilDesenhado porEtapa={funil.porEtapa} vendasNoMes={funil.vendasNoMes} />
          </section>
        </div>
      </div>

      {/* ── Velocidade de resposta + qualidade por origem ───────────────────── */}
      <section className="mt-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <Titulo>Resposta e *qualidade*</Titulo>
          <Segmentado
            rotulo="Período da resposta e da qualidade"
            valor={periodo}
            onChange={setPeriodo}
            opcoes={[
              { value: 'hoje' as const, label: 'Hoje' },
              { value: '7' as const,    label: '7 dias' },
              { value: '30' as const,   label: '30 dias' },
            ]}
          />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <article className="bento p-5 lg:p-6 min-w-0">
            <h4 className="text-[14.5px] font-semibold text-t1">Velocidade de resposta</h4>
            <p className="text-[12.5px] text-t3 mt-0.5 mb-4">Do recebimento do lead ao 1º contato no WhatsApp, em minutos úteis.</p>
            {velocidade === null ? (
              monitor.erro
                ? <p className="text-[13.5px] text-t4 py-6">Sem dados para mostrar — veja o aviso acima.</p>
                : <div className="h-[160px] rounded-[12px] shimmer" aria-busy="true" />
            ) : (
              <VelocidadeDeResposta linhas={velocidade.linhas} total={velocidade.total}
                                    nome={id => nomeCorretor(id) ?? 'Corretor'}
                                    minutosPrazo={slaConfig?.minutes ?? null} />
            )}
          </article>

          <article className="bento p-5 lg:p-6 min-w-0">
            <h4 className="text-[14.5px] font-semibold text-t1">Qualidade por origem</h4>
            <p className="text-[12.5px] text-t3 mt-0.5 mb-4">Onde está hoje cada lead que chegou no período.</p>
            <QualidadePorOrigem linhas={origens} rotuloOrigem={rotuloOrigem} rotuloMotivo={rotuloMotivo} />
          </article>
        </div>
      </section>

    </div>
  )
}

/** A leitura do banco falhou: diz isso e, se há números na tela, que podem estar atrasados. */
function AvisoDeAtraso({ erro, temDados, onTentar }: { erro: string; temDados: boolean; onTentar: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-[14px] border border-error-line bg-error-bg px-4 py-3" role="alert">
      <AlertTriangle size={16} strokeWidth={1.8} className="text-error flex-shrink-0 mt-0.5" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-error">
          {temDados ? 'Os números de prazo de resposta podem estar atrasados' : 'Não foi possível ler a distribuição dos leads'}
        </p>
        <p className="text-[13px] text-t2 mt-0.5 break-words">{erro}</p>
      </div>
      <button type="button" onClick={onTentar}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] text-[13px] font-semibold text-error hover:bg-surface cursor-pointer flex-shrink-0">
        <RefreshCw size={14} strokeWidth={1.8} aria-hidden /> Tentar de novo
      </button>
    </div>
  )
}

// ─── Peças pequenas ───────────────────────────────────────────────────────────

function Titulo({ children, descricao }: { children: string; descricao?: string }) {
  return (
    <div className="mb-4 min-w-0">
      <h3 className="font-display text-[16px] font-bold tracking-[-0.015em] text-t1">{destacar(children)}</h3>
      {descricao && <p className="text-[13px] text-t3 mt-0.5">{descricao}</p>}
    </div>
  )
}

function Conexao({ estado, carregado }: { estado: string; carregado: boolean }) {
  const [rotulo, cor, pulsa] =
    estado === 'live' && carregado ? ['Ao vivo', 'bg-success', true]
    : estado === 'reconnecting'    ? ['Reconectando — os números podem estar atrasados', 'bg-warning', false]
    : estado === 'error'           ? ['Sem atualização ao vivo', 'bg-error', false]
    : ['Conectando', 'bg-t4', false] as const
  return (
    <span className="inline-flex items-center gap-2 h-7 px-3 rounded-full bg-s2 text-[12.5px] font-medium text-t2" role="status">
      <span className={`w-2 h-2 rounded-full ${cor} ${pulsa ? 'pulse-live-dot' : ''}`} aria-hidden />
      {rotulo}
    </span>
  )
}

// ─── Gráfico de leads por dia ─────────────────────────────────────────────────

function GraficoLeads({ serie, media, altura }: { serie: { data: string; n: number }[]; media: number | null; altura: number }) {
  const opcao = useCallback((t: CoresGrafico) => {
    const ultimo = serie.length - 1
    const neutro = resolverCor('var(--stage-lead)')
    return {
      grid: { left: 4, right: 12, top: 28, bottom: 4, containLabel: true },
      legend: { show: false },
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'shadow' },
        valueFormatter: (v: number) => `${v} ${v === 1 ? 'lead' : 'leads'}`,
      },
      xAxis: eixoCategoria(t, serie.map((p, i) => rotuloDia(p.data, i === ultimo))),
      yAxis: eixoValor(t, undefined, { minInterval: 1 }),
      series: [{
        name: 'Leads recebidos', type: 'bar', barMaxWidth: 30,
        // Hoje é a única barra dourada: é o dia que ainda está acontecendo.
        data: serie.map((p, i) => ({
          value: p.n,
          itemStyle: { color: i === ultimo ? t.marca : neutro, opacity: i === ultimo ? 1 : 0.42, borderRadius: [6, 6, 0, 0] },
        })),
        label: {
          show: serie.length <= 16, position: 'top', color: t.texto, fontSize: 11, fontWeight: 600,
          formatter: (p: { value: number }) => (p.value > 0 ? String(p.value) : ''),
        },
        markLine: media === null ? undefined : {
          silent: true, symbol: 'none',
          lineStyle: { color: t.textoFraco, type: 'dashed', width: 1 },
          label: { formatter: `média ${media.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}`, color: t.textoFraco, fontSize: 11, position: 'insideEndTop' },
          data: [{ yAxis: media }],
        },
      }],
    }
  }, [serie, media])

  const total = serie.reduce((s, p) => s + p.n, 0)
  return (
    <Grafico
      altura={altura}
      opcao={opcao}
      rotulo={`Leads recebidos por dia nos últimos ${serie.length} dias: ${total} no total, ${serie[serie.length - 1]?.n ?? 0} hoje.`}
    />
  )
}

// ─── Funil desenhado ──────────────────────────────────────────────────────────

/**
 * O funil é uma FORMA, não um gráfico de proporção: com 105 leads em followup
 * e 1 em proposta, barras proporcionais virariam um traço. A silhueta afunila
 * por posição; cada fatia leva a cor da etapa, o nome e o número DENTRO dela.
 * Preenchimento tingido (não sólido) para o texto ler igual nos dois temas.
 */
function FunilDesenhado({ porEtapa, vendasNoMes }: { porEtapa: Record<LeadFunnelStage, number>; vendasNoMes: number }) {
  const L = 300, H = 52, VAO = 5, PASSO = 32
  const linhas = ETAPAS_FUNIL.map(e => ({
    etapa: e,
    nome: e === 'venda' ? 'Vendas no mês' : STAGE_THEME[e].columnLabel,
    n: e === 'venda' ? vendasNoMes : porEtapa[e],
    cor: STAGE_THEME[e].solidVar,
  }))
  const altura = linhas.length * (H + VAO) - VAO

  return (
    <div className="flex justify-center my-auto">
      <svg viewBox={`0 0 ${L} ${altura}`} className="w-full max-w-[290px] h-auto" role="img"
           aria-label={`Funil agora: ${linhas.map(l => `${l.nome} ${l.n}`).join(', ')}.`}>
        {linhas.map((l, i) => {
          const y = i * (H + VAO)
          const topo = L - i * PASSO, base = L - (i + 1) * PASSO
          const pontos = [
            [(L - topo) / 2, y], [(L + topo) / 2, y], [(L + base) / 2, y + H], [(L - base) / 2, y + H],
          ].map(p => p.join(',')).join(' ')
          return (
            <g key={l.etapa}>
              <polygon points={pontos} strokeWidth={1.5} strokeLinejoin="round"
                style={{ fill: `color-mix(in srgb, ${l.cor} 22%, transparent)`, stroke: l.cor }} />
              <text x={L / 2} y={y + 21} textAnchor="middle" style={{ fill: 'var(--t2)', fontSize: 11.5 }}>{l.nome}</text>
              <text x={L / 2} y={y + 41} textAnchor="middle" className="font-display tabular-nums"
                style={{ fill: 'var(--t1)', fontSize: 18, fontWeight: 800 }}>
                {l.n.toLocaleString('pt-BR')}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ─── Quadro de atividade de um corretor ───────────────────────────────────────

// ─── Registros ao vivo ────────────────────────────────────────────────────────

/**
 * Tudo que a equipe registrou hoje, num feed só, do mais recente para o mais
 * antigo — para saber "o que acabou de acontecer" sem varrer uma coluna por
 * corretor. O filtro mostra um corretor de cada vez. Linha nova entra sozinha.
 */
function RegistrosAoVivo({ corretores, feed, carregado }: {
  corretores: { id: string; nome: string }[]
  feed: PulseEvent[]
  carregado: boolean
}) {
  const [filtro, setFiltro] = useState<string | null>(null)
  const ativo = corretores.some(c => c.id === filtro) ? filtro : null
  const nomes = useMemo(() => new Map(corretores.map(c => [c.id, c.nome.split(' ')[0]])), [corretores])
  const eventos = useMemo(
    () => agruparFeed(feed.filter(e => e.brokerId && (ativo ? e.brokerId === ativo : nomes.has(e.brokerId)))).slice(0, LINHAS_AO_VIVO),
    [feed, ativo, nomes],
  )

  return (
    <section className="bento flex flex-col min-w-0 overflow-hidden">
      <header className="flex items-center justify-between gap-3 flex-wrap px-5 lg:px-6 pt-4 pb-3 border-b border-line">
        <h3 className="font-display text-[16px] font-bold tracking-[-0.015em] text-t1">{destacar('Registros *ao vivo*')}</h3>
        {corretores.length > 1 && (
          <Segmentado
            rotulo="Filtrar registros por corretor"
            valor={ativo}
            onChange={setFiltro}
            opcoes={[{ value: null, label: 'Todos' }, ...corretores.map(c => ({ value: c.id as string | null, label: nomes.get(c.id) ?? c.nome }))]}
          />
        )}
      </header>

      {/* ocupa a altura da coluna ao lado; no celular, uma janela fixa */}
      <div className="flex-1 basis-0 min-h-[420px] overflow-y-auto overscroll-contain">
        {!carregado ? (
          <div className="m-5 h-40 rounded-[12px] shimmer" aria-busy="true" />
        ) : eventos.length === 0 ? (
          <p className="text-[13.5px] text-t4 px-5 py-12 text-center">Nenhum registro hoje ainda.</p>
        ) : (
          <ul className="py-2" aria-live="polite" aria-label="Registros da equipe hoje">
            {eventos.map(ev => {
              const v = fraseDoCorretor(ev)
              const Icone = v.icon
              return (
                <li key={ev.id} className="flex items-start gap-3 px-5 lg:px-6 py-2 pulse-item-in">
                  <span className="w-[42px] flex-shrink-0 pt-[5px] text-[12px] text-t4 tabular-nums">{horaCurta(ev.at)}</span>
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${TOM_DISCO[v.tone]}`} aria-hidden>
                    <Icone size={14} strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1 pt-[3px]">
                    <span className="block text-[14px] text-t1 leading-snug">
                      {!ativo && ev.brokerId && <span className="font-semibold">{nomes.get(ev.brokerId)} · </span>}
                      {v.texto}
                    </span>
                    {v.detalhe && <span className="block text-[12.5px] text-t3 truncate mt-0.5">{v.detalhe}</span>}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

/** O que cada cor de traço quer dizer na linha do dia — quatro palavras, sem caixa. */
function LegendaDaLinha({ ontem }: { ontem: string | null }) {
  const itens: [string, string][] = [
    ['var(--info)', 'contato'],
    ['var(--success)', 'interesse ou visita'],
    ['var(--warning)', 'descarte'],
    ['var(--t3)', 'anotação'],
  ]
  return (
    <ul className="mb-4 hidden sm:flex items-center gap-x-4 text-[12px] text-t3" aria-label="Cores da linha do dia">
      {itens.map(([cor, nome]) => (
        <li key={nome} className="flex items-center gap-1.5">
          <span className="h-3 w-[3px] rounded-full" style={{ background: cor }} aria-hidden /> {nome}
        </li>
      ))}
      {/* qual é a régua do "ontem" embaixo de cada número */}
      {ontem && <li className="pl-4 border-l border-line text-t4">{ontem}</li>}
    </ul>
  )
}
