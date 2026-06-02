import { useState, useEffect } from 'react'
import {
  Plus, Pencil, Trash2, Check, Database, Copy,
  ChevronDown, ChevronUp, CheckCircle2, Loader2, X,
} from 'lucide-react'
import { LeadConfigEntry, LeadConfigType } from '../../types'
import { useLeadConfigStore } from '../../store/useLeadConfigStore'
import toast from 'react-hot-toast'

// ── SQL setup ─────────────────────────────────────────────────────────────────

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
insert into lead_config (id, type, slug, label, emoji, display_order) values
  ('sr-1','discard_reason','sem_condicao','Sem condição financeira','💸',1),
  ('sr-2','discard_reason','fora_de_nicho','Fora do nicho de atuação','🎯',2),
  ('sr-3','discard_reason','parou_de_responder','Parou de responder','🔇',3),
  ('sr-4','discard_reason','nunca_respondeu','Nunca respondeu','📵',4),
  ('sr-5','discard_reason','telefone_invalido','Telefone inválido','❌',5)
on conflict (type, slug) do nothing;
insert into lead_config (id, type, slug, label, emoji, color, display_order) values
  ('or-1','origin','felicita','Felicità','✨','text-rose-400',1),
  ('or-2','origin','meta_ads','Meta ADS','📱','text-blue-400',2),
  ('or-3','origin','portal','Portal','🌐','text-cyan-400',3),
  ('or-4','origin','offline','Offline','🤝','text-amber-400',4),
  ('or-5','origin','campanha','Campanha','📣','text-violet-400',5)
on conflict (type, slug) do nothing;`

// ── Color palette para origens ────────────────────────────────────────────────

const COLORS = [
  { label: 'Rosa',    value: 'text-rose-400',   dot: 'bg-rose-400'   },
  { label: 'Azul',    value: 'text-blue-400',   dot: 'bg-blue-400'   },
  { label: 'Ciano',   value: 'text-cyan-400',   dot: 'bg-cyan-400'   },
  { label: 'Âmbar',   value: 'text-amber-400',  dot: 'bg-amber-400'  },
  { label: 'Violeta', value: 'text-violet-400', dot: 'bg-violet-400' },
  { label: 'Verde',   value: 'text-green-400',  dot: 'bg-green-400'  },
  { label: 'Laranja', value: 'text-orange-400', dot: 'bg-orange-400' },
  { label: 'Índigo',  value: 'text-indigo-400', dot: 'bg-indigo-400' },
]

// ── Inline edit form ──────────────────────────────────────────────────────────

interface EditFormProps {
  type: LeadConfigType
  initial?: LeadConfigEntry
  onSave: (data: { label: string; emoji: string; color?: string; slug: string }) => void
  onCancel: () => void
}

function EditForm({ type, initial, onSave, onCancel }: EditFormProps) {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [emoji, setEmoji] = useState(initial?.emoji ?? '')
  const [color, setColor] = useState(initial?.color ?? 'text-blue-400')
  const [slug,  setSlug]  = useState(initial?.slug  ?? '')
  const isEdit = !!initial

  function slugify(text: string) {
    return text.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  }

  function handleLabel(v: string) {
    setLabel(v)
    if (!isEdit) setSlug(slugify(v))
  }

  function handleSave() {
    if (!label.trim()) { toast.error('Informe um nome'); return }
    if (!slug.trim())  { toast.error('Informe um identificador'); return }
    onSave({ label: label.trim(), emoji: emoji.trim(), color: type === 'origin' ? color : undefined, slug: slug.trim() })
  }

  return (
    <div className="bg-page border border-blue-500/30 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-s3/50 border-b border-blue-500/20">
        <span className="text-xs font-semibold text-blue-300">{isEdit ? 'Editar item' : 'Novo item'}</span>
        <button onClick={onCancel} className="text-t3 hover:text-t2 transition-colors">
          <X size={14} />
        </button>
      </div>
      <div className="p-4 space-y-4">
        <div className="flex gap-3">
          <div className="w-20 flex-shrink-0">
            <label className="text-[10px] font-semibold text-t3 uppercase tracking-wider block mb-1.5">Emoji</label>
            <input
              value={emoji}
              onChange={e => setEmoji(e.target.value)}
              placeholder="💸"
              maxLength={2}
              className="w-full bg-s3/50 border border-line rounded-lg px-3 py-2.5 text-lg text-center focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/40"
            />
          </div>
          <div className="flex-1">
            <label className="text-[10px] font-semibold text-t3 uppercase tracking-wider block mb-1.5">Nome</label>
            <input
              value={label}
              onChange={e => handleLabel(e.target.value)}
              placeholder={type === 'origin' ? 'Ex: Google Ads' : 'Ex: Sem retorno'}
              className="w-full bg-s3/50 border border-line rounded-lg px-3 py-2.5 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/40"
            />
          </div>
        </div>

        {!isEdit && (
          <div>
            <label className="text-[10px] font-semibold text-t3 uppercase tracking-wider block mb-1.5">
              Identificador interno
            </label>
            <input
              value={slug}
              onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="sem_retorno"
              className="w-full bg-s3/50 border border-line rounded-lg px-3 py-2 text-sm text-t2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/40"
            />
            <p className="text-[10px] text-t4 mt-1">Gerado automaticamente · só letras, números e _</p>
          </div>
        )}

        {type === 'origin' && (
          <div>
            <label className="text-[10px] font-semibold text-t3 uppercase tracking-wider block mb-2">Cor</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map(c => (
                <button
                  key={c.value}
                  onClick={() => setColor(c.value)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    color === c.value
                      ? 'bg-s3 border-line-strong text-t1'
                      : 'bg-s2 border-line text-t3 hover:border-line-strong hover:text-t2'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 text-sm text-t3 hover:text-t2 bg-s2 border border-line rounded-xl transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all shadow-lg shadow-blue-600/20"
          >
            {isEdit ? 'Salvar' : 'Adicionar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Config section ────────────────────────────────────────────────────────────

interface ConfigSectionProps {
  type: LeadConfigType
  title: string
  subtitle: string
  items: LeadConfigEntry[]
  dbAvailable: boolean
}

function ConfigSection({ type, title, subtitle, items, dbAvailable }: ConfigSectionProps) {
  const { add, update, remove } = useLeadConfigStore()
  const [showAdd, setShowAdd]   = useState(false)
  const [editId,  setEditId]    = useState<string | null>(null)
  const [delId,   setDelId]     = useState<string | null>(null)

  const active   = items.filter(i => i.active)
  const inactive = items.filter(i => !i.active)

  async function handleAdd(data: Parameters<typeof add>[1]) {
    await add(type, data)
    setShowAdd(false)
    toast.success('Item adicionado')
  }

  async function handleEdit(id: string, data: Parameters<typeof add>[1]) {
    await update(id, { label: data.label, emoji: data.emoji, color: data.color })
    setEditId(null)
    toast.success('Salvo')
  }

  async function handleToggle(item: LeadConfigEntry) {
    await update(item.id, { active: !item.active })
  }

  async function handleDelete(id: string) {
    await remove(id)
    setDelId(null)
    toast.success('Removido')
  }

  const colorDot = (color?: string) =>
    COLORS.find(c => c.value === color)?.dot ?? 'bg-slate-400'

  return (
    <div className="bg-s2/50 border border-line rounded-2xl overflow-hidden">
      {/* Header — single line: title left, badge + button right */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-line">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-t1 truncate">{title}</h3>
          <p className="text-[11px] text-t4 mt-0.5 truncate">{subtitle}</p>
        </div>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-s3/70 text-blue-400 border border-blue-500/20 flex-shrink-0">
          {active.length} {active.length === 1 ? 'ativo' : 'ativos'}
        </span>
        <button
          onClick={() => { setShowAdd(v => !v); setEditId(null) }}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all flex-shrink-0 ${
            showAdd
              ? 'bg-s3 border-line-strong text-t2'
              : 'bg-blue-600 border-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-600/20'
          }`}
        >
          {showAdd ? <X size={13} /> : <Plus size={13} />}
          {showAdd ? 'Cancelar' : 'Adicionar'}
        </button>
      </div>

      <div className="p-3 space-y-2">
        {/* Add form */}
        {showAdd && (
          <EditForm
            type={type}
            onSave={handleAdd}
            onCancel={() => setShowAdd(false)}
          />
        )}

        {/* Active items */}
        {active.map(item => (
          <div key={item.id}>
            {editId === item.id ? (
              <EditForm
                type={type}
                initial={item}
                onSave={data => handleEdit(item.id, data)}
                onCancel={() => setEditId(null)}
              />
            ) : delId === item.id ? (
              /* Confirm delete */
              <div className="flex items-center gap-3 px-4 py-3 bg-red-500/8 border border-red-500/25 rounded-xl">
                <span className="text-sm text-red-300 flex-1">Remover <strong>{item.label}</strong>?</span>
                <button
                  onClick={() => setDelId(null)}
                  className="text-xs px-3 py-1.5 text-t3 hover:text-t2 bg-s2 border border-line rounded-lg transition-all"
                >
                  Não
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="text-xs px-3 py-1.5 font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-all"
                >
                  Remover
                </button>
              </div>
            ) : (
              /* Normal row */
              <div className="group flex items-center gap-2.5 px-4 py-2.5 bg-s2 hover:bg-s3 border border-line hover:border-line-strong rounded-xl transition-all">
                {/* Emoji */}
                <div className="w-8 h-8 rounded-lg bg-s3 border border-line flex items-center justify-center text-base flex-shrink-0">
                  {item.emoji || '·'}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  {type === 'origin' && item.color && (
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colorDot(item.color)}`} />
                  )}
                  <span className={`text-sm font-medium truncate ${type === 'origin' && item.color ? item.color : 'text-t1'}`}>
                    {item.label}
                  </span>
                  <span className="text-[11px] text-t4 font-mono truncate hidden sm:block">{item.slug}</span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {dbAvailable && (
                    <>
                      <button
                        onClick={() => { setEditId(item.id); setShowAdd(false) }}
                        className="w-8 h-8 flex items-center justify-center text-t4 hover:text-t1 hover:bg-s3 rounded-lg transition-all"
                        title="Editar"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleToggle(item)}
                        className="w-8 h-8 flex items-center justify-center text-t4 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-all"
                        title="Desativar"
                      >
                        <span className="text-[10px] font-bold">OFF</span>
                      </button>
                      <button
                        onClick={() => setDelId(item.id)}
                        className="w-8 h-8 flex items-center justify-center text-t4 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                        title="Remover"
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {active.length === 0 && !showAdd && (
          <div className="text-center py-6">
            <p className="text-sm text-t4">Nenhum item ativo</p>
          </div>
        )}

        {/* Inactive items (collapsed) */}
        {inactive.length > 0 && dbAvailable && (
          <div className="pt-1">
            <p className="text-[10px] font-semibold text-t5 uppercase tracking-wider px-1 mb-2">
              Inativos ({inactive.length})
            </p>
            {inactive.map(item => (
              <div
                key={item.id}
                className="group flex items-center gap-3 px-4 py-2.5 opacity-40 hover:opacity-70 rounded-xl transition-all"
              >
                <span className="text-base w-9 text-center">{item.emoji || '·'}</span>
                <span className="text-sm text-t3 flex-1 line-through">{item.label}</span>
                <button
                  onClick={() => handleToggle(item)}
                  className="opacity-0 group-hover:opacity-100 text-xs px-2.5 py-1 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg transition-all"
                >
                  Ativar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

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
    <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">

      {/* DB status banner — só mostra se não conectado ou ainda verificando */}
      {(syncing || (dbChecked && !dbAvailable)) && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${
          syncing
            ? 'bg-white/3 border-white/8 text-t3'
            : 'bg-amber-500/8 border-amber-500/20 text-amber-300'
        }`}>
          {syncing
            ? <Loader2 size={14} className="animate-spin flex-shrink-0" />
            : <Database size={14} className="flex-shrink-0" />
          }
          <span className="flex-1">
            {syncing
              ? 'Conectando ao banco…'
              : <>Tabela <code className="font-mono text-amber-400 bg-amber-500/15 px-1 rounded text-xs">lead_config</code> não encontrada — edições não persistem</>
            }
          </span>
          {!syncing && !dbAvailable && (
            <button
              onClick={() => setShowSql(v => !v)}
              className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-200 font-medium transition-colors flex-shrink-0"
            >
              {showSql ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              Ver SQL
            </button>
          )}
        </div>
      )}

      {/* Conectado — badge pequeno no topo */}
      {dbChecked && dbAvailable && (
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <CheckCircle2 size={13} />
          <span>Conectado ao banco — alterações salvas automaticamente</span>
        </div>
      )}

      {/* SQL expandido */}
      {showSql && !dbAvailable && (
        <div className="rounded-xl border border-line overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-white/3 border-b border-white/8">
            <span className="text-xs font-semibold text-t3">SQL · Supabase SQL Editor</span>
            <button
              onClick={handleCopySql}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
                copied
                  ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'
                  : 'text-t3 hover:text-t1 bg-white/3 border-white/8'
              }`}
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
          <pre className="p-4 text-[11px] text-t3 font-mono leading-relaxed overflow-x-auto whitespace-pre">
            {SETUP_SQL}
          </pre>
        </div>
      )}

      {/* Two-column layout on large screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ConfigSection
          type="discard_reason"
          title="Motivos de Descarte"
          subtitle="Por que o lead foi descartado"
          items={allDiscards}
          dbAvailable={dbAvailable}
        />
        <ConfigSection
          type="origin"
          title="Origens de Lead"
          subtitle="De onde o lead veio"
          items={allOrigins}
          dbAvailable={dbAvailable}
        />
      </div>

      {/* Footer info */}
      <div className="text-center text-xs text-t5 pb-2">
        Essas configurações alimentam os relatórios de conversão por canal e qualidade do funil
      </div>
    </div>
  )
}
