import { useState, useRef, useCallback, useMemo } from 'react'
import {
  Upload, FileSpreadsheet, CheckCircle2, XCircle,
  Users, RefreshCw, ArrowRight, Search, Database,
  Megaphone, TrendingUp, ShoppingBag, ChevronDown,
  AlertTriangle, Sparkles, SlidersHorizontal,
} from 'lucide-react'
import { Modal }   from '../../components/ui/Modal'
import { Button }  from '../../components/ui/Button'
import { parseXlsx, ParsedLead } from '../../lib/xlsxParser'
import { analyzeLeads, AnalyzedLead, AnalysisResult, ConflictType } from '../../lib/importAnalysis'
import { normalizePhone, generateId, formatPhone } from '../../lib/formatters'
import { supabase }  from '../../lib/supabase'
import { db }        from '../../lib/db'
import { useLeadListsStore } from '../../store/useLeadListsStore'
import toast from 'react-hot-toast'

interface Props {
  listId:    string
  listName:  string
  isOpen:    boolean
  onClose:   () => void
  onSuccess: (count: number) => void
}

type Step = 'upload' | 'preview' | 'analyzing' | 'review' | 'importing' | 'done'

type FilterType = 'all' | ConflictType

interface ImportStats {
  newContacts:      number
  existingContacts: number
  linkedToList:     number
  alreadyInList:    number
  skippedByUser:    number
  errors:           string[]
}

// ─── Config visual por tipo de conflito ────────────────────────────────────────
const CONFLICT_CONFIG: Record<ConflictType, {
  icon: React.ElementType
  color: string
  bg: string
  border: string
  dot: string
  label: string
  filterLabel: string
}> = {
  other_list: {
    icon: Database, color: 'text-blue-400', bg: 'bg-s3/60',
    border: 'border-blue-500/20', dot: 'bg-blue-400',
    label: 'Outra lista', filterLabel: 'Em listas',
  },
  campaign: {
    icon: Megaphone, color: 'text-violet-400', bg: 'bg-violet-500/10',
    border: 'border-violet-500/20', dot: 'bg-violet-400',
    label: 'Em campanha', filterLabel: 'Em campanhas',
  },
  funnel: {
    icon: TrendingUp, color: 'text-amber-400', bg: 'bg-amber-500/10',
    border: 'border-amber-500/20', dot: 'bg-amber-400',
    label: 'No funil', filterLabel: 'No funil',
  },
  client: {
    icon: ShoppingBag, color: 'text-red-400', bg: 'bg-red-500/10',
    border: 'border-red-500/20', dot: 'bg-red-400',
    label: 'Já é cliente', filterLabel: 'Clientes',
  },
}

// ─── Componente principal ──────────────────────────────────────────────────────
export function ImportLeadsModal({ listId, listName, isOpen, onClose, onSuccess }: Props) {
  const { updateCount, lists } = useLeadListsStore()

  // Steps
  const [step, setStep] = useState<Step>('upload')

  // Upload / parsing
  const [dragging,   setDragging]   = useState(false)
  const [fileName,   setFileName]   = useState('')
  const [parsed,     setParsed]     = useState<ParsedLead[]>([])
  const [parseErrors,setParseErrors]= useState<string[]>([])
  const [dupFile,    setDupFile]    = useState(0)
  const [invalidPh,  setInvalidPh]  = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  // Analyzing
  const [analyzeProgress, setAnalyzeProgress] = useState(0)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)

  // Review / decisões
  const [decisions, setDecisions] = useState<Map<string, boolean>>(new Map())  // phone → importar?
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [search, setSearch]   = useState('')
  const [filterOpen, setFilterOpen] = useState(false)

  // Import
  const [progress, setProgress] = useState(0)
  const [stats,    setStats]    = useState<ImportStats | null>(null)

  // ── Reset ────────────────────────────────────────────────────────────────────
  function reset() {
    setStep('upload'); setFileName(''); setParsed([]); setParseErrors([])
    setDupFile(0); setInvalidPh(0); setAnalyzeProgress(0); setAnalysis(null)
    setDecisions(new Map()); setFilterType('all'); setSearch('')
    setProgress(0); setStats(null)
  }

  function handleClose() { reset(); onClose() }

  // ── Upload / parse ───────────────────────────────────────────────────────────
  async function processFile(file: File) {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast.error('Use arquivos .xlsx, .xls ou .csv')
      return
    }
    setFileName(file.name)
    const result = await parseXlsx(file)
    setParsed(result.leads)
    setParseErrors(result.errors.slice(0, 20))
    setDupFile(result.duplicatePhones)
    setInvalidPh(result.invalidPhones)
    setStep('preview')
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [])

  // ── Analisar ─────────────────────────────────────────────────────────────────
  async function startAnalysis() {
    setStep('analyzing')
    setAnalyzeProgress(0)
    try {
      const result = await analyzeLeads(parsed, listId, pct => setAnalyzeProgress(pct))
      setAnalysis(result)
      // Inicializa decisões padrão vindas do análise
      const map = new Map<string, boolean>()
      result.conflicted.forEach(l => map.set(l.phone, l.importDecision))
      setDecisions(map)
      setStep('review')
    } catch (err: unknown) {
      const msg = (err instanceof Error ? err.message : (err as { message?: string })?.message) ?? String(err)
      toast.error(`Erro na análise: ${msg}`)
      setStep('preview')
    }
  }

  // ── Review: leads filtrados ──────────────────────────────────────────────────
  const filteredConflicted = useMemo(() => {
    if (!analysis) return []
    return analysis.conflicted.filter(lead => {
      if (filterType !== 'all' && !lead.conflicts.some(c => c.type === filterType)) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return lead.name.toLowerCase().includes(q) || lead.phone.includes(q)
      }
      return true
    })
  }, [analysis, filterType, search])

  const totalToImport = useMemo(() => {
    if (!analysis) return 0
    const fromClean      = analysis.clean.length
    const fromConflicted = analysis.conflicted.filter(l => decisions.get(l.phone) ?? l.importDecision).length
    return fromClean + fromConflicted
  }, [analysis, decisions])

  function toggleDecision(phone: string) {
    setDecisions(prev => {
      const next = new Map(prev)
      next.set(phone, !(next.get(phone) ?? true))
      return next
    })
  }

  function setAllVisible(value: boolean) {
    setDecisions(prev => {
      const next = new Map(prev)
      filteredConflicted.forEach(l => next.set(l.phone, value))
      return next
    })
  }

  // Contagens por tipo para o sumário
  const conflictCounts = useMemo(() => {
    if (!analysis) return {} as Record<ConflictType, number>
    const counts: Partial<Record<ConflictType, number>> = {}
    analysis.conflicted.forEach(l => {
      const seen = new Set<ConflictType>()
      l.conflicts.forEach(c => {
        if (!seen.has(c.type)) {
          seen.add(c.type)
          counts[c.type] = (counts[c.type] ?? 0) + 1
        }
      })
    })
    return counts as Record<ConflictType, number>
  }, [analysis])

  // ── Importar ─────────────────────────────────────────────────────────────────
  async function startImport() {
    if (!analysis) return
    setStep('importing')
    setProgress(0)

    // Quais leads serão importados
    const toImport: ParsedLead[] = [
      ...analysis.clean,
      ...analysis.conflicted.filter(l => decisions.get(l.phone) ?? l.importDecision),
    ]

    const s: ImportStats = {
      newContacts: 0, existingContacts: 0, linkedToList: 0,
      alreadyInList: analysis.alreadyInList,
      skippedByUser: analysis.conflicted.filter(l => !(decisions.get(l.phone) ?? l.importDecision)).length,
      errors: [],
    }

    try {
      const CHUNK = 500
      const total = toImport.length

      // 1. Reutiliza os contact IDs já encontrados pela análise (evita re-busca
      //    e resolve o mismatch de formato: "(47) 9xxxx" vs "479xxxx")
      const existingMap = new Map<string, string>() // phone normalizado → contact_id
      for (const lead of toImport as AnalyzedLead[]) {
        if (lead.existingContactId) existingMap.set(lead.phone, lead.existingContactId)
      }

      // 2. Criar novos contatos (apenas os que a análise não encontrou)
      const now           = new Date().toISOString()
      const currentUserId = (await supabase.auth.getUser()).data.user?.id ?? null
      const listProfile   = lists.find(ll => ll.id === listId)?.productProfile ?? null
      const toCreate      = toImport.filter(l => !existingMap.has(l.phone))

      for (let i = 0; i < toCreate.length; i += CHUNK) {
        const chunk = toCreate.slice(i, i + CHUNK)
        const rows  = chunk.map(l => ({
          id: generateId(), name: l.name, phone: l.phone,
          tags: [], has_children: false, is_married: false,
          permuta_items: null, permuta_type: null,
          permuta_property_region: null, permuta_property_value: null,
          permuta_car_model: null, permuta_car_value: null,
          is_base_lead: true, base_lead_profile: listProfile,
          broker_id: currentUserId, created_at: now, updated_at: now,
        }))

        const { data, error } = await supabase.from('contacts').insert(rows).select('id, phone')
        if (error) {
          s.errors.push(`Erro ao criar contatos: ${error.message}`)
        } else if (data) {
          (data as { id: string; phone: string }[]).forEach(c => {
            const norm = normalizePhone(c.phone)
            if (norm) existingMap.set(norm, c.id)
          })
          s.newContacts += data.length
        }
        setProgress(Math.round(((i + CHUNK) / total) * 50))
      }

      s.existingContacts = total - toCreate.length

      // 3. Quais já estão NESTA lista
      const allContactIds = Array.from(existingMap.values())
      const alreadyInList = await db.leadListMembers.checkExisting(allContactIds, listId)
      const alreadySet    = new Set(alreadyInList)

      // 4. Vincular à lista
      const membersToAdd = toImport
        .filter(l => existingMap.has(l.phone) && !alreadySet.has(existingMap.get(l.phone)!))
        .map(l => ({
          listId, contactId: existingMap.get(l.phone)!,
          importBatch: fileName, rawPhone: l.rawPhone,
        }))

      await db.leadListMembers.insertMany(membersToAdd)
      s.linkedToList = membersToAdd.length
      setProgress(85)

      // 5. Registrar eventos contact_events
      if (membersToAdd.length > 0) {
        const eventRows = membersToAdd.map(m => ({
          id:         generateId(),
          contact_id: m.contactId,
          event_type: 'added_to_list',
          title:      `Adicionado à lista "${listName}"`,
          metadata:   { listId, listName, importBatch: fileName },
          broker_id:  currentUserId,
          created_at: now,
        }))
        // Inserir em chunks para não estourar limite
        for (let i = 0; i < eventRows.length; i += CHUNK) {
          await supabase.from('contact_events').insert(eventRows.slice(i, i + CHUNK))
        }
      }
      setProgress(95)

      // 6. Atualizar total_count da lista
      const currentList = lists.find(l => l.id === listId)
      const newTotal    = (currentList?.totalCount ?? 0) + s.linkedToList
      await updateCount(listId, newTotal)

      setProgress(100)
      setStats(s)
      setStep('done')
      onSuccess(s.linkedToList)
    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
        : (err as { message?: string })?.message ?? String(err)
      s.errors.push(msg)
      setStats(s)
      setStep('done')
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  const dropZoneCls = `border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer ${
    dragging ? 'border-brand bg-brand/5' : 'border-line hover:border-brand/50 hover:bg-s2/30'
  }`

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Importar Leads"
      subtitle={`Lista: ${listName}`} size="xl">

      {/* ── UPLOAD ── */}
      {step === 'upload' && (
        <div className="flex flex-col gap-5">
          <div className={dropZoneCls}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
          >
            <div className="w-12 h-12 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center mx-auto mb-4">
              <Upload size={22} className="text-brand" />
            </div>
            <p className="text-sm font-semibold text-t1 mb-1">Arraste ou clique para selecionar</p>
            <p className="text-xs text-t4">.xlsx · .xls · .csv — colunas detectadas automaticamente</p>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f) }} />

          <div className="bg-s2/50 border border-line rounded-xl p-4">
            <p className="text-xs font-semibold text-t3 mb-2">Colunas reconhecidas automaticamente</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Telefone', keys: 'telefone, cel, celular, fone, whatsapp' },
                { label: 'Nome',     keys: 'nome, cliente, lead, prospect' },
                { label: 'E-mail',   keys: 'email, mail, correio' },
              ].map(c => (
                <div key={c.label} className="text-[11px]">
                  <p className="font-semibold text-t2 mb-0.5">{c.label}</p>
                  <p className="text-t4">{c.keys}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── PREVIEW (dados do arquivo) ── */}
      {step === 'preview' && (
        <div className="flex flex-col gap-5">
          {/* Header do arquivo */}
          <div className="flex items-center gap-3 p-4 bg-s3/50 border border-blue-500/20 rounded-xl">
            <div className="w-9 h-9 rounded-xl bg-s3/70 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
              <FileSpreadsheet size={18} className="text-t2" />
            </div>
            <div>
              <p className="text-sm font-semibold text-t1">{fileName}</p>
              <p className="text-xs text-t4">{parsed.length.toLocaleString('pt-BR')} leads válidos encontrados</p>
            </div>
          </div>

          {/* Contadores */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Leads válidos',     value: parsed.length,      color: 'text-blue-400',   icon: <Users size={14} /> },
              { label: 'Duplicatas',        value: dupFile,            color: 'text-amber-400',  icon: <RefreshCw size={14} /> },
              { label: 'Números inválidos', value: invalidPh,          color: 'text-red-400',    icon: <XCircle size={14} /> },
              { label: 'Avisos de parse',   value: parseErrors.length, color: 'text-t3',  icon: <AlertTriangle size={14} /> },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-3 p-3 bg-s2/50 border border-line rounded-xl">
                <span className={s.color}>{s.icon}</span>
                <div>
                  <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value.toLocaleString('pt-BR')}</p>
                  <p className="text-[11px] text-t4">{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Amostra */}
          <div>
            <p className="text-xs font-semibold text-t3 mb-2">Prévia dos primeiros registros</p>
            <div className="border border-line rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-s2/70">
                    <th className="text-left px-3 py-2 text-t4 font-semibold">Nome</th>
                    <th className="text-left px-3 py-2 text-t4 font-semibold">Telefone</th>
                    <th className="text-left px-3 py-2 text-t4 font-semibold">E-mail</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.slice(0, 5).map((l, i) => (
                    <tr key={i} className="border-t border-line/50">
                      <td className="px-3 py-2 text-t2">{l.name}</td>
                      <td className="px-3 py-2 text-t3 font-mono">{formatPhone(l.phone)}</td>
                      <td className="px-3 py-2 text-t4">{l.email ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.length > 5 && (
                <p className="text-center text-[11px] text-t4 py-2 border-t border-line/50">
                  + {(parsed.length - 5).toLocaleString('pt-BR')} registros
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={reset}>Cancelar</Button>
            <Button className="flex-1 gap-2" onClick={startAnalysis} disabled={parsed.length === 0}>
              <Sparkles size={14} /> Analisar {parsed.length.toLocaleString('pt-BR')} leads
            </Button>
          </div>
        </div>
      )}

      {/* ── ANALYZING ── */}
      {step === 'analyzing' && (
        <div className="flex flex-col items-center gap-6 py-10">
          {/* Anel animado */}
          <div className="relative w-20 h-20">
            <div className="w-20 h-20 rounded-full border-4 border-s3/50" />
            <div className="absolute inset-0 w-20 h-20 rounded-full border-4 border-transparent border-t-brand animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Sparkles size={22} className="text-brand animate-pulse" />
            </div>
          </div>

          <div className="text-center">
            <p className="text-sm font-semibold text-t1 mb-1">Cruzando com a base…</p>
            <p className="text-xs text-t4">Verificando listas, campanhas, funil e vendas</p>
          </div>

          <div className="w-full max-w-xs">
            <div className="h-1.5 bg-s3/50 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand to-indigo-400 transition-all duration-500"
                style={{ width: `${analyzeProgress}%` }}
              />
            </div>
            <p className="text-center text-xs text-t4 mt-2">{analyzeProgress}%</p>
          </div>
        </div>
      )}

      {/* ── REVIEW (conflitos + decisões) ── */}
      {step === 'review' && analysis && (
        <div className="flex flex-col gap-5">

          {/* Sumário */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <SummaryCard
              icon={<CheckCircle2 size={14} className="text-green-400" />}
              value={analysis.clean.length}
              label="Novos (automático)"
              color="text-green-400"
              bg="bg-green-500/8 border-green-500/20"
            />
            {analysis.alreadyInList > 0 && (
              <SummaryCard
                icon={<RefreshCw size={14} className="text-t3" />}
                value={analysis.alreadyInList}
                label="Já nesta lista"
                color="text-t3"
                bg="bg-s2/50 border-line"
              />
            )}
            {(Object.keys(CONFLICT_CONFIG) as ConflictType[]).map(type => {
              const count = conflictCounts[type]
              if (!count) return null
              const cfg   = CONFLICT_CONFIG[type]
              const Icon  = cfg.icon
              return (
                <SummaryCard key={type}
                  icon={<Icon size={14} className={cfg.color} />}
                  value={count}
                  label={cfg.filterLabel}
                  color={cfg.color}
                  bg={`${cfg.bg} ${cfg.border}`}
                />
              )
            })}
          </div>

          {/* Tabela de conflitos */}
          {analysis.conflicted.length > 0 && (
            <div className="flex flex-col gap-3">
              {/* Barra de filtros */}
              <div className="flex items-center gap-2">
                {/* Busca */}
                <div className="relative flex-1">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-t4 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Buscar por nome ou telefone…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-xs bg-s2/50 border border-line rounded-xl text-t1 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/30"
                  />
                </div>

                {/* Filtro por tipo */}
                <div className="relative">
                  <button
                    onClick={() => setFilterOpen(p => !p)}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs bg-s2/50 border border-line rounded-xl text-t3 hover:text-t1 hover:border-brand/40 transition-all"
                  >
                    <SlidersHorizontal size={12} />
                    {filterType === 'all' ? 'Todos' : CONFLICT_CONFIG[filterType].filterLabel}
                    <ChevronDown size={11} className={`transition-transform ${filterOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {filterOpen && (
                    <div className="absolute right-0 top-full mt-1.5 w-44 bg-s1 border border-line rounded-xl shadow-xl z-20 py-1 overflow-hidden">
                      {([['all', 'Todos'] as const, ...(Object.keys(CONFLICT_CONFIG) as ConflictType[]).map(k => [k, CONFLICT_CONFIG[k].filterLabel] as const)]).map(([type, label]) => (
                        <button
                          key={type}
                          onClick={() => { setFilterType(type); setFilterOpen(false) }}
                          className={`w-full text-left px-3 py-2 text-xs transition-colors ${filterType === type ? 'bg-brand/10 text-brand' : 'text-t3 hover:bg-s2/50 hover:text-t1'}`}
                        >
                          {label}
                          {type !== 'all' && conflictCounts[type as ConflictType] && (
                            <span className="ml-1.5 text-t4">({conflictCounts[type as ConflictType]})</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Ações em massa */}
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-t4">
                  {filteredConflicted.length.toLocaleString('pt-BR')} lead{filteredConflicted.length !== 1 ? 's' : ''} com histórico
                  {filterType !== 'all' && ' (filtrado)'}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAllVisible(true)}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-green-500/10 hover:bg-green-500/15 border border-green-500/20 text-green-400 transition-all"
                  >
                    Marcar todos
                  </button>
                  <button
                    onClick={() => setAllVisible(false)}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-s2/50 hover:bg-s3/50 border border-line text-t4 hover:text-t2 transition-all"
                  >
                    Desmarcar todos
                  </button>
                </div>
              </div>

              {/* Lista de leads */}
              <div className="flex flex-col gap-1.5 max-h-[340px] overflow-y-auto pr-0.5 -mr-1">
                {filteredConflicted.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-xs text-t4">
                    Nenhum lead encontrado com este filtro
                  </div>
                ) : (
                  filteredConflicted.map(lead => {
                    const checked = decisions.get(lead.phone) ?? lead.importDecision
                    const isClient = lead.conflicts.some(c => c.type === 'client')
                    return (
                      <ConflictRow
                        key={lead.phone}
                        lead={lead}
                        checked={checked}
                        isClient={isClient}
                        onToggle={() => toggleDecision(lead.phone)}
                      />
                    )
                  })
                )}
              </div>
            </div>
          )}

          {/* Rodapé */}
          <div className="flex items-center gap-3 pt-1 border-t border-line">
            <div className="flex-1">
              <p className="text-xs text-t4">
                <span className="font-semibold text-t1">{totalToImport.toLocaleString('pt-BR')}</span> leads serão importados
              </p>
            </div>
            <Button variant="secondary" onClick={reset} className="shrink-0">Cancelar</Button>
            <Button onClick={startImport} disabled={totalToImport === 0} className="gap-2 shrink-0">
              Importar {totalToImport.toLocaleString('pt-BR')} leads <ArrowRight size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* ── IMPORTING ── */}
      {step === 'importing' && (
        <div className="flex flex-col items-center gap-6 py-10">
          <div className="relative w-20 h-20">
            <div className="w-20 h-20 rounded-full border-4 border-s3/50" />
            <div className="absolute inset-0 w-20 h-20 rounded-full border-4 border-transparent border-t-brand animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-t1 mb-1">Importando leads…</p>
            <p className="text-xs text-t4">Criando contatos e vinculando à lista. Aguarde.</p>
          </div>
          <div className="w-full max-w-xs">
            <div className="h-1.5 bg-s3/50 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand to-indigo-400 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-center text-xs text-t4 mt-2">{progress}%</p>
          </div>
        </div>
      )}

      {/* ── DONE ── */}
      {step === 'done' && stats && (
        <div className="flex flex-col gap-5">
          {/* Header */}
          <div className="flex items-center gap-3 p-4 bg-green-500/8 border border-green-500/20 rounded-xl">
            <div className="w-10 h-10 rounded-xl bg-green-500/15 border border-green-500/20 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 size={20} className="text-green-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-t1">Importação concluída!</p>
              <p className="text-xs text-t4">
                {stats.linkedToList.toLocaleString('pt-BR')} leads adicionados a "{listName}"
              </p>
            </div>
          </div>

          {/* Estatísticas */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Novos contatos criados',    value: stats.newContacts,      color: 'text-green-400',  bg: 'bg-green-500/8 border-green-500/20'   },
              { label: 'Já existiam no sistema',    value: stats.existingContacts, color: 'text-blue-400',   bg: 'bg-s3/50 border-blue-500/20'     },
              { label: 'Adicionados à lista',       value: stats.linkedToList,     color: 'text-brand',      bg: 'bg-brand/8 border-brand/20'           },
              { label: 'Já estavam nesta lista',    value: stats.alreadyInList,    color: 'text-t3',  bg: 'bg-s2/50 border-line'                 },
              { label: 'Pulados por sua escolha',   value: stats.skippedByUser,    color: 'text-amber-400',  bg: 'bg-amber-500/8 border-amber-500/20'   },
            ].map(s => (
              <div key={s.label} className={`p-3 rounded-xl border ${s.bg}`}>
                <p className={`text-xl font-bold tabular-nums ${s.color}`}>
                  {s.value.toLocaleString('pt-BR')}
                </p>
                <p className="text-[11px] text-t4 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Erros (se houver) */}
          {stats.errors.length > 0 && (
            <div className="p-3 bg-red-500/8 border border-red-500/20 rounded-xl">
              <p className="text-xs font-semibold text-red-400 mb-1">Erros encontrados</p>
              {stats.errors.map((e, i) => (
                <p key={i} className="text-[11px] text-red-400/70">{e}</p>
              ))}
            </div>
          )}

          <Button className="w-full" onClick={handleClose}>Fechar</Button>
        </div>
      )}
    </Modal>
  )
}

// ─── Sub-componentes ───────────────────────────────────────────────────────────

function SummaryCard({
  icon, value, label, color, bg,
}: {
  icon: React.ReactNode
  value: number
  label: string
  color: string
  bg: string
}) {
  return (
    <div className={`flex items-start gap-2.5 p-3 rounded-xl border ${bg}`}>
      <div className="mt-0.5 flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className={`text-lg font-bold tabular-nums leading-none ${color}`}>
          {value.toLocaleString('pt-BR')}
        </p>
        <p className="text-[11px] text-t4 mt-0.5 leading-tight">{label}</p>
      </div>
    </div>
  )
}

function ConflictRow({
  lead, checked, isClient, onToggle,
}: {
  lead: AnalyzedLead
  checked: boolean
  isClient: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl border text-left transition-all group
        ${checked
          ? 'bg-s2/60 border-line hover:border-brand/30'
          : 'bg-s2/20 border-line/40 opacity-60 hover:opacity-80'
        }
      `}
    >
      {/* Checkbox customizado */}
      <div className={`w-4 h-4 rounded-md border flex-shrink-0 mt-0.5 flex items-center justify-center transition-all
        ${checked
          ? isClient
            ? 'bg-amber-500 border-amber-400'
            : 'bg-brand border-brand/80'
          : 'border-line bg-s3/50'
        }`}
      >
        {checked && (
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
            <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        {/* Nome + telefone */}
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xs font-semibold text-t1 group-hover:text-white transition-colors">
            {lead.name}
          </span>
          <span className="text-[11px] text-t4 font-mono">{formatPhone(lead.phone)}</span>
        </div>

        {/* Conflitos — um por linha */}
        <div className="mt-1.5 flex flex-col gap-1">
          {lead.conflicts.map((c, i) => {
            const cfg  = CONFLICT_CONFIG[c.type]
            const Icon = cfg.icon
            return (
              <div key={i} className="flex items-start gap-1.5">
                <span className={`w-1 h-1 rounded-full mt-1.5 flex-shrink-0 ${cfg.dot}`} />
                <div className="flex items-center gap-1 flex-wrap">
                  <Icon size={10} className={`${cfg.color} flex-shrink-0`} />
                  <span className={`text-[11px] font-medium ${cfg.color}`}>{c.label}</span>
                  {c.subLabel && (
                    <span className="text-[11px] text-t4">— {c.subLabel}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Badge de cliente (destaque) */}
      {isClient && (
        <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 border border-red-500/25 text-red-400 font-medium">
          Cliente
        </span>
      )}
    </button>
  )
}
