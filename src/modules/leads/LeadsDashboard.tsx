import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronRight, RefreshCw, Snowflake, Timer } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Lead, LeadFunnelStage, LeadPause } from '../../types'
import { STAGE_THEME } from '../../lib/stageTheme'
import { useAdminView } from '../../hooks/useAdminView'
import { useAuthStore } from '../../store/useAuthStore'
import { usePulseStore } from '../pulse/usePulseStore'
import { useLeadPauseStore } from '../../store/useLeadPauseStore'
import { useSlaConfigStore } from '../../store/useSlaConfigStore'
import { useLeadConfigStore } from '../../store/useLeadConfigStore'
import { horaDaVolta, pausaDe } from '../../lib/pausaLeads'
import { agruparFeed, horaCurta } from '../pulse/pulseEvents'
import type { PulseTone } from '../pulse/pulseEvents'
import type { PulseBroker, PulseEvent } from '../pulse/types'
import { destacar } from '../../components/shared/Destaque'
import { Segmentado } from '../../components/shared/visual'
import { Grafico, eixoCategoria, eixoValor, resolverCor } from '../../components/charts/Grafico'
import type { CoresGrafico } from '../../components/charts/Grafico'
import {
  ETAPAS_FUNIL, ORIGEM, atencao, estaAtivo, fraseDoCorretor, funilAgora, haQuanto, leadsPorDia,
  mediaSemHoje, prazoVencido, rotuloDia, textoDoPrazo, DIAS_ESFRIANDO,
} from './dashboardLeads'
import {
  atividadePorHora, inicioDoPeriodo, proximoDeCadaRoleta, qualidadePorOrigem, recebidosHoje,
  velocidadeDeResposta,
} from './monitorLeads'
import type { PeriodoMonitor } from './monitorLeads'
import { useMonitorLeads } from './useMonitorLeads'
import {
  LegendaVelocidade, NumeroVivo, QualidadePorOrigem, RitmoDoDia, RoletaAoVivo, VelocidadeDeResposta,
} from './PainelMonitor'
import type { CartaoRoleta } from './PainelMonitor'

/**
 * Leads › Dashboard — refeito em 15/11/2026.
 *
 * A tela responde, nesta ordem: quanto está chegando e onde os leads estão
 * (gráfico + funil), o que a equipe está fazendo neste momento (atividade por
 * corretor, ao vivo) e o que não pode esperar.
 *
 * 16/11/2026 — monitoramento ao vivo: roleta (para quem vai o próximo lead e
 * quem está em pausa), velocidade de resposta por corretor, qualidade por
 * origem, ritmo do dia e a comparação com ontem em cada quadro de atividade.
 *
 * De onde vem cada coisa — e por que isso não pesa no banco:
 *   • Roleta e velocidade: `useMonitorLeads` — uma leitura ao abrir e depois só
 *     as linhas novas da trilha de distribuição, quando um lead muda de mão.
 *   • Qualidade por origem e ritmo do dia: dos dados já em memória.
 *   • Ontem: uma chamada por sessão (`pulse_resumo_dia`).
 *   • Gráfico, funil e atenção: dos leads que o `useLeadsStore` JÁ tem em
 *     memória (uma carga por sessão + realtime). Zero requisição nova.
 *   • Atividade dos corretores: do `usePulseStore` — UMA leitura agregada ao
 *     abrir (pulse_snapshot) e depois só INSERT pelo realtime, com listas de
 *     teto fixo. É a mesma estrutura do Pulse, que roda 12 h por dia.
 *   • Nenhum setInterval toca a rede: o único relógio da tela só reescreve
 *     "há 3 min" a cada 30 s, em JS puro.
 *
 * Escopo: o modelo de visão do admin (imobiliária · meu desempenho · corretor);
 * corretor comum vê só o próprio — a RPC e o realtime já respeitam a RLS.
 */

interface Props {
  leads: Lead[]
  onOpenLead: (lead: Lead) => void
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
const LINHAS_POR_CORRETOR = 40
const LINHAS_DE_ATENCAO = 6

export function LeadsDashboard({ leads, onOpenLead }: Props) {
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

  // Trilha de distribuição e roletas (só o admin lê as roletas).
  const monitor = useMonitorLeads(leads, isAdmin)
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

  // Quem aparece nos quadros de atividade
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
      eventos: agruparFeed(feed.filter(e => e.brokerId === id)).slice(0, LINHAS_POR_CORRETOR),
      horas: atividadePorHora(feed.filter(e => e.brokerId === id), new Date(agora)),
      ontem: resumoOntem?.corretores.find(c => c.brokerId === id),
    }))
  }, [isGlobalView, effectiveBrokerId, allProfiles, nomeCorretor, feed, corretores, resumoOntem, agora])

  // ── Roleta ao vivo ────────────────────────────────────────────────────────
  const cartoesRoleta = useMemo<CartaoRoleta[]>(() => {
    const { atribuicoes, roleta } = monitor
    if (!atribuicoes) return []
    const ativo = (id: string) => allProfiles.find(p => p.id === id)?.active ?? id === profile?.id
    const emPausa = (id: string) => !!pausaDe(pausas, id, agora)
    const recebidos = recebidosHoje(atribuicoes, new Date(agora))

    const naRoleta = new Set<string>()
    const proximoEm = new Map<string, Set<string>>()
    if (roleta) {
      for (const id of roleta.geral.brokerIds) naRoleta.add(id)
      for (const f of roleta.formularios) if (f.active) for (const id of f.brokerIds) naRoleta.add(id)
      for (const p of proximoDeCadaRoleta(roleta, ativo, emPausa)) {
        if (!p.brokerId) continue
        // Vários formulários levam o mesmo nome de produto: o selo aparece uma vez.
        const s = proximoEm.get(p.brokerId) ?? new Set<string>()
        s.add(p.nome)
        proximoEm.set(p.brokerId, s)
      }
    }

    let ids: string[]
    if (!isGlobalView) ids = effectiveBrokerId ? [effectiveBrokerId] : []
    else if (roleta) {
      const daEquipe = allProfiles.filter(p => p.active && p.role === 'broker').map(p => p.id)
      ids = [...new Set([...roleta.geral.brokerIds, ...naRoleta, ...daEquipe])].filter(ativo)
    } else ids = []

    return ids.map(id => {
      const esperando = alerta.aguardandoPrimeiroContato.filter(l => l.brokerId === id)
      const vencidos = esperando.filter(l => prazoVencido(l.slaDueAt!, agora)).length
      return {
        id, nome: nomeCorretor(id) ?? 'Corretor',
        naRoleta: naRoleta.has(id),
        pausa: pausaDe(pausas, id, agora),
        recebidos: recebidos.get(id),
        aguardando: esperando.length - vencidos,
        vencidos,
        // "Roleta geral" primeiro: é a que decide o próximo lead sem formulário.
        proximoEm: roleta ? [...(proximoEm.get(id) ?? [])].sort((a, b) => Number(b === 'Roleta geral') - Number(a === 'Roleta geral')) : null,
      }
    })
  }, [monitor, allProfiles, profile, pausas, agora, isGlobalView, effectiveBrokerId, alerta, nomeCorretor])

  const proximoGeral = cartoesRoleta.find(c => c.proximoEm?.includes('Roleta geral'))

  // ── Velocidade de resposta e qualidade por origem ─────────────────────────
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


  return (
    <div className="flex flex-col gap-5 pb-10">

      {/* ── Gráfico grande + funil ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-5">
        <section className="bento p-5 lg:p-6 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <Titulo descricao="Todo lead que entrou, inclusive os já descartados. Atualiza sozinho.">
              Leads recebidos por *dia*
            </Titulo>
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
          <GraficoLeads serie={serie} media={media} />
        </section>

        <section className="bento p-5 lg:p-6 min-w-0 flex flex-col">
          <Titulo descricao={`${funil.ativos.toLocaleString('pt-BR')} leads ativos no funil.`}>
            Funil *agora*
          </Titulo>
          <FunilDesenhado porEtapa={funil.porEtapa} vendasNoMes={funil.vendasNoMes} />
        </section>
      </div>

      {/* ── Roleta ao vivo ──────────────────────────────────────────────────── */}
      <section className="mt-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <Titulo descricao={
            !isAdmin ? 'Seu recebimento de leads hoje.'
            : proximoGeral ? `O próximo lead sem formulário próprio vai para ${proximoGeral.nome.split(' ')[0]}. Os selos mostram quem é o próximo em cada formulário.`
            : 'Quem está recebendo, quem está em pausa e para quem vai o próximo lead.'
          }>
            Roleta *ao vivo*
          </Titulo>
          <Conexao estado={connection} carregado={carregado} />
        </div>
        {monitor.erro && <AvisoDeAtraso erro={monitor.erro} temDados={monitor.atribuicoes !== null} onTentar={() => void monitor.recarregar()} />}
        {monitor.atribuicoes === null ? (
          !monitor.erro && <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5" aria-busy="true">
            {[0, 1, 2].map(i => <div key={i} className="bento h-[190px] animate-pulse" />)}
          </div>
        ) : cartoesRoleta.length === 0 ? (
          <p className="text-[14px] text-t3 py-4">Nenhum corretor ativo nas roletas.</p>
        ) : (
          <RoletaAoVivo cartoes={cartoesRoleta} agora={agora} />
        )}
      </section>

      {/* ── Atividade por corretor, ao vivo ─────────────────────────────────── */}
      <section className="mt-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <Titulo descricao="O que cada corretor fez hoje no sistema, hora a hora, e como está em relação a ontem. As linhas novas entram sozinhas.">
            Atividade da *equipe*
          </Titulo>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5" aria-busy="true">
            {[0, 1].map(i => <div key={i} className="bento h-[420px] animate-pulse" />)}
          </div>
        ) : quadros.length === 0 ? (
          <p className="text-[14px] text-t3 py-6">Nenhum corretor ativo para mostrar.</p>
        ) : (
          <div className={`grid grid-cols-1 gap-5 ${quadros.length === 2 ? 'md:grid-cols-2' : quadros.length >= 3 ? 'md:grid-cols-2 xl:grid-cols-3' : ''}`}>
            {quadros.map(q => (
              <QuadroCorretor key={q.id} nome={q.nome} resumo={q.resumo} eventos={q.eventos} agora={agora}
                              pausa={pausaDe(pausas, q.id, agora)} horas={q.horas} ontem={q.ontem} />
            ))}
          </div>
        )}
      </section>

      {/* ── Velocidade de resposta + qualidade por origem ───────────────────── */}
      <section className="mt-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <Titulo descricao="Quem atende no prazo e de onde vêm os leads que avançam. Muda sozinho a cada lead e a cada contato.">
            Resposta e *qualidade*
          </Titulo>
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
            <p className="text-[12.5px] text-t3 mt-0.5 mb-4">Do momento em que o corretor recebe o lead até o 1º contato no WhatsApp.</p>
            {velocidade === null ? (
              monitor.erro
                ? <p className="text-[13.5px] text-t4 py-6">Sem dados para mostrar — veja o aviso acima.</p>
                : <div className="h-[160px] rounded-[12px] shimmer" aria-busy="true" />
            ) : (
              <>
                <VelocidadeDeResposta linhas={velocidade.linhas} total={velocidade.total}
                                      nome={id => nomeCorretor(id) ?? 'Corretor'}
                                      minutosPrazo={slaConfig?.minutes ?? null} />
                {velocidade.total.recebidos > 0 && <LegendaVelocidade />}
              </>
            )}
          </article>

          <article className="bento p-5 lg:p-6 min-w-0">
            <h4 className="text-[14.5px] font-semibold text-t1">Qualidade por origem</h4>
            <p className="text-[12.5px] text-t3 mt-0.5 mb-4">Onde está hoje cada lead que chegou no período, por produto e origem.</p>
            <QualidadePorOrigem linhas={origens} rotuloOrigem={rotuloOrigem} rotuloMotivo={rotuloMotivo} />
          </article>
        </div>
      </section>

      <PedeAtencao alerta={alerta} agora={agora} onOpenLead={onOpenLead} nomeCorretor={nomeCorretor} />
    </div>
  )
}

/** A leitura do banco falhou: diz isso e, se há números na tela, que podem estar atrasados. */
function AvisoDeAtraso({ erro, temDados, onTentar }: { erro: string; temDados: boolean; onTentar: () => void }) {
  return (
    <div className="mb-4 flex items-start gap-3 rounded-[14px] border border-error-line bg-error-bg px-4 py-3" role="alert">
      <AlertTriangle size={16} strokeWidth={1.8} className="text-error flex-shrink-0 mt-0.5" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-error">
          {temDados ? 'A roleta e a velocidade de resposta podem estar atrasadas' : 'Não foi possível ler a distribuição dos leads'}
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

function GraficoLeads({ serie, media }: { serie: { data: string; n: number }[]; media: number | null }) {
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
          show: serie.length <= 31, position: 'top', color: t.texto, fontSize: 11, fontWeight: 600,
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
      altura={340}
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
      <svg viewBox={`0 0 ${L} ${altura}`} className="w-full max-w-[360px] h-auto" role="img"
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

function QuadroCorretor({ nome, resumo, eventos, agora, pausa, horas, ontem }: {
  nome: string
  resumo?: PulseBroker
  eventos: PulseEvent[]
  agora: number
  /** recebimento de leads pausado (migração 089) */
  pausa?: LeadPause
  /** registros de hoje por hora (0–23) */
  horas: number[]
  /** o dia de ontem inteiro, para comparar; undefined enquanto não carregou */
  ontem?: PulseBroker
}) {
  const ultima = eventos[0]?.at ?? resumo?.ultimaAtividadeAt ?? null
  const ativo = estaAtivo(ultima, agora)
  const numeros: [number, string, number | undefined][] = [
    [resumo?.interacoesHoje ?? 0, 'Atendimentos', ontem?.interacoesHoje],
    [resumo?.ligacoesHoje ?? 0, 'Ligações', ontem?.ligacoesHoje],
    [resumo?.avancosHoje ?? 0, 'Avanços', ontem?.avancosHoje],
    [resumo?.visitasHoje ?? 0, 'Visitas', ontem?.visitasHoje],
  ]

  return (
    <article className="bento flex flex-col min-w-0 overflow-hidden">
      <header className="flex items-center gap-3.5 px-5 lg:px-6 pt-5 pb-4">
        <span className="relative flex-shrink-0" aria-hidden>
          <span className="w-11 h-11 rounded-full bg-brand-fill text-brand-fill-text flex items-center justify-center text-[16px] font-bold">
            {nome.charAt(0).toUpperCase()}
          </span>
          {ativo && <span className="absolute -right-0.5 -bottom-0.5 w-3.5 h-3.5 rounded-full bg-success border-2 border-surface pulse-live-dot" />}
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="font-display text-[16px] font-bold tracking-[-0.015em] text-t1 truncate">{nome}</h4>
          <p className={`text-[12.5px] ${ativo ? 'text-success font-medium' : 'text-t3'}`}>
            {ativo ? `Em atividade · ${haQuanto(ultima!, agora)}`
              : ultima ? `Última atividade ${haQuanto(ultima, agora)}`
              : 'Sem atividade hoje'}
          </p>
        </div>
        {pausa && (
          <span className="flex-shrink-0 rounded-full border border-warning-line bg-warning-bg px-2.5 py-1 text-[12px] font-semibold text-warning tabular-nums"
                title="Pausou o recebimento de leads — a roleta pula a vez dele até a volta">
            Em pausa · volta {horaDaVolta(pausa.untilAt, agora)}
          </span>
        )}
      </header>

      <dl className="grid grid-cols-4 border-y border-line bg-s2/50">
        {numeros.map(([n, rotulo, antes], i) => (
          <div key={rotulo} className={`px-3 py-3 text-center min-w-0 ${i > 0 ? 'border-l border-line' : ''}`}>
            <dd className={`font-display text-[19px] font-extrabold leading-none ${n === 0 ? 'text-t4' : 'text-t1'}`}>
              <NumeroVivo valor={n} />
            </dd>
            <dt className="text-[11.5px] text-t3 mt-1.5 truncate">{rotulo}</dt>
            {/* O dia de ontem INTEIRO: serve de régua, não de placar da mesma hora. */}
            {antes !== undefined && (
              <dd className={`text-[11px] mt-0.5 tabular-nums truncate ${n > antes ? 'text-success' : 'text-t4'}`}>
                ontem {antes.toLocaleString('pt-BR')}
              </dd>
            )}
          </div>
        ))}
      </dl>

      <RitmoDoDia horas={horas} agora={agora} nome={nome} />

      <div className="h-[360px] overflow-y-auto overscroll-contain">
        {eventos.length === 0 ? (
          <p className="text-[13.5px] text-t4 px-5 py-10 text-center">Nenhuma atividade registrada hoje ainda.</p>
        ) : (
          <ul className="py-2" aria-live="polite" aria-label={`Atividade de ${nome} hoje`}>
            {eventos.map((ev, i) => {
              const v = fraseDoCorretor(ev)
              const Icone = v.icon
              return (
                <li key={ev.id} className="relative flex items-start gap-3.5 px-5 lg:px-6 py-2.5 pulse-item-in">
                  {/* Fio da linha do tempo, ligando um evento ao seguinte */}
                  {i < eventos.length - 1 && (
                    <span className="absolute left-[33px] lg:left-[37px] top-[38px] -bottom-[10px] w-px bg-line" aria-hidden />
                  )}
                  <span className={`relative w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${TOM_DISCO[v.tone]}`} aria-hidden>
                    <Icone size={14} strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1 pt-[3px]">
                    <span className="block text-[14px] text-t1 leading-snug">{v.texto}</span>
                    {v.detalhe && <span className="block text-[12.5px] text-t3 truncate mt-0.5">{v.detalhe}</span>}
                  </span>
                  <span className="text-[12px] text-t4 tabular-nums flex-shrink-0 pt-[5px]">{horaCurta(ev.at)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </article>
  )
}

// ─── O que pede atenção ───────────────────────────────────────────────────────

function PedeAtencao({ alerta, agora, onOpenLead, nomeCorretor }: {
  alerta: ReturnType<typeof atencao<Lead>>
  agora: number
  onOpenLead: (lead: Lead) => void
  nomeCorretor: (id?: string | null) => string | undefined
}) {
  // Produto e corretor: quem olha a lista precisa saber DE QUE produto é o
  // lead e COM QUEM ele está, sem abrir um por um.
  const produtoECorretor = (l: Lead) =>
    [l.propertyName ?? 'Sem produto', nomeCorretor(l.brokerId)?.split(' ')[0] ?? 'Sem corretor'].join(' · ')
  const vencidos = alerta.aguardandoPrimeiroContato.filter(l => prazoVencido(l.slaDueAt!, agora)).length
  const grupos: {
    chave: string; icon: LucideIcon; disco: string; titulo: string; vazio: string
    leads: Lead[]; nota: (l: Lead) => string; lado?: (l: Lead) => string; alerta?: (l: Lead) => boolean
  }[] = [
    {
      chave: 'sla', icon: Timer, disco: vencidos > 0 ? 'bg-error-bg text-error' : 'bg-warning-bg text-warning',
      titulo: 'Aguardando 1º contato', vazio: 'Todo lead novo já foi chamado.',
      leads: alerta.aguardandoPrimeiroContato,
      nota: produtoECorretor,
      lado: l => textoDoPrazo(l.slaDueAt!, agora),
      alerta: l => prazoVencido(l.slaDueAt!, agora),
    },
    {
      chave: 'frio', icon: Snowflake, disco: 'bg-info-bg text-info',
      titulo: `Sem contato há ${DIAS_ESFRIANDO} dias ou mais`, vazio: 'Nenhuma negociação esfriando.',
      leads: alerta.esfriando,
      nota: l => `${STAGE_THEME[l.funnelStage].label} · ${produtoECorretor(l)}`,
      lado: l => `último contato ${haQuanto(l.lastContactAt ?? l.stageChangedAt ?? l.createdAt, agora)}`,
    },
  ]

  return (
    <section className="mt-3">
      <Titulo descricao="Toque em um lead para abrir.">Pede *atenção*</Titulo>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {grupos.map(g => (
          <article key={g.chave} className="bento min-w-0 overflow-hidden flex flex-col">
            <header className="flex items-center gap-3 px-5 pt-4 pb-3">
              <span className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${g.leads.length > 0 ? g.disco : 'bg-s2 text-t4'}`} aria-hidden>
                <g.icon size={15} strokeWidth={1.8} />
              </span>
              <h4 className="text-[14px] font-semibold text-t1 min-w-0 flex-1 leading-snug">{g.titulo}</h4>
              <span className={`font-display text-[22px] font-extrabold tabular-nums leading-none ${g.leads.length > 0 ? 'text-t1' : 'text-t4'}`}>
                {g.leads.length}
              </span>
            </header>
            {g.leads.length === 0 ? (
              <p className="text-[13px] text-t4 px-5 pb-5">{g.vazio}</p>
            ) : (
              <ul className="border-t border-line divide-y divide-line">
                {g.leads.slice(0, LINHAS_DE_ATENCAO).map(l => {
                  const urgente = g.alerta?.(l) ?? false
                  return (
                    <li key={l.id}>
                      <button type="button" onClick={() => onOpenLead(l)}
                        className="group w-full flex items-center gap-2 px-5 py-2.5 min-h-[48px] text-left hover:bg-s2 cursor-pointer
                                   focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40">
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-medium text-t1 truncate">{l.name}</span>
                          <span className="block text-[12.5px] text-t3 truncate">{g.nota(l)}</span>
                          {g.lado && (
                            <span className={`block text-[12.5px] truncate ${urgente ? 'text-error font-medium' : 'text-t4'}`}>{g.lado(l)}</span>
                          )}
                        </span>
                        <ChevronRight size={14} strokeWidth={1.8} className="text-t4 flex-shrink-0" aria-hidden />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            {g.leads.length > LINHAS_DE_ATENCAO && <p className="text-[12.5px] text-t4 px-5 py-2.5 border-t border-line">e mais {g.leads.length - LINHAS_DE_ATENCAO}</p>}
          </article>
        ))}
      </div>
    </section>
  )
}
