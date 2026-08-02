import { useState } from 'react'
import { Check, X, Loader2, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useDevelopmentsStore } from '../../store/useDevelopmentsStore'

/**
 * Região e tipologia procuradas — as duas preferências que TODO lead tem,
 * venham do formulário ou não.
 *
 * Nenhum formulário pergunta região, e o Porto Velas nem pergunta tipologia.
 * Sem um lugar para o corretor anotar o que ouviu, esse dado morre no WhatsApp
 * e o cruzamento com lançamentos fica cego justo onde mais valeria.
 *
 * Múltiplas de propósito: "Fazenda ou Praia Brava", "2 ou 3 dorms" é a regra,
 * não a exceção. São preferências, nunca travas — ordenam a sugestão, não
 * reprovam ninguém.
 */

const TIPOLOGIAS = [
  { value: '1', label: '1 dorm'  },
  { value: '2', label: '2 dorms' },
  { value: '3', label: '3 dorms' },
  { value: '4', label: '4+ dorms' },
]

export function LeadPreferencesEditor({
  leadId, field, atuais, onSaved, onCancel,
}: {
  leadId: string
  field: 'regioes' | 'tipologias'
  atuais?: string[]
  onSaved: () => void
  onCancel: () => void
}) {
  const [sel, setSel] = useState<string[]>(atuais ?? [])
  const [novo, setNovo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const developments = useDevelopmentsStore(s => s.developments)

  // Sugere as regiões dos lançamentos ativos: é onde o cruzamento vai acontecer,
  // e digitar igual ao cadastro evita "Fazenda" x "fazenda " virarem duas.
  const sugestoes = field === 'regioes'
    ? [...new Set(developments.filter(d => d.active && d.region).map(d => d.region!))]
        .filter(r => !sel.some(s => s.toLowerCase() === r.toLowerCase()))
    : []

  function alternar(v: string) {
    setSel(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v])
  }

  function adicionar(valor?: string) {
    const v = (valor ?? novo).trim()
    if (!v) return
    if (sel.some(s => s.toLowerCase() === v.toLowerCase())) { setNovo(''); return }
    setSel(p => [...p, v])
    setNovo('')
  }

  async function salvar(limpar = false) {
    setSalvando(true)
    try {
      const valor = limpar || sel.length === 0 ? null : {
        values: sel,
        labels: field === 'tipologias'
          ? sel.map(v => TIPOLOGIAS.find(t => t.value === v)?.label ?? v)
          : sel,
      }
      const { error } = await supabase.rpc('set_lead_profile_field', {
        p_lead_id: leadId, p_field: field, p_value: valor,
      })
      if (error) throw error
      toast.success(valor ? 'Preferências salvas' : 'Preferências removidas')
      onSaved()
    } catch (err) {
      console.error('[preferencias] salvar:', err)
      toast.error('Não foi possível salvar. Verifique sua conexão e tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="rounded-[14px] border border-brand/30 bg-brand-tint/30 p-3 space-y-2.5">
      {field === 'tipologias' ? (
        <div className="flex flex-wrap gap-1.5">
          {TIPOLOGIAS.map(t => (
            <button
              key={t.value}
              onClick={() => alternar(t.value)}
              aria-pressed={sel.includes(t.value)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all duration-150 cursor-pointer
                ${sel.includes(t.value)
                  ? 'bg-brand-tint text-brand-text border-brand/40'
                  : 'bg-surface text-t3 border-line hover:border-line-strong'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : (
        <>
          {sel.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {sel.map(r => (
                <span
                  key={r}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs
                             bg-brand-tint text-brand-text border border-brand/40"
                >
                  {r}
                  <button
                    onClick={() => setSel(p => p.filter(x => x !== r))}
                    aria-label={`Remover ${r}`}
                    className="hover:text-error transition-colors"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-1.5">
            <input
              value={novo}
              onChange={e => setNovo(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionar() } }}
              placeholder="Bairro ou região…"
              aria-label="Adicionar região"
              className="flex-1 bg-surface border border-line-input rounded-lg px-2.5 py-1.5 text-xs text-t1
                         placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand"
            />
            <button
              onClick={() => adicionar()}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-line
                         text-t3 hover:text-brand-text hover:border-brand/40 transition-colors"
              aria-label="Adicionar"
            >
              <Plus size={13} />
            </button>
          </div>
          {sugestoes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-[11px] text-t4 mr-0.5">Nos lançamentos:</span>
              {sugestoes.map(r => (
                <button
                  key={r}
                  onClick={() => adicionar(r)}
                  className="text-[11px] px-1.5 py-0.5 rounded-full border border-dashed border-line
                             text-t3 hover:text-brand-text hover:border-brand/40 transition-colors"
                >
                  + {r}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={() => salvar()}
          disabled={salvando}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-brand hover:bg-brand-dark
                     font-heading text-xs font-bold rounded-[10px] transition-all duration-150 disabled:opacity-50"
          style={{ color: 'var(--brand-btn-text)' }}
        >
          {salvando ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          Salvar
        </button>
        {(atuais?.length ?? 0) > 0 && (
          <button
            onClick={() => salvar(true)}
            disabled={salvando}
            className="px-2.5 py-1.5 text-xs text-t3 hover:text-error rounded-[10px] hover:bg-s2 transition-colors"
          >
            Limpar
          </button>
        )}
        <button
          onClick={onCancel}
          disabled={salvando}
          className="w-8 h-8 flex items-center justify-center text-t4 hover:text-t2 rounded-[10px] hover:bg-s2 transition-colors"
          aria-label="Cancelar"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  )
}
