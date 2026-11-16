import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ChevronRight, Percent, RefreshCw } from 'lucide-react'
import { db } from '../../lib/db'
import { STAGE_THEME } from '../../lib/stageTheme'
import { useAdminView } from '../../hooks/useAdminView'
import { useAuthStore } from '../../store/useAuthStore'
import { usePeriodStore } from '../../store/usePeriodStore'
import { useLeadConfigStore } from '../../store/useLeadConfigStore'
import { PeriodSelector } from '../../components/shared/PeriodSelector'
import { EstadoTela } from '../../components/shared/EstadoTela'
import { EsqueletoKpis, EsqueletoLinhas } from '../../components/shared/Esqueleto'
import { Destaque } from '../../components/shared/Destaque'
import { Barra, FaixaNumeros, Segmentado, SecaoTitulo, TOM } from '../../components/shared/visual'
import { Grafico, eixoCategoria, eixoValor, resolverCor } from '../../components/charts/Grafico'
import type { CoresGrafico } from '../../components/charts/Grafico'
import { ORIGEM_META } from './origens'
import type { LeadFunnelStage, LeadOrigin } from '../../types'
import {
  ETAPAS_RELATORIO, etapa, fmtData, fmtTaxa, gerarLeituras, montarRecorte, passos, preencherSerie,
  rotuloBalde, slugLegivel, taxa, variacao,
} from './conversao'
import type { LinhaConversao, ModoConversao, RelatorioConversao } from './conversao'

/**
 * Leads › Conversão — refeita em 15/11/2026.
 *
 * A tela antiga tirava os descartados da conta, filtrava pela data de entrada
 * do lead e creditava o dono atual: a taxa saía inflada e não respondia "o que
 * este corretor fez neste período". Agora são duas leituras, escolhidas no topo:
 *
 *   Por atividade — o que aconteceu no período, creditado a quem avançou o lead.
 *   Por safra     — dos leads que chegaram no período, até onde foram.
 *
 * Descartado conta nas duas. A conta inteira é feita no banco
 * (`lead_conversion_report`, migração 088); a tela só mostra o que voltou.
 * Escopo: o modelo de visão do admin (imobiliária · meu desempenho · corretor);
 * corretor comum vê sempre o próprio. Período: o seletor global do sistema.
 * Uma leitura ao abrir e a cada troca de filtro — nada de recarga periódica.
 */

const NOME_ETAPA: Record<string, string> = {
  atendimento: 'Atendimento', visita: 'Visita', proposta: 'Proposta', venda: 'Venda',
}

export function LeadConversionTab() {
  const { effectiveBrokerId, isGlobalView, isOwnView } = useAdminView()
  const { isAdmin, profile, allProfiles, fetchAllProfiles, setViewAsBroker } = useAuthStore()
  const { preset, startDate, endDate } = usePeriodStore()
  const getByType = useLeadConfigStore(s => s.getByType)

  const [modo, setModo] = useState<ModoConversao>('atividade')
  const [atual, setAtual] = useState<RelatorioConversao | null>(null)
  const [anterior, setAnterior] = useState<RelatorioConversao | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const pedido = useRef(0)

  const recorte = useMemo(
    () => montarRecorte(startDate, endDate, preset === 'all'),
    [startDate, endDate, preset],
  )

  const carregar = useCallback(async () => {
    const meu = ++pedido.current
    setCarregando(true)
    setErro(null)
    try {
      const base = { brokerId: effectiveBrokerId, mode: modo, bucket: recorte.balde }
      const [a, b] = await Promise.all([
        db.leadConversion.report({ ...base, start: recorte.inicio, end: recorte.fim }),
        recorte.anterior
          ? db.leadConversion.report({ ...base, start: recorte.anterior.inicio, end: recorte.anterior.fim })
          : Promise.resolve(null),
      ])
      if (meu !== pedido.current) return   // filtro mudou no meio: resposta velha
      setAtual(a)
      setAnterior(b)
    } catch (e) {
      if (meu !== pedido.current) return
      // Falhou: a tela não fica com número de outro filtro por baixo do erro.
      setAtual(null)
      setAnterior(null)
      setErro((e as { message?: string })?.message ?? 'Erro desconhecido ao ler o relatório')
    } finally {
      if (meu === pedido.current) setCarregando(false)
    }
  }, [effectiveBrokerId, modo, recorte])

  useEffect(() => { void carregar() }, [carregar])
  useEffect(() => { if (isAdmin && allProfiles.length === 0) void fetchAllProfiles() }, [isAdmin, allProfiles.length, fetchAllProfiles])

  const motivos = useMemo(() => getByType('discard_reason'), [getByType])
  const nomeMotivo = useCallback(
    (slug: string) => motivos.find(m => m.slug === slug)?.label ?? slugLegivel(slug),
    [motivos],
  )
  const nomeOrigem = (slug: string) => ORIGEM_META[slug as LeadOrigin]?.label ?? slugLegivel(slug)

  const escopo = isGlobalView ? 'Imobiliária inteira'
    : isOwnView ? 'Meu desempenho'
    : allProfiles.find(p => p.id === effectiveBrokerId)?.name ?? 'Corretor'

  const quando = recorte.inicio && recorte.fim
    ? `de ${fmtData(recorte.inicio)} a ${fmtData(recorte.fim)}`
    : 'desde o começo'
  const frase = modo === 'atividade'
    ? `O que aconteceu ${quando}. Cada avanço conta para quem o fez; lead descartado entra na conta.`
    : `Leads que chegaram ${quando} e até onde foram até hoje. Lead descartado entra na conta.`

  const vazio = !!atual && atual.received === 0 && atual.discarded === 0 && atual.funnel.every(f => f.count === 0)

  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* Topo em uma linha: título, leitura, escopo e período */}
      <div>
        <div className="flex items-center gap-x-3 gap-y-2 flex-wrap">
          <h2 className="font-display text-[18px] font-bold tracking-[-0.02em] text-t1">
            Conversão do <Destaque>funil</Destaque>
          </h2>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <Segmentado
              rotulo="Como ler o funil"
              valor={modo}
              onChange={setModo}
              opcoes={[
                { value: 'atividade' as const, label: 'Por atividade' },
                { value: 'safra' as const,     label: 'Por safra' },
              ]}
            />
            {isAdmin && (
              <select
                value={effectiveBrokerId ?? ''}
                onChange={e => setViewAsBroker(e.target.value || null)}
                aria-label="De quem é o relatório"
                className="h-9 max-w-[190px] rounded-[10px] bg-s2 border border-transparent px-3 text-[13px] font-medium text-t1
                           cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <option value="">Imobiliária inteira</option>
                {profile && <option value={profile.id}>Meu desempenho</option>}
                {allProfiles.filter(p => p.active && p.id !== profile?.id).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
            <PeriodSelector />
            <button
              type="button"
              onClick={() => void carregar()}
              disabled={carregando}
              aria-label="Atualizar o relatório"
              className="w-9 h-9 rounded-[10px] flex items-center justify-center text-t3 hover:text-t1 hover:bg-s2
                         cursor-pointer disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <RefreshCw size={15} strokeWidth={1.8} className={carregando ? 'animate-spin' : ''} aria-hidden />
            </button>
          </div>
        </div>
        <p className="text-[13px] text-t3 mt-1.5">
          <span className="font-medium text-t2">{escopo}</span> · {frase}
        </p>
      </div>

      <EstadoTela
        carregando={carregando && !atual}
        erro={erro}
        vazio={vazio}
        onTentarDeNovo={() => void carregar()}
        icone={Percent}
        titulo="Nada aconteceu no *período*"
        descricao="Nenhum lead chegou, avançou de etapa ou foi descartado neste recorte. Troque o período ou o corretor no topo."
        esqueleto={<div className="flex flex-col gap-6"><EsqueletoKpis kpis={4} /><EsqueletoLinhas linhas={5} /></div>}
      >
        {atual && (
          <Relatorio
            atual={atual}
            anterior={anterior}
            desbotado={carregando}
            leituras={gerarLeituras(atual, anterior, recorte, { origem: nomeOrigem, motivo: nomeMotivo })}
            nomeOrigem={nomeOrigem}
            nomeMotivo={nomeMotivo}
            abrirCorretor={isAdmin && isGlobalView ? (id: string) => setViewAsBroker(id) : undefined}
          />
        )}
      </EstadoTela>
    </div>
  )
}

// ─── Corpo do relatório ───────────────────────────────────────────────────────

function Relatorio({ atual, anterior, desbotado, leituras, nomeOrigem, nomeMotivo, abrirCorretor }: {
  atual: RelatorioConversao
  anterior: RelatorioConversao | null
  desbotado: boolean
  leituras: ReturnType<typeof gerarLeituras>
  nomeOrigem: (slug: string) => string
  nomeMotivo: (slug: string) => string
  abrirCorretor?: (id: string) => void
}) {
  const safra = atual.mode === 'safra'
  const visitas = etapa(atual, 'visita')
  const vendas  = etapa(atual, 'venda')

  const corretores = useMemo(
    () => [...atual.byBroker].sort((a, b) =>
      (b.stages.visita ?? 0) - (a.stages.visita ?? 0) || b.received - a.received),
    [atual.byBroker],
  )

  return (
    <div className={`flex flex-col gap-8 transition-opacity duration-200 ${desbotado ? 'opacity-60' : ''}`} aria-busy={desbotado}>
      {/* Os quatro números que respondem a tela */}
      <FaixaNumeros itens={[
        {
          rotulo: safra ? 'Leads da safra' : 'Leads recebidos', destaque: true,
          valor: atual.received.toLocaleString('pt-BR'),
          nota: variacao(atual.received, anterior?.received) ?? undefined,
        },
        {
          rotulo: 'Visitas',
          valor: visitas.toLocaleString('pt-BR'),
          nota: [safra ? `${fmtTaxa(taxa(visitas, atual.received))} da safra` : null, variacao(visitas, anterior ? etapa(anterior, 'visita') : null)]
            .filter(Boolean).join(' · ') || undefined,
        },
        {
          rotulo: 'Vendas',
          valor: vendas.toLocaleString('pt-BR'),
          nota: [safra ? `${fmtTaxa(taxa(vendas, atual.received))} da safra` : null, variacao(vendas, anterior ? etapa(anterior, 'venda') : null)]
            .filter(Boolean).join(' · ') || undefined,
        },
        {
          rotulo: 'Descartados',
          valor: atual.discarded.toLocaleString('pt-BR'),
          nota: safra ? `${fmtTaxa(taxa(atual.discarded, atual.received))} da safra` : (variacao(atual.discarded, anterior?.discarded) ?? undefined),
        },
      ]} />

      {/* O que os números dizem */}
      {leituras.length > 0 && (
        <section aria-label="Leitura do período">
          <SecaoTitulo icon={Percent}>O que os números *dizem*</SecaoTitulo>
          <ul className="flex flex-col gap-2 stagger-children">
            {leituras.map((l, i) => (
              <li key={i} className="flex items-start gap-3 text-[14px] leading-relaxed text-t2">
                <span className={`mt-[9px] w-1.5 h-1.5 rounded-full flex-shrink-0 ${TOM[l.tom].ponto}`} aria-hidden />
                <span>{l.texto}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-8">
        <Funil atual={atual} />
        <Evolucao atual={atual} />
      </div>

      {(corretores.length > 1 || (corretores.length === 1 && abrirCorretor)) && (
        <Linhas
          titulo="Por *corretor*"
          descricao={safra
            ? 'Leads da safra que estão hoje com cada corretor.'
            : 'Recebidos e descartados contam para o dono atual do lead; os avanços, para quem avançou.'}
          cabecalho="Corretor"
          safra={safra}
          linhas={corretores.map(b => ({
            chave: b.brokerId ?? 'sem', nome: b.name, dados: b,
            aoClicar: abrirCorretor && b.brokerId ? () => abrirCorretor(b.brokerId!) : undefined,
          }))}
        />
      )}

      {atual.byOrigin.length > 0 && (
        <Linhas
          titulo="Por *origem*"
          descricao="De onde veio o lead."
          cabecalho="Origem"
          safra={safra}
          linhas={atual.byOrigin.map(o => ({ chave: o.origin, nome: nomeOrigem(o.origin), dados: o }))}
        />
      )}

      {atual.discardReasons.length > 0 && (
        <section>
          <SecaoTitulo icon={Percent} descricao={safra ? 'Leads da safra que saíram do funil.' : 'Leads descartados dentro do período.'}>
            Por que os leads *saem*
          </SecaoTitulo>
          <ul className="flex flex-col gap-3 max-w-2xl">
            {atual.discardReasons.map(m => (
              <li key={m.reason}>
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <span className="text-[14px] text-t1 truncate">{nomeMotivo(m.reason)}</span>
                  <span className="text-[13px] text-t3 tabular-nums flex-shrink-0">
                    {m.count.toLocaleString('pt-BR')} · {fmtTaxa(taxa(m.count, atual.discarded))}
                  </span>
                </div>
                <Barra pct={taxa(m.count, atual.discarded) ?? 0} tom="neutro" altura={5}
                  rotuloAcessivel={`${nomeMotivo(m.reason)}: ${m.count} de ${atual.discarded} descartes`} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

// ─── Funil ────────────────────────────────────────────────────────────────────

function Funil({ atual }: { atual: RelatorioConversao }) {
  const ps = passos(atual)
  const linhas = [
    { chave: 'recebidos', nome: atual.mode === 'safra' ? 'Chegaram' : 'Recebidos', n: atual.received, cor: 'var(--stage-lead)' },
    ...ETAPAS_RELATORIO.map(e => ({
      chave: e, nome: NOME_ETAPA[e], n: etapa(atual, e), cor: STAGE_THEME[e as LeadFunnelStage].solidVar,
    })),
  ]
  const maior = Math.max(1, ...linhas.map(l => l.n))

  return (
    <section>
      <SecaoTitulo icon={Percent} descricao={atual.mode === 'safra'
        ? 'Quantos leads da safra alcançaram cada etapa.'
        : 'Quantos leads entraram em cada etapa no período.'}>
        Etapa a *etapa*
      </SecaoTitulo>
      <ol className="flex flex-col">
        {linhas.map((l, i) => (
          <li key={l.chave}>
            {i > 0 && (
              <p className="flex items-center gap-1.5 pl-[3px] py-1 text-[12.5px] text-t4">
                <ArrowDown size={12} strokeWidth={1.8} aria-hidden />
                <span className="font-semibold text-t2 tabular-nums">{fmtTaxa(ps[i - 1].taxa)}</span>
                {ps[i - 1].taxa === null ? 'sem base para calcular' : `de ${ps[i - 1].de.toLowerCase()} para ${l.nome.toLowerCase()}`}
              </p>
            )}
            <div className="flex items-center gap-3">
              <span className="w-[92px] flex-shrink-0 text-[14px] font-medium text-t1 truncate">{l.nome}</span>
              <div className="flex-1 h-7 rounded-[8px] bg-s2 overflow-hidden"
                   role="img" aria-label={`${l.nome}: ${l.n.toLocaleString('pt-BR')} leads`}>
                <BarraFunil pct={(l.n / maior) * 100} cor={l.cor} />
              </div>
              <span className="w-12 flex-shrink-0 text-right font-display text-[17px] font-extrabold text-t1 tabular-nums">
                {l.n.toLocaleString('pt-BR')}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Nasce vazia e enche — o mesmo gesto da `Barra` do sistema, na cor da etapa. */
function BarraFunil({ pct, cor }: { pct: number; cor: string }) {
  const [w, setW] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(pct))
    return () => cancelAnimationFrame(id)
  }, [pct])
  return (
    <div className="h-full rounded-[8px] transition-[width] duration-[520ms]"
         style={{ width: `${Math.max(w, pct > 0 ? 1.5 : 0)}%`, background: cor, opacity: 0.9 }} />
  )
}

// ─── Evolução no tempo ────────────────────────────────────────────────────────

function Evolucao({ atual }: { atual: RelatorioConversao }) {
  // Dias, semanas ou meses sem movimento entram com zero — não somem do eixo.
  const serie = useMemo(
    () => preencherSerie(atual.series, atual.start, atual.end, atual.bucket),
    [atual.series, atual.start, atual.end, atual.bucket],
  )
  const opcao = useCallback((t: CoresGrafico) => {
    const cor = (e: LeadFunnelStage) => resolverCor(STAGE_THEME[e].solidVar)
    const linha = (nome: string, e: LeadFunnelStage, dados: number[]) => ({
      // Sem suavização: curva entre dois pontos sugere valor que não existiu.
      name: nome, type: 'line', yAxisIndex: 1, data: dados,
      symbol: 'circle', symbolSize: 5, lineStyle: { width: 2, color: cor(e) }, itemStyle: { color: cor(e) },
    })
    return {
      grid: { left: 4, right: 4, top: 40, bottom: 4, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: eixoCategoria(t, serie.map(s => rotuloBalde(s.bucket, atual.bucket))),
      yAxis: [
        eixoValor(t, undefined, { minInterval: 1 }),
        eixoValor(t, undefined, { minInterval: 1, splitLine: { show: false } }),
      ],
      series: [
        {
          name: atual.mode === 'safra' ? 'Chegaram' : 'Recebidos', type: 'bar', barMaxWidth: 22,
          data: serie.map(s => s.received),
          itemStyle: { color: resolverCor('var(--stage-lead)'), opacity: 0.28, borderRadius: [5, 5, 0, 0] },
        },
        linha('Atendimento', 'atendimento', serie.map(s => s.atendimento)),
        linha('Visita', 'visita', serie.map(s => s.visita)),
        linha('Venda', 'venda', serie.map(s => s.venda)),
      ],
    }
  }, [serie, atual.bucket, atual.mode])

  const unidade = { day: 'dia', week: 'semana (domingo a sábado)', month: 'mês' }[atual.bucket]
  const totalVisitas = serie.reduce((s, x) => s + x.visita, 0)

  return (
    <section>
      <SecaoTitulo icon={Percent} descricao={atual.mode === 'safra'
        ? `Por ${unidade} de chegada do lead. Barras à esquerda, linhas à direita.`
        : `Por ${unidade}. Barras (recebidos) na escala da esquerda, linhas (avanços) na da direita.`}>
        Ao longo do *tempo*
      </SecaoTitulo>
      {atual.series.length === 0 ? (
        <p className="text-[13px] text-t4 py-10">Sem movimento para desenhar neste período.</p>
      ) : (
        <Grafico
          altura={280}
          opcao={opcao}
          rotulo={`Evolução por ${unidade}: ${atual.received} leads recebidos e ${totalVisitas} entradas em visita, em ${serie.length} pontos.`}
        />
      )}
    </section>
  )
}

// ─── Linhas (corretor / origem) ───────────────────────────────────────────────

interface LinhaItem { chave: string; nome: string; dados: LinhaConversao; aoClicar?: () => void }

function Linhas({ titulo, descricao, cabecalho, linhas, safra }: {
  titulo: string
  descricao: string
  cabecalho: string
  linhas: LinhaItem[]
  safra: boolean
}) {
  const grade = 'md:grid md:grid-cols-[minmax(0,1.7fr)_repeat(7,minmax(0,1fr))] md:items-center md:gap-3'
  const colunas = ['Recebidos', 'Atend.', 'Visitas', 'Propostas', 'Vendas', 'Descart.', safra ? 'Visita / safra' : 'Atend. → visita']
  const clicavel = linhas.some(l => l.aoClicar)

  return (
    <section>
      <SecaoTitulo icon={Percent} descricao={descricao}>{titulo}</SecaoTitulo>
      <div className={`hidden ${grade} px-3 pb-2 text-[12.5px] text-t4`} aria-hidden>
        <span>{cabecalho}</span>
        {colunas.map(c => <span key={c} className="text-right">{c}</span>)}
      </div>
      <ul className="divide-y divide-line border-y border-line">
        {linhas.map(l => {
          const s = l.dados.stages
          const at = s.atendimento ?? 0, vi = s.visita ?? 0, pr = s.proposta ?? 0, ve = s.venda ?? 0
          const indice = safra ? taxa(vi, l.dados.received) : taxa(vi, at)
          const numeros = [l.dados.received, at, vi, pr, ve, l.dados.discarded]
          const corpo = (
            <>
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="text-[14px] font-semibold text-t1 truncate">{l.nome}</span>
                {l.aoClicar && <ChevronRight size={14} strokeWidth={1.8} className="text-t4 flex-shrink-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity" aria-hidden />}
              </span>
              {/* Celular: uma linha de leitura, sem rolagem lateral */}
              <span className="md:hidden block text-[13px] text-t3 mt-0.5 tabular-nums">
                {l.dados.received.toLocaleString('pt-BR')} recebidos · {at} atend. · {vi} visitas · {ve} vendas · {l.dados.discarded} descart.
              </span>
              {numeros.map((n, i) => (
                <span key={i} className={`hidden md:block text-right text-[14px] tabular-nums ${n === 0 ? 'text-t4' : 'text-t1'}`}>
                  {n.toLocaleString('pt-BR')}
                </span>
              ))}
              <span className="hidden md:block text-right text-[14px] font-semibold text-t1 tabular-nums">{fmtTaxa(indice)}</span>
            </>
          )
          return (
            <li key={l.chave}>
              {l.aoClicar ? (
                <button type="button" onClick={l.aoClicar}
                  aria-label={`Ver o relatório de ${l.nome}`}
                  className={`group w-full text-left px-3 py-3 min-h-[48px] ${grade} hover:bg-s2 cursor-pointer
                              focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40`}>
                  {corpo}
                </button>
              ) : (
                <div className={`px-3 py-3 min-h-[48px] ${grade}`}>{corpo}</div>
              )}
            </li>
          )
        })}
      </ul>
      {clicavel && <p className="text-[12.5px] text-t4 mt-2">Toque em um corretor para ver o relatório só dele.</p>}
    </section>
  )
}
