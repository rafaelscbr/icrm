import { useState } from 'react'
import { Pencil, Plus, ChevronDown } from 'lucide-react'
import { LeadProfileEditor } from './LeadProfileEditor'
import { LeadPreferencesEditor, RegionItem } from './LeadPreferencesEditor'
import { useIntelligenceStore } from '../../store/useIntelligenceStore'
import { Destaque } from '../../components/shared/Destaque'
import type { PerfilDoLead } from './useLeadProfile'
import {
  LeadProfileField, LeadProfileValue, LeadKnownList, LeadFormSubmission,
} from '../../types'
import { formatCurrency, formatCurrencyRound, formatDateShort } from '../../lib/formatters'

/*
 * Perfil declarado — v2 "Quem é o cliente" (11/11/2026).
 *
 * Antes era uma lista de rótulos em maiúsculas com o valor ao lado, na aba
 * Perfil, atrás de um clique. O corretor abria o lead para ligar e não via
 * renda, entrada nem prazo sem trocar de aba. Agora o perfil é o segundo
 * bloco do Resumo, logo depois do "Agora": um quadro de duas colunas em que
 * o VALOR é o que se lê primeiro (grande), o rótulo fica pequeno em cima e o
 * texto exato que a pessoa marcou no formulário fica embaixo, discreto.
 *
 * Cada célula é editável: o que o corretor apura na conversa sobrepõe o
 * declarado e ganha a marca "apurado" — o original continua no histórico.
 */

const ROTULO: Record<LeadProfileField, string> = {
  objetivo: 'Objetivo', renda: 'Renda familiar', entrada: 'Entrada', fgts: 'FGTS',
  prazo: 'Quando', tipologia: 'Tipologia', capacidade: 'Capacidade',
  interesse_visita: 'Visita', regioes: 'Regiões', tipologias: 'Tipologias',
}

/** O corretor pode apurar estes; os demais só existem se o formulário perguntou. */
const EDITAVEIS: LeadProfileField[] = ['objetivo', 'renda', 'entrada', 'fgts', 'prazo', 'tipologia']

/** Ordem de leitura, em pares: por que compra / quando · quanto ganha / quanto tem · resto. */
const ORDEM: LeadProfileField[] = [
  'objetivo', 'prazo', 'renda', 'entrada', 'fgts', 'tipologia', 'capacidade', 'interesse_visita',
]

/** Faixa curta e legível: "R$ 8 mil – 15 mil", "até R$ 25 mil", "R$ 30 mil ou mais". */
function faixaCurta(v: LeadProfileValue): string | null {
  if (v.min == null && v.max == null) return null
  const k = (n: number) => formatCurrency(n)
  if (v.min != null && v.max != null) return v.min === 0 ? `até ${k(v.max)}` : `${k(v.min)} – ${k(v.max)}`
  if (v.min != null) return `${k(v.min)} ou mais`
  return `até ${k(v.max!)}`
}

/** Valor principal da célula: a faixa quando existe, senão o texto marcado. */
function valorPrincipal(v: LeadProfileValue): string {
  return faixaCurta(v) ?? v.label ?? v.value ?? '—'
}

const URGENCIA = ['', 'Só pesquisando', 'Médio prazo', 'Curto prazo', 'Imediato']

function Urgencia({ rank }: { rank: number }) {
  const cor = rank >= 4 ? 'var(--success)' : rank >= 3 ? 'var(--brand)' : 'var(--t3)'
  return (
    <span className="inline-flex gap-[3px] align-middle ml-2" title={URGENCIA[rank]} aria-label={URGENCIA[rank]}>
      {[1, 2, 3, 4].map(i => (
        <span key={i} className="w-[5px] h-[5px] rounded-full" style={{ background: i <= rank ? cor : 'var(--line-strong)' }} />
      ))}
    </span>
  )
}

/** Uma célula do quadro — rótulo pequeno, valor grande, o texto marcado embaixo. */
function Celula({ campo, valor, onEdit }: { campo: LeadProfileField; valor: LeadProfileValue; onEdit?: () => void }) {
  const apurado = valor.source === 'corretor'
  const faixa = faixaCurta(valor)
  const conteudo = (
    <>
      <span className="flex items-center gap-1.5 text-[12px] text-t4">
        {ROTULO[campo]}
        {apurado && <span className="font-semibold text-brand-text" title="Apurado na conversa — sobrepõe o formulário">· apurado</span>}
      </span>
      <span className="block mt-0.5 text-[15.5px] font-semibold text-t1 leading-snug tabular-nums">
        {valorPrincipal(valor)}
        {valor.rank != null && <Urgencia rank={valor.rank} />}
      </span>
      {(valor.unplanned || (faixa && valor.label && !apurado)) && (
        <span className="block mt-0.5 text-[12px] text-t4 leading-snug line-clamp-2">
          {valor.unplanned ? 'Ainda vai se planejar' : valor.label}
        </span>
      )}
      {onEdit && (
        <Pencil size={13} strokeWidth={1.8} aria-hidden
          className="perfil-lapis absolute top-3 right-3 text-t4" />
      )}
    </>
  )
  return onEdit ? (
    <button type="button" onClick={onEdit} className="perfil-celula text-left" aria-label={`Editar ${ROTULO[campo].toLowerCase()}`}>
      {conteudo}
    </button>
  ) : (
    <div className="perfil-celula">{conteudo}</div>
  )
}

/* ── Quem é o cliente (Resumo) ──────────────────────────────────────────── */

export function PerfilDeclarado({ leadId, perfil }: { leadId: string; perfil: PerfilDoLead }) {
  const { data, loading, erro, recarregar } = perfil
  const [editando, setEditando] = useState<LeadProfileField | null>(null)
  const [editPref, setEditPref] = useState<'regioes' | 'tipologias' | null>(null)
  const recarregarIntel = useIntelligenceStore(s => s.load)

  // Mudou o perfil? O encaixe com os produtos muda junto.
  function aposSalvar() {
    setEditando(null)
    setEditPref(null)
    void recarregar()
    recarregarIntel(true)
  }

  const titulo = <h3 className="text-[15px] font-semibold text-t1 whitespace-nowrap flex-shrink-0">Quem é o <Destaque>cliente</Destaque></h3>

  if (loading && !data) {
    return (
      <section>
        <div className="mb-2.5">{titulo}</div>
        <div className="perfil-quadro" aria-hidden>
          {[0, 1, 2, 3].map(i => <div key={i} className="perfil-celula"><span className="block h-3 w-16 rounded bg-s3 mb-2" /><span className="block h-4 w-28 rounded bg-s3" /></div>)}
        </div>
        <span className="sr-only">Carregando perfil</span>
      </section>
    )
  }

  // Banco é a fonte da verdade: falha aparece, não some.
  if (erro || !data) {
    return (
      <section>
        <div className="mb-2">{titulo}</div>
        <p className="text-[13.5px] text-error">Não foi possível carregar o perfil deste lead.</p>
      </section>
    )
  }

  const campos = ORDEM.filter(c => data.profile[c])
  const ultimoForm = data.forms[0]
  const prefs = ([
    { key: 'regioes'    as const, label: 'Procura em', vazio: 'Onde ele procura?' },
    { key: 'tipologias' as const, label: 'Tipologias', vazio: 'Quantos dormitórios?' },
  ])

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 mb-2.5">
        {titulo}
        <span className="min-w-0 text-[12px] text-t4 truncate">
          {ultimoForm
            ? `${ultimoForm.formName} · ${formatDateShort(ultimoForm.at)}`
            : 'Sem formulário do Meta'}
          {data.isKnown && <span className="text-brand-text font-medium"> · já era da base</span>}
        </span>
      </div>

      {campos.length > 0 ? (
        <div className="perfil-quadro">
          {campos.map(c => editando === c ? (
            <div key={c} className="col-span-full p-4 bg-surface">
              <LeadProfileEditor leadId={leadId} field={c} atual={data.profile[c]}
                onSaved={aposSalvar} onCancel={() => setEditando(null)} />
            </div>
          ) : (
            <Celula key={c} campo={c} valor={data.profile[c]!}
              onEdit={EDITAVEIS.includes(c) ? () => { setEditPref(null); setEditando(c) } : undefined} />
          ))}
          {campos.length % 2 === 1 && <div className="perfil-celula perfil-vazia" aria-hidden />}
        </div>
      ) : (
        <p className="text-[13.5px] text-t4">
          Nada declarado ainda — o que você descobrir na conversa entra aqui.
        </p>
      )}

      {/* Preferências de busca: sempre visíveis, mesmo vazias — é o que cruza o
          lead com os produtos, e nenhum formulário pergunta região. */}
      <div className="mt-3 flex flex-col gap-1">
        {prefs.map(({ key, label, vazio }) => {
          const vals = data.profile[key] as unknown as { values?: string[]; labels?: string[]; items?: RegionItem[] } | undefined
          const itens = vals?.labels ?? vals?.values ?? []
          if (editPref === key) {
            return (
              <div key={key} className="py-2">
                <LeadPreferencesEditor leadId={leadId} field={key} atuais={vals?.values} atuaisRegioes={vals?.items}
                  onSaved={aposSalvar} onCancel={() => setEditPref(null)} />
              </div>
            )
          }
          return (
            <button key={key} type="button" onClick={() => { setEditando(null); setEditPref(key) }}
              className="perfil-pref group flex items-center gap-3 min-h-[40px] text-left">
              <span className="w-[76px] flex-shrink-0 text-[12.5px] text-t4">{label}</span>
              <span className="flex-1 min-w-0 flex flex-wrap gap-1.5">
                {itens.length > 0
                  ? itens.map(i => <span key={i} className="px-2.5 py-1 rounded-full bg-s2 text-[13px] font-medium text-t1">{i}</span>)
                  : <span className="text-[13.5px] text-t4">{vazio}</span>}
              </span>
              {itens.length > 0
                ? <Pencil size={13} strokeWidth={1.8} className="perfil-lapis text-t4" aria-hidden />
                : <Plus size={15} strokeWidth={2} className="text-t4" aria-hidden />}
            </button>
          )
        })}
      </div>

      {/* O que falta descobrir — cada pendência abre o campo para preencher */}
      {data.missing.length > 0 && (
        <div className="mt-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12.5px] text-t4 mr-0.5">Falta descobrir</span>
            {data.missing.map(m => (
              <button key={m} type="button" onClick={() => { setEditPref(null); setEditando(m) }}
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[12.5px] font-medium text-t2
                           bg-surface shadow-[inset_0_0_0_1px_var(--line-strong)] hover:bg-s2 transition-colors">
                <Plus size={12} strokeWidth={2.2} aria-hidden /> {ROTULO[m] ?? m}
              </button>
            ))}
          </div>
          {editando && data.missing.includes(editando) && (
            <div className="mt-3">
              <LeadProfileEditor leadId={leadId} field={editando} onSaved={aposSalvar} onCancel={() => setEditando(null)} />
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/* ── Já procurava imóvel (Produtos) ─────────────────────────────────────── */

export function BaseConhecida({ lists }: { lists: LeadKnownList[] }) {
  if (lists.length === 0) return null
  return (
    <section>
      <h3 className="text-[15px] font-semibold text-t1 mb-1">Já procurava <Destaque>imóvel</Destaque></h3>
      <p className="text-[12.5px] text-t4 mb-2">
        O telefone já estava em {lists.length} {lists.length === 1 ? 'lista' : 'listas'} da Base de Leads.
      </p>
      <ul className="flex flex-col">
        {lists.slice(0, 6).map(l => {
          const p = l.profile ?? {}
          const detalhes = [p.region, p.bedrooms ? `${p.bedrooms} dorm` : null, p.valueMax ? `até ${formatCurrencyRound(p.valueMax)}` : null]
            .filter(Boolean).join(' · ')
          return (
            <li key={l.listId} className="flex items-center gap-3 py-2 border-b border-line last:border-0">
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] text-t1 truncate">{l.name}</span>
                {detalhes && <span className="block text-[12.5px] text-t4 truncate">{detalhes}</span>}
              </span>
              <span className="text-[12.5px] text-t4 tabular-nums flex-shrink-0">{formatDateShort(l.at)}</span>
            </li>
          )
        })}
      </ul>
      {lists.length > 6 && <p className="text-[12.5px] text-t4 mt-1">e mais {lists.length - 6}</p>}
    </section>
  )
}

/* ── Formulários preenchidos (Histórico) ────────────────────────────────── */

export function FormulariosPreenchidos({ forms, textoOriginal }: { forms: LeadFormSubmission[]; textoOriginal?: string }) {
  const [aberto, setAberto] = useState(false)
  if (forms.length === 0 && !textoOriginal) return null
  return (
    <section>
      <button type="button" onClick={() => setAberto(v => !v)} aria-expanded={aberto}
        className="w-full flex items-center justify-between gap-3 text-left">
        <span>
          <span className="block text-[15px] font-semibold text-t1">Formulários preenchidos</span>
          <span className="block text-[12.5px] text-t4">
            {forms.length > 0 ? `${forms.length} preenchimento${forms.length !== 1 ? 's' : ''} no Meta` : 'Texto original recebido'}
          </span>
        </span>
        <ChevronDown size={16} strokeWidth={1.8} aria-hidden className={`text-t4 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {aberto && (
        <div className="mt-3 flex flex-col gap-4">
          {forms.map(f => (
            <div key={f.eventId}>
              <p className="flex items-baseline justify-between gap-2">
                <span className="text-[14px] font-semibold text-t1 truncate">{f.formName}</span>
                <span className="text-[12.5px] text-t4 tabular-nums flex-shrink-0">{formatDateShort(f.at)}</span>
              </p>
              <dl className="mt-1 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-[13px]">
                {/* Toda resposta aparece — inclusive pergunta nova que ainda não tem
                    campo canônico (lead_field_map): nesse caso o rótulo é a própria pergunta. */}
                {f.answers?.filter(a => a.raw).map((a, i) => (
                  <div key={i} className="contents">
                    <dt className="text-t4">{a.field ? (ROTULO[a.field] ?? a.field) : a.question}</dt>
                    <dd className="text-t2">{a.raw}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
          {textoOriginal && (
            <p className="text-[13px] text-t3 leading-relaxed whitespace-pre-wrap rounded-[12px] bg-s2 p-3.5">{textoOriginal}</p>
          )}
        </div>
      )}
    </section>
  )
}
