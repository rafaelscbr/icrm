import { useState, useRef, useCallback } from 'react'
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertCircle, XCircle,
  Users, RefreshCw, ArrowRight,
} from 'lucide-react'
import { Modal }  from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { parseXlsx, ParsedLead } from '../../lib/xlsxParser'
import { normalizePhone } from '../../lib/formatters'
import { supabase } from '../../lib/supabase'
import { db } from '../../lib/db'
import { useLeadListsStore } from '../../store/useLeadListsStore'
import { Contact } from '../../types'
import toast from 'react-hot-toast'

interface Props {
  listId:    string
  listName:  string
  isOpen:    boolean
  onClose:   () => void
  onSuccess: (count: number) => void
}

type Step = 'upload' | 'preview' | 'importing' | 'done'

interface ImportStats {
  newContacts:      number
  existingContacts: number
  linkedToList:     number
  duplicatesInFile: number
  invalidPhones:    number
  alreadyInList:    number
  errors:           string[]
}

export function ImportLeadsModal({ listId, listName, isOpen, onClose, onSuccess }: Props) {
  const { updateCount, lists } = useLeadListsStore()
  const [step,       setStep]       = useState<Step>('upload')
  const [dragging,   setDragging]   = useState(false)
  const [fileName,   setFileName]   = useState('')
  const [parsed,     setParsed]     = useState<ParsedLead[]>([])
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [duplicatesInFile, setDuplicatesInFile] = useState(0)
  const [invalidPhones,    setInvalidPhones]    = useState(0)
  const [stats,      setStats]      = useState<ImportStats | null>(null)
  const [progress,   setProgress]   = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  function reset() {
    setStep('upload'); setFileName(''); setParsed([]); setParseErrors([])
    setDuplicatesInFile(0); setInvalidPhones(0); setStats(null); setProgress(0)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function processFile(file: File) {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast.error('Use arquivos .xlsx, .xls ou .csv')
      return
    }
    setFileName(file.name)
    const result = await parseXlsx(file)
    setParsed(result.leads)
    setParseErrors(result.errors.slice(0, 20)) // mostra só os primeiros 20
    setDuplicatesInFile(result.duplicatePhones)
    setInvalidPhones(result.invalidPhones)
    setStep('preview')
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [])

  async function startImport() {
    setStep('importing')
    setProgress(0)

    const s: ImportStats = {
      newContacts: 0, existingContacts: 0, linkedToList: 0,
      duplicatesInFile, invalidPhones, alreadyInList: 0, errors: [],
    }

    try {
      // 1. Buscar todos os phones normalizados já existentes em contacts
      const CHUNK = 500
      const total = parsed.length
      let newContacts: { id: string; phone: string }[] = []

      // Busca phones existentes em lote
      const allPhones = parsed.map(l => l.phone)
      const existingMap = new Map<string, string>() // phone → contact_id

      for (let i = 0; i < allPhones.length; i += CHUNK) {
        const chunk = allPhones.slice(i, i + CHUNK)
        const { data } = await supabase
          .from('contacts')
          .select('id, phone')
          .in('phone', chunk)
        if (data) {
          (data as { id: string; phone: string }[]).forEach(c => {
            const norm = normalizePhone(c.phone)
            if (norm) existingMap.set(norm, c.id)
          })
        }
      }

      // 2. Criar novos contatos em batch (os que não existem)
      const toCreate = parsed.filter(l => !existingMap.has(l.phone))
      const now = new Date().toISOString()
      const currentUserId = (await supabase.auth.getUser()).data.user?.id ?? null
      const listProfile   = lists.find(ll => ll.id === listId)?.productProfile ?? null

      for (let i = 0; i < toCreate.length; i += CHUNK) {
        const chunk = toCreate.slice(i, i + CHUNK)
        const rows = chunk.map(l => ({
          name: l.name, phone: l.phone,
          tags: [], has_children: false, is_married: false,
          permuta_items: null,
          permuta_type: null, permuta_property_region: null,
          permuta_property_value: null, permuta_car_model: null, permuta_car_value: null,
          is_base_lead: true,
          base_lead_profile: listProfile,
          broker_id: currentUserId,
          created_at: now, updated_at: now,
        }))

        const { data, error } = await supabase
          .from('contacts')
          .insert(rows)
          .select('id, phone')

        if (error) {
          s.errors.push(`Erro ao inserir contatos: ${error.message}`)
        } else if (data) {
          (data as { id: string; phone: string }[]).forEach(c => {
            const norm = normalizePhone(c.phone)
            if (norm) existingMap.set(norm, c.id)
            newContacts.push(c)
          })
          s.newContacts += data.length
        }
        setProgress(Math.round(((i + CHUNK) / total) * 60))
      }

      s.existingContacts = total - toCreate.length

      // 3. Buscar quais contacts já estão nesta lista
      const allContactIds = Array.from(existingMap.values())
      const alreadyInList = await db.leadListMembers.checkExisting(allContactIds, listId)
      const alreadySet = new Set(alreadyInList)
      s.alreadyInList = alreadySet.size

      // 4. Criar vínculos na lista (só os que ainda não estão)
      const membersToAdd = parsed
        .map(l => ({ phone: l.phone, rawPhone: l.rawPhone }))
        .filter(l => existingMap.has(l.phone))
        .filter(l => !alreadySet.has(existingMap.get(l.phone)!))
        .map(l => ({
          listId,
          contactId:   existingMap.get(l.phone)!,
          importBatch: fileName,
          rawPhone:    l.rawPhone,
        }))

      await db.leadListMembers.insertMany(membersToAdd)
      s.linkedToList = membersToAdd.length

      setProgress(90)

      // 5. Atualizar total_count da lista
      const currentList = lists.find(l => l.id === listId)
      const newTotal = (currentList?.totalCount ?? 0) + s.linkedToList
      await updateCount(listId, newTotal)

      setProgress(100)
      setStats(s)
      setStep('done')
      onSuccess(s.linkedToList)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      s.errors.push(msg)
      setStats(s)
      setStep('done')
    }
  }

  const dropZoneCls = `border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer ${
    dragging ? 'border-brand bg-brand/5' : 'border-line hover:border-brand/50 hover:bg-s2/30'
  }`

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Importar Leads"
      subtitle={`Lista: ${listName}`}
      size="lg"
    >
      {/* ── Step: upload ── */}
      {step === 'upload' && (
        <div className="flex flex-col gap-5">
          <div
            className={dropZoneCls}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={32} className="mx-auto mb-3 text-slate-500" />
            <p className="text-sm font-semibold text-t1 mb-1">Arraste ou clique para selecionar</p>
            <p className="text-xs text-t4">.xlsx · .xls · .csv — o sistema detecta as colunas automaticamente</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f) }}
          />
          <div className="bg-s2/50 border border-line rounded-xl p-4">
            <p className="text-xs font-semibold text-t3 mb-2">Colunas reconhecidas automaticamente</p>
            <div className="grid grid-cols-3 gap-2">
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
            <p className="text-[11px] text-t4 mt-3">
              Números com +55 ou 55 são normalizados automaticamente. Duplicatas são ignoradas.
            </p>
          </div>
        </div>
      )}

      {/* ── Step: preview ── */}
      {step === 'preview' && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3 p-4 bg-blue-500/8 border border-blue-500/20 rounded-xl">
            <FileSpreadsheet size={20} className="text-blue-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-t1">{fileName}</p>
              <p className="text-xs text-t4">{parsed.length.toLocaleString()} leads válidos encontrados</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Leads para importar', value: parsed.length, color: 'text-blue-400',   icon: <Users size={14} /> },
              { label: 'Duplicatas no arquivo', value: duplicatesInFile, color: 'text-amber-400', icon: <RefreshCw size={14} /> },
              { label: 'Números inválidos',    value: invalidPhones, color: 'text-red-400',   icon: <XCircle size={14} /> },
              { label: 'Avisos',               value: parseErrors.length, color: 'text-slate-400', icon: <AlertCircle size={14} /> },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-3 p-3 bg-s2/50 border border-line rounded-xl">
                <span className={s.color}>{s.icon}</span>
                <div>
                  <p className={`text-lg font-bold tabular-nums ${s.color}`}>{s.value.toLocaleString()}</p>
                  <p className="text-[11px] text-t4">{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          {parseErrors.length > 0 && (
            <div className="max-h-32 overflow-y-auto bg-s2/50 border border-line rounded-xl p-3">
              <p className="text-xs font-semibold text-t3 mb-2">Avisos de importação</p>
              {parseErrors.map((e, i) => (
                <p key={i} className="text-[11px] text-amber-400/80 leading-5">{e}</p>
              ))}
              {parseErrors.length === 20 && (
                <p className="text-[11px] text-t4 mt-1">…e mais avisos não exibidos</p>
              )}
            </div>
          )}

          {/* Prévia dos primeiros registros */}
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
                      <td className="px-3 py-2 text-t3 font-mono">{l.phone}</td>
                      <td className="px-3 py-2 text-t4">{l.email ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.length > 5 && (
                <p className="text-center text-[11px] text-t4 py-2 border-t border-line/50">
                  + {(parsed.length - 5).toLocaleString()} registros não exibidos
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={reset}>Cancelar</Button>
            <Button className="flex-1 gap-2" onClick={startImport} disabled={parsed.length === 0}>
              Importar {parsed.length.toLocaleString()} leads <ArrowRight size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step: importing ── */}
      {step === 'importing' && (
        <div className="flex flex-col items-center gap-6 py-8">
          <div className="w-16 h-16 rounded-full border-4 border-brand border-t-transparent animate-spin" />
          <div className="text-center">
            <p className="text-sm font-semibold text-t1 mb-1">Importando leads…</p>
            <p className="text-xs text-t4">Criando contatos e vinculando à lista. Aguarde.</p>
          </div>
          <div className="w-full max-w-sm">
            <div className="h-2 bg-s3/50 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-center text-xs text-t4 mt-2">{progress}%</p>
          </div>
        </div>
      )}

      {/* ── Step: done ── */}
      {step === 'done' && stats && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3 p-4 bg-green-500/8 border border-green-500/20 rounded-xl">
            <CheckCircle2 size={20} className="text-green-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-t1">Importação concluída!</p>
              <p className="text-xs text-t4">
                {stats.linkedToList.toLocaleString()} leads adicionados a "{listName}"
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Novos contatos criados',  value: stats.newContacts,      color: 'text-green-400'  },
              { label: 'Já existiam no sistema',  value: stats.existingContacts, color: 'text-blue-400'   },
              { label: 'Adicionados à lista',     value: stats.linkedToList,     color: 'text-brand'      },
              { label: 'Já estavam nesta lista',  value: stats.alreadyInList,    color: 'text-amber-400'  },
            ].map(s => (
              <div key={s.label} className="p-3 bg-s2/50 border border-line rounded-xl">
                <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value.toLocaleString()}</p>
                <p className="text-[11px] text-t4 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

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
