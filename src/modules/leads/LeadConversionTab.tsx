import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Building2, Percent, RefreshCw, User, X } from 'lucide-react'
import { db } from '../../lib/db'
import { STAGE_THEME } from '../../lib/stageTheme'
import { useAdminView } from '../../hooks/useAdminView'
import { useAuthStore } from '../../store/useAuthStore'
import { usePeriodStore } from '../../store/usePeriodStore'
import { useLeadConfigStore } from '../../store/useLeadConfigStore'
import { PeriodSelector } from '../../components/shared/PeriodSelector'
import { FilterDropdown } from '../../components/shared/FilterDropdown'
import { EstadoTela } from '../../components/shared/EstadoTela'
import { EsqueletoKpis, EsqueletoLinhas } from '../../components/shared/Esqueleto'
import { Destaque } from '../../components/shared/Destaque'
import { Barra, Segmentado, SecaoTitulo, TOM } from '../../components/shared/visual'
import { Grafico, eixoCategoria, eixoValor, resolverCor } from '../../components/charts/Grafico'
import type { CoresGrafico } from '../../components/charts/Grafico'
import type { LeadFunnelStage } from '../../types'
import { fmtData, fmtTaxa, hojeIso, montarRecorte, rotuloBalde, slugLegivel, taxa } from './conversao'
import {
  ETAPAS_SAFRA, NOME_ETAPA, SEM, contar, ladoALado, leiturasSafra, matriz, motivosSafra, normalizar,
  passosSafra, serieSafra, tempoAteVisita,
} from './safra'
import type { Contagem, EtapaSafra, Fatia, Filtro, FunilSafra } from './safra'

/**
 * Leads › Conversão — refeita em 22/11/2026, sempre por safra.
 *
 * A pergunta é uma só: dos leads que CHEGARAM no período, até onde foram até
 * hoje? Antes havia uma segunda leitura ("por atividade") que confundia mais
 * do que ajudava; saiu. O que entrou no lugar são os recortes:
 *
 *   • período (o seletor global do sistema),
 *   • corretor (o modelo de visão do admin: imobiliária · meu · corretor X),
 *   • produto (o empreendimento do formulário do Meta),
 *   • e o funil LADO A LADO — de cada corretor, ou de cada produto, respeitando
 *     o outro filtro. Corretor escolhido + "produtos" = o funil dele em cada
 *     produto, um ao lado do outro.
 *
 * O banco devolve um cubo pequeno (`funil_por_safra`, migração 103, ~5 KB) e
 * a tela recorta na hora: só o período vai ao banco de novo. Descartado conta;
 * crédito para o dono atual do lead.
 */

const COR: Record<EtapaSafra | 'chegada', string> = {
  chegada:     'var(--stage-lead)',
  atendimento: STAGE_THEME.atendimento.solidVar,
  visita:      STAGE_THEME.visita.solidVar,
  proposta:    STAGE_THEME.proposta.solidVar,
  venda:       STAGE_THEME.venda.solidVar,
}
const COLUNAS: (EtapaSafra | 'chegada')[] = ['chegada', ...ETAPAS_SAFRA]
const n = (x: number) => x.toLocaleString('pt-BR')
/** Barra em raiz quadrada: 1% ainda aparece ao lado de 100%. O número escrito é o real. */
const escala = (parte: number, base: number) => (base > 0 && parte > 0 ? Math.max(3, Math.sqrt(parte / base) * 100) : 0)

export function LeadConversionTab() {
  const { effectiveBrokerId, isGlobalView } = useAdminView()
  const { isAdmin, allProfiles, fetchAllProfiles, setViewAsBroker } = useAuthStore()
  const { preset, startDate, endDate } = usePeriodStore()
  const getByType = useLeadConfigStore(s => s.getByType)

  const [dados, setDados] = useState<FunilSafra | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [produto, setProduto] = useState<string | null>(null)
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
      const bruto = await db.funilSafra.carregar({ start: recorte.inicio, end: recorte.fim, bucket: recorte.balde })
      if (meu !== pedido.current) return   // período mudou no meio: resposta velha
      setDados(normalizar(bruto))
    } catch (e) {
      if (meu !== pedido.current) return
      // Falhou: a tela não fica com número de outro período por baixo do erro.
      setDados(null)
      setErro((e as { message?: string })?.message ?? 'Erro desconhecido ao ler o funil')
    } finally {
      if (meu === pedido.current) setCarregando(false)
    }
  }, [recorte])

  useEffect(() => { void carregar() }, [carregar])
  useEffect(() => { if (isAdmin && allProfiles.length === 0) void fetchAllProfiles() }, [isAdmin, allProfiles.length, fetchAllProfiles])

  const motivos = useMemo(() => getByType('discard_reason'), [getByType])
  const nomeMotivo = useCallback(
    (slug: string) => motivos.find(m => m.slug === slug)?.label ?? slugLegivel(slug),
    [motivos],
  )

  // Corretor comum: o cubo já vem só com os leads dele — filtrar de novo é inútil.
  const corretor = isAdmin && !isGlobalView ? effectiveBrokerId : null
  const filtro: Filtro = useMemo(() => ({ corretor, produto }), [corretor, produto])

  const nomeCorretor = (id: string | null) =>
    id === null ? null
      : dados?.corretores.find(c => c.chave === id)?.nome ?? allProfiles.find(p => p.id === id)?.name ?? 'Corretor'
  const nomeProduto = (k: string | null) => (k === null ? null : dados?.produtos.find(p => p.chave === k)?.nome ?? 'Produto')

  const quando = recorte.inicio && recorte.fim
    ? `de ${fmtData(recorte.inicio)} a ${fmtData(recorte.fim)}`
    : 'desde o começo'

  const total = useMemo(() => (dados ? contar(dados, filtro) : null), [dados, filtro])
  const nadaNoPeriodo = !!dados && dados.cubo.length === 0

  // Opções dos filtros, com quantos leads cada um tem na safra
  const opcoesProduto = useMemo(() => dados
    ? ladoALado(dados, 'produto', { corretor, produto: null }).map(f => ({ value: f.chave, label: f.nome, count: f.c.recebidos }))
    : [], [dados, corretor])
  const opcoesCorretor = useMemo(() => {
    if (!dados) return []
    const op = ladoALado(dados, 'corretor', { corretor: null, produto })
      .filter(f => f.chave !== SEM)
      .map(f => ({ value: f.chave, label: f.nome, count: f.c.recebidos }))
    // O escolhido sem lead nesta safra continua aparecendo — senão o filtro some.
    if (corretor && !op.some(o => o.value === corretor)) op.push({ value: corretor, label: nomeCorretor(corretor) ?? 'Corretor', count: 0 })
    return op
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados, produto, corretor])

  const escolherCorretor = (id: string | null) => setViewAsBroker(id && id !== SEM ? id : null)

  return (
    <div className="flex flex-col gap-7 pb-12">
      {/* Topo: título, frase e filtros */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-x-3 gap-y-2 flex-wrap">
          <h2 className="font-display text-[20px] font-bold tracking-[-0.02em] text-t1">
            Conversão do <Destaque>funil</Destaque>
          </h2>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <FilterDropdown label="Produto" icon={Building2} allLabel="Todos os produtos"
              options={opcoesProduto} value={produto} onChange={setProduto} align="right" />
            {isAdmin && (
              <FilterDropdown label="Corretor" icon={User} allLabel="Imobiliária inteira"
                options={opcoesCorretor} value={corretor} onChange={escolherCorretor} align="right" />
            )}
            <PeriodSelector />
            <button
              type="button"
              onClick={() => void carregar()}
              disabled={carregando}
              aria-label="Atualizar o funil"
              className="w-9 h-9 rounded-[10px] flex items-center justify-center text-t3 hover:text-t1 hover:bg-s2
                         cursor-pointer disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <RefreshCw size={15} strokeWidth={1.8} className={carregando ? 'animate-spin' : ''} aria-hidden />
            </button>
          </div>
        </div>
        <p className="text-[13.5px] text-t3 max-w-3xl">
          Leads que chegaram <span className="font-medium text-t2">{quando}</span> e até onde foram até hoje.
          Lead descartado entra na conta; cada lead conta para o corretor que está com ele.
        </p>
        {(corretor || produto) && (
          <div className="flex items-center gap-2 flex-wrap">
            {corretor && <FiltroAtivo rotulo={nomeCorretor(corretor)!} icone={User} onLimpar={() => escolherCorretor(null)} />}
            {produto && <FiltroAtivo rotulo={nomeProduto(produto)!} icone={Building2} onLimpar={() => setProduto(null)} />}
          </div>
        )}
      </div>

      <EstadoTela
        carregando={carregando && !dados}
        erro={erro}
        vazio={nadaNoPeriodo}
        onTentarDeNovo={() => void carregar()}
        icone={Percent}
        titulo="Nenhum lead chegou no *período*"
        descricao="A safra deste recorte está vazia. Troque o período no topo."
        esqueleto={<div className="flex flex-col gap-6"><EsqueletoKpis kpis={5} /><EsqueletoLinhas linhas={6} /></div>}
      >
        {dados && total && (
          <div className={`flex flex-col gap-9 transition-opacity duration-200 ${carregando ? 'opacity-60' : ''}`} aria-busy={carregando}>
            {total.recebidos === 0 ? (
              <p className="bento px-6 py-10 text-center text-[14px] text-t3">
                Nenhum lead {corretor ? `de ${nomeCorretor(corretor)}` : ''}{produto ? ` do ${nomeProduto(produto)}` : ''} chegou neste período.
              </p>
            ) : (
              <>
                <FunilPrincipal c={total} mediana={tempoAteVisita(dados, filtro).mediana} />
                <Leituras itens={leiturasSafra(dados, filtro, hojeIso(), nomeMotivo)} />
              </>
            )}

            <LadoALado
              dados={dados}
              filtro={filtro}
              admin={isAdmin}
              nomeCorretor={nomeCorretor(corretor)}
              nomeProduto={nomeProduto(produto)}
              escolherCorretor={escolherCorretor}
              escolherProduto={setProduto}
            />

            {isAdmin && (
              <Matriz dados={dados} filtro={filtro}
                escolher={(c, p) => { escolherCorretor(c); setProduto(p) }} />
            )}

            {total.recebidos > 0 && (
              <>
                <Safras dados={dados} filtro={filtro} inicio={recorte.inicio} fim={recorte.fim} />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-9">
                  <Saidas dados={dados} filtro={filtro} total={total} nomeMotivo={nomeMotivo} />
                  <TempoAteVisita dados={dados} filtro={filtro} />
                </div>
              </>
            )}
          </div>
        )}
      </EstadoTela>
    </div>
  )
}

function FiltroAtivo({ rotulo, icone: Icone, onLimpar }: { rotulo: string; icone: typeof User; onLimpar: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 h-8 pl-3 pr-1 rounded-full bg-brand-tint border border-brand/25 text-[13px] font-medium text-t1">
      <Icone size={13} strokeWidth={1.8} className="text-brand-text" aria-hidden />
      {rotulo}
      <button type="button" onClick={onLimpar} aria-label={`Tirar o filtro ${rotulo}`}
        className="w-6 h-6 rounded-full flex items-center justify-center text-t3 hover:text-t1 hover:bg-s2 cursor-pointer
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
        <X size={13} strokeWidth={2} aria-hidden />
      </button>
    </span>
  )
}

// ─── O funil principal ────────────────────────────────────────────────────────

/**
 * O funil inteiro numa faixa: cinco colunas (chegaram → venda), cada uma com o
 * número, quanto isso é dos leads que chegaram e quanto avançou do passo
 * anterior. Por baixo, a fita colorida afina de etapa em etapa, e em cada
 * coluna fica onde os leads PARARAM — vivos ou descartados.
 */
function FunilPrincipal({ c, mediana }: { c: Contagem; mediana: number | null }) {
  const [foco, setFoco] = useState<EtapaSafra | 'chegada' | null>(null)
  const ps = passosSafra(c)
  const conversao = taxa(c.venda, c.recebidos)

  // Fita: largura fixa por coluna, altura pela raiz da proporção
  const H = 132
  const alt = COLUNAS.map(e => {
    const v = e === 'chegada' ? c.recebidos : c[e]
    return v > 0 ? Math.max(5, H * Math.sqrt(v / Math.max(1, c.recebidos))) : 2
  })
  const W = 1000, col = W / 5, barra = col * 0.62

  return (
    <section aria-label="Funil da safra" className="bento overflow-hidden">
      <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)]">
        {/* O número que decide */}
        <div className="px-6 py-6 xl:border-r border-b xl:border-b-0 border-line flex flex-col gap-5">
          <div>
            <p className="text-[12.5px] text-t4">Viraram venda</p>
            <p className="font-display text-[52px] leading-none font-extrabold tracking-[-0.04em] text-brand-text tabular-nums mt-1.5">
              {fmtTaxa(conversao)}
            </p>
            <p className="text-[13.5px] text-t3 mt-2">
              <span className="font-semibold text-t1 tabular-nums">{n(c.venda)}</span> {c.venda === 1 ? 'venda' : 'vendas'} de{' '}
              <span className="font-semibold text-t1 tabular-nums">{n(c.recebidos)}</span> {c.recebidos === 1 ? 'lead' : 'leads'}
            </p>
          </div>
          <dl className="grid grid-cols-3 xl:grid-cols-1 gap-3">
            <MiniNumero rotulo="Em andamento" valor={n(c.emAndamento)} nota={`${fmtTaxa(taxa(c.emAndamento, c.recebidos))} da safra`} />
            <MiniNumero rotulo="Descartados" valor={n(c.descartados)} nota={`${fmtTaxa(taxa(c.descartados, c.recebidos))} da safra`} />
            <MiniNumero rotulo="Até a visita" valor={mediana === null ? '—' : mediana < 1 ? 'mesmo dia' : `${mediana.toLocaleString('pt-BR')} d`}
              nota={mediana === null ? 'sem visitas ainda' : 'metade das visitas'} />
          </dl>
        </div>

        {/* As cinco etapas */}
        <div className="min-w-0" role="presentation" onMouseLeave={() => setFoco(null)}>
          <ol className="grid grid-cols-1 sm:grid-cols-5">
            {COLUNAS.map((e, i) => {
              const v = e === 'chegada' ? c.recebidos : c[e]
              const passo = i > 0 ? ps[i - 1] : null
              const apagado = foco !== null && foco !== e
              return (
                <li key={e}
                  className={`sm:border-l first:border-l-0 border-line transition-opacity duration-200 ${apagado ? 'opacity-45' : ''}`}>
                  <div role="presentation" className="h-full px-5 pt-5 pb-3" onMouseEnter={() => setFoco(e)}>
                  <p className="flex items-center gap-1.5 font-label text-[11px] uppercase tracking-[0.14em] text-t3">
                    <span className="w-2 h-2 rounded-full" style={{ background: COR[e] }} aria-hidden />
                    {NOME_ETAPA[e]}
                  </p>
                  <p className="font-display text-[34px] leading-none font-extrabold tracking-[-0.03em] text-t1 tabular-nums mt-2.5">
                    {n(v)}
                  </p>
                  <p className="text-[12.5px] text-t4 mt-1.5 tabular-nums">
                    {i === 0 ? 'leads na safra' : `${fmtTaxa(taxa(v, c.recebidos))} dos leads`}
                  </p>
                  {passo && (
                    <p className="inline-flex items-center gap-1 mt-2 h-6 px-2 rounded-full bg-s2 text-[12px] text-t2 tabular-nums"
                       title={`De ${n(passo.base)} em ${NOME_ETAPA[passo.anterior].toLowerCase()}, ${n(passo.n)} chegaram a ${NOME_ETAPA[e].toLowerCase()}`}>
                      <span className="font-semibold text-t1">{fmtTaxa(passo.taxaPasso)}</span> do passo anterior
                    </p>
                  )}
                  {/* Celular: a fita vira uma barra por etapa */}
                  <div className="sm:hidden mt-3 h-2 rounded-full bg-s2 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${escala(v, c.recebidos)}%`, background: COR[e] }} />
                  </div>
                  </div>
                </li>
              )
            })}
          </ol>

          {/* A fita: afina de etapa em etapa */}
          <svg viewBox={`0 0 ${W} ${H + 8}`} preserveAspectRatio="none" className="hidden sm:block w-full h-[120px]" aria-hidden>
            <defs>
              {COLUNAS.map(e => (
                <linearGradient key={e} id={`fita-${e}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={COR[e]} stopOpacity="0.95" />
                  <stop offset="1" stopColor={COR[e]} stopOpacity="0.7" />
                </linearGradient>
              ))}
            </defs>
            {COLUNAS.map((e, i) => {
              const x = i * col + (col - barra) / 2
              const meio = (H + 8) / 2
              const h = alt[i]
              const apagado = foco !== null && foco !== e
              return (
                <g key={e} className="transition-opacity duration-200" style={{ opacity: apagado ? 0.3 : 1 }}>
                  {i < 4 && (
                    <path
                      d={`M ${x + barra} ${meio - h / 2} L ${x + col} ${meio - alt[i + 1] / 2} L ${x + col} ${meio + alt[i + 1] / 2} L ${x + barra} ${meio + h / 2} Z`}
                      fill={COR[COLUNAS[i + 1]]} opacity="0.16" />
                  )}
                  <rect x={x} y={meio - h / 2} width={barra} height={h} rx="6" fill={`url(#fita-${e})`} />
                </g>
              )
            })}
          </svg>

          {/* Onde pararam */}
          <div className="grid grid-cols-1 sm:grid-cols-5 border-t border-line bg-s2/40">
            {COLUNAS.map((e, i) => {
              const apagado = foco !== null && foco !== e
              const parada = e === 'venda' ? null : c.parouEm[e]
              return (
                <div key={e} className={`px-5 py-3 sm:border-l first:border-l-0 border-line transition-opacity duration-200 ${apagado ? 'opacity-45' : ''}`}>
                  <p className="text-[11.5px] text-t4">{i === 0 ? 'Pararam no 1º contato' : e === 'venda' ? 'Fecharam' : `Pararam em ${NOME_ETAPA[e].toLowerCase()}`}</p>
                  {parada ? (
                    <p className="text-[13px] text-t2 tabular-nums mt-0.5">
                      <span className="font-semibold text-t1">{n(parada.ativos)}</span> {parada.ativos === 1 ? 'vivo' : 'vivos'}
                      <span className="text-t4"> · </span>
                      <span className="font-semibold text-t1">{n(parada.descartados)}</span> {parada.descartados === 1 ? 'descartado' : 'descartados'}
                    </p>
                  ) : (
                    <p className="text-[13px] text-t2 tabular-nums mt-0.5">
                      <span className="font-semibold text-success">{n(c.venda)}</span> {c.venda === 1 ? 'venda' : 'vendas'}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

function MiniNumero({ rotulo, valor, nota }: { rotulo: string; valor: string; nota: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-t4 truncate">{rotulo}</dt>
      <dd className="font-display text-[20px] font-extrabold tracking-[-0.02em] text-t1 tabular-nums leading-tight">{valor}</dd>
      <dd className="text-[11.5px] text-t4 truncate">{nota}</dd>
    </div>
  )
}

function Leituras({ itens }: { itens: ReturnType<typeof leiturasSafra> }) {
  if (itens.length === 0) return null
  return (
    <section aria-label="O que os números dizem">
      <SecaoTitulo icon={Percent}>O que os números *dizem*</SecaoTitulo>
      <ul className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-2.5 stagger-children">
        {itens.map((l, i) => (
          <li key={i} className="flex items-start gap-3 text-[14px] leading-relaxed text-t2">
            <span className={`mt-[9px] w-1.5 h-1.5 rounded-full flex-shrink-0 ${TOM[l.tom].ponto}`} aria-hidden />
            <span>{l.texto}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ─── Lado a lado ──────────────────────────────────────────────────────────────

function LadoALado({ dados, filtro, admin, nomeCorretor, nomeProduto, escolherCorretor, escolherProduto }: {
  dados: FunilSafra
  filtro: Filtro
  admin: boolean
  nomeCorretor: string | null
  nomeProduto: string | null
  escolherCorretor: (id: string | null) => void
  escolherProduto: (k: string | null) => void
}) {
  const podeCorretores = admin && dados.corretores.length > 1
  // Com um corretor escolhido, o natural é ver o funil dele em cada produto.
  const [dimEscolhida, setDim] = useState<'corretor' | 'produto' | null>(null)
  const dim = !podeCorretores ? 'produto' : dimEscolhida ?? (filtro.corretor ? 'produto' : 'corretor')
  const fatias = useMemo(() => ladoALado(dados, dim, filtro), [dados, dim, filtro])

  if (fatias.length === 0) return null

  const descricao = dim === 'corretor'
    ? `O funil de cada corretor${nomeProduto ? ` no ${nomeProduto}` : ''}. Toque em um para filtrar a tela por ele.`
    : `O funil de cada produto${nomeCorretor ? ` nos leads de ${nomeCorretor}` : ''}. Toque em um para filtrar a tela por ele.`
  const selecionado = dim === 'corretor' ? filtro.corretor : filtro.produto
  const escolher = (chave: string) => {
    if (dim === 'corretor') { if (chave !== SEM) escolherCorretor(chave === selecionado ? null : chave) }
    else escolherProduto(chave === selecionado ? null : chave)
  }

  return (
    <section aria-label="Funis lado a lado">
      <div className="flex items-end gap-3 flex-wrap mb-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-t1 tracking-[-0.01em]">
            Lado a <Destaque>lado</Destaque>
          </h3>
          <p className="text-[12.5px] text-t4 mt-0.5">{descricao}</p>
        </div>
        {podeCorretores && (
          <div className="ml-auto">
            <Segmentado rotulo="Comparar" valor={dim} onChange={v => setDim(v)}
              opcoes={[{ value: 'corretor' as const, label: 'Corretores' }, { value: 'produto' as const, label: 'Produtos' }]} />
          </div>
        )}
      </div>
      <ul className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(236px,1fr))] stagger-children">
        {fatias.map(f => (
          <li key={f.chave}>
            <CartaoFunil fatia={f} ativo={f.chave === selecionado}
              onClick={dim === 'corretor' && f.chave === SEM ? undefined : () => escolher(f.chave)} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function CartaoFunil({ fatia, ativo, onClick }: { fatia: Fatia; ativo: boolean; onClick?: () => void }) {
  const { c } = fatia
  const pouco = c.recebidos < 5
  const corpo = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[14px] font-semibold text-t1 truncate">{fatia.nome}</span>
        <span className="text-[12px] text-t4 tabular-nums flex-shrink-0">{n(c.recebidos)} {c.recebidos === 1 ? 'lead' : 'leads'}</span>
      </div>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className={`font-display text-[26px] leading-none font-extrabold tracking-[-0.03em] tabular-nums ${pouco ? 'text-t3' : 'text-t1'}`}>
          {fmtTaxa(taxa(c.visita, c.recebidos))}
        </span>
        <span className="text-[12px] text-t4">chegaram a visita</span>
      </p>
      <ul className="mt-3 flex flex-col gap-1.5">
        {ETAPAS_SAFRA.map(e => (
          <li key={e} className="grid grid-cols-[76px_minmax(0,1fr)_28px_38px] items-center gap-2 text-[12px]">
            <span className="text-t3 truncate">{NOME_ETAPA[e]}</span>
            <span className="h-1.5 rounded-full bg-s2 overflow-hidden" aria-hidden>
              <span className="block h-full rounded-full" style={{ width: `${escala(c[e], c.recebidos)}%`, background: COR[e] }} />
            </span>
            <span className={`text-right tabular-nums font-semibold ${c[e] === 0 ? 'text-t4' : 'text-t1'}`}>{n(c[e])}</span>
            <span className="text-right tabular-nums text-t4">{fmtTaxa(taxa(c[e], c.recebidos))}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 pt-2.5 border-t border-line text-[11.5px] text-t4 tabular-nums">
        {pouco ? 'Poucos leads para comparar · ' : ''}
        {n(c.emAndamento)} em andamento · {fmtTaxa(taxa(c.descartados, c.recebidos))} descartados
      </p>
    </>
  )
  const base = `bento block w-full h-full text-left px-4 py-3.5 transition-[box-shadow,transform] duration-200
                ${ativo ? 'ring-2 ring-brand/60' : ''}`
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={ativo}
      aria-label={`${fatia.nome}: ${c.recebidos} leads, ${c.visita} chegaram a visita, ${c.venda} vendas`}
      className={`${base} cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-18px_rgba(15,39,89,.45)]
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50`}>
      {corpo}
    </button>
  ) : <div className={base}>{corpo}</div>
}

// ─── Corretor × produto ───────────────────────────────────────────────────────

const METRICAS: { value: EtapaSafra; label: string }[] = [
  { value: 'atendimento', label: 'Atendimento' },
  { value: 'visita',      label: 'Visita' },
  { value: 'venda',       label: 'Venda' },
]

/**
 * Quem converte o quê: cada célula é a taxa da etapa escolhida naquele
 * corretor e naquele produto. Mais forte = taxa maior. Com menos de 5 leads a
 * célula fica sem cor — porcentagem de três leads não diz nada.
 */
function Matriz({ dados, filtro, escolher }: {
  dados: FunilSafra
  filtro: Filtro
  escolher: (corretor: string | null, produto: string | null) => void
}) {
  const [metrica, setMetrica] = useState<EtapaSafra>('visita')
  const m = useMemo(() => matriz(dados), [dados])
  if (m.linhas.length < 2 || m.colunas.length < 2) return null

  const tx = (c: Contagem) => (c.recebidos >= 5 ? taxa(c[metrica], c.recebidos) : null)
  const maior = Math.max(1, ...m.linhas.flatMap(l => m.colunas.map(col => tx(m.celula(l.chave, col.chave)) ?? 0)))
  const cor = COR[metrica]

  const celula = (chave: string, c: Contagem, corretor: string | null, produto: string | null, total = false) => {
    const t = tx(c)
    const ativo = (corretor ?? null) === filtro.corretor && (produto ?? null) === filtro.produto
    if (c.recebidos === 0) return <td key={chave} className="px-2 py-2 text-center text-[13px] text-t4">—</td>
    const fundo = t !== null && !total ? `color-mix(in srgb, ${cor} ${Math.round(8 + 52 * (t / maior))}%, transparent)` : undefined
    const clicavel = corretor !== SEM
    const conteudo = (
      <>
        <span className={`block text-[14px] font-semibold tabular-nums ${t === null ? 'text-t4' : 'text-t1'}`}>{t === null ? '·' : fmtTaxa(t)}</span>
        <span className="block text-[11px] text-t4 tabular-nums">{n(c[metrica])} de {n(c.recebidos)}</span>
      </>
    )
    return (
      <td key={chave} className="p-1">
        {clicavel ? (
          <button type="button" onClick={() => escolher(corretor, produto)}
            aria-label={`${NOME_ETAPA[metrica]}: ${c[metrica]} de ${c.recebidos} leads`}
            className={`w-full min-w-[84px] rounded-[10px] px-2 py-1.5 text-center cursor-pointer transition-shadow
                        hover:ring-1 hover:ring-line focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50
                        ${total ? 'bg-s2/70' : ''} ${ativo ? 'ring-2 ring-brand/60' : ''}`}
            style={fundo ? { background: fundo } : undefined}>
            {conteudo}
          </button>
        ) : (
          <div className={`w-full min-w-[84px] rounded-[10px] px-2 py-1.5 text-center ${total ? 'bg-s2/70' : ''}`}
               style={fundo ? { background: fundo } : undefined}>{conteudo}</div>
        )}
      </td>
    )
  }

  const totalGeral = contar(dados)

  return (
    <section aria-label="Corretor por produto">
      <div className="flex items-end gap-3 flex-wrap mb-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-t1 tracking-[-0.01em]">
            Corretor × <Destaque>produto</Destaque>
          </h3>
          <p className="text-[12.5px] text-t4 mt-0.5">
            Quantos leads de cada cruzamento chegaram a {NOME_ETAPA[metrica].toLowerCase()}. Cor mais forte, taxa maior; com menos de 5 leads fica sem cor. Toque para filtrar.
          </p>
        </div>
        <div className="ml-auto">
          <Segmentado rotulo="Etapa da matriz" valor={metrica} onChange={setMetrica} opcoes={METRICAS} />
        </div>
      </div>
      <div className="bento overflow-x-auto">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-[1] bg-surface px-4 py-3 text-left text-[12px] font-medium text-t4">Corretor</th>
              {m.colunas.map(col => (
                <th key={col.chave} scope="col" className="px-2 py-3 text-center text-[12px] font-medium text-t3 max-w-[140px]">
                  <span className="block truncate" title={col.nome}>{col.nome}</span>
                </th>
              ))}
              <th scope="col" className="px-2 py-3 text-center text-[12px] font-semibold text-t2">Todos</th>
            </tr>
          </thead>
          <tbody>
            {m.linhas.map(l => (
              <tr key={l.chave} className="border-t border-line">
                <th scope="row" className="sticky left-0 z-[1] bg-surface px-4 py-1 text-left text-[13.5px] font-semibold text-t1 whitespace-nowrap">
                  {l.nome}
                </th>
                {m.colunas.map(col => celula(col.chave, m.celula(l.chave, col.chave), l.chave, col.chave))}
                {celula('todos', m.totalLinha(l.chave), l.chave, null, true)}
              </tr>
            ))}
            <tr>
              <th scope="row" className="sticky left-0 z-[1] bg-surface px-4 py-1 text-left text-[13.5px] font-semibold text-t2">Imobiliária</th>
              {m.colunas.map(col => celula(col.chave, m.totalColuna(col.chave), null, col.chave, true))}
              {celula('todos', totalGeral, null, null, true)}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ─── Safras no tempo ──────────────────────────────────────────────────────────

function Safras({ dados, filtro, inicio, fim }: { dados: FunilSafra; filtro: Filtro; inicio: string | null; fim: string | null }) {
  const serie = useMemo(() => serieSafra(dados, filtro, inicio, fim), [dados, filtro, inicio, fim])
  const unidade = { day: 'dia', week: 'semana', month: 'mês' }[dados.bucket]

  const opcao = useCallback((t: CoresGrafico) => {
    const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null)
    const linha = (nome: string, e: LeadFunnelStage, dados: (number | null)[]) => ({
      // Sem suavização: curva entre dois pontos sugere valor que não existiu.
      name: nome, type: 'line', yAxisIndex: 1, data: dados, connectNulls: false,
      symbol: 'circle', symbolSize: 6, lineStyle: { width: 2.5, color: resolverCor(STAGE_THEME[e].solidVar) },
      itemStyle: { color: resolverCor(STAGE_THEME[e].solidVar) },
    })
    return {
      grid: { left: 4, right: 4, top: 40, bottom: 4, containLabel: true },
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'shadow' },
        valueFormatter: (v: number | null) => (v === null || v === undefined ? '—' : String(v)),
      },
      xAxis: eixoCategoria(t, serie.map(s => rotuloBalde(s.bucket, dados.bucket))),
      yAxis: [
        eixoValor(t, undefined, { minInterval: 1 }),
        eixoValor(t, (v: number) => `${v}%`, { splitLine: { show: false }, max: (x: { max: number }) => Math.max(10, Math.ceil(x.max / 10) * 10) }),
      ],
      series: [
        {
          name: 'Leads que chegaram', type: 'bar', barMaxWidth: 26,
          data: serie.map(s => s.recebidos),
          itemStyle: { color: resolverCor('var(--stage-lead)'), opacity: 0.3, borderRadius: [5, 5, 0, 0] },
        },
        linha('% atendidos', 'atendimento', serie.map(s => pct(s.atendimento, s.recebidos))),
        linha('% com visita', 'visita', serie.map(s => pct(s.visita, s.recebidos))),
      ],
    }
  }, [serie, dados.bucket])

  if (serie.length < 2) return null
  return (
    <section>
      <SecaoTitulo icon={Percent}
        descricao={`Cada barra é a safra de um ${unidade}: quantos chegaram (escala da esquerda) e quanto dela foi atendida e visitou até hoje (direita). Safra recente ainda está amadurecendo.`}>
        Safra a *safra*
      </SecaoTitulo>
      <Grafico
        altura={290}
        opcao={opcao}
        rotulo={`Safras por ${unidade}: ${serie.reduce((s, x) => s + x.recebidos, 0)} leads em ${serie.length} ${unidade === 'mês' ? 'meses' : `${unidade}s`}.`}
      />
    </section>
  )
}

// ─── Saídas e tempo ───────────────────────────────────────────────────────────

function Saidas({ dados, filtro, total, nomeMotivo }: {
  dados: FunilSafra; filtro: Filtro; total: Contagem; nomeMotivo: (slug: string) => string
}) {
  const lista = motivosSafra(dados, filtro)
  return (
    <section>
      <SecaoTitulo icon={Percent} descricao={`${n(total.descartados)} leads da safra saíram do funil (${fmtTaxa(taxa(total.descartados, total.recebidos))}).`}>
        Por que os leads *saem*
      </SecaoTitulo>
      {lista.length === 0 ? (
        <p className="text-[13px] text-t4 py-6">Nenhum lead desta safra foi descartado.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {lista.map(m => (
            <li key={m.motivo}>
              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <span className="text-[14px] text-t1 truncate">{nomeMotivo(m.motivo)}</span>
                <span className="text-[13px] text-t3 tabular-nums flex-shrink-0">
                  {n(m.n)} · {fmtTaxa(taxa(m.n, total.descartados))}
                </span>
              </div>
              <Barra pct={taxa(m.n, total.descartados) ?? 0} tom="neutro" altura={5}
                rotuloAcessivel={`${nomeMotivo(m.motivo)}: ${m.n} de ${total.descartados} descartes`} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function TempoAteVisita({ dados, filtro }: { dados: FunilSafra; filtro: Filtro }) {
  const t = tempoAteVisita(dados, filtro)
  const maior = Math.max(1, ...t.faixas.map(f => f.n))
  return (
    <section>
      <SecaoTitulo icon={Percent} descricao="Dias entre a chegada do lead e a primeira vez que ele entrou em Visita.">
        Quanto demora até a *visita*
      </SecaoTitulo>
      {t.total === 0 ? (
        <p className="text-[13px] text-t4 py-6">Nenhum lead desta safra chegou a visita ainda.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {t.faixas.map(f => (
            <li key={f.rotulo} className="grid grid-cols-[120px_minmax(0,1fr)_56px] items-center gap-3">
              <span className="text-[13.5px] text-t2">{f.rotulo}</span>
              <span className="h-6 rounded-[7px] bg-s2 overflow-hidden" aria-hidden>
                <span className="block h-full rounded-[7px]"
                  style={{ width: `${f.n === 0 ? 0 : Math.max(3, (f.n / maior) * 100)}%`, background: COR.visita, opacity: 0.85 }} />
              </span>
              <span className="text-right text-[13px] tabular-nums">
                <span className={`font-semibold ${f.n === 0 ? 'text-t4' : 'text-t1'}`}>{n(f.n)}</span>
                <span className="text-t4"> · {fmtTaxa(taxa(f.n, t.total))}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
