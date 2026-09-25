import { useEffect, useMemo, useRef } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Search, X, SlidersHorizontal, ArrowDownUp, Trophy, Trash2,
  Timer, Snowflake, Star, Thermometer, RefreshCw, CalendarPlus,
  Radar, CalendarRange, GitBranch, Target, Megaphone, Home, User,
} from 'lucide-react'
import { Lead, LeadFunnelStage } from '../../types'
import {
  Temperature, Fit, TEMPERATURE_LABEL, TEMPERATURE_COLOR, FIT_LABEL, FIT_COLOR,
} from '../../lib/intelligence'
import { STAGE_THEME, FUNNEL_STAGES } from '../../lib/stageTheme'
import { SORT_LABEL, KanbanSort } from '../../store/useKanbanPrefs'
import { useLeadFiltersStore } from '../../store/useLeadFiltersStore'
import { SidePanel } from '../../components/ui/SidePanel'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { TOM, Tom, SecaoTitulo, Dica } from '../../components/shared/visual'
import { slaActive } from './SlaBadge'
import { avisoReentrada } from './reentrada'
import { semContatoHaMaisDe, ESFRIANDO_DIAS } from './contato'
import { ORIGEM_META, ORIGENS } from './origens'
import {
  FiltrosLead, Faceta, ContextoFiltro, JanelaContato, PeriodoEntrada,
  JANELA_LABEL, PERIODO_LABEL, aplicarFiltros, contarFiltros, intervaloEntrada, chaveProduto,
} from './leadFiltros'

/**
 * Filtros do funil — a barra e o painel.
 *
 * Três camadas, da mais rápida para a mais precisa:
 *
 *   1. ATALHOS — as perguntas que o corretor faz todo dia ("quem está sem
 *      contato?", "quais são as prioridades?"), a um toque, com a contagem
 *      já na cara. A contagem é a do resultado: clicar em "12" mostra 12.
 *   2. PAINEL — todas as facetas, à direita, sem cobrir o funil: o quadro
 *      atrás reage a cada toque, então dá para ir recortando de olho no
 *      resultado.
 *   3. RESUMO — "12 de 130 leads" e o que está aplicado, cada um com o seu X.
 *      Filtro invisível escondendo lead é o jeito mais rápido de alguém achar
 *      que o sistema perdeu dado.
 *
 * Atalho e painel escrevem no MESMO estado: o atalho é só um jeito curto de
 * ligar um valor. Por isso nunca discordam.
 */

// ── Atalhos ──────────────────────────────────────────────────────────────────

interface Atalho {
  id: string
  label: string
  icon: LucideIcon
  tom: Tom
  titulo: string
  faceta: Faceta
  ativo: (f: FiltrosLead) => boolean
  alternar: (ligar: boolean) => Partial<FiltrosLead>
  casa: (l: Lead, ctx: ContextoFiltro, agora: number) => boolean
}

// Ordem: o que é risco primeiro, oportunidade depois, contexto por último.
const ATALHOS: Atalho[] = [
  {
    id: 'sla', label: '1º contato pendente', icon: Timer, tom: 'risco', faceta: 'sla',
    titulo: 'Leads do Meta Ads com o relógio de SLA correndo — ninguém falou com eles ainda',
    ativo: f => f.sla, alternar: on => ({ sla: on }),
    casa: l => slaActive(l),
  },
  {
    id: 'esfriando', label: `Sem contato +${ESFRIANDO_DIAS}d`, icon: Snowflake, tom: 'atencao', faceta: 'semContato',
    titulo: `Mais de ${ESFRIANDO_DIAS} dias sem WhatsApp, ligação ou tarefa concluída registrados`,
    ativo: f => f.semContato === String(ESFRIANDO_DIAS),
    alternar: on => ({ semContato: on ? (String(ESFRIANDO_DIAS) as JanelaContato) : null }),
    casa: (l, _c, agora) => semContatoHaMaisDe(l, ESFRIANDO_DIAS, agora),
  },
  {
    id: 'prioridade', label: 'Prioridade', icon: Star, tom: 'marca', faceta: 'prioridade',
    titulo: 'Leads marcados com a estrela de prioridade máxima',
    ativo: f => f.prioridade, alternar: on => ({ prioridade: on }),
    casa: l => !!l.flagged,
  },
  {
    id: 'quentes', label: 'Quentes', icon: Thermometer, tom: 'marca', faceta: 'temperaturas',
    titulo: 'Temperatura calculada pelo que o lead fez: respondeu, agendou, compareceu',
    ativo: f => f.temperaturas.length === 1 && f.temperaturas[0] === 'quente',
    alternar: on => ({ temperaturas: on ? ['quente'] : [] }),
    casa: (l, ctx) => ctx.intel[l.id]?.temperature === 'quente',
  },
  {
    id: 'voltaram', label: 'Voltaram', icon: RefreshCw, tom: 'info', faceta: 'voltou',
    titulo: 'Preencheram o formulário de novo e você ainda não abriu o lead',
    ativo: f => f.voltou, alternar: on => ({ voltou: on }),
    casa: l => !!avisoReentrada(l),
  },
  {
    id: 'hoje', label: 'Entraram hoje', icon: CalendarPlus, tom: 'info', faceta: 'entrada',
    titulo: 'Leads que entraram no funil hoje',
    ativo: f => f.entrada === 'hoje',
    alternar: on => ({ entrada: on ? 'hoje' : null, entradaDe: '', entradaAte: '' }),
    casa: (l, _c, agora) => {
      const iv = intervaloEntrada({ entrada: 'hoje', entradaDe: '', entradaAte: '' }, agora)!
      const t = new Date(l.createdAt).getTime()
      return t >= iv.de && t < iv.ate
    },
  },
]

// ── Barra ────────────────────────────────────────────────────────────────────

export interface OpcaoCatalogo { value: string; label: string }

interface BarraProps {
  vista: 'lista' | 'kanban'
  /** escopo atual, sem filtro: ativos, descartados ou ganhos */
  base: Lead[]
  visiveis: number
  ctx: ContextoFiltro
  agora: number
  ordem: KanbanSort
  opcoesOrdem: KanbanSort[]
  onOrdem: (o: KanbanSort) => void
  escopo: 'active' | 'discarded' | 'won'
  onEscopo: (e: 'active' | 'discarded' | 'won') => void
  ganhos: number
  descartados: number
  onAbrirPainel: () => void
  produtos: OpcaoCatalogo[]
  corretores: OpcaoCatalogo[] | null
}

export function BarraDeFiltros({
  vista, base, visiveis, ctx, agora, ordem, opcoesOrdem, onOrdem,
  escopo, onEscopo, ganhos, descartados, onAbrirPainel, produtos, corretores,
}: BarraProps) {
  const { filtros, definir, limpar } = useLeadFiltersStore()
  const buscaRef = useRef<HTMLInputElement>(null)
  const nFiltros = contarFiltros(filtros, ctx)
  const temRecorte = nFiltros > 0 || filtros.busca.trim() !== ''

  // "/" leva à busca, de qualquer lugar da tela — o atalho do Gmail, do GitHub
  // e do Linear. Quem vive no funil não tira a mão do teclado para procurar.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const alvo = e.target as HTMLElement | null
      if (alvo && (alvo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName))) return
      if (document.querySelector('[role="dialog"]')) return
      e.preventDefault()
      buscaRef.current?.focus()
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [])

  // Contagem de cada atalho = o que aparece ao ligá-lo, com os outros filtros
  // mantidos. Com ele ligado, é o próprio resultado.
  const contagens = useMemo(() => {
    const out: Record<string, number> = {}
    for (const a of ATALHOS) {
      out[a.id] = aplicarFiltros(base, filtros, ctx, a.faceta).filter(l => a.casa(l, ctx, agora)).length
    }
    return out
  }, [base, filtros, ctx, agora])

  const pilulas = descreverFiltros(filtros, { ...ctx, produtos, corretores })

  return (
    <div className="flex flex-col gap-2.5 mb-4">
      {/* ── Linha 1: busca, painel, ordem e escopo ─────────────────────────
          No celular é UMA linha rolável: controles quebrando em três linhas
          empurravam o primeiro lead para fora da tela. */}
      <div className="flex items-center gap-2 overflow-x-auto sm:overflow-visible sm:flex-wrap pb-1 sm:pb-0 -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t3" aria-hidden />
          <input
            ref={buscaRef}
            value={filtros.busca}
            onChange={e => definir({ busca: e.target.value })}
            onKeyDown={e => {
              if (e.key !== 'Escape') return
              if (filtros.busca) { e.stopPropagation(); definir({ busca: '' }) }
              else e.currentTarget.blur()
            }}
            aria-label="Buscar lead por nome, telefone, e-mail ou produto"
            placeholder="Buscar nome, telefone, produto..."
            className="w-full h-10 sm:h-9 bg-surface border border-line-input rounded-[12px] pl-9 pr-9 text-sm text-t1
                       placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/50 transition-all"
          />
          {filtros.busca ? (
            <button
              onClick={() => { definir({ busca: '' }); buscaRef.current?.focus() }}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full text-t4 hover:text-t2 hover:bg-s2 transition-colors"
            >
              <X size={13} strokeWidth={2} />
            </button>
          ) : (
            <kbd
              className="hidden sm:flex absolute right-2.5 top-1/2 -translate-y-1/2 h-5 min-w-5 px-1.5 items-center justify-center
                         rounded-md border border-line bg-s2 font-label text-[11px] text-t4 pointer-events-none"
              title="Aperte / para buscar"
            >
              /
            </kbd>
          )}
        </div>

        <button
          type="button"
          onClick={onAbrirPainel}
          aria-haspopup="dialog"
          className={`flex items-center gap-1.5 h-10 sm:h-9 px-3 rounded-[12px] border text-xs font-semibold transition-all flex-shrink-0
            focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40
            ${nFiltros > 0
              ? 'bg-brand-tint border-brand/40 text-brand-text'
              : 'bg-surface border-line-input text-t2 hover:bg-s2 hover:text-t1'}`}
        >
          <SlidersHorizontal size={13} strokeWidth={1.6} aria-hidden />
          Filtros
          {nFiltros > 0 && (
            <span className="min-w-5 h-5 px-1 rounded-full bg-brand-fill text-brand-fill-text font-heading text-[11px] font-bold tabular-nums flex items-center justify-center">
              {nFiltros}
            </span>
          )}
        </button>

        <label className="relative flex items-center flex-shrink-0">
          <span className="sr-only">Ordenar por</span>
          <ArrowDownUp size={13} strokeWidth={1.6} className="absolute left-3 text-t3 pointer-events-none" aria-hidden />
          <select
            value={ordem}
            onChange={e => onOrdem(e.target.value as KanbanSort)}
            title="Ordem dos leads"
            className="h-10 sm:h-9 appearance-none bg-surface border border-line-input rounded-[12px] pl-8 pr-3 text-xs font-semibold text-t2
                       cursor-pointer hover:bg-s2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            {opcoesOrdem.map(o => <option key={o} value={o}>{SORT_LABEL[o]}</option>)}
          </select>
        </label>

        {/* Ganhos e descartados sempre com rótulo: "6" e "888" soltos ao lado
            de um ícone não diziam o que eram. */}
        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => onEscopo(escopo === 'won' ? 'active' : 'won')}
            aria-pressed={escopo === 'won'}
            className={`flex items-center gap-1.5 h-10 sm:h-9 px-3 rounded-[12px] border text-xs font-semibold transition-all whitespace-nowrap
              ${escopo === 'won' ? 'bg-success-bg border-success-line text-success' : 'bg-surface border-line-input text-t3 hover:text-t2 hover:bg-s2'}`}
          >
            <Trophy size={13} strokeWidth={1.6} aria-hidden />
            Ganhos
            {ganhos > 0 && <span className="font-bold tabular-nums">{ganhos}</span>}
          </button>
          <button
            onClick={() => onEscopo(escopo === 'discarded' ? 'active' : 'discarded')}
            aria-pressed={escopo === 'discarded'}
            className={`flex items-center gap-1.5 h-10 sm:h-9 px-3 rounded-[12px] border text-xs font-semibold transition-all whitespace-nowrap
              ${escopo === 'discarded' ? 'bg-error-bg border-error-line text-error' : 'bg-surface border-line-input text-t3 hover:text-t2 hover:bg-s2'}`}
          >
            <Trash2 size={13} strokeWidth={1.6} aria-hidden />
            Descartados
            {descartados > 0 && <span className="font-bold tabular-nums">{descartados}</span>}
          </button>
        </div>
      </div>

      {/* ── Linha 2: atalhos ────────────────────────────────────────────── */}
      <div
        role="group"
        aria-label="Atalhos de filtro"
        className="flex items-center gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible sm:pb-0"
      >
        {ATALHOS.map(a => {
          const ativo = a.ativo(filtros)
          const n = contagens[a.id]
          const t = TOM[a.tom]
          return (
            <button
              key={a.id}
              type="button"
              aria-pressed={ativo}
              title={a.titulo}
              onClick={() => definir(a.alternar(!ativo))}
              className={`group flex items-center gap-1.5 h-10 sm:h-8 pl-2.5 pr-3 rounded-full border text-xs font-semibold
                          whitespace-nowrap flex-shrink-0 transition-all duration-150 active:scale-[0.98]
                          focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40
                          ${ativo
                            ? `${t.fundo} ${t.borda} ${t.texto}`
                            : `bg-surface border-line text-t2 hover:border-line-strong hover:bg-s2 ${n === 0 ? 'opacity-60' : ''}`}`}
            >
              <a.icon
                size={13}
                strokeWidth={1.8}
                className={ativo ? '' : t.texto}
                fill={a.id === 'prioridade' && ativo ? 'currentColor' : 'none'}
                aria-hidden
              />
              {a.label}
              <span className={`tabular-nums ${ativo ? 'font-bold' : 'text-t4 font-medium'}`}>{n}</span>
            </button>
          )
        })}
      </div>

      {/* ── Linha 3: o que está aplicado ──────────────────────────────────── */}
      {temRecorte && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <p className="text-t3" aria-live="polite">
            <span className="font-heading font-bold text-t1 tabular-nums">{visiveis}</span>
            {' '}de <span className="tabular-nums">{base.length}</span> {base.length === 1 ? 'lead' : 'leads'}
          </p>
          {pilulas.map(p => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full border border-line bg-s2/60 text-t2 max-w-[260px]"
            >
              <span className="truncate">{p.texto}</span>
              <button
                type="button"
                onClick={() => definir(p.limpar)}
                aria-label={`Remover filtro ${p.texto}`}
                className="w-6 h-6 flex items-center justify-center rounded-full text-t4 hover:text-t1 hover:bg-s3 transition-colors"
              >
                <X size={11} strokeWidth={2} aria-hidden />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => { limpar(); definir({ busca: '' }) }}
            className="h-7 px-2 rounded-lg font-semibold text-t3 hover:text-t1 hover:bg-s2 transition-colors"
          >
            Limpar tudo
          </button>
          {vista === 'kanban' && filtros.etapas.length > 0 && (
            <span className="text-t4">· o filtro de etapa vale só na lista</span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Descrição dos filtros aplicados ──────────────────────────────────────────

function dataCurta(ymd: string): string {
  const [, m, d] = ymd.split('-')
  return `${d}/${m}`
}

function listaCurta(itens: string[]): string {
  return itens.length <= 2 ? itens.join(', ') : `${itens.slice(0, 2).join(', ')} +${itens.length - 2}`
}

/**
 * Pílulas do que está aplicado — só o que NÃO aparece como atalho ligado. O
 * atalho aceso já é a própria pílula; repetir viraria ruído.
 */
function descreverFiltros(
  f: FiltrosLead,
  ctx: ContextoFiltro & { produtos: OpcaoCatalogo[]; corretores: OpcaoCatalogo[] | null },
): { id: string; texto: string; limpar: Partial<FiltrosLead> }[] {
  const out: { id: string; texto: string; limpar: Partial<FiltrosLead> }[] = []
  const atalho = (id: string) => ATALHOS.find(a => a.id === id)!.ativo(f)

  if (!ctx.ignorarEtapa && f.etapas.length > 0) {
    out.push({ id: 'etapas', texto: `Etapa: ${listaCurta(f.etapas.map(e => STAGE_THEME[e].label))}`, limpar: { etapas: [] } })
  }
  if (f.semContato && !atalho('esfriando')) {
    out.push({ id: 'semContato', texto: f.semContato === 'nunca' ? 'Nunca contatado' : `Sem contato: ${JANELA_LABEL[f.semContato].toLowerCase()}`, limpar: { semContato: null } })
  }
  if (f.entrada && !atalho('hoje')) {
    const texto = f.entrada === 'personalizado'
      ? `Entrada: ${f.entradaDe ? dataCurta(f.entradaDe) : 'início'} a ${f.entradaAte ? dataCurta(f.entradaAte) : 'hoje'}`
      : `Entrada: ${PERIODO_LABEL[f.entrada].toLowerCase()}`
    out.push({ id: 'entrada', texto, limpar: { entrada: null, entradaDe: '', entradaAte: '' } })
  }
  if (f.temperaturas.length > 0 && !atalho('quentes')) {
    out.push({ id: 'temperaturas', texto: `Temperatura: ${listaCurta(f.temperaturas.map(t => TEMPERATURE_LABEL[t]))}`, limpar: { temperaturas: [] } })
  }
  if (f.encaixes.length > 0) {
    out.push({ id: 'encaixes', texto: `Encaixe: ${listaCurta(f.encaixes.map(e => FIT_LABEL[e]))}`, limpar: { encaixes: [] } })
  }
  if (f.origens.length > 0) {
    out.push({ id: 'origens', texto: `Origem: ${listaCurta(f.origens.map(o => ORIGEM_META[o]?.label ?? o))}`, limpar: { origens: [] } })
  }
  if (f.produtos.length > 0) {
    const nomes = f.produtos.map(k => ctx.produtos.find(p => p.value === k)?.label ?? 'Produto')
    out.push({ id: 'produtos', texto: `Produto: ${listaCurta(nomes)}`, limpar: { produtos: [] } })
  }
  if (f.corretores.length > 0) {
    const nomes = f.corretores.map(id => ctx.corretores?.find(c => c.value === id)?.label.split(' ')[0] ?? 'Corretor')
    out.push({ id: 'corretores', texto: `Corretor: ${listaCurta(nomes)}`, limpar: { corretores: [] } })
  }
  return out
}

// ── Painel ───────────────────────────────────────────────────────────────────

interface PainelProps {
  isOpen: boolean
  onClose: () => void
  vista: 'lista' | 'kanban'
  base: Lead[]
  visiveis: number
  ctx: ContextoFiltro
  agora: number
  produtos: OpcaoCatalogo[]
  corretores: OpcaoCatalogo[] | null
}

export function PainelDeFiltros({
  isOpen, onClose, vista, base, visiveis, ctx, agora, produtos, corretores,
}: PainelProps) {
  const { filtros, definir, alternar, limpar } = useLeadFiltersStore()
  const nFiltros = contarFiltros(filtros, ctx)

  // "Quantos aparecem se eu ligar esta opção", com as outras facetas valendo.
  // Base de cada faceta calculada uma vez por render do painel.
  const semFaceta = useMemo(() => {
    const facetas: Faceta[] = ['etapas', 'origens', 'temperaturas', 'encaixes', 'corretores', 'produtos',
      'prioridade', 'sla', 'voltou', 'semContato', 'entrada']
    const out = {} as Record<Faceta, Lead[]>
    if (!isOpen) return out
    for (const fa of facetas) out[fa] = aplicarFiltros(base, filtros, ctx, fa)
    return out
  }, [isOpen, base, filtros, ctx])

  if (!isOpen) return null

  const conta = (fa: Faceta, casa: (l: Lead) => boolean) => (semFaceta[fa] ?? []).filter(casa).length

  // Opções que existem no escopo — a lista não pula enquanto se filtra; o que
  // zerou fica apagado, mas no lugar.
  const temperaturas = (['quente', 'reaquecendo', 'morno', 'novo', 'frio'] as Temperature[])
    .filter(t => filtros.temperaturas.includes(t) || base.some(l => ctx.intel[l.id]?.temperature === t))
  const encaixes = (['ideal', 'possivel', 'dificil', 'sem_dados'] as Fit[])
    .filter(e => filtros.encaixes.includes(e) || base.some(l => (ctx.intel[l.id]?.fitOrigin?.fit ?? 'sem_dados') === e))
  const origens = ORIGENS.filter(o => filtros.origens.includes(o) || base.some(l => l.origin === o))

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title="Filtros"
      subtitle={`${visiveis} de ${base.length} ${base.length === 1 ? 'lead' : 'leads'} com os filtros de agora`}
      size="md"
      footer={
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={limpar} disabled={nFiltros === 0}>
            Limpar filtros
          </Button>
          <Button onClick={onClose} className="ml-auto">
            Ver {visiveis} {visiveis === 1 ? 'lead' : 'leads'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-7">
        <Grupo icon={Radar} titulo="Sinais" tom="risco" descricao="O que pede ação antes do resto">
          <Opcao ativo={filtros.sla} onClick={() => definir({ sla: !filtros.sla })}
                 icon={Timer} tom="risco" label="1º contato pendente"
                 count={conta('sla', l => slaActive(l))} />
          <Opcao ativo={filtros.prioridade} onClick={() => definir({ prioridade: !filtros.prioridade })}
                 icon={Star} tom="marca" label="Prioridade"
                 count={conta('prioridade', l => !!l.flagged)} />
          <Opcao ativo={filtros.voltou} onClick={() => definir({ voltou: !filtros.voltou })}
                 icon={RefreshCw} tom="info" label="Voltou a se cadastrar"
                 count={conta('voltou', l => !!avisoReentrada(l))} />
        </Grupo>

        <Grupo icon={Snowflake} titulo="Tempo sem contato" tom="atencao" descricao="Escolha uma janela">
          {(['2', '7', '15', '30', 'nunca'] as JanelaContato[]).map(j => (
            <Opcao
              key={j}
              ativo={filtros.semContato === j}
              onClick={() => definir({ semContato: filtros.semContato === j ? null : j })}
              label={JANELA_LABEL[j]}
              tom="atencao"
              count={conta('semContato', l => j === 'nunca' ? !l.lastContactAt : semContatoHaMaisDe(l, Number(j), agora))}
            />
          ))}
          <div className="basis-full">
            <Dica>
              Conta como contato: WhatsApp aberto pelo funil, ligação registrada e tarefa do lead
              concluída. Nota, transferência e mudança de etapa não contam.
            </Dica>
          </div>
        </Grupo>

        <Grupo icon={CalendarRange} titulo="Entrada no funil" tom="info" descricao="Quando o lead chegou">
          {(['hoje', 'ontem', 'semana', '7d', 'mes', '30d', 'mais30', 'personalizado'] as PeriodoEntrada[]).map(p => (
            <Opcao
              key={p}
              ativo={filtros.entrada === p}
              onClick={() => definir(filtros.entrada === p
                ? { entrada: null, entradaDe: '', entradaAte: '' }
                : { entrada: p, ...(p === 'personalizado' ? {} : { entradaDe: '', entradaAte: '' }) })}
              label={PERIODO_LABEL[p]}
              tom="info"
              count={p === 'personalizado' ? undefined : conta('entrada', l => {
                const iv = intervaloEntrada({ entrada: p, entradaDe: '', entradaAte: '' }, agora)!
                const t = new Date(l.createdAt).getTime()
                return t >= iv.de && t < iv.ate
              })}
            />
          ))}
          {filtros.entrada === 'personalizado' && (
            <div className="basis-full grid grid-cols-2 gap-3 mt-1">
              <Input
                label="De"
                type="date"
                value={filtros.entradaDe}
                max={filtros.entradaAte || undefined}
                onChange={e => definir({ entradaDe: e.target.value })}
              />
              <Input
                label="Até"
                type="date"
                value={filtros.entradaAte}
                min={filtros.entradaDe || undefined}
                onChange={e => definir({ entradaAte: e.target.value })}
              />
            </div>
          )}
        </Grupo>

        {vista === 'lista' && (
          <Grupo icon={GitBranch} titulo="Etapa" tom="neutro">
            {FUNNEL_STAGES.map((s: LeadFunnelStage) => (
              <Opcao
                key={s}
                ativo={filtros.etapas.includes(s)}
                onClick={() => alternar('etapas', s)}
                label={STAGE_THEME[s].label}
                dot={STAGE_THEME[s].dot}
                count={conta('etapas', l => l.funnelStage === s)}
              />
            ))}
          </Grupo>
        )}

        {temperaturas.length > 0 && (
          <Grupo icon={Thermometer} titulo="Temperatura" tom="neutro" descricao="Calculada pelo que o lead fez">
            {temperaturas.map(t => (
              <Opcao
                key={t}
                ativo={filtros.temperaturas.includes(t)}
                onClick={() => alternar('temperaturas', t)}
                label={TEMPERATURE_LABEL[t]}
                dotCor={TEMPERATURE_COLOR[t]}
                count={conta('temperaturas', l => ctx.intel[l.id]?.temperature === t)}
              />
            ))}
          </Grupo>
        )}

        {encaixes.length > 0 && (
          <Grupo icon={Target} titulo="Encaixe no produto de origem" tom="neutro">
            {encaixes.map(e => (
              <Opcao
                key={e}
                ativo={filtros.encaixes.includes(e)}
                onClick={() => alternar('encaixes', e)}
                label={FIT_LABEL[e]}
                dotCor={FIT_COLOR[e]}
                count={conta('encaixes', l => (ctx.intel[l.id]?.fitOrigin?.fit ?? 'sem_dados') === e)}
              />
            ))}
          </Grupo>
        )}

        {produtos.length > 0 && (
          <Grupo icon={Home} titulo="Produto de interesse" tom="neutro">
            {produtos.map(p => (
              <Opcao
                key={p.value}
                ativo={filtros.produtos.includes(p.value)}
                onClick={() => alternar('produtos', p.value)}
                label={p.label}
                count={conta('produtos', l => chaveProduto(l) === p.value)}
              />
            ))}
          </Grupo>
        )}

        {origens.length > 0 && (
          <Grupo icon={Megaphone} titulo="Origem" tom="neutro">
            {origens.map(o => (
              <Opcao
                key={o}
                ativo={filtros.origens.includes(o)}
                onClick={() => alternar('origens', o)}
                label={ORIGEM_META[o].label}
                icon={ORIGEM_META[o].icon}
                count={conta('origens', l => l.origin === o)}
              />
            ))}
          </Grupo>
        )}

        {corretores && corretores.length > 0 && (
          <Grupo icon={User} titulo="Corretor" tom="neutro">
            {corretores.map(c => (
              <Opcao
                key={c.value || 'sem'}
                ativo={filtros.corretores.includes(c.value)}
                onClick={() => alternar('corretores', c.value)}
                label={c.label}
                count={conta('corretores', l => (l.brokerId ?? '') === c.value)}
              />
            ))}
          </Grupo>
        )}
      </div>
    </SidePanel>
  )
}

function Grupo({ icon, titulo, tom, descricao, children }: {
  icon: LucideIcon
  titulo: string
  tom: Tom
  descricao?: string
  children: React.ReactNode
}) {
  return (
    <section>
      <SecaoTitulo icon={icon} tom={tom} descricao={descricao}>{titulo}</SecaoTitulo>
      <div role="group" aria-label={titulo} className="flex flex-wrap gap-2">
        {children}
      </div>
    </section>
  )
}

/**
 * Opção do painel — botão de alternar, nunca radio de mentira. Nas facetas de
 * uma escolha só (tempo sem contato, entrada), tocar noutra troca e tocar na
 * mesma desliga; o `aria-pressed` diz o estado sem prometer teclado de
 * radiogroup que não existe.
 */
function Opcao({ ativo, onClick, label, count, icon: Icon, dot, dotCor, tom = 'marca' }: {
  ativo: boolean
  onClick: () => void
  label: string
  count?: number
  icon?: LucideIcon
  /** classe utilitária de cor (etapa) */
  dot?: string
  /** valor CSS de cor (temperatura, encaixe) */
  dotCor?: string
  tom?: Tom
}) {
  const t = TOM[tom]
  const zerado = count === 0 && !ativo
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={`flex items-center gap-1.5 min-h-10 px-3 rounded-[12px] border text-[13px] font-medium
                  transition-all duration-150 active:scale-[0.98]
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40
                  ${ativo ? `${t.fundo} ${t.borda} ${t.texto} font-semibold` : 'bg-surface border-line-input text-t2 hover:bg-s2 hover:border-line-strong'}
                  ${zerado ? 'opacity-50' : ''}`}
    >
      {dot && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} aria-hidden />}
      {dotCor && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotCor }} aria-hidden />}
      {Icon && <Icon size={13} strokeWidth={1.6} className={ativo ? '' : 'text-t3'} aria-hidden />}
      <span>{label}</span>
      {count !== undefined && (
        <span className={`tabular-nums text-xs ${ativo ? 'font-bold' : 'text-t4'}`}>{count}</span>
      )}
    </button>
  )
}
