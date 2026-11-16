import { useEffect, useRef, useState } from 'react'
import { ArrowRightLeft, Clock3, Hourglass } from 'lucide-react'
import type { LeadPause } from '../../types'
import { Barra } from '../../components/shared/visual'
import { horaDaVolta } from '../../lib/pausaLeads'
import { janelaDoDia, textoDeMinutos } from './monitorLeads'
import type { LinhaOrigem, LinhaVelocidade, RecebidosHoje } from './monitorLeads'

/**
 * Leads › Dashboard — as peças do monitoramento ao vivo (16/11/2026).
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

// ─── 1. Roleta ao vivo ────────────────────────────────────────────────────────

export interface CartaoRoleta {
  id: string
  nome: string
  /** está em alguma roleta (geral ou de formulário) */
  naRoleta: boolean
  pausa?: LeadPause
  recebidos?: RecebidosHoje
  /** leads com ele sem 1º contato, prazo correndo */
  aguardando: number
  /** … e com o prazo já vencido */
  vencidos: number
  /** roletas em que ele é o próximo a receber; null = a tela não lê as roletas (corretor) */
  proximoEm: string[] | null
}

export function RoletaAoVivo({ cartoes, agora }: { cartoes: CartaoRoleta[]; agora: number }) {
  const colunas = cartoes.length >= 3 ? 'md:grid-cols-2 xl:grid-cols-3' : cartoes.length === 2 ? 'md:grid-cols-2' : ''
  return (
    <div className={`grid grid-cols-1 gap-5 ${colunas}`}>
      {cartoes.map(c => <CartaoDaRoleta key={c.id} c={c} agora={agora} />)}
    </div>
  )
}

function CartaoDaRoleta({ c, agora }: { c: CartaoRoleta; agora: number }) {
  const proximoGeral = c.proximoEm?.includes('Roleta geral') ?? false
  const rec = c.recebidos
  const detalhe = !rec || rec.total === 0 ? 'nenhum até agora'
    : [
        rec.daRoleta > 0 && `${n(rec.daRoleta)} da roleta`,
        rec.porTransferencia > 0 && `${n(rec.porTransferencia)} por transferência`,
        rec.manual > 0 && `${n(rec.manual)} ${rec.manual === 1 ? 'repassado' : 'repassados'}`,
      ].filter(Boolean).join(' · ')
  const esperando = c.aguardando + c.vencidos

  return (
    <article className={`bento min-w-0 overflow-hidden flex flex-col transition-shadow
                         ${proximoGeral && !c.pausa ? 'ring-1 ring-brand/50' : ''}`}>
      <header className="flex items-center gap-3 px-5 pt-4 pb-3.5">
        <span className="w-10 h-10 rounded-full bg-brand-fill text-brand-fill-text flex items-center justify-center text-[15px] font-bold flex-shrink-0" aria-hidden>
          {c.nome.charAt(0).toUpperCase()}
        </span>
        <h4 className="font-display text-[15.5px] font-bold tracking-[-0.015em] text-t1 truncate min-w-0 flex-1">{c.nome}</h4>
        {c.pausa ? (
          <span className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-full border border-warning-line bg-warning-bg px-2.5 py-1 text-[12px] font-semibold text-warning tabular-nums">
            <span className="w-1.5 h-1.5 rounded-full bg-warning" aria-hidden />
            Em pausa · volta {horaDaVolta(c.pausa.untilAt, agora)}
          </span>
        ) : c.naRoleta ? (
          <span className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-full bg-success-bg px-2.5 py-1 text-[12px] font-semibold text-success">
            <span className="w-1.5 h-1.5 rounded-full bg-success pulse-live-dot" aria-hidden />
            Recebendo
          </span>
        ) : (
          <span className="flex-shrink-0 rounded-full bg-s2 px-2.5 py-1 text-[12px] font-medium text-t3">Fora das roletas</span>
        )}
      </header>

      <dl className="grid grid-cols-2 border-y border-line bg-s2/50">
        <div className="px-5 py-3 min-w-0">
          <dt className="text-[12px] text-t3">Recebidos hoje</dt>
          <dd className="font-display text-[24px] font-extrabold leading-tight text-t1 mt-0.5">
            <NumeroVivo valor={rec?.total ?? 0} className={(rec?.total ?? 0) === 0 ? 'text-t4' : ''} />
          </dd>
          <dd className="text-[12px] text-t4 truncate">{detalhe}</dd>
        </div>
        <div className="px-5 py-3 min-w-0 border-l border-line">
          <dt className="text-[12px] text-t3">Aguardando 1º contato</dt>
          <dd className="font-display text-[24px] font-extrabold leading-tight mt-0.5">
            <NumeroVivo valor={esperando} className={c.vencidos > 0 ? 'text-error' : esperando > 0 ? 'text-warning' : 'text-t4'} />
          </dd>
          <dd className={`text-[12px] truncate ${c.vencidos > 0 ? 'text-error font-medium' : 'text-t4'}`}>
            {c.vencidos > 0 ? `${n(c.vencidos)} com o prazo vencido` : esperando > 0 ? 'dentro do prazo' : 'tudo atendido'}
          </dd>
        </div>
      </dl>

      {c.proximoEm !== null && (
        <div className="px-5 py-3 min-h-[56px] flex items-center gap-2 flex-wrap">
          {c.proximoEm.length === 0 ? (
            <p className="text-[12.5px] text-t4">
              {c.pausa ? 'A roleta pula a vez dele até a volta.' : 'Não é o próximo em nenhuma roleta.'}
            </p>
          ) : (
            <>
              <span className="text-[12.5px] text-t3">Próximo lead de</span>
              {c.proximoEm.map(nome => (
                // key com o nome: quando a vez muda de mão, o selo entra animado
                <span key={nome} className="pulse-item-in rounded-full border border-brand/40 bg-brand/10 px-2.5 py-0.5 text-[12.5px] font-semibold text-brand-text">
                  {nome}
                </span>
              ))}
            </>
          )}
        </div>
      )}
    </article>
  )
}

// ─── Ritmo do dia (dentro do quadro de atividade) ─────────────────────────────

/**
 * Uma barra por hora do dia: mostra QUANDO o corretor produziu, não só quanto.
 * A hora em curso fica na cor da marca e cresce sozinha a cada evento.
 */
export function RitmoDoDia({ horas, agora, nome }: { horas: number[]; agora: number; nome: string }) {
  const dataAgora = new Date(agora)
  const { de, ate } = janelaDoDia(horas, dataAgora)
  const faixa = horas.slice(de, ate + 1)
  const pico = Math.max(1, ...faixa)
  const horaAtual = dataAgora.getHours()
  const total = faixa.reduce((s, v) => s + v, 0)

  return (
    <div className="px-5 lg:px-6 pt-3 pb-2.5 border-b border-line">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <p className="text-[12px] text-t3">Ritmo do dia</p>
        <p className="text-[11.5px] text-t4 tabular-nums">{de}h – {ate + 1}h</p>
      </div>
      <div className="flex items-end gap-[3px] h-9" role="img"
           aria-label={`Atividade de ${nome} por hora hoje: ${total} ${total === 1 ? 'registro' : 'registros'} entre ${de}h e ${ate + 1}h.`}>
        {faixa.map((v, i) => {
          const h = de + i
          const atual = h === horaAtual
          return (
            <span key={h} title={`${h}h — ${v} ${v === 1 ? 'registro' : 'registros'}`}
                  className="flex-1 rounded-t-[3px] transition-[height] duration-500 ease-out"
                  style={{
                    height: v === 0 ? 2 : `${Math.max(14, (v / pico) * 100)}%`,
                    background: atual ? 'var(--brand)' : v === 0 ? 'var(--line-strong)' : 'var(--stage-lead)',
                    opacity: atual || v === 0 ? 1 : 0.5,
                  }} />
          )
        })}
      </div>
    </div>
  )
}

// ─── 2. Velocidade de resposta ────────────────────────────────────────────────

export function VelocidadeDeResposta({ linhas, total, nome, minutosPrazo }: {
  linhas: LinhaVelocidade[]
  total: LinhaVelocidade
  nome: (id: string | null) => string
  /** prazo de 1º contato configurado; null = configuração não carregou */
  minutosPrazo: number | null
}) {
  if (total.recebidos === 0) {
    return <p className="text-[13.5px] text-t4 py-8 text-center">Nenhum lead distribuído neste período.</p>
  }
  const comTotal = linhas.length > 1
  return (
    <div className="overflow-x-auto -mx-5 lg:-mx-6 px-5 lg:px-6">
      <table className="w-full min-w-[520px] text-left border-separate border-spacing-0">
        <thead>
          <tr className="text-[12px] text-t3">
            <th scope="col" className="font-medium pb-2 pr-3">Corretor</th>
            <th scope="col" className="font-medium pb-2 px-3 text-right" title="Cada vez que um lead passou pela mão do corretor e teve desfecho no período (ou ainda espera contato)">Leads</th>
            <th scope="col" className="font-medium pb-2 px-3 text-right" title="Mediana, em minutos úteis, entre receber o lead e registrar o 1º contato">1º contato em</th>
            <th scope="col" className="font-medium pb-2 px-3 w-[26%]">No prazo{minutosPrazo ? ` (${minutosPrazo} min)` : ''}</th>
            <th scope="col" className="font-medium pb-2 px-3 text-right" title="O prazo venceu e o rodízio levou o lead para outro corretor">Perdeu</th>
            <th scope="col" className="font-medium pb-2 pl-3 text-right">Esperando</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(l => <LinhaDeVelocidade key={l.brokerId ?? 'sem'} l={l} rotulo={nome(l.brokerId)} minutosPrazo={minutosPrazo} />)}
        </tbody>
        {comTotal && (
          <tfoot>
            <LinhaDeVelocidade l={total} rotulo="Equipe" minutosPrazo={minutosPrazo} total />
          </tfoot>
        )}
      </table>
    </div>
  )
}

function LinhaDeVelocidade({ l, rotulo, minutosPrazo, total = false }: {
  l: LinhaVelocidade; rotulo: string; minutosPrazo: number | null; total?: boolean
}) {
  // Só entra na conta do prazo quem tinha prazo e já teve desfecho.
  const comDesfecho = l.noPrazo + l.foraDoPrazo + l.perdidos
  const pct = comDesfecho > 0 ? (l.noPrazo / comDesfecho) * 100 : null
  const tomPrazo = pct === null ? 'neutro' : pct >= 80 ? 'sucesso' : pct >= 50 ? 'atencao' : 'risco'
  const lento = minutosPrazo !== null && l.medianaMin !== null && l.medianaMin > minutosPrazo
  const borda = total ? 'border-t-2 border-line-strong' : 'border-t border-line'
  const esperando = l.aguardando + l.vencidos

  return (
    <tr className={total ? 'font-semibold' : ''}>
      <th scope="row" className={`${borda} py-2.5 pr-3 text-[14px] ${total ? 'font-semibold' : 'font-medium'} text-t1 truncate max-w-[160px]`}>{rotulo}</th>
      <td className={`${borda} py-2.5 px-3 text-right text-[14px] text-t1`}><NumeroVivo valor={l.recebidos} /></td>
      <td className={`${borda} py-2.5 px-3 text-right text-[14px] whitespace-nowrap ${lento ? 'text-warning' : 'text-t1'}`}>
        <NumeroVivo valor={textoDeMinutos(l.medianaMin)} />
      </td>
      <td className={`${borda} py-2.5 px-3`}>
        {pct === null ? (
          <span className="text-[13px] text-t4">—</span>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="flex-1 min-w-[48px]">
              <Barra pct={pct} tom={tomPrazo} altura={5} rotuloAcessivel={`${l.noPrazo} de ${comDesfecho} leads atendidos no prazo`} />
            </div>
            <span className="text-[13px] text-t2 tabular-nums whitespace-nowrap">{n(l.noPrazo)} de {n(comDesfecho)}</span>
          </div>
        )}
      </td>
      <td className={`${borda} py-2.5 px-3 text-right text-[14px] ${l.perdidos > 0 ? 'text-error' : 'text-t4'}`}>
        <NumeroVivo valor={l.perdidos} />
      </td>
      <td className={`${borda} py-2.5 pl-3 text-right text-[14px] whitespace-nowrap ${l.vencidos > 0 ? 'text-error' : esperando > 0 ? 'text-warning' : 'text-t4'}`}>
        <NumeroVivo valor={esperando} />
        {l.vencidos > 0 && <span className="text-[12px] font-normal"> · {n(l.vencidos)} vencido{l.vencidos > 1 ? 's' : ''}</span>}
      </td>
    </tr>
  )
}

/** Legenda curta das colunas — vai embaixo da tabela, não em tooltip que ninguém abre. */
export function LegendaVelocidade() {
  const itens = [
    { icon: Clock3, texto: 'Cada passagem do lead pela mão do corretor conta uma vez, no dia do desfecho. Tempo em minutos úteis, pela agenda do rodízio.' },
    { icon: ArrowRightLeft, texto: '"Perdeu": o prazo venceu e o lead foi para outro corretor.' },
    { icon: Hourglass, texto: '"Esperando": ainda sem 1º contato registrado no WhatsApp.' },
  ]
  return (
    <ul className="mt-3 pt-3 border-t border-line flex flex-col gap-1">
      {itens.map(i => (
        <li key={i.texto} className="flex items-start gap-2 text-[12px] text-t4">
          <i.icon size={12} strokeWidth={1.8} className="mt-[3px] flex-shrink-0" aria-hidden /> {i.texto}
        </li>
      ))}
    </ul>
  )
}

// ─── 3. Qualidade por origem ──────────────────────────────────────────────────

const LINHAS_DE_ORIGEM = 8

export function QualidadePorOrigem({ linhas, rotuloOrigem, rotuloMotivo }: {
  linhas: LinhaOrigem[]
  rotuloOrigem: (slug: string) => string
  rotuloMotivo: (slug: string) => string
}) {
  if (linhas.length === 0) {
    return <p className="text-[13.5px] text-t4 py-8 text-center">Nenhum lead chegou neste período.</p>
  }
  const visiveis = linhas.slice(0, LINHAS_DE_ORIGEM)
  const resto = linhas.length - visiveis.length
  return (
    <div>
      <ul className="divide-y divide-line">
        {visiveis.map(l => {
          const pct = (v: number) => (l.chegaram > 0 ? (v / l.chegaram) * 100 : 0)
          return (
            <li key={l.chave} className="py-3 first:pt-0">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-[14px] text-t1">
                  <span className="font-semibold">{l.produto ?? 'Sem produto'}</span>
                  <span className="text-t3"> · {rotuloOrigem(l.origem)}</span>
                </p>
                <p className="flex-shrink-0 text-[13px] text-t3 tabular-nums">
                  <NumeroVivo valor={l.chegaram} className="font-display text-[16px] font-extrabold text-t1" /> {l.chegaram === 1 ? 'chegou' : 'chegaram'}
                </p>
              </div>

              {/* Onde estão hoje: avançou · em aberto · descartado */}
              <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-s2" role="img"
                   aria-label={`${l.avancaram} avançaram, ${l.emAberto} em aberto, ${l.descartados} descartados`}>
                <span className="bg-success transition-[width] duration-500" style={{ width: `${pct(l.avancaram)}%` }} />
                <span className="transition-[width] duration-500" style={{ width: `${pct(l.emAberto)}%`, background: 'var(--stage-lead)', opacity: 0.45 }} />
                <span className="bg-error/70 transition-[width] duration-500" style={{ width: `${pct(l.descartados)}%` }} />
              </div>

              <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] tabular-nums">
                <span className={l.avancaram > 0 ? 'text-success font-medium' : 'text-t4'}>{n(l.avancaram)} {l.avancaram === 1 ? 'avançou' : 'avançaram'}</span>
                <span className="text-t3">{n(l.emAberto)} em aberto</span>
                <span className={l.descartados > 0 ? 'text-error' : 'text-t4'}>
                  {n(l.descartados)} {l.descartados === 1 ? 'descartado' : 'descartados'}
                  {l.descartados > 0 && ` (${Math.round(pct(l.descartados))}%)`}
                </span>
                {l.motivoTop && (
                  <span className="text-t4 truncate">
                    motivo nº 1: {rotuloMotivo(l.motivoTop.slug)} ({n(l.motivoTop.n)})
                  </span>
                )}
              </p>
            </li>
          )
        })}
      </ul>
      {resto > 0 && <p className="text-[12.5px] text-t4 pt-2.5 border-t border-line">e mais {resto} {resto === 1 ? 'origem' : 'origens'} com menos leads</p>}
    </div>
  )
}
