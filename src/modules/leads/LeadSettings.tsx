import { useState, useEffect } from 'react'
import {
  Plus, Pencil, Trash2, Check, Database, Copy, ChevronDown, ChevronUp,
  AlertCircle, CheckCircle2, ToggleLeft, ToggleRight, Loader2,
} from 'lucide-react'
import { LeadConfigEntry, LeadConfigType } from '../../types'
import { useLeadConfigStore } from '../../store/useLeadConfigStore'
import toast from 'react-hot-toast'

// ── SQL para criar a tabela ───────────────────────────────────────────────────

const SETUP_SQL = `-- Executar no Supabase SQL Editor
create table if not exists lead_config (
  id           text primary key,
  type         text not null check (type in ('discard_reason', 'origin')),
  slug         text not null,
  label        text not null,
  emoji        text,
  color        text,
  display_order integer not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique(type, slug)
);

-- Motivos de descarte padrão
insert into lead_config (id, type, slug, label, emoji, display_order) values
  ('sr-1', 'discard_reason', 'sem_condicao',       'Sem condição financeira',  '💸', 1),
  ('sr-2', 'discard_reason', 'fora_de_nicho',      'Fora do nicho de atuação', '🎯', 2),
  ('sr-3', 'discard_reason', 'parou_de_responder', 'Parou de responder',       '🔇', 3),
  ('sr-4', 'discard_reason', 'nunca_respondeu',    'Nunca respondeu',          '📵', 4),
  ('sr-5', 'discard_reason', 'telefone_invalido',  'Telefone inválido',        '❌', 5)
on conflict (type, slug) do nothing;

-- Origens de lead padrão
insert into lead_config (id, type, slug, label, emoji, color, display_order) values
  ('or-1', 'origin', 'felicita', 'Felicità',  '✨', 'text-rose-400',   1),
  ('or-2', 'origin', 'meta_ads', 'Meta ADS',  '📱', 'text-blue-400',   2),
  ('or-3', 'origin', 'portal',   'Portal',    '🌐', 'text-cyan-400',   3),
  ('or-4', 'origin', 'offline',  'Offline',   '🤝', 'text-amber-400',  4),
  ('or-5', 'origin', 'campanha', 'Campanha',  '📣', 'text-violet-400', 5)
on conflict (type, slug) do nothing;`

// ── Cores disponíveis para origens ───────────────────────────────────────────

const COLOR_OPTIONS = [
  { label: 'Rosa',    value: 'text-rose-400'   },
  { label: 'Azul',    value: 'text-blue-400'   },
  { label: 'Ciano',   value: 'text-cyan-400'   },
  { label: 'Âmbar',   value: 'text-amber-400'  },
  { label: 'Violeta', value: 'text-violet-400' },
  { label: 'Verde',   value: 'text-green-400'  },
  { label: 'Laranja', value: 'text-orange-400' },
  { label: 'Índigo',  value: 'text-indigo-400' },
  { label: 'Branco',  value: 'text-slate-200'  },
]

// ── Form de adição / edição ───────────────────────────────────────────────────

interface ItemFormProps {
  type: LeadConfigType
  initial?: LeadConfigEntry
  onSave: (data: { label: string; emoji: string; color?: string; slug: string }) => void
  onCancel: () => void
}

function ItemForm({ type, initial, onSave, onCancel }: ItemFormProps) {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [emoji, setEmoji] = useState(initial?.emoji ?? '')
  const [color, setColor] = useState(initial?.color ?? 'text-blue-400')
  const [slug,  setSlug]  = useState(initial?.slug  ?? '')

  const isEdit = !!initial

  function slugify(text: string) {
    return text
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
  }

  function handleLabelChange(v: string) {
    setLabel(v)
    if (!isEdit) setSlug(slugify(v))
  }

  function handleSave() {
    if (!label.trim()) { toast.error('Informe um nome'); return }
    if (!slug.trim())  { toast.error('Informe um identificador'); return }
    onSave({ label: label.trim(), emoji: emoji.trim(), color: type === 'origin' ? color : undefined, slug: slug.trim() })
  }

  return (
    <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {/* Emoji */}
        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Emoji</label>
          <input
            value={emoji}
            onChange={e => setEmoji(e.target.value)}
            placeholder="💸"
            maxLength={2}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-center text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/40"
          />
        </div>

        {/* Label */}
        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Nome</label>
          <input
            value={label}
            onChange={e => handleLabelChange(e.target.value)}
            placeholder={type === 'origin' ? 'Ex: Google Ads' : 'Ex: Sem retorno'}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/40"
          />
        </div>
      </div>

      {/* Slug (só na criação) */}
      {!isEdit && (
        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
            Identificador <span className="text-slate-700 font-normal normal-case tracking-normal">(gerado automaticamente)</span>
          </label>
          <input
            value={slug}
            onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            placeholder="sem_retorno"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-400 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/40"
          />
          <p className="text-[10px] text-slate-700 mt-1">Apenas letras minúsculas, números e sublinhado</p>
        </div>
      )}

      {/* Cor (só para origens) */}
      {type === 'origin' && (
        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Cor</label>
          <div className="flex flex-wrap gap-1.5">
            {COLOR_OPTIONS.map(c => (
              <button
                key={c.value}
                onClick={() => setColor(c.value)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all ${
                  color === c.value
                    ? 'bg-white/10 border-white/20'
                    : 'bg-white/3 border-white/8 hover:border-white/15'
                } ${c.value}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 py-2 text-sm text-slate-500 hover:text-slate-300 bg-white/3 border border-white/8 rounded-xl transition-all"
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          className="flex-1 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all"
        >
          {isEdit ? 'Salvar alterações' : 'Adicionar'}
        </button>
      </div>
    </div>
  )
}

// ── Linha de item ─────────────────────────────────────────────────────────────

interface ItemRowProps {
  item: LeadConfigEntry
  onEdit:   () => void
  onToggle: () => void
  onDelete: () => void
}

function ItemRow({ item, onEdit, onToggle, onDelete }: ItemRowProps) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
      item.active ? 'bg-white/3 border-white/8' : 'bg-white/1 border-white/5 opacity-60'
    }`}>
      <span className="text-lg w-7 text-center flex-shrink-0">{item.emoji ?? '·'}</span>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${item.color ?? 'text-slate-200'}`}>
          {item.label}
        </p>
        <p className="text-[11px] text-slate-600 font-mono mt-0.5">{item.slug}</p>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={onToggle}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${
            item.active
              ? 'text-emerald-400 hover:bg-emerald-500/10'
              : 'text-slate-600 hover:bg-white/5 hover:text-slate-400'
          }`}
          title={item.active ? 'Desativar' : 'Ativar'}
        >
          {item.active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
        </button>
        <button
          onClick={onEdit}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-all"
          title="Editar"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={onDelete}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-700 hover:text-red-400 hover:bg-red-500/10 transition-all"
          title="Remover"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

// ── Seção ─────────────────────────────────────────────────────────────────────

interface SectionProps {
  type: LeadConfigType
  title: string
  description: string
  items: LeadConfigEntry[]
  dbAvailable: boolean
}

function Section({ type, title, description, items, dbAvailable }: SectionProps) {
  const { add, update, remove } = useLeadConfigStore()
  const [showAdd,  setShowAdd]  = useState(false)
  const [editId,   setEditId]   = useState<string | null>(null)

  async function handleAdd(data: { label: string; emoji: string; color?: string; slug: string }) {
    await add(type, data)
    setShowAdd(false)
    toast.success('Item adicionado')
  }

  async function handleEdit(id: string, data: { label: string; emoji: string; color?: string; slug: string }) {
    await update(id, { label: data.label, emoji: data.emoji, color: data.color })
    setEditId(null)
    toast.success('Item atualizado')
  }

  async function handleToggle(item: LeadConfigEntry) {
    await update(item.id, { active: !item.active })
  }

  async function handleDelete(id: string) {
    await remove(id)
    toast.success('Item removido')
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-300 hover:text-white bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg transition-all"
        >
          <Plus size={12} />
          Adicionar
        </button>
      </div>

      {showAdd && (
        <ItemForm
          type={type}
          onSave={handleAdd}
          onCancel={() => setShowAdd(false)}
        />
      )}

      <div className="space-y-2">
        {items.length === 0 && (
          <p className="text-xs text-slate-600 text-center py-4">Nenhum item configurado</p>
        )}
        {items.map(item => (
          editId === item.id ? (
            <ItemForm
              key={item.id}
              type={type}
              initial={item}
              onSave={data => handleEdit(item.id, data)}
              onCancel={() => setEditId(null)}
            />
          ) : (
            <ItemRow
              key={item.id}
              item={item}
              onEdit={() => setEditId(item.id)}
              onToggle={() => handleToggle(item)}
              onDelete={() => handleDelete(item.id)}
            />
          )
        ))}
      </div>

      {!dbAvailable && (
        <p className="text-[11px] text-amber-500/70 flex items-center gap-1">
          <AlertCircle size={11} />
          Alterações salvas localmente — crie a tabela para persistir no banco
        </p>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export function LeadSettings() {
  const { load, dbAvailable, dbChecked, syncing } = useLeadConfigStore()
  const [showSql, setShowSql] = useState(false)
  const [copied,  setCopied]  = useState(false)

  useEffect(() => { load() }, [])

  const items       = useLeadConfigStore(s => s.items)
  const allDiscards = items.filter(i => i.type === 'discard_reason')
  const allOrigins  = items.filter(i => i.type === 'origin')

  function handleCopySql() {
    navigator.clipboard.writeText(SETUP_SQL)
    setCopied(true)
    toast.success('SQL copiado!')
    setTimeout(() => setCopied(false), 3000)
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-6 space-y-8">

      {/* Status do banco */}
      <div className={`flex items-start gap-3 p-4 rounded-xl border transition-all ${
        syncing
          ? 'bg-white/3 border-white/8'
          : dbAvailable
            ? 'bg-emerald-500/8 border-emerald-500/20'
            : 'bg-amber-500/8 border-amber-500/20'
      }`}>
        {syncing
          ? <Loader2 size={16} className="text-slate-500 flex-shrink-0 mt-0.5 animate-spin" />
          : dbAvailable
            ? <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
            : <Database size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
        }
        <div className="flex-1 min-w-0">
          {syncing ? (
            <p className="text-sm text-slate-500">Verificando banco de dados…</p>
          ) : dbAvailable ? (
            <p className="text-sm font-medium text-emerald-300">Conectado ao banco de dados</p>
          ) : (
            <>
              <p className="text-sm font-medium text-amber-300">
                Tabela <code className="font-mono text-amber-400 bg-amber-500/15 px-1 py-0.5 rounded text-xs">lead_config</code> não encontrada
              </p>
              <p className="text-xs text-amber-400/70 mt-0.5">
                Os valores abaixo são os padrões. Execute o SQL no Supabase para ativar persistência e poder editar.
              </p>
              <button
                onClick={() => setShowSql(v => !v)}
                className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-300 hover:text-amber-200 transition-colors"
              >
                {showSql ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {showSql ? 'Ocultar SQL' : 'Ver SQL de instalação'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* SQL expandido */}
      {showSql && dbChecked && !dbAvailable && (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-white/3 border-b border-white/8">
            <span className="text-xs font-semibold text-slate-400">SQL · Supabase Editor</span>
            <button
              onClick={handleCopySql}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
                copied
                  ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'
                  : 'text-slate-400 hover:text-slate-200 bg-white/3 border-white/8'
              }`}
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
          <pre className="p-4 text-[11px] text-slate-400 font-mono leading-relaxed overflow-x-auto whitespace-pre">
            {SETUP_SQL}
          </pre>
        </div>
      )}

      {/* Seções — sempre visíveis (static fallback garante dados imediatos) */}
      <div className="space-y-6">
        <div className="border-t border-white/6 pt-6">
          <Section
            type="discard_reason"
            title="Motivos de Descarte"
            description="Categorize os leads descartados para relatórios de qualidade de funil"
            items={allDiscards}
            dbAvailable={dbAvailable}
          />
        </div>

        <div className="border-t border-white/6 pt-6">
          <Section
            type="origin"
            title="Origens de Lead"
            description="Canal de origem — essencial para mensurar ROI por canal"
            items={allOrigins}
            dbAvailable={dbAvailable}
          />
        </div>

        {/* Nota sobre relatórios */}
        <div className="border-t border-white/6 pt-6">
          <div className="bg-white/3 border border-white/8 rounded-xl p-4 space-y-2">
            <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-2">
              <Database size={13} className="text-blue-400" />
              Uso em Relatórios
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Os motivos de descarte e origens são usados no <strong className="text-slate-300">Dashboard de Leads</strong> para análise de conversão por canal e diagnóstico de funil. Manter categorização consistente permite identificar quais origens geram leads mais qualificados e onde o funil perde mais.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="bg-white/3 rounded-lg p-2.5">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Motivos de descarte</p>
                <p className="text-xs text-slate-400 mt-1">{allDiscards.filter(d => d.active).length} ativos</p>
              </div>
              <div className="bg-white/3 rounded-lg p-2.5">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Origens</p>
                <p className="text-xs text-slate-400 mt-1">{allOrigins.filter(o => o.active).length} ativas</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
