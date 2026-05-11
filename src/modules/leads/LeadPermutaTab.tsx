import { useState } from 'react'
import { ArrowLeftRight, Car, Home, Save, Trash2, CheckCircle2 } from 'lucide-react'
import { Contact } from '../../types'
import { useContactsStore } from '../../store/useContactsStore'
import { formatCurrencyFull } from '../../lib/formatters'

interface LeadPermutaTabProps {
  contact: Contact | undefined
}

const REGIONS = [
  'Balneário Camboriú', 'Camboriú', 'Itajaí', 'Navegantes',
  'Itapema', 'Porto Belo', 'Florianópolis', 'Blumenau',
  'São José', 'Palhoça', 'Biguaçu',
]

function formatCurrencyInput(value: string): string {
  const num = value.replace(/\D/g, '')
  if (!num) return ''
  return Number(num).toLocaleString('pt-BR')
}

export function LeadPermutaTab({ contact }: LeadPermutaTabProps) {
  const { update: updateContact } = useContactsStore()

  const [type,            setType]            = useState<'imovel' | 'carro'>(contact?.permutaType ?? 'imovel')
  const [region,          setRegion]          = useState(contact?.permutaPropertyRegion ?? '')
  const [propertyValue,   setPropertyValue]   = useState(
    contact?.permutaPropertyValue ? String(contact.permutaPropertyValue) : ''
  )
  const [carModel,        setCarModel]        = useState(contact?.permutaCarModel ?? '')
  const [carValue,        setCarValue]        = useState(
    contact?.permutaCarValue ? String(contact.permutaCarValue) : ''
  )
  const [saved,           setSaved]           = useState(false)

  const hasData = !!contact?.permutaType

  function handleSave() {
    if (!contact) return

    const patch: Partial<Contact> = { permutaType: type }

    if (type === 'imovel') {
      patch.permutaPropertyRegion = region || undefined
      patch.permutaPropertyValue  = propertyValue ? Number(propertyValue.replace(/\D/g, '')) : undefined
      patch.permutaCarModel       = undefined
      patch.permutaCarValue       = undefined
    } else {
      patch.permutaCarModel       = carModel || undefined
      patch.permutaCarValue       = carValue ? Number(carValue.replace(/\D/g, '')) : undefined
      patch.permutaPropertyRegion = undefined
      patch.permutaPropertyValue  = undefined
    }

    updateContact(contact.id, patch)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleClear() {
    if (!contact) return
    updateContact(contact.id, {
      permutaType:            undefined,
      permutaPropertyRegion:  undefined,
      permutaPropertyValue:   undefined,
      permutaCarModel:        undefined,
      permutaCarValue:        undefined,
    })
    setType('imovel')
    setRegion('')
    setPropertyValue('')
    setCarModel('')
    setCarValue('')
  }

  const inputClass = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-500/40 transition-all'
  const labelClass = 'text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block'

  if (!contact) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center">
          <ArrowLeftRight size={20} className="text-orange-400/50" />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-400">Sem contato vinculado</p>
          <p className="text-xs text-slate-600 mt-1">O lead precisa de um contato para registrar permuta</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* Header com nome do contato */}
      <div className="flex items-center gap-2.5 px-1">
        <div className="w-7 h-7 rounded-lg bg-orange-500/15 flex items-center justify-center flex-shrink-0">
          <ArrowLeftRight size={13} className="text-orange-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-orange-300">Perfil de Permuta</p>
          <p className="text-[11px] text-slate-500 truncate">Contato: {contact.name}</p>
        </div>
        {hasData && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/25 flex-shrink-0">
            Registrado
          </span>
        )}
      </div>

      {/* Tipo de permuta */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setType('imovel')}
          className={`flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition-all ${
            type === 'imovel'
              ? 'bg-orange-500/15 border-orange-500/40 text-orange-300'
              : 'bg-white/3 border-white/8 text-slate-500 hover:text-slate-300 hover:border-white/15'
          }`}
        >
          <Home size={14} /> Imóvel
        </button>
        <button
          onClick={() => setType('carro')}
          className={`flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition-all ${
            type === 'carro'
              ? 'bg-orange-500/15 border-orange-500/40 text-orange-300'
              : 'bg-white/3 border-white/8 text-slate-500 hover:text-slate-300 hover:border-white/15'
          }`}
        >
          <Car size={14} /> Carro
        </button>
      </div>

      {/* Campos por tipo */}
      {type === 'imovel' ? (
        <div className="space-y-3">
          <div>
            <label className={labelClass}>Região do imóvel</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {REGIONS.map(r => (
                <button
                  key={r}
                  onClick={() => setRegion(region === r ? '' : r)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
                    region === r
                      ? 'bg-orange-500/20 border-orange-500/40 text-orange-300 font-medium'
                      : 'bg-white/3 border-white/8 text-slate-500 hover:text-slate-300 hover:border-white/15'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={region}
              onChange={e => setRegion(e.target.value)}
              placeholder="Ou digita outra região..."
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Valor do imóvel</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 pointer-events-none">R$</span>
              <input
                type="text"
                inputMode="numeric"
                value={formatCurrencyInput(propertyValue)}
                onChange={e => setPropertyValue(e.target.value.replace(/\D/g, ''))}
                placeholder="0"
                className={`${inputClass} pl-9`}
              />
            </div>
            {propertyValue && (
              <p className="text-xs text-orange-400 mt-1 font-medium">
                {formatCurrencyFull(Number(propertyValue))}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className={labelClass}>Modelo do carro</label>
            <input
              type="text"
              value={carModel}
              onChange={e => setCarModel(e.target.value)}
              placeholder="Ex: Honda Civic 2022..."
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Valor de entrada</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 pointer-events-none">R$</span>
              <input
                type="text"
                inputMode="numeric"
                value={formatCurrencyInput(carValue)}
                onChange={e => setCarValue(e.target.value.replace(/\D/g, ''))}
                placeholder="0"
                className={`${inputClass} pl-9`}
              />
            </div>
            {carValue && (
              <p className="text-xs text-orange-400 mt-1 font-medium">
                {formatCurrencyFull(Number(carValue))}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Ações */}
      <div className="flex gap-2 pt-1">
        {hasData && (
          <button
            onClick={handleClear}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs text-red-400 hover:text-red-300 bg-red-500/8 hover:bg-red-500/15 border border-red-500/20 rounded-xl transition-all"
          >
            <Trash2 size={12} /> Limpar
          </button>
        )}
        <button
          onClick={handleSave}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            saved
              ? 'bg-green-500/20 border border-green-500/30 text-green-300'
              : 'bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/30 hover:border-orange-500/50 text-orange-200'
          }`}
        >
          {saved ? (
            <><CheckCircle2 size={14} /> Salvo no contato!</>
          ) : (
            <><Save size={14} /> Salvar no contato</>
          )}
        </button>
      </div>

      {/* Info */}
      <p className="text-[10px] text-slate-600 text-center">
        Salvo diretamente em {contact.name} — disponível em todo o CRM
      </p>
    </div>
  )
}
