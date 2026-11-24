import { useState } from 'react'
import { Check, X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { MoneyInput } from '../../components/ui/MoneyInput'
import { LeadProfileField, LeadProfileValue } from '../../types'

/**
 * Editor de um campo do perfil.
 *
 * O formulário do Meta é o que a pessoa declarou; o que o corretor apura na
 * conversa entra aqui e passa a valer. O declarado não é apagado — continua no
 * histórico do lead, e a divergência entre os dois é informação (o Anderson
 * declarou renda de R$ 2 a 5 mil e comprou R$ 680 mil).
 *
 * As opções são as mesmas dos formulários, por dois motivos: o corretor
 * reconhece o vocabulário, e a faixa entra na régua de compatibilidade sem
 * tradução no meio.
 */

interface Opcao { label: string; value: string; min?: number; max?: number }

const OPCOES: Partial<Record<LeadProfileField, Opcao[]>> = {
  objetivo: [
    { label: 'Morar',    value: 'morar'    },
    { label: 'Investir', value: 'investir' },
  ],
  fgts: [
    { label: 'Sim', value: 'sim' },
    { label: 'Não', value: 'nao' },
  ],
  prazo: [
    { label: 'Nos próximos 30 dias',   value: 'imediato'    },
    { label: 'Em 1 a 3 meses',         value: 'curto'       },
    { label: 'Em 3 a 6 meses',         value: 'medio'       },
    { label: 'Só conhecendo opções',   value: 'pesquisando' },
  ],
  tipologia: [
    { label: '1 dorm',  value: '1' },
    { label: '2 dorms', value: '2' },
    { label: '3 dorms', value: '3' },
    { label: '4 dorms', value: '4' },
  ],
}

const RANK: Record<string, number> = { imediato: 4, curto: 3, medio: 2, pesquisando: 1 }

export function LeadProfileEditor({
  leadId, field, atual, onSaved, onCancel,
}: {
  leadId: string
  field: LeadProfileField
  atual?: LeadProfileValue
  onSaved: () => void
  onCancel: () => void
}) {
  const ehFaixa = field === 'renda' || field === 'entrada'
  const ehIdade = field === 'idade'
  const [idade, setIdade] = useState(atual?.value && /^\d+$/.test(atual.value) ? atual.value : '')
  const [min, setMin] = useState<number | undefined>(atual?.min)
  const [max, setMax] = useState<number | undefined>(atual?.max)
  const [escolha, setEscolha] = useState<string | undefined>(atual?.value)
  const [salvando, setSalvando] = useState(false)

  async function salvar(valor: Record<string, unknown> | null) {
    setSalvando(true)
    try {
      const { error } = await supabase.rpc('set_lead_profile_field', {
        p_lead_id: leadId, p_field: field, p_value: valor,
      })
      if (error) throw error
      toast.success(valor ? 'Perfil atualizado' : 'Voltou a valer o declarado')
      onSaved()
    } catch (err) {
      console.error('[perfil] salvar:', err)
      toast.error('Não foi possível salvar. Verifique sua conexão e tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  function confirmar() {
    if (ehIdade) {
      const n = parseInt(idade, 10)
      if (!(n >= 18 && n <= 100)) { toast.error('Informe a idade entre 18 e 100 anos'); return }
      salvar({ value: String(n), label: `${n} anos` })
      return
    }
    if (ehFaixa) {
      if (min == null && max == null) { toast.error('Informe ao menos um valor'); return }
      if (min != null && max != null && max < min) { toast.error('O valor máximo precisa ser maior'); return }
      const rotulo = min != null && max != null
        ? `R$ ${min.toLocaleString('pt-BR')} – R$ ${max.toLocaleString('pt-BR')}`
        : min != null
          ? `R$ ${min.toLocaleString('pt-BR')} ou mais`
          : `até R$ ${max!.toLocaleString('pt-BR')}`
      salvar({ min: min ?? 0, max: max ?? null, label: rotulo, value: rotulo.toLowerCase() })
      return
    }
    if (!escolha) { toast.error('Escolha uma opção'); return }
    const op = OPCOES[field]!.find(o => o.value === escolha)!
    salvar({
      value: escolha, label: op.label,
      ...(field === 'prazo' ? { rank: RANK[escolha] } : {}),
    })
  }

  return (
    <div className="rounded-[14px] border border-brand/30 bg-brand-tint/30 p-3 space-y-2.5">
      {ehIdade ? (
        <>
          <label className="flex flex-col gap-1.5 max-w-[200px]">
            <span className="rotulo-campo">Idade do comprador mais velho</span>
            <input inputMode="numeric" value={idade}
                   onChange={e => setIdade(e.target.value.replace(/\D/g, '').slice(0, 3))}
                   onKeyDown={e => { if (e.key === 'Enter') confirmar() }}
                   placeholder="42" className="campo h-10 px-3 tabular-nums" />
          </label>
          <p className="text-[11px] text-t4">A idade sobe sozinha com o tempo. Ela define o prazo máximo do financiamento.</p>
        </>
      ) : ehFaixa ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <MoneyInput label="De" value={min} onChange={setMin} placeholder="8.000" />
            <MoneyInput label="Até" value={max} onChange={setMax} placeholder="15.000" />
          </div>
          <p className="text-[11px] text-t4">
            Deixe “Até” em branco para “ou mais”. Faixa fechada ajuda a régua a decidir.
          </p>
        </>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {OPCOES[field]!.map(o => (
            <button
              key={o.value}
              onClick={() => setEscolha(o.value)}
              aria-pressed={escolha === o.value}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all duration-150 cursor-pointer
                ${escolha === o.value
                  ? 'bg-brand-tint text-brand-text border-brand/40'
                  : 'bg-surface text-t3 border-line hover:border-line-strong'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={confirmar}
          disabled={salvando}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-brand-fill hover:bg-brand-fill-hover
                     font-heading text-xs font-bold rounded-[10px] transition-all duration-150 disabled:opacity-50"
          style={{ color: 'var(--brand-fill-text)' }}
        >
          {salvando ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          Salvar
        </button>
        {atual?.source === 'corretor' && (
          <button
            onClick={() => salvar(null)}
            disabled={salvando}
            className="px-2.5 py-1.5 text-xs text-t3 hover:text-t1 rounded-[10px] hover:bg-s2 transition-colors"
            title="Descartar o valor apurado e voltar ao que a pessoa declarou no formulário"
          >
            Usar o declarado
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
