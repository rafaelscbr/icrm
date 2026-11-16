import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronRight, Radio, RefreshCw, Snowflake, Timer, Undo2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Lead, LeadFunnelStage } from '../../types'
import { STAGE_THEME } from '../../lib/stageTheme'
import { formatCurrency } from '../../lib/formatters'
import { useAdminView } from '../../hooks/useAdminView'
import { useAuthStore } from '../../store/useAuthStore'
import { usePulseStore } from '../pulse/usePulseStore'
import { agruparFeed, horaCurta } from '../pulse/pulseEvents'
import type { PulseTone } from '../pulse/pulseEvents'
import type { PulseBroker, PulseEvent } from '../pulse/types'
import { Destaque } from '../../components/shared/Destaque'
import { FaixaNumeros, Segmentado, SecaoTitulo } from '../../components/shared/visual'
import { Grafico, eixoCategoria, eixoValor, resolverCor } from '../../components/charts/Grafico'
import type { CoresGrafico } from '../../components/charts/Grafico'
import {
  ETAPAS_FUNIL, atencao, estaAtivo, fraseDoCorretor, funilAgora, haQuanto, leadsPorDia,
  mediaSemHoje, rotuloDia, DIAS_ESFRIANDO,
} from './dashboardLeads'

/**
 * Leads › Dashboard — refeito em 15/11/2026.
 *
 * A tela responde, nesta ordem: quanto está chegando (leads por dia), onde os
 * leads estão (funil agora), o que não pode esperar (atenção) e o que a equipe
 * está fazendo neste momento (atividade por corretor, ao vivo).
 *
 * De onde vem cada coisa — e por que isso não pesa no banco:
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

const TOM_COR: Record<PulseTone, string> = {
  neutral: 'text-t3', good: 'text-info', warn: 'text-warning', win: 'text-success',
}

/** Snapshot mais velho que isto é refeito ao abrir a aba (fora dela não há escuta). */
const SNAPSHOT_FRESCO_MS = 60_000
const LINHAS_POR_CORRETOR = 40

export function LeadsDashboard({ leads, onOpenLead }: Props) {
  const { effectiveBrokerId, isGlobalView } = useAdminView()
  const { isAdmin, profile, allProfiles, fetchAllProfiles } = useAuthStore()

  const connection  = usePulseStore(s => s.connection)
  const erroPulso   = usePulseStore(s => s.erro)
  const carregado   = usePulseStore(s => s.ultimoSnapshotAt !== null)
  const feed        = usePulseStore(s => s.feed)
  const corretores  = usePulseStore(s => s.corretores)
  const brokerNames = usePulseStore(s => s.brokerNames)

  const [janela, setJanela] = useState<Janela>('30')
  const [agora, setAgora] = useState(() => Date.now())

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

  const hoje  = serie[serie.length - 1]?.n ?? 0
  const ontem = serie[serie.length - 2]?.n ?? 0
  const media = mediaSemHoje(serie)

  // Quem aparece nos quadros de atividade
  const quadros = useMemo(() => {
    const nome = (id: string) => allProfiles.find(p => p.id === id)?.name ?? brokerNames[id]
      ?? (id === profile?.id ? profile.name : 'Corretor')
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
    }))
  }, [isGlobalView, effectiveBrokerId, allProfiles, brokerNames, profile, feed, corretores])

  const noEscopo = (c: PulseBroker) => isGlobalView || c.brokerId === effectiveBrokerId
  const atendimentosHoje = corretores.filter(noEscopo).reduce((s, c) => s + c.interacoesHoje, 0)
  const ligacoesHoje     = corretores.filter(noEscopo).reduce((s, c) => s + c.ligacoesHoje, 0)
  const visitasHoje      = corretores.filter(noEscopo).reduce((s, c) => s + c.visitasHoje, 0)
  const semPulso = !carregado

  return (
    <div className="flex flex-col gap-8 pb-10">
      {/* Topo em uma linha */}
      <div className="flex items-center gap-x-3 gap-y-2 flex-wrap">
        <h2 className="font-display text-[18px] font-bold tracking-[-0.02em] text-t1">
          Leads <Destaque>ao vivo</Destaque>
        </h2>
        <Conexao estado={connection} carregado={carregado} />
      </div>

      {/* Os quatro números do dia */}
      <FaixaNumeros itens={[
        {
          rotulo: 'Leads hoje', destaque: true,
          valor: hoje.toLocaleString('pt-BR'),
          nota: `ontem ${ontem.toLocaleString('pt-BR')}${media !== null ? ` · média ${media.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}/dia` : ''}`,
        },
        {
          rotulo: 'Atendimentos hoje',
          valor: semPulso ? '—' : atendimentosHoje.toLocaleString('pt-BR'),
          nota: semPulso ? 'carregando' : `${ligacoesHoje.toLocaleString('pt-BR')} ligações de prospecção`,
        },
        {
          rotulo: 'Visitas marcadas hoje',
          valor: semPulso ? '—' : visitasHoje.toLocaleString('pt-BR'),
          nota: `${funil.porEtapa.visita.toLocaleString('pt-BR')} leads em visita agora`,
        },
        {
          rotulo: 'Em negociação',
          valor: formatCurrency(funil.emNegociacao),
          nota: `${funil.leadsEmNegociacao.toLocaleString('pt-BR')} em visita e proposta`,
        },
      ]} />

      {/* Gráfico grande + funil */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-x-10 gap-y-8">
        <section>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <SecaoTitulo icon={Radio} descricao="Todo lead que entrou, inclusive os já descartados. Atualiza sozinho quando chega um novo.">
              Leads recebidos por *dia*
            </SecaoTitulo>
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

        <section>
          <SecaoTitulo icon={Radio} descricao="Leads ativos em cada etapa. Vendas: concluídas neste mês.">
            Funil *agora*
          </SecaoTitulo>
          <FunilDesenhado porEtapa={funil.porEtapa} vendasNoMes={funil.vendasNoMes} />
        </section>
      </div>

      <PedeAtencao alerta={alerta} agora={agora} onOpenLead={onOpenLead} />

      {/* Atividade por corretor, ao vivo */}
      <section>
        <SecaoTitulo icon={Radio} descricao="O que cada corretor fez hoje no sistema. As linhas novas entram sozinhas, sem recarregar.">
          Atividade da *equipe*
        </SecaoTitulo>

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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" aria-busy="true">
            {[0, 1].map(i => <div key={i} className="bento h-[320px] animate-pulse" />)}
          </div>
        ) : quadros.length === 0 ? (
          <p className="text-[14px] text-t3 py-6">Nenhum corretor ativo para mostrar.</p>
        ) : (
          <div className={`grid grid-cols-1 gap-4 ${quadros.length === 2 ? 'md:grid-cols-2' : quadros.length >= 3 ? 'md:grid-cols-2 xl:grid-cols-3' : ''}`}>
            {quadros.map(q => (
              <QuadroCorretor key={q.id} nome={q.nome} resumo={q.resumo} eventos={q.eventos} agora={agora} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ─── Estado da conexão ao vivo ────────────────────────────────────────────────

function Conexao({ estado, carregado }: { estado: string; carregado: boolean }) {
  const [rotulo, cor, pulsa] =
    estado === 'live' && carregado ? ['Ao vivo', 'bg-success', true]
    : estado === 'reconnecting'    ? ['Reconectando — os números podem estar atrasados', 'bg-warning', false]
    : estado === 'error'           ? ['Sem atualização ao vivo', 'bg-error', false]
    : ['Conectando', 'bg-t4', false] as const
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-t3" role="status">
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
          itemStyle: { color: i === ultimo ? t.marca : neutro, opacity: i === ultimo ? 1 : 0.4, borderRadius: [6, 6, 0, 0] },
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

function FunilDesenhado({ porEtapa, vendasNoMes }: { porEtapa: Record<LeadFunnelStage, number>; vendasNoMes: number }) {
  const L = 300, H = 50, VAO = 4, PASSO = 34
  const linhas = ETAPAS_FUNIL.map(e => ({
    etapa: e,
    nome: e === 'venda' ? 'Vendas no mês' : STAGE_THEME[e].columnLabel,
    n: e === 'venda' ? vendasNoMes : porEtapa[e],
    cor: STAGE_THEME[e].solidVar,
  }))
  const altura = linhas.length * (H + VAO) - VAO

  return (
    <div className="flex justify-center">
      <svg viewBox={`0 0 ${L} ${altura}`} className="w-full max-w-[340px] h-auto" role="img"
           aria-label={`Funil agora: ${linhas.map(l => `${l.nome} ${l.n}`).join(', ')}.`}>
        {linhas.map((l, i) => {
          const y = i * (H + VAO)
          const topo = L - i * PASSO, base = L - (i + 1) * PASSO
          const pontos = [
            [(L - topo) / 2, y], [(L + topo) / 2, y], [(L + base) / 2, y + H], [(L - base) / 2, y + H],
          ].map(p => p.join(',')).join(' ')
          return (
            <g key={l.etapa}>
              <polygon points={pontos} strokeWidth={1.25} strokeLinejoin="round"
                style={{ fill: `color-mix(in srgb, ${l.cor} 20%, transparent)`, stroke: l.cor }} />
              <text x={L / 2} y={y + 21} textAnchor="middle" style={{ fill: 'var(--t3)', fontSize: 11.5 }}>{l.nome}</text>
              <text x={L / 2} y={y + 40} textAnchor="middle" className="font-display tabular-nums"
                style={{ fill: 'var(--t1)', fontSize: 17, fontWeight: 800 }}>
                {l.n.toLocaleString('pt-BR')}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ─── O que pede atenção ───────────────────────────────────────────────────────

function PedeAtencao({ alerta, agora, onOpenLead }: {
  alerta: ReturnType<typeof atencao<Lead>>
  agora: number
  onOpenLead: (lead: Lead) => void
}) {
  const grupos: { chave: string; icon: LucideIcon; cor: string; titulo: string; leads: Lead[]; nota: (l: Lead) => string }[] = [
    {
      chave: 'sla', icon: Timer, cor: 'text-error', titulo: '1º contato atrasado', leads: alerta.primeiroContatoAtrasado,
      nota: l => `prazo venceu ${haQuanto(l.slaDueAt!, agora)}`,
    },
    {
      chave: 'frio', icon: Snowflake, cor: 'text-warning', titulo: `Sem contato há ${DIAS_ESFRIANDO} dias ou mais`, leads: alerta.esfriando,
      nota: l => `${STAGE_THEME[l.funnelStage].label} · último contato ${haQuanto(l.lastContactAt ?? l.stageChangedAt ?? l.createdAt, agora)}`,
    },
    {
      chave: 'volta', icon: Undo2, cor: 'text-info', titulo: 'Voltaram a se cadastrar', leads: alerta.voltaram,
      nota: l => `preencheu de novo ${haQuanto(l.reentryAt!, agora)}`,
    },
  ]
  const total = grupos.reduce((s, g) => s + g.leads.length, 0)

  return (
    <section>
      <SecaoTitulo icon={AlertTriangle} descricao={total === 0 ? undefined : 'Toque em um lead para abrir.'}>
        Pede *atenção*
      </SecaoTitulo>
      {total === 0 ? (
        <p className="text-[14px] text-t3">Nada parado: nenhum 1º contato atrasado, nenhuma negociação esfriando, nenhuma reentrada sem ver.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
          {grupos.map(g => (
            <div key={g.chave} className="min-w-0">
              <p className="flex items-center gap-2 text-[13.5px] font-semibold text-t1">
                <g.icon size={15} strokeWidth={1.8} className={g.leads.length > 0 ? g.cor : 'text-t4'} aria-hidden />
                {g.titulo}
                <span className={`ml-auto font-display text-[17px] font-extrabold tabular-nums ${g.leads.length > 0 ? 'text-t1' : 'text-t4'}`}>
                  {g.leads.length}
                </span>
              </p>
              {g.leads.length > 0 && (
                <ul className="mt-2 divide-y divide-line border-y border-line">
                  {g.leads.slice(0, 4).map(l => (
                    <li key={l.id}>
                      <button type="button" onClick={() => onOpenLead(l)}
                        className="group w-full flex items-center gap-2 py-2.5 min-h-[44px] text-left hover:bg-s2 cursor-pointer
                                   focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40">
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-medium text-t1 truncate">{l.name}</span>
                          <span className="block text-[12.5px] text-t3 truncate">{g.nota(l)}</span>
                        </span>
                        <ChevronRight size={14} strokeWidth={1.8} className="text-t4 flex-shrink-0" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {g.leads.length > 4 && <p className="text-[12.5px] text-t4 mt-1.5">e mais {g.leads.length - 4}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ─── Quadro de atividade de um corretor ───────────────────────────────────────

function QuadroCorretor({ nome, resumo, eventos, agora }: {
  nome: string
  resumo?: PulseBroker
  eventos: PulseEvent[]
  agora: number
}) {
  const ultima = eventos[0]?.at ?? resumo?.ultimaAtividadeAt ?? null
  const ativo = estaAtivo(ultima, agora)
  const numeros: [number, string, string][] = [
    [resumo?.interacoesHoje ?? 0, 'atendimento', 'atendimentos'],
    [resumo?.ligacoesHoje ?? 0, 'ligação', 'ligações'],
    [resumo?.avancosHoje ?? 0, 'avanço', 'avanços'],
    [resumo?.visitasHoje ?? 0, 'visita', 'visitas'],
  ]

  return (
    <article className="bento flex flex-col min-w-0 overflow-hidden">
      <header className="flex items-center gap-3 px-5 pt-4 pb-3">
        <span className="w-9 h-9 rounded-full bg-brand-fill text-brand-fill-text flex items-center justify-center text-[14px] font-bold flex-shrink-0" aria-hidden>
          {nome.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-t1 truncate">{nome}</h3>
          <p className="flex items-center gap-1.5 text-[12.5px] text-t3">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ativo ? 'bg-success pulse-live-dot' : 'bg-t4'}`} aria-hidden />
            {ativo ? `Em atividade · ${haQuanto(ultima!, agora)}`
              : ultima ? `Última atividade ${haQuanto(ultima, agora)}`
              : 'Sem atividade hoje'}
          </p>
        </div>
      </header>

      <p className="px-5 pb-3 text-[12.5px] text-t3 tabular-nums">
        {numeros.map(([n, um, varios], i) => (
          <span key={um}>
            {i > 0 && ' · '}
            <span className={n > 0 ? 'font-semibold text-t1' : ''}>{n.toLocaleString('pt-BR')}</span> {n === 1 ? um : varios}
          </span>
        ))}
      </p>

      <div className="border-t border-line h-[320px] overflow-y-auto overscroll-contain">
        {eventos.length === 0 ? (
          <p className="text-[13.5px] text-t4 px-5 py-8 text-center">Nenhuma atividade registrada hoje ainda.</p>
        ) : (
          <ul aria-live="polite" aria-label={`Atividade de ${nome} hoje`}>
            {eventos.map(ev => {
              const v = fraseDoCorretor(ev)
              const Icone = v.icon
              return (
                <li key={ev.id} className="flex items-start gap-3 px-5 py-2.5 border-b border-line/60 last:border-0 pulse-item-in">
                  <span className="text-[12px] text-t4 tabular-nums w-10 flex-shrink-0 pt-[3px]">{horaCurta(ev.at)}</span>
                  <Icone size={15} strokeWidth={1.8} className={`flex-shrink-0 mt-[3px] ${TOM_COR[v.tone]}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] text-t1 leading-snug">{v.texto}</span>
                    {v.detalhe && <span className="block text-[12.5px] text-t3 truncate">{v.detalhe}</span>}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </article>
  )
}
