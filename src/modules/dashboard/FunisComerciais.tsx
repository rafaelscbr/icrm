import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { destacar } from '../../components/shared/Destaque'
import { FotoPerfil } from '../../components/shared/FotoPerfil'
import { FunilJoia } from '../../components/shared/FunilJoia'
import type { EtapaFunil } from '../../components/shared/FunilJoia'
import { Segmentado } from '../../components/shared/visual'
import { useAuthStore } from '../../store/useAuthStore'
import { useDevelopmentsStore } from '../../store/useDevelopmentsStore'
import { db } from '../../lib/db'
import { mensagemDeErro } from '../../lib/erros'
import { formatCurrencyRound } from '../../lib/formatters'
import { JOIA } from '../../lib/paletaJoia'
import { fmtTaxa, taxa } from '../leads/conversao'
import { normalizar } from '../leads/safra'
import type { FunilSafra } from '../leads/safra'
import type { Lead, LeadFunnelStage, Sale } from '../../types'
import {
  ETAPAS_ABERTAS, inicioDoPeriodo, montarFunis, PERIODOS,
} from './funis'
import type { Dinheiro, EtapaAberta, Periodo, Recorte } from './funis'

/**
 * Funil comercial da dashboard principal (Rafael, 23/11/2026): o funil geral,
 * um por produto e um por corretor — conversão, VGV em andamento, VGV vendido,
 * comissão em pipeline e comissão recebida, dividida entre corretor e Souza.
 *
 * Fica logo abaixo da meta: é a resposta a "de onde vem o que falta".
 *
 * Os três tempos estão escritos na tela, porque misturá-los mente:
 *   conversão = safra do período · em andamento = agora · vendido = período.
 * A conta está em funis.ts; aqui é só desenho.
 */

/** Passos do funil, na régua da safra (lead e followup = chegaram). */
const PASSOS: { chave: 'recebidos' | 'atendimento' | 'visita' | 'proposta' | 'venda'; nome: string; joia: LeadFunnelStage }[] = [
  { chave: 'recebidos',   nome: 'Leads',       joia: 'lead' },
  { chave: 'atendimento', nome: 'Atendimento', joia: 'atendimento' },
  { chave: 'visita',      nome: 'Visita',      joia: 'visita' },
  { chave: 'proposta',    nome: 'Proposta',    joia: 'proposta' },
  { chave: 'venda',       nome: 'Vendas',      joia: 'venda' },
]

/** As fatias do funil de um recorte, na régua da safra. */
function etapasDoFunil(r: Recorte): EtapaFunil[] {
  return PASSOS.map(p => ({ chave: p.chave, nome: p.nome, n: r.safra[p.chave], joia: p.joia }))
}

const NOME_ABERTA: Record<EtapaAberta, string> = {
  chegada: '1º contato', atendimento: 'Atendimento', visita: 'Visita', proposta: 'Proposta',
}
const JOIA_ABERTA: Record<EtapaAberta, LeadFunnelStage> = {
  chegada: 'lead', atendimento: 'atendimento', visita: 'visita', proposta: 'proposta',
}

const CHAVE_PERIODO = 'icrm:dashboard:periodo-funil'

function periodoSalvo(): Periodo {
  try {
    const v = localStorage.getItem(CHAVE_PERIODO)
    if (v && PERIODOS.some(p => p.value === v)) return v as Periodo
  } catch { /* sem armazenamento: fica o padrão */ }
  return '3m'
}

const R = formatCurrencyRound

// ─── Componente ───────────────────────────────────────────────────────────────

export function FunisComerciais({ leads, sales, corretor, mostrarCorretores }: {
  leads: Lead[]
  sales: Sale[]
  /** corretor da visão; null = imobiliária inteira */
  corretor: string | null
  /** a grade por corretor — só na visão global do admin */
  mostrarCorretores: boolean
}) {
  const { isAdmin, profile, allProfiles } = useAuthStore()
  const { developments, carregarCarteira } = useDevelopmentsStore()

  const [periodo, setPeriodo] = useState<Periodo>(periodoSalvo)
  const [safra, setSafra] = useState<FunilSafra | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [tentativa, setTentativa] = useState(0)

  const inicio = inicioDoPeriodo(periodo)

  useEffect(() => { void carregarCarteira() }, [carregarCarteira])

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    setErro(null)
    db.funilSafra.carregar({ start: inicio, end: null, bucket: 'month' })
      .then(b => { if (vivo) setSafra(normalizar(b)) })
      .catch(err => { if (vivo) { setSafra(null); setErro(mensagemDeErro(err)) } })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [inicio, tentativa])

  function escolherPeriodo(p: Periodo) {
    setPeriodo(p)
    try { localStorage.setItem(CHAVE_PERIODO, p) } catch { /* sem armazenamento */ }
  }

  const perfis = useMemo(() => {
    const m = new Map(allProfiles.map(p => [p.id, p]))
    if (profile) m.set(profile.id, profile)
    return m
  }, [allProfiles, profile])

  const funis = useMemo(() => {
    if (!safra) return null
    return montarFunis({
      safra, leads, sales, inicio, corretor,
      pctDoLancamento: new Map(developments.map(d => [d.id, d.commissionPct])),
      lancamentos: developments.map(d => ({ id: d.id, nome: d.name })),
      shareDe: id => (id ? perfis.get(id)?.commissionShare ?? null : null),
      nomeDoCorretor: id => perfis.get(id)?.name ?? 'Corretor',
    })
  }, [safra, leads, sales, inicio, corretor, developments, perfis])

  const descricao = PERIODOS.find(p => p.value === periodo)!.descricao

  return (
    <section aria-labelledby="funis-titulo" className="mb-10">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 mb-3.5 px-0.5">
        <div className="min-w-0">
          <h2 id="funis-titulo" className="font-display text-[18px] font-bold text-t1 tracking-[-0.02em]">
            {destacar('Funil *comercial*')}
          </h2>
          <p className="text-[12.5px] text-t4 mt-0.5">
            Conversão de quem chegou {descricao} · em andamento agora · vendido {descricao}
          </p>
        </div>
        <Segmentado opcoes={PERIODOS.map(p => ({ value: p.value, label: p.label }))}
                    valor={periodo} onChange={escolherPeriodo} rotulo="Período do funil" />
      </div>

      {erro ? (
        <div role="alert" className="bento px-5 py-4 flex items-center gap-3">
          <p className="text-[13px] text-error flex-1">Não foi possível carregar o funil: {erro}</p>
          <button type="button" onClick={() => setTentativa(t => t + 1)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] bg-s2 text-[13px] font-medium text-t2 hover:text-t1 cursor-pointer">
            <RefreshCw size={13} aria-hidden /> Tentar de novo
          </button>
        </div>
      ) : !funis ? (
        <div className="grid lg:grid-cols-12 gap-4" aria-busy="true">
          <div className="lg:col-span-7 h-[420px] rounded-[22px] shimmer" />
          <div className="lg:col-span-5 h-[420px] rounded-[22px] shimmer" />
        </div>
      ) : (
        <div className={`flex flex-col gap-8 transition-opacity ${carregando ? 'opacity-60' : ''}`}>
          <FunilGeral r={funis.geral} admin={isAdmin} descricao={descricao} />

          {funis.porProduto.length > 0 && (
            <Grade titulo="Por *produto*" nota="do que mais tem dinheiro em jogo para o que menos tem">
              {funis.porProduto.map(r => <CartaoFunil key={r.chave} r={r} admin={isAdmin} />)}
            </Grade>
          )}

          {mostrarCorretores && funis.porCorretor.length > 0 && (
            <Grade titulo="Por *corretor*" nota="parte de cada um na comissão, pela regra do perfil">
              {funis.porCorretor.map(r => {
                const p = perfis.get(r.chave)
                return (
                  <CartaoFunil key={r.chave} r={r} admin={isAdmin}
                    foto={{ nome: r.nome, url: p?.avatarUrl, share: p?.commissionShare ?? null }} />
                )
              })}
            </Grade>
          )}
        </div>
      )}
    </section>
  )
}

function Grade({ titulo, nota, children }: { titulo: string; nota: string; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline gap-2.5 mb-3 px-0.5">
        <h3 className="font-display text-[16px] font-bold text-t1 tracking-[-0.02em]">{destacar(titulo)}</h3>
        <span className="text-[12px] text-t4 truncate">{nota}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">{children}</div>
    </div>
  )
}

// ─── Funil geral ──────────────────────────────────────────────────────────────

function FunilGeral({ r, admin, descricao }: { r: Recorte; admin: boolean; descricao: string }) {
  const s = r.safra
  const total = s.recebidos
  const fim = taxa(s.venda, total)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Conversão — o funil desenhado */}
      <article className="bento surface-premium lg:col-span-7 xl:col-span-8 p-5 sm:p-6 flex flex-col" aria-label="Conversão do funil">
        <header className="flex items-start justify-between gap-3 mb-5">
          <div>
            <p className="text-[12.5px] text-t4">Conversão</p>
            <p className="font-display text-[15px] font-bold text-t1 mt-0.5">
              {total.toLocaleString('pt-BR')} {total === 1 ? 'lead chegou' : 'leads chegaram'} {descricao}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[12.5px] text-t4">Lead → venda</p>
            <p className="font-display font-extrabold tabular-nums text-[26px] leading-none mt-1 text-t3"
               style={fim ? { color: JOIA.venda.medio } : undefined}>
              {fmtTaxa(fim)}
            </p>
          </div>
        </header>

        <div className="flex-1 flex items-center justify-center">
          <FunilJoia etapas={etapasDoFunil(r)} rotulo={`Funil de conversão, leads que chegaram ${descricao}`} />
        </div>

        <p className="mt-5 pt-4 border-t border-line text-[13px] text-t3">
          {total > 0
            ? <>De cada 100 leads que chegaram {descricao}, <b className="text-t1 font-semibold tabular-nums">{Math.round((s.venda / total) * 100)}</b> viraram venda até hoje e <b className="text-t1 font-semibold tabular-nums">{s.emAndamento.toLocaleString('pt-BR')}</b> seguem em andamento.</>
            : <>Nenhum lead chegou {descricao}.</>}
        </p>
      </article>

      {/* Dinheiro — em andamento e vendido */}
      <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-4">
        <article className="bento surface-premium p-5 sm:p-6" aria-label="VGV em andamento">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12.5px] text-t4">VGV em andamento · agora</p>
              <p className="font-display font-extrabold tabular-nums text-[30px] leading-tight tracking-[-0.02em] text-t1 truncate">
                {R(r.pipeline.vgv)}
              </p>
            </div>
            <p className="text-[12.5px] text-t4 tabular-nums text-right shrink-0 mt-1">
              {r.pipeline.n.toLocaleString('pt-BR')} {r.pipeline.n === 1 ? 'lead em aberto' : 'leads em aberto'}
            </p>
          </div>
          <PipelinePorEtapa r={r} />
          <Comissao rotulo="Comissão em pipeline" d={r.pipeline} admin={admin} />
        </article>

        <article className="bento surface-premium p-5 sm:p-6" aria-label="VGV vendido">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12.5px] text-t4">VGV vendido · {descricao}</p>
              <p className={`font-display font-extrabold tabular-nums text-[30px] leading-tight tracking-[-0.02em] truncate ${r.vendido.n ? 'text-success' : 'text-t1'}`}>
                {R(r.vendido.vgv)}
              </p>
            </div>
            <p className="text-[12.5px] text-t4 tabular-nums text-right shrink-0 mt-1">
              {r.vendido.n.toLocaleString('pt-BR')} {r.vendido.n === 1 ? 'venda' : 'vendas'}
            </p>
          </div>
          <Comissao rotulo="Comissão recebida" d={r.vendido} admin={admin} />
        </article>
      </div>
    </div>
  )
}

/** VGV aberto por etapa: uma barra dividida e a legenda com os valores. */
function PipelinePorEtapa({ r }: { r: Recorte }) {
  const total = r.pipeline.vgv
  return (
    <div className="mt-4">
      <div className="flex h-2.5 rounded-full overflow-hidden bg-s3" aria-hidden>
        {ETAPAS_ABERTAS.map(e => r.aberto[e].vgv > 0 && (
          <div key={e} style={{ width: `${(r.aberto[e].vgv / total) * 100}%`, background: JOIA[JOIA_ABERTA[e]].claro }} />
        ))}
      </div>
      <dl className="grid grid-cols-2 xl:grid-cols-1 gap-x-4 gap-y-2 mt-3">
        {ETAPAS_ABERTAS.map(e => (
          <div key={e} className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: JOIA[JOIA_ABERTA[e]].claro }} aria-hidden />
            <dt className="text-[12.5px] text-t3 truncate">
              {NOME_ABERTA[e]} <span className="text-t4 tabular-nums">· {r.aberto[e].n}</span>
            </dt>
            <dd className="ml-auto text-[12.5px] font-semibold text-t1 tabular-nums whitespace-nowrap">{R(r.aberto[e].vgv)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/**
 * A comissão e para onde ela vai. Admin vê a divisão inteira (corretor, Souza,
 * impostos); o corretor vê só a parte dele, como no Kanban.
 */
function Comissao({ rotulo, d, admin }: { rotulo: string; d: Dinheiro; admin: boolean }) {
  const partes = [
    { nome: 'Corretores', valor: d.corretor, cor: 'var(--info)' },
    { nome: 'Souza',      valor: d.souza,    cor: 'var(--brand-fill)' },
    { nome: 'Impostos',   valor: d.impostos, cor: 'var(--t5)' },
  ]
  if (!admin) {
    return (
      <div className="mt-4 pt-4 border-t border-line flex items-baseline justify-between gap-3">
        <p className="text-[13px] text-t3">{rotulo} · sua parte</p>
        <p className="font-display font-bold tabular-nums text-[18px] text-t1">{R(d.corretor)}</p>
      </div>
    )
  }
  return (
    <div className="mt-4 pt-4 border-t border-line">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] text-t3">{rotulo} <span className="text-t4">· bruta</span></p>
        <p className="font-display font-bold tabular-nums text-[18px] text-t1">{R(d.bruta)}</p>
      </div>
      {d.bruta > 0 && (
        <div className="flex h-1.5 rounded-full overflow-hidden bg-s3 mt-2.5" aria-hidden>
          {partes.map(p => p.valor > 0 && (
            <div key={p.nome} style={{ width: `${(p.valor / d.bruta) * 100}%`, background: p.cor }} />
          ))}
        </div>
      )}
      <dl className="grid grid-cols-3 gap-3 mt-2.5">
        {partes.map(p => (
          <div key={p.nome} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-[12px] text-t4">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.cor }} aria-hidden />
              {p.nome}
            </dt>
            <dd className="text-[13.5px] font-semibold text-t1 tabular-nums truncate">{R(p.valor)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

// ─── Cartão de produto / corretor ─────────────────────────────────────────────

function CartaoFunil({ r, admin, foto }: {
  r: Recorte
  admin: boolean
  foto?: { nome: string; url?: string; share: number | null }
}) {
  const s = r.safra
  const fim = taxa(s.venda, s.recebidos)

  return (
    <article className="bento surface-premium p-5 flex flex-col gap-4 min-w-0" aria-label={`Funil de ${r.nome}`}>
      <header className="flex items-center gap-3 min-w-0">
        {foto && <FotoPerfil nome={foto.nome} url={foto.url} tamanho={44} />}
        <div className="min-w-0 flex-1">
          <h4 className="font-display text-[16px] font-bold text-t1 truncate">{r.nome}</h4>
          <p className="text-[12.5px] text-t4 tabular-nums truncate">
            {s.recebidos.toLocaleString('pt-BR')} {s.recebidos === 1 ? 'lead chegou' : 'leads chegaram'}
            {foto?.share ? ` · ${foto.share.toLocaleString('pt-BR')}% da líquida` : ''}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-display font-extrabold tabular-nums text-[20px] leading-none text-t3"
             style={fim ? { color: JOIA.venda.medio } : undefined}>
            {fmtTaxa(fim)}
          </p>
          <p className="text-[11.5px] text-t4 mt-1">lead → venda</p>
        </div>
      </header>

      <div>
        <FunilJoia compacto etapas={etapasDoFunil(r)} rotulo={`Funil de ${r.nome}`} />
      </div>

      <div className="grid grid-cols-2 gap-3 pt-4 border-t border-line mt-auto">
        <Valores titulo="Em andamento" d={r.pipeline} n={r.pipeline.n} unidade={['lead', 'leads']} admin={admin} />
        <Valores titulo="Vendido" d={r.vendido} n={r.vendido.n} unidade={['venda', 'vendas']} admin={admin} vendido />
      </div>
    </article>
  )
}

function Valores({ titulo, d, n, unidade, admin, vendido = false }: {
  titulo: string
  d: Dinheiro
  n: number
  unidade: [string, string]
  admin: boolean
  vendido?: boolean
}) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] text-t4">
        {titulo} <span className="tabular-nums">· {n} {n === 1 ? unidade[0] : unidade[1]}</span>
      </p>
      <p className={`font-display font-extrabold tabular-nums text-[19px] leading-tight truncate mt-0.5 ${vendido && n ? 'text-success' : 'text-t1'}`}>
        {R(d.vgv)}
      </p>
      <dl className="mt-1.5 flex flex-col gap-0.5 text-[12px] tabular-nums">
        {admin ? (
          <>
            <Linha nome={vendido ? 'Comissão recebida' : 'Comissão'} valor={d.bruta} forte />
            <Linha nome="Corretor" valor={d.corretor} />
            <Linha nome="Souza" valor={d.souza} />
            <Linha nome="Impostos" valor={d.impostos} />
          </>
        ) : (
          <Linha nome="Sua parte" valor={d.corretor} forte />
        )}
      </dl>
    </div>
  )
}

function Linha({ nome, valor, forte = false }: { nome: string; valor: number; forte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 min-w-0">
      <dt className="text-t4 truncate">{nome}</dt>
      <dd className={`whitespace-nowrap ${forte ? 'text-t1 font-semibold' : 'text-t2'}`}>{R(valor)}</dd>
    </div>
  )
}
