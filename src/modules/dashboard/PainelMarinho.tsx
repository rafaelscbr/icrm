import type { ReactNode } from 'react'
import { AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react'
import { FotoPerfil } from '../../components/shared/FotoPerfil'
import { formatCurrencyRound } from '../../lib/formatters'
import { PERIODOS } from './funis'
import type { Periodo } from './funis'

/**
 * O topo da dashboard (24/11/2026) — inspirado no painel escuro de
 * "Invoices" que o Rafael mostrou, nas cores da Souza: a faixa Marinho do
 * Pulse (.pulse-marinho) com cartões de vidro por dentro e o Champanhe no
 * lugar do verde-limão — só onde é meta (a barra das semanas e o realizado).
 *
 *   Perfil   — a foto grande de quem está na visão e os totais do período
 *   Meta     — meta, realizado e falta do mês; as semanas em barras, com a
 *              foto de quem vendeu em cada uma
 *   Previsão — VGV em visita + proposta e a comissão prevista
 */

const R = formatCurrencyRound

export interface Pessoa {
  nome: string
  foto?: string
  /** "Visão global · a imobiliária inteira", "Corretor · 40% da líquida"… */
  papel: string
}

export interface Total {
  rotulo: string
  valor: string
  nota: string
}

export interface Semana {
  rotulo: string
  /** dias do mês que a semana cobre — a largura da barra */
  dias: number
  vgv: number
  futura: boolean
  vendedores: { id: string; nome: string; foto?: string }[]
}

export interface Meta {
  alvo: number
  realizado: number
  vendas: number
  dia: number
  diasNoMes: number
  mes: string
}

export interface Previsao {
  total: number
  visita: number
  proposta: number
  leadsVisita: number
  leadsProposta: number
  comissao: number
}

// ─── O painel ─────────────────────────────────────────────────────────────────

export function PainelMarinho({ pessoa, totais, periodo, onPeriodo, meta, semanas, previsao, erro, carregando, onRecarregar, onAbrirKanban }: {
  pessoa: Pessoa
  totais: Total[] | null
  periodo: Periodo
  onPeriodo: (p: Periodo) => void
  meta: Meta | null
  semanas: Semana[]
  previsao: Previsao | null
  erro: string | null
  carregando: boolean
  onRecarregar: () => void
  onAbrirKanban: () => void
}) {
  return (
    <section className="pulse-marinho dash-topo mb-8" aria-label="Perfil, meta e previsão">
      {/* Perfil */}
      <div className="relative flex flex-wrap items-center gap-x-8 gap-y-5">
        <div className="flex items-center gap-5 min-w-0">
          <FotoPerfil nome={pessoa.nome} url={pessoa.foto} tamanho={104} className="dash-foto shrink-0" />
          <div className="min-w-0">
            <p className="text-[13px] font-medium" style={{ color: 'var(--m-t3)' }}>{pessoa.papel}</p>
            <h2 className="font-display text-[clamp(1.9rem,3.2vw,2.75rem)] font-extrabold tracking-[-0.035em] leading-[1.02] truncate" style={{ color: 'var(--m-t1)' }}>
              {pessoa.nome}
            </h2>
          </div>
        </div>
        <div className="sm:ml-auto">
          <PilulasPeriodo valor={periodo} onChange={onPeriodo} />
        </div>
      </div>

      {/* Os totais do período */}
      <div className="relative mt-7">
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-y-5 dash-totais">
          {(totais ?? Array.from({ length: 4 }, () => null)).map((t, i) => (
            <div key={t?.rotulo ?? i} className="min-w-0 dash-total">
              {t ? (
                <>
                  <dt className="text-[12.5px]" style={{ color: 'var(--m-t3)' }}>{t.rotulo}</dt>
                  <dd className="font-display text-[clamp(1.5rem,2.2vw,2rem)] font-extrabold tabular-nums tracking-[-0.03em] leading-tight" style={{ color: 'var(--m-t1)' }}>
                    {t.valor}
                  </dd>
                  <dd className="text-[12px]" style={{ color: 'var(--m-t3)' }}>{t.nota}</dd>
                </>
              ) : <div className="h-[70px] w-28 rounded-[12px] bg-white/10 animate-pulse" aria-hidden />}
            </div>
          ))}
        </dl>
      </div>

      {/* Meta + previsão */}
      <div className="relative mt-7 grid grid-cols-1 lg:grid-cols-12 gap-4">
        {erro && !meta ? (
          <div className="lg:col-span-12 dash-vidro px-5 py-4 flex items-center gap-3" role="alert">
            <AlertTriangle size={18} style={{ color: 'var(--m-risco)' }} aria-hidden />
            <p className="flex-1 text-[14px]" style={{ color: 'var(--m-t1)' }}>Não foi possível carregar a meta: {erro}</p>
            <button type="button" onClick={onRecarregar} className="h-9 px-4 rounded-full bg-white text-[13px] font-semibold cursor-pointer" style={{ color: '#143275' }}>
              Tentar de novo
            </button>
          </div>
        ) : (
          <>
            <CartaoMeta meta={meta} semanas={semanas} carregando={carregando} onRecarregar={onRecarregar} />
            <CartaoPrevisao previsao={previsao} meta={meta} onAbrirKanban={onAbrirKanban} />
          </>
        )}
      </div>
    </section>
  )
}

function PilulasPeriodo({ valor, onChange }: { valor: Periodo; onChange: (p: Periodo) => void }) {
  return (
    <div role="radiogroup" aria-label="Período dos totais e do funil" className="dash-pilulas">
      {PERIODOS.map(p => (
        <button key={p.value} type="button" role="radio" aria-checked={valor === p.value} onClick={() => onChange(p.value)}
                className={`dash-pilulas-item ${valor === p.value ? 'dash-pilulas-ativo' : ''}`}>
          {p.label}
        </button>
      ))}
    </div>
  )
}

// ─── Meta do mês ──────────────────────────────────────────────────────────────

function CartaoMeta({ meta, semanas, carregando, onRecarregar }: {
  meta: Meta | null; semanas: Semana[]; carregando: boolean; onRecarregar: () => void
}) {
  if (!meta) return <div className="lg:col-span-7 dash-vidro h-[300px] animate-pulse" aria-busy="true" />

  const falta = Math.max(meta.alvo - meta.realizado, 0)
  const pct = meta.alvo > 0 ? meta.realizado / meta.alvo : 0
  const ritmo = meta.dia / meta.diasNoMes
  const noRitmo = pct >= ritmo
  const metaSemana = meta.alvo / Math.max(1, semanas.length)

  return (
    <article className="lg:col-span-7 dash-vidro p-6 lg:p-7 flex flex-col" aria-label={`Meta de VGV de ${meta.mes}`}>
      <header className="flex items-center gap-2">
        <p className="text-[13px]" style={{ color: 'var(--m-t3)' }}>Meta de VGV · {meta.mes}</p>
        <button type="button" onClick={onRecarregar} disabled={carregando} aria-label="Atualizar"
                className="ml-auto p-1.5 rounded-full hover:bg-white/10 cursor-pointer disabled:opacity-50" style={{ color: 'var(--m-t3)' }}>
          <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} />
        </button>
      </header>

      <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Numero rotulo="Meta" valor={R(meta.alvo)} />
        <Numero rotulo="Realizado" valor={R(meta.realizado)} ouro
                nota={`${Math.round(pct * 100)}% · ${meta.vendas} ${meta.vendas === 1 ? 'venda' : 'vendas'}`} />
        <Numero rotulo="Falta" valor={falta > 0 ? R(falta) : 'Batida'}
                nota={`dia ${meta.dia} de ${meta.diasNoMes} · ${noRitmo ? 'no ritmo' : 'abaixo do ritmo'}`} />
      </div>

      {/* As semanas do mês */}
      <div className="mt-auto pt-7 flex gap-2" aria-label="VGV vendido por semana">
        {semanas.map(s => {
          const enche = metaSemana > 0 ? Math.min(1, s.vgv / metaSemana) : 0
          return (
            <div key={s.rotulo} className="min-w-0 flex flex-col gap-2" style={{ flex: `${s.dias} 1 0` }}>
              <p className="text-[12.5px] truncate" style={{ color: s.futura ? 'var(--m-t3)' : 'var(--m-t2)' }}>
                {s.rotulo}{s.vgv > 0 && <span className="font-semibold tabular-nums" style={{ color: 'var(--m-t1)' }}> · {R(s.vgv)}</span>}
              </p>
              <div className="dash-trilho" role="img" aria-label={`${s.rotulo}: ${R(s.vgv)} vendidos`}>
                {enche > 0 && <span className="dash-trilho-cheio" style={{ width: `${Math.max(8, enche * 100)}%` }} />}
              </div>
              <div className="h-9 flex items-center">
                {s.vendedores.length > 0 ? (
                  <div className="flex -space-x-2.5">
                    {s.vendedores.slice(0, 5).map(v => (
                      <span key={v.id} title={v.nome}><FotoPerfil nome={v.nome} url={v.foto} tamanho={34} className="ring-2 ring-[#1D4396]" /></span>
                    ))}
                  </div>
                ) : <span className="text-[12px]" style={{ color: 'var(--m-t3)' }}>{s.futura ? '' : 'sem venda'}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </article>
  )
}

function Numero({ rotulo, valor, nota, ouro = false }: { rotulo: string; valor: ReactNode; nota?: string; ouro?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[12.5px]" style={{ color: 'var(--m-t3)' }}>{rotulo}</p>
      <p className="font-display text-[clamp(1.35rem,2.3vw,2.1rem)] font-extrabold tabular-nums tracking-[-0.03em] leading-tight truncate"
         style={{ color: ouro ? 'var(--m-ouro)' : 'var(--m-t1)' }}>
        {valor}
      </p>
      {nota && <p className="text-[12px] mt-0.5 truncate" style={{ color: 'var(--m-t3)' }}>{nota}</p>}
    </div>
  )
}

// ─── Previsão de VGV ──────────────────────────────────────────────────────────

function CartaoPrevisao({ previsao, meta, onAbrirKanban }: { previsao: Previsao | null; meta: Meta | null; onAbrirKanban: () => void }) {
  if (!previsao) return <div className="lg:col-span-5 dash-vidro h-[300px] animate-pulse" aria-busy="true" />

  const cobre = meta && meta.alvo > 0 ? previsao.total / meta.alvo : 0
  const abas = [
    { id: 'visita',   rotulo: 'Visita',   valor: previsao.visita,   nota: `${previsao.leadsVisita} ${previsao.leadsVisita === 1 ? 'lead' : 'leads'}` },
    { id: 'proposta', rotulo: 'Proposta', valor: previsao.proposta, nota: `${previsao.leadsProposta} ${previsao.leadsProposta === 1 ? 'lead' : 'leads'}`, destaque: true },
    { id: 'comissao', rotulo: 'Comissão', valor: previsao.comissao, nota: '5% prevista' },
  ]

  return (
    <article className="lg:col-span-5 dash-vidro p-6 lg:p-7 pb-0 lg:pb-0 flex flex-col overflow-hidden" aria-label="Previsão de VGV">
      <header className="flex items-center gap-3">
        <p className="text-[13px]" style={{ color: 'var(--m-t3)' }}>Previsão de VGV · visita + proposta</p>
        <button type="button" onClick={onAbrirKanban} aria-label="Abrir o Kanban"
                className="ml-auto w-9 h-9 rounded-full border border-white/20 flex items-center justify-center hover:bg-white/10 cursor-pointer" style={{ color: 'var(--m-t1)' }}>
          <ArrowRight size={16} strokeWidth={2} className="-rotate-45" />
        </button>
      </header>
      <div className="mt-1 flex items-baseline gap-3 flex-wrap">
        <p className="font-display text-[clamp(1.9rem,3vw,2.6rem)] font-extrabold tabular-nums tracking-[-0.03em] leading-tight" style={{ color: 'var(--m-t1)' }}>
          {R(previsao.total)}
        </p>
        <span className="dash-pilula-escura">cobre {Math.round(cobre * 100)}% da meta</span>
      </div>

      {/* As abas — como os cartões de pagamento da referência */}
      <div className="mt-auto pt-6 grid grid-cols-3 gap-2 items-end">
        {abas.map(a => (
          <div key={a.id} className={`dash-aba-cartao ${a.destaque ? 'dash-aba-cartao-destaque' : ''}`}>
            <p className="font-display text-[14px] sm:text-[clamp(1rem,1.5vw,1.25rem)] font-bold tabular-nums tracking-[-0.02em] truncate">{R(a.valor)}</p>
            <div className="mt-auto">
              <p className="text-[13px] font-semibold">{a.rotulo}</p>
              <p className="text-[11.5px] opacity-70">{a.nota}</p>
            </div>
          </div>
        ))}
      </div>
    </article>
  )
}
