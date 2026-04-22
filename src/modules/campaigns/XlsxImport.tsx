import { useRef, useState } from 'react'
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { parseXlsx, ParsedLead } from '../../lib/xlsxParser'
import { useCampaignLeadsStore } from '../../store/useCampaignLeadsStore'
import { formatPhone } from '../../lib/formatters'
import toast from 'react-hot-toast'

interface XlsxImportProps {
  campaignId: string
  onDone:     () => void
}

export function XlsxImport({ campaignId, onDone }: XlsxImportProps) {
  const { addBulk } = useCampaignLeadsStore()
  const inputRef = useRef<HTMLInputElement>(null)

  const [preview,    setPreview]    = useState<ParsedLead[]>([])
  const [errors,     setErrors]     = useState<string[]>([])
  const [duplicates, setDuplicates] = useState(0)
  const [filename,   setFilename]   = useState('')
  const [loading,    setLoading]    = useState(false)
  const [imported,   setImported]   = useState(false)

  async function handleFile(file: File) {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast.error('Apenas arquivos .xlsx ou .xls são suportados')
      return
    }
    setLoading(true)
    setFilename(file.name)
    const result = await parseXlsx(file)
    setPreview(result.leads)
    setErrors(result.errors)
    setDuplicates(result.duplicatePhones)
    setLoading(false)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  function handleImport() {
    if (!preview.length) return
    const result = addBulk(preview.map(l => ({ ...l, campaignId })))
    setImported(true)
    toast.success(`${result.added} lead${result.added !== 1 ? 's' : ''} importado${result.added !== 1 ? 's' : ''}!${result.skipped ? ` (${result.skipped} duplicado${result.skipped !== 1 ? 's' : ''} ignorado${result.skipped !== 1 ? 's' : ''})` : ''}`)
    onDone()
  }

  function reset() {
    setPreview([])
    setErrors([])
    setDuplicates(0)
    setFilename('')
    setImported(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  if (imported) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <CheckCircle2 size={40} className="text-green-400" />
        <p className="text-sm font-medium text-slate-200">Importação concluída!</p>
        <Button variant="secondary" onClick={reset}>Importar outro arquivo</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Drop zone */}
      {!preview.length && (
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-white/10 hover:border-indigo-500/40 rounded-2xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors group"
        >
          <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center group-hover:bg-indigo-500/20 transition-colors">
            <Upload size={22} className="text-indigo-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-300">Arraste seu arquivo ou clique para selecionar</p>
            <p className="text-xs text-slate-600 mt-1">Suporta .xlsx e .xls · Colunas: Nome, Telefone, E-mail (opcional)</p>
          </div>
          {loading && <p className="text-xs text-indigo-400 animate-pulse">Processando...</p>}
        </div>
      )}

      <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleInputChange} />

      {/* Preview */}
      {preview.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet size={16} className="text-green-400" />
              <span className="text-sm font-medium text-slate-200">{filename}</span>
            </div>
            <button onClick={reset} className="text-slate-600 hover:text-slate-300 transition-colors cursor-pointer">
              <X size={15} />
            </button>
          </div>

          {/* Stats */}
          <div className="flex gap-3">
            <div className="flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-1.5">
              <CheckCircle2 size={12} /> {preview.length} lead{preview.length !== 1 ? 's' : ''} encontrado{preview.length !== 1 ? 's' : ''}
            </div>
            {duplicates > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-1.5">
                <AlertTriangle size={12} /> {duplicates} duplicado{duplicates !== 1 ? 's' : ''} ignorado{duplicates !== 1 ? 's' : ''}
              </div>
            )}
            {errors.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5">
                <AlertTriangle size={12} /> {errors.length} erro{errors.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>

          {/* Table preview */}
          <div className="bg-white/3 rounded-xl border border-white/8 overflow-hidden">
            <div className="grid grid-cols-3 gap-0 px-4 py-2 border-b border-white/8 text-xs text-slate-600 uppercase tracking-wider font-medium">
              <span>Nome</span><span>Telefone</span><span>E-mail</span>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {preview.slice(0, 50).map((l, i) => (
                <div key={i} className="grid grid-cols-3 gap-0 px-4 py-2.5 border-b border-white/5 text-sm last:border-0">
                  <span className="text-slate-200 truncate">{l.name}</span>
                  <span className="text-slate-400 truncate tabular-nums">{formatPhone(l.phone)}</span>
                  <span className="text-slate-500 truncate">{l.email ?? '—'}</span>
                </div>
              ))}
              {preview.length > 50 && (
                <div className="px-4 py-2 text-xs text-slate-600 text-center">+ {preview.length - 50} mais leads</div>
              )}
            </div>
          </div>

          {errors.length > 0 && (
            <div className="text-xs text-red-400/70 space-y-0.5">
              {errors.slice(0, 3).map((e, i) => <p key={i}>{e}</p>)}
              {errors.length > 3 && <p>... e mais {errors.length - 3} erros</p>}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={reset}>Cancelar</Button>
            <Button onClick={handleImport} className="flex-1">
              Importar {preview.length} lead{preview.length !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
