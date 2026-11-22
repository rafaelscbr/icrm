import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import type { LeadPause } from '../../types'
import { horaDaVolta } from '../../lib/pausaLeads'
import type { PulseTone } from '../pulse/pulseEvents'
import { posicaoNoDia } from './monitorLeads'
import type { AlertaSala } from './monitorLeads'

/**
 * Leads › Dashboard — as peças da sala de comando (16/11/2026).
 *
 * Só desenham: quem calcula é `monitorLeads.ts`, quem busca é
 * `useMonitorLeads`. Tudo aqui reage sozinho — o número que muda dá um pulo
 * curto para o olho achar o que mudou sem precisar comparar de cabeça.
 */

const n = (v: number) => v.toLocaleString('pt-BR')

/**
 * Número que avisa quando muda. O pulo só acontece em MUDANÇA — na primeira
 * pintura a tela inteira pulando seria ruído, não informação.
 */
export function NumeroVivo({ valor, className = '' }: { valor: number | string; className?: string }) {
  const anterior = useRef(valor)
  const [pulo, setPulo] = useState(0)
  useEffect(() => {
    if (anterior.current !== valor) { anterior.current = valor; setPulo(p => p + 1) }
  }, [valor])
  return (
    <span key={pulo} className={`inline-block tabular-nums ${pulo > 0 ? 'badge-bounce' : ''} ${className}`}>
      {typeof valor === 'number' ? n(valor) : valor}
    </span>
  )
}

// ─── Alertas por exceção ──────────────────────────────────────────────────────

/**
 * O que saiu do esperado AGORA. Sem alerta, a faixa não existe — silêncio é o
 * estado normal, e é por isso que ela chama o olho quando aparece.
 */
export function AlertasDaSala({ alertas }: { alertas: AlertaSala[] }) {
  if (alertas.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Alertas" aria-live="polite">
      {alertas.map(a => {
        const cor = a.gravidade === 'risco' ? 'border-error-line bg-error-bg' : 'border-warning-line bg-warning-bg'
        const icone = a.gravidade === 'risco' ? 'text-error' : 'text-warning'
        const corpo = (
          <>
            <AlertTriangle size={14} strokeWidth={2} className={`flex-shrink-0 ${icone}`} aria-hidden />
            <span className="min-w-0 text-[13px] font-medium text-t1">{a.texto}</span>
            {a.leadId && <ChevronRight size={13} strokeWidth={2} className="flex-shrink-0 text-t4" aria-hidden />}
          </>
        )
        const caixa = `pulse-item-in inline-flex max-w-full items-center gap-2 rounded-full border px-3.5 py-1.5 ${cor}`
        return (
          <li key={a.chave} className="max-w-full">
            {a.leadId
              ? <Link to={`/leads?lead=${a.leadId}`} className={`${caixa} hover:brightness-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40`}>{corpo}</Link>
              : <span className={caixa}>{corpo}</span>}
          </li>
        )
      })}
    </ul>
  )
}

// ─── Relógio da sala ──────────────────────────────────────────────────────────

/** Hora cheia com segundos. O tique é local e isolado: só este texto redesenha. */
export function Relogio() {
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const data = agora.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).replace(/\./g, '')
  return (
    <p className="flex items-baseline gap-2 tabular-nums" aria-label={`Agora: ${agora.toLocaleTimeString('pt-BR')}`}>
      <span className="font-display text-[17px] font-bold tracking-[-0.01em] text-t1">{agora.toLocaleTimeString('pt-BR')}</span>
      <span className="text-[12.5px] text-t3">{data}</span>
    </p>
  )
}

// ─── Painel da equipe ─────────────────────────────────────────────────────────

const COR_DA_MARCA: Record<PulseTone, string> = {
  neutral: 'var(--t3)',
  good:    'var(--info)',
  warn:    'var(--warning)',
  win:     'var(--success)',
}

/**
 * A linha do dia de um corretor: cada registro é um traço na hora exata em que
 * aconteceu, na cor do tipo; o cursor dourado é o agora. Dá para ler de relance
 * quando ele trabalhou, quando parou e há quanto tempo está parado.
 */
function LinhaDoDia({ marcas, de, ate, agora, nome }: {
  marcas: { t: number; tom: PulseTone }[]
  de: number; ate: number; agora: number; nome: string
}) {
  const ref = new Date(agora)
  const cursor = posicaoNoDia(agora, de, ate, ref)
  return (
    <div className="relative h-9" role="img"
         aria-label={`Linha do dia de ${nome}: ${marcas.length} ${marcas.length === 1 ? 'registro' : 'registros'} entre ${de}h e ${ate + 1}h.`}>
      {/* trilho: sólido até agora, tracejado no que ainda não aconteceu */}
      <span className="absolute inset-x-0 top-1/2 h-px bg-[color:var(--line-strong)]" aria-hidden />
      {cursor !== null && (
        <span className="absolute top-1/2 right-0 h-px bg-surface" style={{ left: `${cursor}%` }} aria-hidden>
          <span className="block h-px w-full border-t border-dashed border-[color:var(--line-strong)]" />
        </span>
      )}
      {marcas.map((m, i) => {
        const x = posicaoNoDia(m.t, de, ate, ref)
        if (x === null) return null
        return (
          <span key={i} aria-hidden
                className="absolute top-1/2 w-[3px] h-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full pulse-item-in"
                style={{ left: `${x}%`, background: COR_DA_MARCA[m.tom], opacity: 0.78 }} />
        )
      })}
      {cursor !== null && (
        <span className="absolute inset-y-0 w-px bg-brand" style={{ left: `${cursor}%` }} aria-hidden>
          <span className="absolute -top-[3px] left-1/2 h-[7px] w-[7px] -translate-x-1/2 rounded-full bg-brand pulse-live-dot" />
        </span>
      )}
    </div>
  )
}

export interface LinhaEquipe {
  id: string
  nome: string
  /** agiu nos últimos minutos */
  ativo: boolean
  /** "Em atividade · há 2 min" · "Última atividade há 1 h" */
  status: string
  pausa?: LeadPause
  marcas: { t: number; tom: PulseTone }[]
  /** atendimentos, ligações, avanços, visitas — `meta` só onde existe meta diária */
  producao: { rotulo: string; hoje: number; ontem?: number; meta?: number }[]
  /** null enquanto a trilha de distribuição não carregou */
  leadsNovos: number | null
  herdados: number
  prazo: { noPrazo: number; comDesfecho: number; perdidos: number } | null
  esperando: number
  vencidos: number
}

/** Colunas do painel no computador — as mesmas no cabeçalho e em cada linha. */
const GRADE = 'lg:grid-cols-[minmax(170px,1.1fr)_minmax(200px,3fr)_repeat(4,minmax(58px,0.6fr))_minmax(70px,0.7fr)_minmax(78px,0.8fr)_minmax(78px,0.8fr)]'
const ROTULO = 'font-label text-[10.5px] font-bold uppercase tracking-[0.12em] text-t4'

/**
 * A equipe num painel só, uma linha por corretor: estado, linha do dia e os
 * números lado a lado — para comparar de relance, como num painel de controle.
 * No celular cada linha vira um bloco, com o rótulo em cima de cada número.
 */
export function PainelDaEquipe({ linhas, de, ate, agora }: {
  linhas: LinhaEquipe[]; de: number; ate: number; agora: number
}) {
  const horas: number[] = []
  for (let h = de; h <= ate + 1; h += 2) horas.push(h)
  const largura = ate + 1 - de

  return (
    <div className="bento overflow-hidden">
      {/* cabeçalho: só no computador */}
      <div className={`hidden lg:grid ${GRADE} items-end gap-x-4 px-6 pt-4 pb-2 border-b border-line`}>
        <span className={ROTULO}>Corretor</span>
        <span className="relative h-4" aria-hidden>
          {horas.map(h => (
            <span key={h} className="absolute bottom-0 -translate-x-1/2 text-[10.5px] text-t4 tabular-nums first:translate-x-0 last:-translate-x-full"
                  style={{ left: `${((h - de) / largura) * 100}%` }}>{h}h</span>
          ))}
        </span>
        {['Atend.', 'Ligações', 'Avanços', 'Visitas', 'Leads novos', 'No prazo', 'Esperando'].map(r => (
          <span key={r} className={`${ROTULO} text-right`}>{r}</span>
        ))}
      </div>

      <ul>
        {linhas.map(l => (
          <li key={l.id} className={`grid grid-cols-4 ${GRADE} items-center gap-x-4 gap-y-3 px-5 lg:px-6 py-4 lg:py-3.5 border-b border-line last:border-0`}>
            {/* quem e como está */}
            <div className="col-span-4 lg:col-span-1 flex items-center gap-3 min-w-0">
              <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${l.pausa ? 'bg-warning' : l.ativo ? 'bg-success pulse-live-dot' : 'bg-[color:var(--line-strong)]'}`} aria-hidden />
              <div className="min-w-0">
                <p className="truncate font-display text-[15px] font-bold tracking-[-0.015em] text-t1">{l.nome}</p>
                <p className={`truncate text-[12px] tabular-nums ${l.pausa ? 'text-warning font-medium' : l.ativo ? 'text-success font-medium' : 'text-t3'}`}>
                  {l.pausa ? `Em pausa · volta ${horaDaVolta(l.pausa.untilAt, agora)}` : l.status}
                </p>
              </div>
            </div>

            <div className="col-span-4 lg:col-span-1 min-w-0">
              <LinhaDoDia marcas={l.marcas} de={de} ate={ate} agora={agora} nome={l.nome} />
            </div>

            {l.producao.map(p => {
              const bateu = p.meta !== undefined && p.hoje >= p.meta
              return (
                <Celula key={p.rotulo} rotulo={p.rotulo}
                        valor={<>
                          <NumeroVivo valor={p.hoje} className={bateu ? 'text-success' : p.hoje === 0 ? 'text-t4' : 'text-t1'} />
                          {/* a meta do dia, ao lado: número sem meta não diz se está bom */}
                          {p.meta !== undefined && <span className="text-[12px] font-semibold text-t4 tabular-nums">/{n(p.meta)}</span>}
                        </>}
                        nota={p.ontem === undefined ? undefined : `ontem ${n(p.ontem)}`}
                        notaTom={p.ontem !== undefined && p.hoje > p.ontem ? 'text-success' : 'text-t4'}
                        dica={p.meta !== undefined ? `Meta do dia: ${n(p.meta)} por corretor` : undefined} />
              )
            })}

            <Celula rotulo="Leads novos"
                    valor={l.leadsNovos === null ? '—' : <NumeroVivo valor={l.leadsNovos} className={l.leadsNovos === 0 ? 'text-t4' : 'text-t1'} />}
                    nota={l.herdados > 0 ? `+${n(l.herdados)} ${l.herdados === 1 ? 'herdado' : 'herdados'}` : undefined}
                    dica="Leads que a roleta entregou hoje. Herdado = lead antigo que veio de outro corretor." />
            <Celula rotulo="No prazo" largo
                    valor={!l.prazo || l.prazo.comDesfecho === 0 ? '—' : <NumeroVivo valor={`${l.prazo.noPrazo}/${l.prazo.comDesfecho}`} />}
                    nota={l.prazo && l.prazo.perdidos > 0 ? `${n(l.prazo.perdidos)} ${l.prazo.perdidos === 1 ? 'perdido' : 'perdidos'}` : undefined}
                    notaTom="text-error"
                    dica="1º contato feito dentro do prazo, sobre os leads que tiveram desfecho hoje. Perdido = o prazo venceu e o lead foi para outro corretor." />
            <Celula rotulo="Esperando"
                    valor={<NumeroVivo valor={l.esperando} className={l.vencidos > 0 ? 'text-error' : l.esperando > 0 ? 'text-warning' : 'text-t4'} />}
                    nota={l.vencidos > 0 ? `${n(l.vencidos)} ${l.vencidos === 1 ? 'vencido' : 'vencidos'}` : undefined}
                    notaTom="text-error"
                    dica="Leads com ele ainda sem 1º contato." />
          </li>
        ))}
      </ul>
    </div>
  )
}

function Celula({ rotulo, valor, nota, notaTom = 'text-t4', dica, largo = false }: {
  rotulo: string; valor: React.ReactNode; nota?: string; notaTom?: string; dica?: string; largo?: boolean
}) {
  return (
    <div className={`min-w-0 lg:text-right ${largo ? 'col-span-2 lg:col-span-1' : ''}`} title={dica}>
      <p className={`${ROTULO} lg:hidden mb-0.5 truncate`}>{rotulo}</p>
      <p className="font-display text-[18px] font-extrabold leading-none text-t1 whitespace-nowrap">{valor}</p>
      <p className={`mt-1 h-[14px] truncate text-[11px] leading-none tabular-nums ${nota ? notaTom : ''}`}>{nota ?? ''}</p>
    </div>
  )
}
