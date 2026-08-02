import { useEffect, useState } from 'react'
import {
  Target, Wallet, Banknote, Landmark, Clock, BedDouble,
  Database, ChevronDown, HelpCircle, Loader2, FileText, CheckCircle2,
  Pencil, Plus, UserCheck,
} from 'lucide-react'
import { LeadProfileEditor } from './LeadProfileEditor'
import { db } from '../../lib/db'
import { useIntelligenceStore } from '../../store/useIntelligenceStore'
import {
  LeadProfile, LeadProfileField, LeadProfileValue, LeadKnownList,
} from '../../types'
import { formatCurrencyRound, formatDateShort } from '../../lib/formatters'

/* ── Vocabulário ────────────────────────────────────────────────────────── */

const CAMPO: Record<LeadProfileField, { label: string; Icon: typeof Target }> = {
  objetivo:         { label: 'Objetivo',  Icon: Target },
  renda:            { label: 'Renda',     Icon: Wallet },
  entrada:          { label: 'Entrada',   Icon: Banknote },
  fgts:             { label: 'FGTS',      Icon: Landmark },
  prazo:            { label: 'Prazo',     Icon: Clock },
  tipologia:        { label: 'Tipologia', Icon: BedDouble },
  capacidade:       { label: 'Capacidade', Icon: CheckCircle2 },
  interesse_visita: { label: 'Visita',    Icon: Target },
}

/** O corretor pode apurar estes; os demais só existem se o formulário perguntou. */
const EDITAVEIS: LeadProfileField[] = ['objetivo', 'renda', 'entrada', 'fgts', 'prazo', 'tipologia']

/** Ordem de leitura: o que decide a conversa primeiro. */
const ORDEM: LeadProfileField[] = [
  'objetivo', 'renda', 'entrada', 'fgts', 'prazo', 'tipologia', 'capacidade', 'interesse_visita',
]

/** Faixa em reais, sem centavos e sem repetir "R$" duas vezes. */
function faixaTexto(v: LeadProfileValue): string | null {
  if (v.min == null && v.max == null) return null
  if (v.min != null && v.max != null) {
    return v.min === 0
      ? `até ${formatCurrencyRound(v.max)}`
      : `${formatCurrencyRound(v.min)} – ${formatCurrencyRound(v.max)}`
  }
  if (v.min != null) return `${formatCurrencyRound(v.min)} ou mais`
  return `até ${formatCurrencyRound(v.max!)}`
}

/* ── Medidor de urgência ─────────────────────────────────────────────────── */

function Urgencia({ rank }: { rank: number }) {
  const nomes = ['', 'Só pesquisando', 'Médio prazo', 'Curto prazo', 'Imediato']
  return (
    <span className="inline-flex items-center gap-1.5" title={nomes[rank]}>
      <span className="flex gap-[3px]" aria-hidden>
        {[1, 2, 3, 4].map(i => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full transition-colors"
            style={{
              background: i <= rank
                ? (rank >= 4 ? 'var(--success)' : rank >= 3 ? 'var(--brand)' : 'var(--t3)')
                : 'var(--line)',
            }}
          />
        ))}
      </span>
      <span className="sr-only">{nomes[rank]}</span>
    </span>
  )
}

/* ── Uma linha do perfil ─────────────────────────────────────────────────── */

function LinhaPerfil({
  campo, valor, onEdit,
}: { campo: LeadProfileField; valor: LeadProfileValue; onEdit?: () => void }) {
  const { label, Icon } = CAMPO[campo]
  const faixa = faixaTexto(valor)
  const apurado = valor.source === 'corretor'

  return (
    <div className="group/linha flex items-start gap-2.5 py-1.5">
      <Icon size={12} strokeWidth={1.6} className="text-t4 flex-shrink-0 mt-[3px]" />
      <span className="font-label text-[11px] uppercase tracking-[0.1em] text-t4 w-[68px] flex-shrink-0 mt-[2px]">
        {label}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Faixa em destaque quando existe: é o número que decide */}
          {faixa
            ? <span className="text-sm text-t1 font-medium tabular-nums">{faixa}</span>
            : <span className="text-sm text-t1">{valor.label}</span>}
          {valor.rank != null && <Urgencia rank={valor.rank} />}
          {valor.unplanned && (
            <span className="font-label text-[10px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-full text-t3 border border-line">
              sem plano
            </span>
          )}
          {/* Distingue "a pessoa respondeu isso" de "alguém daqui apurou isso" —
              são coisas de confiança bem diferente. */}
          {apurado && (
            <span
              className="inline-flex items-center gap-1 font-label text-[10px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-full text-brand-text border border-brand/30"
              title="Apurado pelo corretor — sobrepõe o que foi declarado no formulário"
            >
              <UserCheck size={8} strokeWidth={2} /> apurado
            </span>
          )}
        </div>
        {/* O texto exato que a pessoa marcou, quando a faixa já ocupou a linha */}
        {faixa && valor.label && !apurado && (
          <p className="text-[11px] text-t4 leading-tight mt-0.5 truncate">{valor.label}</p>
        )}
      </div>
      {onEdit && (
        <button
          onClick={onEdit}
          aria-label={`Editar ${label.toLowerCase()}`}
          className="w-6 h-6 flex items-center justify-center rounded text-t5 flex-shrink-0
                     opacity-0 group-hover/linha:opacity-100 focus-visible:opacity-100
                     [@media(hover:none)]:opacity-100 hover:text-brand-text transition-all"
        >
          <Pencil size={11} strokeWidth={1.6} />
        </button>
      )}
    </div>
  )
}

/* ── Listas internas ─────────────────────────────────────────────────────── */

function ListaConhecida({ lista }: { lista: LeadKnownList }) {
  const p = lista.profile ?? {}
  const detalhes = [
    p.region,
    p.bedrooms ? `${p.bedrooms} dorm` : null,
    p.valueMax ? `até ${formatCurrencyRound(p.valueMax)}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-5 h-5 rounded-[6px] bg-s2 border border-line flex items-center justify-center flex-shrink-0">
        <Database size={10} strokeWidth={1.6} className="text-t4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-t2 truncate">{lista.name}</p>
        {detalhes && <p className="text-[11px] text-t4 truncate">{detalhes}</p>}
      </div>
      <span className="font-label text-[11px] text-t4 flex-shrink-0 tabular-nums">
        {formatDateShort(lista.at)}
      </span>
    </div>
  )
}

/* ── Painel ──────────────────────────────────────────────────────────────── */

export function LeadProfilePanel({ leadId }: { leadId: string }) {
  const [data, setData]       = useState<LeadProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro]       = useState(false)
  const [aberto, setAberto]   = useState(true)
  const [verFormularios, setVerFormularios] = useState(false)
  const [editando, setEditando] = useState<LeadProfileField | null>(null)
  const recarregar = useIntelligenceStore(s => s.load)

  function carregar() {
    setLoading(true); setErro(false)
    db.leads.profile(leadId)
      .then(r => setData(r))
      .catch(() => setErro(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let vivo = true
    setLoading(true); setErro(false)
    db.leads.profile(leadId)
      .then(r => { if (vivo) setData(r) })
      .catch(() => { if (vivo) setErro(true) })
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [leadId])

  // Mudou o perfil? A compatibilidade muda junto — sem isso o corretor
  // corrigiria a renda e continuaria vendo o encaixe antigo.
  function aposSalvar() {
    setEditando(null)
    carregar()
    recarregar(true)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-t4">
        <Loader2 size={12} className="animate-spin" /> Carregando perfil…
      </div>
    )
  }

  // Banco é a fonte da verdade: falha aparece, não some.
  if (erro) {
    return (
      <div className="py-2 px-3 rounded-[10px] bg-error-bg border border-error-line">
        <p className="text-xs text-error">Não foi possível carregar o perfil deste lead.</p>
      </div>
    )
  }

  const campos = data ? ORDEM.filter(c => data.profile[c]) : []
  const nada = campos.length === 0 && (data?.lists.length ?? 0) === 0

  if (!data || nada) {
    return (
      <div className="py-2">
        <p className="text-xs text-t4">
          Sem perfil declarado — este lead não veio de formulário do Meta.
        </p>
      </div>
    )
  }

  const ultimoForm = data.forms[0]

  return (
    <div>
      {/* Cabeçalho colapsável, no padrão das outras seções do painel */}
      <button
        onClick={() => setAberto(v => !v)}
        className="flex items-center justify-between w-full mb-2 group"
        aria-expanded={aberto}
      >
        <div className="flex items-center gap-1.5">
          <FileText size={12} strokeWidth={1.6} className="text-t4" />
          <span className="font-label text-[11px] font-medium uppercase tracking-[0.12em] text-t3 group-hover:text-t2 transition-colors">
            Perfil declarado
          </span>
          {data.formCount > 0 && (
            <span className="font-label text-[11px] bg-s3 text-t3 px-1.5 py-0.5 rounded-full tabular-nums">
              {data.formCount}
            </span>
          )}
          {data.isKnown && (
            <span className="font-label text-[10px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-full bg-brand-tint text-brand-text border border-brand/30">
              já era da base
            </span>
          )}
        </div>
        <ChevronDown
          size={12} strokeWidth={1.6} aria-hidden
          className={`text-t4 transition-transform duration-200 ${aberto ? 'rotate-180' : ''}`}
        />
      </button>

      {aberto && (
        <div className="space-y-3">
          {/* ── Campos ─────────────────────────────────────────────── */}
          {campos.length > 0 && (
            <div className="rounded-[14px] bg-s2/50 border border-line px-3 py-1.5">
              {campos.map(c => (
                editando === c ? (
                  <div key={c} className="py-2">
                    <LeadProfileEditor
                      leadId={leadId} field={c} atual={data.profile[c]}
                      onSaved={aposSalvar} onCancel={() => setEditando(null)}
                    />
                  </div>
                ) : (
                  <LinhaPerfil
                    key={c} campo={c} valor={data.profile[c]!}
                    onEdit={EDITAVEIS.includes(c) ? () => setEditando(c) : undefined}
                  />
                )
              ))}
              {ultimoForm && (
                <p className="text-[11px] text-t4 pt-1.5 pb-1 border-t border-line mt-1">
                  {ultimoForm.formName} · {formatDateShort(ultimoForm.at)}
                </p>
              )}
            </div>
          )}

          {/* ── O que falta descobrir ──────────────────────────────── */}
          {data.missing.length > 0 && (
            <div className="flex items-start gap-2">
              <HelpCircle size={12} strokeWidth={1.6} className="text-t4 flex-shrink-0 mt-[3px]" />
              <div className="min-w-0">
                <p className="font-label text-[11px] uppercase tracking-[0.1em] text-t4 mb-1">
                  Falta descobrir
                </p>
                {/* Cada pendência é um botão: apontar o que falta sem oferecer
                    onde preencher seria só cobrança. */}
                <div className="flex flex-wrap gap-1.5">
                  {data.missing.map(m => (
                    <button
                      key={m}
                      onClick={() => setEditando(m)}
                      className="inline-flex items-center gap-1 font-label text-[11px] px-2 py-0.5 rounded-full
                                 text-t3 border border-dashed border-line
                                 hover:text-brand-text hover:border-brand/40 transition-colors cursor-pointer"
                    >
                      <Plus size={9} strokeWidth={2} /> {CAMPO[m]?.label ?? m}
                    </button>
                  ))}
                </div>
                {editando && data.missing.includes(editando) && (
                  <div className="mt-2">
                    <LeadProfileEditor
                      leadId={leadId} field={editando}
                      onSaved={aposSalvar} onCancel={() => setEditando(null)}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Já era da base ─────────────────────────────────────── */}
          {data.lists.length > 0 && (
            <div>
              <p className="font-label text-[11px] uppercase tracking-[0.1em] text-t4 mb-1">
                Já procurava imóvel — {data.lists.length}{' '}
                {data.lists.length === 1 ? 'lista' : 'listas'}
              </p>
              <div className="rounded-[14px] bg-s2/50 border border-line px-3 py-1">
                {data.lists.slice(0, 4).map(l => <ListaConhecida key={l.listId} lista={l} />)}
                {data.lists.length > 4 && (
                  <p className="text-[11px] text-t4 py-1">
                    e mais {data.lists.length - 4}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Histórico de preenchimentos ────────────────────────── */}
          {data.forms.length > 1 && (
            <div>
              <button
                onClick={() => setVerFormularios(v => !v)}
                className="flex items-center gap-1 text-xs text-brand-text hover:text-brand transition-colors"
                aria-expanded={verFormularios}
              >
                {verFormularios ? 'Ocultar' : `Ver os ${data.forms.length} preenchimentos`}
                <ChevronDown size={10} strokeWidth={1.6}
                  className={`transition-transform duration-200 ${verFormularios ? 'rotate-180' : ''}`} />
              </button>

              {verFormularios && (
                <div className="mt-2 space-y-2">
                  {data.forms.map(f => (
                    <div key={f.eventId} className="rounded-[14px] border border-line px-3 py-2">
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <p className="text-xs font-medium text-t1 truncate">{f.formName}</p>
                        <span className="font-label text-[11px] text-t4 flex-shrink-0 tabular-nums">
                          {formatDateShort(f.at)}
                        </span>
                      </div>
                      {f.answers?.filter(a => a.field).map((a, i) => (
                        <p key={i} className="text-[11px] text-t3 leading-relaxed">
                          <span className="text-t4">{CAMPO[a.field!]?.label ?? a.field}:</span>{' '}
                          {a.raw}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
