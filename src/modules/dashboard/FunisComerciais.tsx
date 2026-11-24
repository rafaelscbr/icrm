import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Building2, RefreshCw } from 'lucide-react'
import { destacar } from '../../components/shared/Destaque'
import { FotoPerfil } from '../../components/shared/FotoPerfil'
import { FunilJoia } from '../../components/shared/FunilJoia'
import type { EtapaFunil } from '../../components/shared/FunilJoia'
import { useAuthStore } from '../../store/useAuthStore'
import type { Profile } from '../../store/useAuthStore'
import { useDevelopmentsStore } from '../../store/useDevelopmentsStore'
import { db } from '../../lib/db'
import { mensagemDeErro } from '../../lib/erros'
import { formatCurrencyRound } from '../../lib/formatters'
import { fmtTaxa, taxa } from '../leads/conversao'
import { normalizar } from '../leads/safra'
import type { FunilSafra } from '../leads/safra'
import type { Lead, LeadFunnelStage, Sale } from '../../types'
import { inicioDoPeriodo, montarFunis, PERIODOS } from './funis'
import type { Dinheiro, Periodo, Recorte } from './funis'

/**
 * Funil comercial da dashboard principal — redesenho de 24/11/2026 inspirado
 * na referência de "Invoices" que o Rafael mostrou: um painel branco com a
 * LISTA à esquerda (a imobiliária inteira, cada produto, cada corretor com a
 * foto) e o DETALHE em Marinho à direita (o funil e o dinheiro de quem está
 * selecionado). Antes eram três grades de cartões, uma embaixo da outra.
 *
 * Os três tempos continuam escritos na tela, porque misturá-los mente:
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

function etapasDoFunil(r: Recorte): EtapaFunil[] {
  return PASSOS.map(p => ({ chave: p.chave, nome: p.nome, n: r.safra[p.chave], joia: p.joia }))
}

const CHAVE_PERIODO = 'icrm:dashboard:periodo-funil'

export function periodoSalvo(): Periodo {
  try {
    const v = localStorage.getItem(CHAVE_PERIODO)
    if (v && PERIODOS.some(p => p.value === v)) return v as Periodo
  } catch { /* sem armazenamento: fica o padrão */ }
  return '3m'
}

export function salvarPeriodo(p: Periodo) {
  try { localStorage.setItem(CHAVE_PERIODO, p) } catch { /* sem armazenamento */ }
}

const R = formatCurrencyRound

// ─── Os dados ─────────────────────────────────────────────────────────────────

export type Funis = ReturnType<typeof montarFunis>

/**
 * Lê a safra do período e monta os funis (geral, por produto, por corretor).
 * Fica num hook porque a dashboard usa o resultado em dois lugares: o perfil
 * no topo (o vendido do período) e o painel do funil.
 */
export function useFunisComerciais({ leads, sales, corretor, periodo }: {
  leads: Lead[]
  sales: Sale[]
  corretor: string | null
  periodo: Periodo
}) {
  const { profile, allProfiles } = useAuthStore()
  const { developments, carregarCarteira } = useDevelopmentsStore()
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

  return { funis, erro, carregando, inicio, perfis, tentarDeNovo: () => setTentativa(t => t + 1) }
}

// ─── O painel ─────────────────────────────────────────────────────────────────

type Aba = 'produtos' | 'corretores'

export function FunisComerciais({ funis, erro, carregando, onTentarDeNovo, perfis, periodo, mostrarCorretores, admin }: {
  funis: Funis | null
  erro: string | null
  carregando: boolean
  onTentarDeNovo: () => void
  perfis: Map<string, Profile>
  periodo: Periodo
  /** a aba por corretor — só na visão global do admin */
  mostrarCorretores: boolean
  admin: boolean
}) {
  const [aba, setAba] = useState<Aba>('produtos')
  const [escolhido, setEscolhido] = useState<string>('geral')
  const descricao = PERIODOS.find(p => p.value === periodo)!.descricao

  const abaReal: Aba = mostrarCorretores ? aba : 'produtos'
  const lista: Recorte[] = funis ? [funis.geral, ...(abaReal === 'corretores' ? funis.porCorretor : funis.porProduto)] : []
  const atual = lista.find(r => r.chave === escolhido) ?? lista[0]

  function trocarAba(a: Aba) { setAba(a); setEscolhido('geral') }
  // No celular o detalhe fica embaixo da lista: tocar numa linha leva até ele.
  function escolher(chave: string) {
    setEscolhido(chave)
    if (window.matchMedia('(max-width: 1023px)').matches) {
      requestAnimationFrame(() => document.getElementById('funil-detalhe')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  }

  return (
    <section aria-labelledby="funis-titulo" className="dash-painel-branco mb-10">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 mb-5">
        <div className="min-w-0">
          <h2 id="funis-titulo" className="font-display text-[22px] font-bold text-t1 tracking-[-0.025em]">
            {destacar('Funil *comercial*')}
          </h2>
          <p className="text-[13px] text-t4 mt-0.5">
            Conversão de quem chegou {descricao} · em andamento agora · vendido {descricao}
          </p>
        </div>
        {mostrarCorretores && funis && (
          <div className="dash-abas" role="tablist" aria-label="Recorte do funil">
            {([['produtos', 'Produtos', funis.porProduto.length], ['corretores', 'Corretores', funis.porCorretor.length]] as const).map(([id, nome, n]) => (
              <button key={id} type="button" role="tab" aria-selected={abaReal === id} onClick={() => trocarAba(id)}
                      className={`dash-aba ${abaReal === id ? 'dash-aba-ativa' : ''}`}>
                {nome}
                <span className="dash-aba-conta">{n}</span>
              </button>
            ))}
          </div>
        )}
      </header>

      {erro ? (
        <div role="alert" className="rounded-[20px] border border-error-line bg-error-bg px-5 py-4 flex items-center gap-3">
          <p className="text-[13.5px] text-error flex-1">Não foi possível carregar o funil: {erro}</p>
          <button type="button" onClick={onTentarDeNovo}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-surface border border-line text-[13px] font-medium text-t2 hover:text-t1 cursor-pointer">
            <RefreshCw size={13} aria-hidden /> Tentar de novo
          </button>
        </div>
      ) : !funis || !atual ? (
        <div className="grid lg:grid-cols-12 gap-5" aria-busy="true">
          <div className="lg:col-span-5 xl:col-span-4 h-[460px] rounded-[24px] shimmer" />
          <div className="lg:col-span-7 xl:col-span-8 h-[460px] rounded-[28px] shimmer" />
        </div>
      ) : (
        <div className={`grid grid-cols-1 lg:grid-cols-12 gap-5 items-start transition-opacity ${carregando ? 'opacity-60' : ''}`}>
          {/* A lista */}
          <ul className="lg:col-span-5 xl:col-span-4 flex flex-col gap-2.5" aria-label="Escolha o funil">
            {lista.map(r => (
              <li key={r.chave}>
                <LinhaDaLista r={r} geral={r === funis.geral} ativo={r.chave === atual.chave}
                              foto={abaReal === 'corretores' && r !== funis.geral ? perfis.get(r.chave) : undefined}
                              onEscolher={() => escolher(r.chave)} />
              </li>
            ))}
          </ul>

          {/* O detalhe */}
          <Detalhe r={atual} geral={atual === funis.geral} descricao={descricao} admin={admin}
                   foto={abaReal === 'corretores' && atual !== funis.geral ? perfis.get(atual.chave) : undefined} />
        </div>
      )}
    </section>
  )
}

// ─── Linha da lista ───────────────────────────────────────────────────────────

function iniciais(nome: string) {
  const p = nome.replace(/[^\p{L}\s]/gu, '').trim().split(/\s+/)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase()
}

function LinhaDaLista({ r, geral, ativo, foto, onEscolher }: {
  r: Recorte; geral: boolean; ativo: boolean; foto?: Profile; onEscolher: () => void
}) {
  const fim = taxa(r.safra.venda, r.safra.recebidos)
  return (
    <button type="button" onClick={onEscolher} aria-pressed={ativo}
            className={`dash-linha group ${ativo ? 'dash-linha-ativa' : ''}`}>
      {foto ? (
        <FotoPerfil nome={foto.name} url={foto.avatarUrl} tamanho={46} />
      ) : (
        <span className={`dash-monograma ${geral ? 'dash-monograma-geral' : ''}`} aria-hidden>
          {geral ? <Building2 size={20} strokeWidth={1.8} /> : iniciais(r.nome)}
        </span>
      )}
      <span className="flex-1 min-w-0 text-left">
        <span className="block font-heading text-[15px] font-semibold truncate tracking-[-0.01em]">{geral ? 'Imobiliária inteira' : r.nome}</span>
        <span className="dash-linha-sub block text-[12.5px] tabular-nums sm:truncate">
          {r.safra.recebidos.toLocaleString('pt-BR')} {r.safra.recebidos === 1 ? 'lead' : 'leads'} · {fmtTaxa(fim)} → venda
          <span className="sm:hidden"> · {R(r.pipeline.vgv)}</span>
        </span>
      </span>
      <span className="hidden sm:block text-right shrink-0">
        <span className="block font-display text-[16px] font-bold tabular-nums tracking-[-0.01em]">{R(r.pipeline.vgv)}</span>
        <span className="dash-linha-sub block text-[11.5px]">em andamento</span>
      </span>
    </button>
  )
}

// ─── Detalhe em Marinho ───────────────────────────────────────────────────────

function Detalhe({ r, geral, descricao, admin, foto }: {
  r: Recorte; geral: boolean; descricao: string; admin: boolean; foto?: Profile
}) {
  const navigate = useNavigate()
  const s = r.safra
  const fim = taxa(s.venda, s.recebidos)

  return (
    <article id="funil-detalhe" className="pulse-marinho dash-detalhe scroll-mt-20 lg:col-span-7 xl:col-span-8" aria-label={`Funil de ${geral ? 'toda a imobiliária' : r.nome}`}>
      {/* Cabeçalho */}
      <header className="relative flex flex-wrap items-start gap-x-8 gap-y-4">
        <div className="min-w-0">
          <p className="text-[13px]" style={{ color: 'var(--m-t3)' }}>Funil de</p>
          <div className="flex flex-wrap items-center gap-3 mt-1 min-w-0">
            <h3 className="font-display text-[clamp(1.6rem,2.6vw,2.2rem)] font-extrabold tracking-[-0.03em] leading-none sm:truncate" style={{ color: 'var(--m-t1)' }}>
              {geral ? 'Imobiliária inteira' : r.nome}
            </h3>
            <span className="dash-pilula-escura shrink-0">{s.recebidos.toLocaleString('pt-BR')} leads</span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-6">
          <div className="text-right">
            <p className="text-[13px]" style={{ color: 'var(--m-t3)' }}>Lead → venda</p>
            <p className="font-display text-[30px] font-extrabold tabular-nums leading-none mt-1" style={{ color: 'var(--m-t1)' }}>{fmtTaxa(fim)}</p>
          </div>
          {foto && (
            <div className="flex items-center gap-3">
              <FotoPerfil nome={foto.name} url={foto.avatarUrl} tamanho={52} className="ring-2 ring-white/70" />
              <div className="leading-tight">
                <p className="text-[14px] font-semibold" style={{ color: 'var(--m-t1)' }}>{foto.name.split(' ')[0]}</p>
                <p className="text-[12.5px]" style={{ color: 'var(--m-t3)' }}>
                  {foto.commissionShare ? `${foto.commissionShare}% da líquida` : 'sem parte na comissão'}
                </p>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Funil + dinheiro */}
      <div className="relative mt-6 grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-7 dash-vidro p-5 flex flex-col">
          <p className="text-[12.5px] mb-4" style={{ color: 'var(--m-t3)' }}>Conversão de quem chegou {descricao}</p>
          <div className="flex-1 flex items-center">
            <FunilJoia compacto escuro etapas={etapasDoFunil(r)} rotulo={`Funil de ${r.nome}, leads que chegaram ${descricao}`} />
          </div>
        </div>
        <div className="xl:col-span-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3 content-start">
          <Valor rotulo="VGV em andamento" nota={`${r.pipeline.n} ${r.pipeline.n === 1 ? 'lead em aberto' : 'leads em aberto'} · agora`} valor={r.pipeline.vgv} />
          <Valor rotulo={admin ? 'Comissão em pipeline' : 'Sua comissão em jogo'} nota={admin ? 'bruta' : 'sua parte'} valor={admin ? r.pipeline.bruta : r.pipeline.corretor} />
          <Valor rotulo={`VGV vendido`} nota={`${r.vendido.n} ${r.vendido.n === 1 ? 'venda' : 'vendas'} · ${descricao}`} valor={r.vendido.vgv} ganho={r.vendido.n > 0} />
          <Valor rotulo={admin ? 'Comissão recebida' : 'Sua comissão recebida'} nota={admin ? 'bruta' : 'sua parte'} valor={admin ? r.vendido.bruta : r.vendido.corretor} ganho={r.vendido.n > 0} />
        </div>
      </div>

      {/* Rodapé: para onde vai a comissão recebida */}
      <footer className="relative mt-5 dash-vidro dash-rodape">
        {admin ? <Divisao d={r.vendido} /> : (
          <div className="min-w-0">
            <p className="text-[12.5px]" style={{ color: 'var(--m-t3)' }}>Sua parte do que está em jogo + recebido</p>
            <p className="font-display text-[22px] font-bold tabular-nums" style={{ color: 'var(--m-t1)' }}>{R(r.pipeline.corretor + r.vendido.corretor)}</p>
          </div>
        )}
        <button type="button" onClick={() => navigate('/leads')}
                className="ml-auto inline-flex items-center gap-2 h-11 pl-5 pr-4 rounded-full bg-white text-[14px] font-bold cursor-pointer
                           transition-transform hover:scale-[1.03] active:scale-[0.98] shrink-0"
                style={{ color: '#143275' }}>
          Abrir o Kanban <ArrowRight size={16} strokeWidth={2.2} aria-hidden />
        </button>
      </footer>
    </article>
  )
}

function Valor({ rotulo, nota, valor, ganho = false }: { rotulo: string; nota: string; valor: number; ganho?: boolean }) {
  return (
    <div className="dash-vidro px-5 py-3.5 min-w-0">
      <p className="text-[12.5px] font-medium truncate" style={{ color: 'var(--m-t2)' }}>
        {rotulo} <span style={{ color: 'var(--m-t3)' }}>· {nota}</span>
      </p>
      <p className="mt-0.5 font-display text-[24px] font-bold tabular-nums leading-tight tracking-[-0.02em]"
         style={{ color: ganho ? 'var(--m-ok)' : 'var(--m-t1)' }}>
        {R(valor)}
      </p>
    </div>
  )
}

function Divisao({ d }: { d: Dinheiro }) {
  const partes = [
    { nome: 'Comissão recebida', valor: d.bruta },
    { nome: 'Corretores', valor: d.corretor },
    { nome: 'Souza', valor: d.souza },
    { nome: 'Impostos', valor: d.impostos },
  ]
  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-3 min-w-0">
      {partes.map((p, i) => (
        <div key={p.nome} className="min-w-0">
          <dt className="text-[12.5px]" style={{ color: 'var(--m-t3)' }}>{p.nome}</dt>
          <dd className="font-display text-[21px] font-bold tabular-nums tracking-[-0.02em]"
              style={{ color: i === 2 ? 'var(--m-ouro)' : 'var(--m-t1)' }}>
            {R(p.valor)}
          </dd>
        </div>
      ))}
    </dl>
  )
}
