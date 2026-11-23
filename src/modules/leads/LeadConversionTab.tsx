import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Building2, Filter, RefreshCw, User, X } from 'lucide-react'
import { db } from '../../lib/db'
import { useAdminView } from '../../hooks/useAdminView'
import { useContagem } from '../../hooks/useContagem'
import { useAuthStore } from '../../store/useAuthStore'
import { usePeriodStore } from '../../store/usePeriodStore'
import { useLeadConfigStore } from '../../store/useLeadConfigStore'
import { PeriodSelector } from '../../components/shared/PeriodSelector'
import { FilterDropdown } from '../../components/shared/FilterDropdown'
import { EstadoTela } from '../../components/shared/EstadoTela'
import { EsqueletoKpis, EsqueletoLinhas } from '../../components/shared/Esqueleto'
import { destacar } from '../../components/shared/Destaque'
import { Segmentado } from '../../components/shared/visual'
import { Grafico, eixoCategoria, eixoValor } from '../../components/charts/Grafico'
import type { CoresGrafico } from '../../components/charts/Grafico'
import { fmtDataCurta, fmtTaxa, montarRecorte, rotuloBalde, slugLegivel, taxa } from './conversao'
import {
  ETAPAS_SAFRA, NOME_ETAPA, SEM, contar, ladoALado, matriz, motivosSafra, normalizar,
  passosSafra, serieSafra, tempoAteVisita,
} from './safra'
import type { Contagem, EtapaSafra, Fatia, Filtro, FunilSafra, PontoSafra } from './safra'
import { FunilDesenhado, TOM, TOM_DESCARTE } from './FunilDesenhado'
import type { ChaveFatia, FatiaDesenho } from './FunilDesenhado'

/**
 * Leads › Conversão — 22/11/2026, na linguagem do Pulse.
 *
 * Sempre por safra: dos leads que CHEGARAM no período, até onde foram até
 * hoje. Topo claro com filtros e um cartão de número por etapa, cards brancos
 * sobre o fundo pontilhado, e o funil DESENHADO — a mesma forma do Pulse — no
 * grande e, lado a lado, um por corretor ou produto. Inspirada no Pulse, não
 * copiada: a faixa Marinho é dele (o Rafael não quis repetir).
 *
 * Pouco texto de propósito (pedido do Rafael): número, desenho e rótulo curto.
 *
 * O banco devolve um cubo pequeno (`funil_por_safra`, migração 103, ~5 KB) e a
 * tela recorta na hora por corretor e produto; só o período vai ao banco.
 * Descartado conta; crédito para o dono atual do lead.
 */

const COLUNAS: ChaveFatia[] = ['chegada', ...ETAPAS_SAFRA]
const n = (x: number) => x.toLocaleString('pt-BR')
const pct = (a: number, b: number) => fmtTaxa(taxa(a, b))

function fatiasDe(c: Contagem): FatiaDesenho[] {
  return COLUNAS.map(k => ({ chave: k, nome: k === 'chegada' ? 'Leads' : NOME_ETAPA[k], n: k === 'chegada' ? c.recebidos : c[k] }))
}

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

  // Corretor comum: o cubo já vem só com os leads dele.
  const corretor = isAdmin && !isGlobalView ? effectiveBrokerId : null
  const filtro: Filtro = useMemo(() => ({ corretor, produto }), [corretor, produto])

  const nomeCorretor = (id: string | null) =>
    id === null ? null
      : dados?.corretores.find(c => c.chave === id)?.nome ?? allProfiles.find(p => p.id === id)?.name ?? 'Corretor'
  const nomeProduto = (k: string | null) => (k === null ? null : dados?.produtos.find(p => p.chave === k)?.nome ?? 'Produto')

  const total = useMemo(() => (dados ? contar(dados, filtro) : null), [dados, filtro])
  const serie = useMemo(() => (dados ? serieSafra(dados, filtro, recorte.inicio, recorte.fim) : []), [dados, filtro, recorte])

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
  const quando = recorte.inicio && recorte.fim ? `${fmtDataCurta(recorte.inicio)} a ${fmtDataCurta(recorte.fim)}` : 'desde o começo'

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* ── Topo: título, filtros e os números da safra ── */}
      <header className="flex items-end gap-x-4 gap-y-3 flex-wrap px-1 pt-1">
        <div className="min-w-0">
          <p className="font-label text-[11px] font-semibold uppercase tracking-[0.18em] text-t3">Safra · {quando}</p>
          <h2 className="font-display text-[24px] leading-tight font-bold tracking-[-0.03em] text-t1 mt-0.5">
            {destacar('Conversão do *funil*')}
          </h2>
        </div>
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
            aria-label="Atualizar"
            className="w-9 h-9 rounded-[10px] flex items-center justify-center text-t3 hover:text-t1 hover:bg-white
                       cursor-pointer disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <RefreshCw size={15} strokeWidth={1.8} className={carregando ? 'animate-spin' : ''} aria-hidden />
          </button>
        </div>
      </header>

      {(corretor || produto) && (
        <div className="flex items-center gap-2 flex-wrap px-1 -mt-1">
          {corretor && <FiltroAtivo rotulo={nomeCorretor(corretor)!} icone={User} onLimpar={() => escolherCorretor(null)} />}
          {produto && <FiltroAtivo rotulo={nomeProduto(produto)!} icone={Building2} onLimpar={() => setProduto(null)} />}
        </div>
      )}

      {total && total.recebidos > 0 && <NumerosDaSafra c={total} />}

      <EstadoTela
        carregando={carregando && !dados}
        erro={erro}
        vazio={!!dados && dados.cubo.length === 0}
        onTentarDeNovo={() => void carregar()}
        icone={Filter}
        titulo="Nenhum lead chegou no *período*"
        descricao="Troque o período no topo."
        esqueleto={<div className="flex flex-col gap-4"><EsqueletoKpis kpis={3} /><EsqueletoLinhas linhas={6} /></div>}
      >
        {dados && total && (
          <div className={`flex flex-col gap-4 transition-opacity duration-200 ${carregando ? 'opacity-60' : ''}`} aria-busy={carregando}>
            {total.recebidos === 0 ? (
              <p className="rounded-[16px] border border-line bg-surface px-6 py-12 text-center text-[14px] text-t3">Nenhum lead neste recorte.</p>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-4">
                <Cartao titulo="Funil da *safra*" extra="passe o mouse nas etapas">
                  <FunilDaSafra c={total} />
                </Cartao>
                <div className="grid grid-cols-1 gap-4 content-start">
                  <Cartao titulo="Onde *param*" extra="vivos · descartados">
                    <OndeParam c={total} />
                  </Cartao>
                  <Cartao titulo="Até a *visita*" extra="dias desde a chegada">
                    <AteAVisita dados={dados} filtro={filtro} />
                  </Cartao>
                </div>
              </div>
            )}

            <LadoALado
              dados={dados}
              filtro={filtro}
              admin={isAdmin}
              escolherCorretor={escolherCorretor}
              escolherProduto={setProduto}
            />

            {total.recebidos > 0 && (
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-4">
                <Cartao titulo="Safra a *safra*" extra={{ day: 'por dia', week: 'por semana', month: 'por mês' }[dados.bucket]}>
                  <SafraASafra serie={serie} balde={dados.bucket} />
                </Cartao>
                <Cartao titulo="Por que *saem*" extra={`${n(total.descartados)} descartados`}>
                  <PorQueSaem dados={dados} filtro={filtro} total={total} nomeMotivo={nomeMotivo} />
                </Cartao>
              </div>
            )}

            {isAdmin && <Matriz dados={dados} filtro={filtro} escolher={(c, p) => { escolherCorretor(c); setProduto(p) }} />}
          </div>
        )}
      </EstadoTela>
    </div>
  )
}

// ─── Peças ────────────────────────────────────────────────────────────────────

function Cartao({ titulo, extra, acao, children, className = '' }: {
  titulo: string; extra?: ReactNode; acao?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <section className={`rounded-[16px] border border-line bg-surface flex flex-col min-w-0 overflow-hidden ${className}`}>
      <header className="flex items-center gap-3 px-5 pt-4 pb-3 flex-wrap">
        <h3 className="font-display text-[15.5px] font-semibold tracking-[-0.015em] text-t1 whitespace-nowrap">{destacar(titulo)}</h3>
        {extra && <span className="min-w-0 text-[12.5px] text-t4 truncate">{extra}</span>}
        {acao && <div className="ml-auto">{acao}</div>}
      </header>
      <div className="flex-1 min-h-0 px-5 pb-5">{children}</div>
    </section>
  )
}

function FiltroAtivo({ rotulo, icone: Icone, onLimpar }: { rotulo: string; icone: typeof User; onLimpar: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 h-8 pl-3 pr-1 rounded-full bg-surface border border-line text-[13px] font-medium text-t1">
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

function Vivo({ valor }: { valor: number }) {
  const v = useContagem(valor)
  return <>{Math.round(v).toLocaleString('pt-BR')}</>
}

// ─── Números da safra ─────────────────────────────────────────────────────────

/**
 * Um cartão por etapa, com a cor da etapa (a mesma do funil): o número, quanto
 * isso é dos leads e uma barra na cor da etapa. O último é a conversão em
 * venda — o único dourado da tela.
 */
function NumerosDaSafra({ c }: { c: Contagem }) {
  const itens: { chave: ChaveFatia | 'descarte'; rotulo: string; valor: number; nota: string }[] = [
    { chave: 'chegada',     rotulo: 'Leads',       valor: c.recebidos,   nota: `${n(c.emAndamento)} em andamento` },
    { chave: 'atendimento', rotulo: 'Atendidos',   valor: c.atendimento, nota: `${pct(c.atendimento, c.recebidos)} dos leads` },
    { chave: 'visita',      rotulo: 'Visitaram',   valor: c.visita,      nota: `${pct(c.visita, c.recebidos)} dos leads` },
    { chave: 'proposta',    rotulo: 'Propostas',   valor: c.proposta,    nota: `${pct(c.proposta, c.recebidos)} dos leads` },
    { chave: 'descarte',    rotulo: 'Descartados', valor: c.descartados, nota: `${pct(c.descartados, c.recebidos)} dos leads` },
  ]
  return (
    <div className="rounded-[16px] border border-line bg-surface grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 overflow-hidden">
      {itens.map((it, i) => (
        <div key={it.rotulo} className={`px-5 py-4 min-w-0 border-line ${i > 0 ? 'xl:border-l' : ''} ${i % 2 ? 'border-l md:border-l-0' : ''} ${i % 3 ? 'md:border-l' : ''} ${i >= 2 ? 'border-t md:border-t-0' : ''} ${i >= 3 ? 'md:border-t xl:border-t-0' : ''}`}>
          <p className="flex items-center gap-2 text-[12.5px] text-t3 truncate">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: it.chave === 'descarte' ? TOM_DESCARTE : TOM[it.chave].barra }} aria-hidden />
            {it.rotulo}
          </p>
          <p className="mt-1.5 font-display text-[28px] leading-none font-semibold tracking-[-0.03em] tabular-nums text-t1">
            <Vivo valor={it.valor} />
          </p>
          <p className="mt-1.5 text-[12px] text-t4 truncate tabular-nums">{it.nota}</p>
        </div>
      ))}
      <div className="px-5 py-4 min-w-0 border-line border-l border-t xl:border-t-0">
        <p className="flex items-center gap-2 text-[12.5px] text-t3">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: TOM.venda.barra }} aria-hidden />
          Viraram venda
        </p>
        <p className="mt-1.5 font-display text-[28px] leading-none font-semibold tracking-[-0.03em] tabular-nums" style={{ color: TOM.venda.barra }}>
          {fmtTaxa(taxa(c.venda, c.recebidos))}
        </p>
        <p className="mt-1.5 text-[12px] text-t4 tabular-nums">{n(c.venda)} {c.venda === 1 ? 'venda' : 'vendas'} de {n(c.recebidos)}</p>
      </div>
    </div>
  )
}

// ─── Funil da safra ───────────────────────────────────────────────────────────

function FunilDaSafra({ c }: { c: Contagem }) {
  const [foco, setFoco] = useState<ChaveFatia | null>(null)
  const ps = passosSafra(c)
  const fatias = fatiasDe(c)
  const f = fatias.find(x => x.chave === foco)
  const passo = foco && foco !== 'chegada' ? ps.find(p => p.etapa === foco) : null
  const parada = foco && foco !== 'venda' ? c.parouEm[foco] : null

  const dica = f && (
    <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-[12px] bg-[#0F2759] px-4 py-3 text-white pulse-item-in whitespace-nowrap"
         role="status">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: f.chave === 'venda' ? '#E2C385' : '#B8C5E3' }}>{f.nome}</p>
      <p className="mt-1 font-display text-[22px] font-semibold leading-none tabular-nums">
        {n(f.n)}<span className="ml-1.5 text-[14px] font-medium text-white/70">{pct(f.n, c.recebidos)} dos leads</span>
      </p>
      {passo && <p className="mt-1 text-[13px] text-white/75">{passo.anterior === 'chegada' ? `${fmtTaxa(passo.taxaPasso)} dos leads chegaram aqui` : `${fmtTaxa(passo.taxaPasso)} de quem estava em ${NOME_ETAPA[passo.anterior].toLowerCase()}`}</p>}
      {parada && <p className="mt-0.5 text-[13px] text-white/75">pararam aqui: {n(parada.ativos)} vivos · {n(parada.descartados)} descartados</p>}
    </div>
  )

  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-4 items-stretch">
      <FunilDesenhado fatias={fatias} foco={foco} onFoco={setFoco} dica={dica}
        rotulo={`Funil da safra: ${fatias.map(x => `${x.nome} ${x.n}`).join(', ')}.`} />
      <Escada c={c} foco={foco} />
    </div>
  )
}

/** Os degraus da safra e, entre eles, quanto avançou de um para o outro. */
function Escada({ c, foco }: { c: Contagem; foco: ChaveFatia | null }) {
  const ps = passosSafra(c)
  const maxRaiz = Math.sqrt(Math.max(1, c.recebidos))
  return (
    <ol className="md:border-l border-line md:pl-6 py-1 flex flex-col justify-between gap-1">
      {COLUNAS.map((k, i) => {
        const v = k === 'chegada' ? c.recebidos : c[k]
        const p = i > 0 ? ps[i - 1] : null
        return (
          <li key={k} className="transition-opacity duration-200" style={{ opacity: foco === null || foco === k ? 1 : 0.35 }}>
            {p && (
              <div className="flex items-center gap-2 py-1 pl-1">
                <span className="text-t4 text-[14px]" aria-hidden>↓</span>
                <span className="rounded-full px-2 py-px text-[12px] font-semibold tabular-nums"
                      style={{ background: `color-mix(in srgb, ${TOM[k].barra} 12%, transparent)`, color: k === 'chegada' ? TOM.atendimento.barra : TOM[k].barra }}>
                  {fmtTaxa(p.taxaPasso)}
                </span>
                <span className="text-[12.5px] text-t3">avançam</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="w-[96px] shrink-0 text-[13.5px] font-medium text-t2">{k === 'chegada' ? 'Leads' : NOME_ETAPA[k]}</span>
              <span className="relative flex-1 h-1.5 rounded-full bg-s2 overflow-hidden">
                <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700"
                      style={{ width: `${v > 0 ? Math.max(2, (Math.sqrt(v) / maxRaiz) * 100) : 0}%`, background: TOM[k].barra }} />
              </span>
              <span className="w-[56px] shrink-0 text-right font-display text-[17px] font-semibold tabular-nums text-t1">{n(v)}</span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// ─── Onde param · até a visita · por que saem ─────────────────────────────────

function OndeParam({ c }: { c: Contagem }) {
  const linhas = (['chegada', 'atendimento', 'visita', 'proposta'] as const).map(k => ({ k, ...c.parouEm[k] }))
  const maior = Math.max(1, ...linhas.map(l => l.ativos + l.descartados))
  return (
    <ul className="flex flex-col gap-3">
      {linhas.map(l => (
        <li key={l.k} className="grid grid-cols-[96px_minmax(0,1fr)_76px] items-center gap-3">
          <span className="text-[13.5px] text-t2">{l.k === 'chegada' ? '1º contato' : NOME_ETAPA[l.k]}</span>
          <span className="flex h-1.5 rounded-full bg-s2 overflow-hidden" aria-hidden>
            <span className="h-full" style={{ width: `${(l.ativos / maior) * 100}%`, background: TOM[l.k].barra }} />
            <span className="h-full" style={{ width: `${(l.descartados / maior) * 100}%`, background: TOM_DESCARTE }} />
          </span>
          <span className="text-right text-[13px] tabular-nums text-t3" aria-label={`${l.ativos} vivos, ${l.descartados} descartados`}>
            <b className="font-semibold text-t1">{n(l.ativos)}</b> · {n(l.descartados)}
          </span>
        </li>
      ))}
      <li className="grid grid-cols-[96px_minmax(0,1fr)_76px] items-center gap-3">
        <span className="text-[13.5px] text-t2">Venda</span>
        <span className="h-1.5 rounded-full bg-s2 overflow-hidden" aria-hidden>
          <span className="block h-full rounded-full" style={{ width: `${c.venda > 0 ? Math.max(2, (c.venda / maior) * 100) : 0}%`, background: TOM.venda.barra }} />
        </span>
        <span className="text-right text-[13px] tabular-nums font-semibold" style={{ color: TOM.venda.barra }}>{n(c.venda)}</span>
      </li>
    </ul>
  )
}

const FAIXA_CURTA = ['mesmo dia', '1–3 d', '4–7 d', '8–14 d', '15+ d']

function AteAVisita({ dados, filtro }: { dados: FunilSafra; filtro: Filtro }) {
  const t = tempoAteVisita(dados, filtro)
  if (t.total === 0) return <p className="text-[14px] text-t4 py-2">Sem visitas ainda.</p>
  const maior = Math.max(1, ...t.faixas.map(f => f.n))
  return (
    <div className="flex items-end gap-6">
      <div className="shrink-0">
        <p className="font-display text-[32px] leading-none font-semibold tracking-[-0.03em] tabular-nums text-t1">
          {t.mediana! < 1 ? '0' : t.mediana!.toLocaleString('pt-BR')}<span className="text-[16px] font-bold text-t3 ml-1">dias</span>
        </p>
        <p className="text-[12.5px] text-t3 mt-1.5">mediana · {n(t.total)} visitas</p>
      </div>
      <div className="flex-1 grid grid-cols-5 gap-2 items-end h-[92px]">
        {t.faixas.map((f, i) => (
          <div key={f.rotulo} className="flex flex-col items-center justify-end h-full gap-1" title={`${f.rotulo}: ${f.n}`}>
            <span className="text-[12px] font-semibold tabular-nums text-t2">{f.n || ''}</span>
            <span className="w-full rounded-t-[5px]" style={{ height: `${f.n ? Math.max(6, (f.n / maior) * 54) : 3}px`, background: f.n ? TOM.visita.fill : 'var(--s2)' }} />
            <span className="text-[11px] text-t4 whitespace-nowrap">{FAIXA_CURTA[i]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PorQueSaem({ dados, filtro, total, nomeMotivo }: {
  dados: FunilSafra; filtro: Filtro; total: Contagem; nomeMotivo: (slug: string) => string
}) {
  const lista = motivosSafra(dados, filtro)
  if (lista.length === 0) return <p className="text-[14px] text-t4 py-2">Nenhum descarte.</p>
  return (
    <ul className="flex flex-col gap-3.5">
      {lista.map(m => (
        <li key={m.motivo}>
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <span className="text-[13.5px] text-t2 truncate">{nomeMotivo(m.motivo)}</span>
            <span className="text-[13px] text-t3 tabular-nums shrink-0"><b className="font-semibold text-t1">{n(m.n)}</b> · {pct(m.n, total.descartados)}</span>
          </div>
          <span className="block h-1.5 rounded-full bg-s2 overflow-hidden" aria-hidden>
            <span className="block h-full rounded-full" style={{ width: `${Math.max(2, (m.n / lista[0].n) * 100)}%`, background: '#9AA6BD' }} />
          </span>
        </li>
      ))}
    </ul>
  )
}

// ─── Safra a safra ────────────────────────────────────────────────────────────

function SafraASafra({ serie, balde }: { serie: PontoSafra[]; balde: FunilSafra['bucket'] }) {
  const opcao = useCallback((t: CoresGrafico) => {
    const p = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null)
    const linha = (nome: string, cor: string, dados: (number | null)[]) => ({
      name: nome, type: 'line', yAxisIndex: 1, data: dados, symbol: 'circle', symbolSize: 5,
      lineStyle: { width: 2, color: cor }, itemStyle: { color: cor },
    })
    return {
      grid: { left: 4, right: 4, top: 36, bottom: 4, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: eixoCategoria(t, serie.map(s => rotuloBalde(s.bucket, balde))),
      yAxis: [
        eixoValor(t, undefined, { minInterval: 1 }),
        eixoValor(t, (v: number) => `${v}%`, { splitLine: { show: false }, max: (x: { max: number }) => Math.max(10, Math.ceil(x.max / 10) * 10) }),
      ],
      series: [
        {
          name: 'Leads', type: 'bar', barMaxWidth: 18, data: serie.map(s => s.recebidos),
          itemStyle: { borderRadius: [4, 4, 0, 0], color: TOM.chegada.fill },
        },
        linha('% atendidos', TOM.atendimento.barra, serie.map(s => p(s.atendimento, s.recebidos))),
        linha('% visitaram', TOM.proposta.barra, serie.map(s => p(s.visita, s.recebidos))),
      ],
    }
  }, [serie, balde])

  if (serie.length < 2) return <p className="text-[14px] text-t4 py-2">Período curto demais.</p>
  return <Grafico altura={270} opcao={opcao} rotulo={`Safra a safra: ${serie.reduce((s, x) => s + x.recebidos, 0)} leads em ${serie.length} pontos.`} />
}

// ─── Lado a lado ──────────────────────────────────────────────────────────────

function LadoALado({ dados, filtro, admin, escolherCorretor, escolherProduto }: {
  dados: FunilSafra
  filtro: Filtro
  admin: boolean
  escolherCorretor: (id: string | null) => void
  escolherProduto: (k: string | null) => void
}) {
  const podeCorretores = admin && dados.corretores.length > 1
  // Com um corretor escolhido, o natural é ver o funil dele em cada produto.
  const [dimEscolhida, setDim] = useState<'corretor' | 'produto' | null>(null)
  const dim = !podeCorretores ? 'produto' : dimEscolhida ?? (filtro.corretor ? 'produto' : 'corretor')
  const fatias = useMemo(() => ladoALado(dados, dim, filtro), [dados, dim, filtro])
  if (fatias.length === 0) return null

  const selecionado = dim === 'corretor' ? filtro.corretor : filtro.produto
  const escolher = (chave: string) => {
    if (dim === 'corretor') { if (chave !== SEM) escolherCorretor(chave === selecionado ? null : chave) }
    else escolherProduto(chave === selecionado ? null : chave)
  }

  return (
    <Cartao titulo="Lado a *lado*" extra="toque para filtrar"
      acao={podeCorretores && (
        <Segmentado rotulo="Comparar" valor={dim} onChange={v => setDim(v)}
          opcoes={[{ value: 'corretor' as const, label: 'Corretores' }, { value: 'produto' as const, label: 'Produtos' }]} />
      )}>
      <ul className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(250px,1fr))] stagger-children">
        {fatias.map(f => (
          <li key={f.chave}>
            <MiniFunil fatia={f} ativo={f.chave === selecionado}
              onClick={dim === 'corretor' && f.chave === SEM ? undefined : () => escolher(f.chave)} />
          </li>
        ))}
      </ul>
    </Cartao>
  )
}

function MiniFunil({ fatia, ativo, onClick }: { fatia: Fatia; ativo: boolean; onClick?: () => void }) {
  const { c } = fatia
  const desenho = fatiasDe(c)
  const corpo = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[14px] font-semibold text-t1 truncate">{fatia.nome}</span>
        <span className="text-[12.5px] font-semibold tabular-nums shrink-0" style={{ color: TOM.venda.barra }}>
          {fmtTaxa(taxa(c.venda, c.recebidos))} <span className="font-medium text-t4">venda</span>
        </span>
      </div>
      <div className="mt-3 flex justify-center">
        <FunilDesenhado tamanho="mini" fatias={desenho} rotulo={`${fatia.nome}: ${desenho.map(x => `${x.nome} ${x.n}`).join(', ')}`} />
      </div>
      <div className="mt-3 pt-2.5 border-t border-line grid grid-cols-3 gap-1 text-center">
        {(['atendimento', 'visita', 'proposta'] as EtapaSafra[]).map(e => (
          <span key={e} className="py-0.5">
            <span className="block text-[13px] font-semibold tabular-nums text-t1">{pct(c[e], c.recebidos)}</span>
            <span className="block text-[10.5px] text-t4">{NOME_ETAPA[e].toLowerCase()}</span>
          </span>
        ))}
      </div>
    </>
  )
  const base = `block w-full h-full text-left rounded-[14px] border bg-surface px-4 py-3.5 transition-colors duration-200 ${ativo ? 'border-[#2F4789]' : 'border-line'}`
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={ativo}
      aria-label={`${fatia.nome}: ${c.recebidos} leads, ${c.visita} visitas, ${c.venda} vendas`}
      className={`${base} cursor-pointer hover:border-[#A9B7D9]
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

/** Taxa da etapa em cada cruzamento. Menos de 5 leads: sem cor. */
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
  const cor = '#2F4789'
  const totalGeral = contar(dados)

  const celula = (chave: string, c: Contagem, corretor: string | null, produto: string | null, total = false) => {
    if (c.recebidos === 0) return <td key={chave} className="px-2 py-2 text-center text-[13px] text-t4">—</td>
    const t = tx(c)
    const forte = t !== null && !total ? t / maior : 0
    const ativo = corretor === filtro.corretor && produto === filtro.produto
    const fundo = t !== null && !total ? `color-mix(in srgb, ${cor} ${Math.round(6 + 74 * forte)}%, transparent)` : undefined
    const claro = forte > 0.6
    const conteudo = (
      <>
        <span className={`block text-[14px] font-semibold tabular-nums ${claro ? 'text-white' : t === null ? 'text-t4' : 'text-t1'}`}>{t === null ? '·' : fmtTaxa(t)}</span>
        <span className={`block text-[11px] tabular-nums ${claro ? 'text-white/80' : 'text-t4'}`}>{n(c[metrica])}/{n(c.recebidos)}</span>
      </>
    )
    const classe = `w-full min-w-[84px] rounded-[10px] px-2 py-2 text-center ${total ? 'bg-s2/60' : ''} ${ativo ? 'ring-1 ring-[#2F4789]' : ''}`
    return (
      <td key={chave} className="p-1">
        {corretor !== SEM ? (
          <button type="button" onClick={() => escolher(corretor, produto)}
            aria-label={`${NOME_ETAPA[metrica]}: ${c[metrica]} de ${c.recebidos} leads`}
            className={`${classe} cursor-pointer transition-colors hover:ring-1 hover:ring-[#A9B7D9] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50`}
            style={fundo ? { background: fundo } : undefined}>
            {conteudo}
          </button>
        ) : (
          <div className={classe} style={fundo ? { background: fundo } : undefined}>{conteudo}</div>
        )}
      </td>
    )
  }

  return (
    <Cartao titulo="Corretor × *produto*" extra={`% que chegou a ${NOME_ETAPA[metrica].toLowerCase()}`}
      acao={<Segmentado rotulo="Etapa da matriz" valor={metrica} onChange={setMetrica} opcoes={METRICAS} />}>
      <div className="overflow-x-auto -mx-2">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-[1] bg-surface px-3 py-2 text-left text-[12.5px] font-medium text-t4">Corretor</th>
              {m.colunas.map(col => (
                <th key={col.chave} scope="col" className="px-2 py-2 text-center text-[12.5px] font-semibold text-t2 max-w-[140px]">
                  <span className="block truncate" title={col.nome}>{col.nome}</span>
                </th>
              ))}
              <th scope="col" className="px-2 py-2 text-center text-[12.5px] font-semibold text-t1">Todos</th>
            </tr>
          </thead>
          <tbody>
            {m.linhas.map(l => (
              <tr key={l.chave}>
                <th scope="row" className="sticky left-0 z-[1] bg-surface px-3 py-1 text-left text-[14px] font-semibold text-t1 whitespace-nowrap">{l.nome}</th>
                {m.colunas.map(col => celula(col.chave, m.celula(l.chave, col.chave), l.chave, col.chave))}
                {celula('todos', m.totalLinha(l.chave), l.chave, null, true)}
              </tr>
            ))}
            <tr>
              <th scope="row" className="sticky left-0 z-[1] bg-surface px-3 py-1 text-left text-[14px] font-semibold text-t3">Imobiliária</th>
              {m.colunas.map(col => celula(col.chave, m.totalColuna(col.chave), null, col.chave, true))}
              {celula('todos', totalGeral, null, null, true)}
            </tr>
          </tbody>
        </table>
      </div>
    </Cartao>
  )
}
