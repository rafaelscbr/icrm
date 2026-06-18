import { useEffect, useRef, useState } from 'react'
import { Lead, Property, PropertyType } from '../../types'
import { useLeadsStore } from '../../store/useLeadsStore'
import { formatCurrencyFull } from '../../lib/formatters'

const TYPE_OPTIONS: { value: PropertyType; label: string }[] = [
  { value: 'apartment',          label: 'Apartamento'        },
  { value: 'apartment_duplex',   label: 'Apartamento Duplex' },
  { value: 'penthouse_duplex',   label: 'Cobertura Duplex'   },
  { value: 'house',              label: 'Casa'               },
  { value: 'commercial',         label: 'Comercial'          },
  { value: 'land',               label: 'Terreno'            },
]

const TYPE_LABELS: Record<string, string> = {
  apartment:          'Apartamento',
  apartment_duplex:   'Apartamento Duplex',
  penthouse_duplex:   'Cobertura Duplex',
  house:              'Casa',
  commercial:         'Comercial',
  land:               'Terreno',
}

interface LeadRadarTabProps {
  lead: Lead
  properties: Property[]
}

function hasAnyRadarField(lead: Lead): boolean {
  return !!(
    lead.radarPropertyType ||
    lead.radarRegion ||
    lead.radarValueMin !== undefined ||
    lead.radarValueMax !== undefined ||
    lead.radarAreaMin !== undefined ||
    lead.radarBedrooms !== undefined
  )
}

function scoreProperty(p: Property, lead: Lead): number {
  let score = 0
  if (lead.radarPropertyType && p.type === lead.radarPropertyType) score++
  if (lead.radarRegion && p.neighborhood.toLowerCase().includes(lead.radarRegion.toLowerCase())) score++
  if (lead.radarValueMin !== undefined && p.value >= lead.radarValueMin) score++
  if (lead.radarValueMax !== undefined && p.value <= lead.radarValueMax) score++
  if (lead.radarAreaMin !== undefined && p.areaSqm !== undefined && p.areaSqm >= lead.radarAreaMin) score++
  if (lead.radarBedrooms !== undefined && p.bedrooms !== undefined && p.bedrooms >= lead.radarBedrooms) score++
  return score
}

export function LeadRadarTab({ lead, properties }: LeadRadarTabProps) {
  const { update } = useLeadsStore()

  const [radarPropertyType, setRadarPropertyType] = useState(lead.radarPropertyType ?? '')
  const [radarRegion, setRadarRegion] = useState(lead.radarRegion ?? '')
  function fmtBRL(n: number) { return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) }
  function parseBRL(s: string) { return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0 }

  const [radarValueMin, setRadarValueMin] = useState(lead.radarValueMin !== undefined ? fmtBRL(lead.radarValueMin) : '')
  const [radarValueMax, setRadarValueMax] = useState(lead.radarValueMax !== undefined ? fmtBRL(lead.radarValueMax) : '')
  const [radarAreaMin, setRadarAreaMin] = useState(lead.radarAreaMin !== undefined ? String(lead.radarAreaMin) : '')
  const [radarBedrooms, setRadarBedrooms] = useState(lead.radarBedrooms !== undefined ? String(lead.radarBedrooms) : '')

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-fill from linked property if radar is all empty
  useEffect(() => {
    if (hasAnyRadarField(lead)) return
    if (!lead.propertyId) return
    const linked = properties.find(p => p.id === lead.propertyId)
    if (!linked) return

    const autofill: Partial<Lead> = {
      radarPropertyType: linked.type,
      radarRegion: linked.neighborhood,
      radarValueMin: Math.round(linked.value * 0.8),
      radarValueMax: Math.round(linked.value * 1.2),
      radarAreaMin: linked.areaSqm,
      radarBedrooms: linked.bedrooms,
    }
    update(lead.id, autofill).catch(() => { /* erro já toastado */ })
    setRadarPropertyType(linked.type)
    setRadarRegion(linked.neighborhood)
    setRadarValueMin(fmtBRL(Math.round(linked.value * 0.8)))
    setRadarValueMax(fmtBRL(Math.round(linked.value * 1.2)))
    setRadarAreaMin(linked.areaSqm !== undefined ? String(linked.areaSqm) : '')
    setRadarBedrooms(linked.bedrooms !== undefined ? String(linked.bedrooms) : '')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function scheduleUpdate(patch: Partial<Lead>) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      update(lead.id, patch).catch(() => { /* erro já toastado */ })
    }, 800)
  }

  function handleType(val: string) {
    setRadarPropertyType(val)
    scheduleUpdate({ radarPropertyType: val || undefined })
  }

  function handleRegion(val: string) {
    setRadarRegion(val)
    scheduleUpdate({ radarRegion: val || undefined })
  }

  function handleValueMin(val: string) {
    setRadarValueMin(val.replace(/[^\d.,]/g, ''))
  }
  function blurValueMin() {
    const n = parseBRL(radarValueMin)
    const formatted = n > 0 ? fmtBRL(n) : ''
    setRadarValueMin(formatted)
    scheduleUpdate({ radarValueMin: n > 0 ? n : undefined })
  }

  function handleValueMax(val: string) {
    setRadarValueMax(val.replace(/[^\d.,]/g, ''))
  }
  function blurValueMax() {
    const n = parseBRL(radarValueMax)
    const formatted = n > 0 ? fmtBRL(n) : ''
    setRadarValueMax(formatted)
    scheduleUpdate({ radarValueMax: n > 0 ? n : undefined })
  }

  function handleAreaMin(val: string) {
    setRadarAreaMin(val)
    scheduleUpdate({ radarAreaMin: val ? Number(val) : undefined })
  }

  function handleBedrooms(val: string) {
    setRadarBedrooms(val)
    scheduleUpdate({ radarBedrooms: val ? Number(val) : undefined })
  }

  const currentLead: Lead = {
    ...lead,
    radarPropertyType: radarPropertyType || undefined,
    radarRegion: radarRegion || undefined,
    radarValueMin: radarValueMin ? parseBRL(radarValueMin) || undefined : undefined,
    radarValueMax: radarValueMax ? parseBRL(radarValueMax) || undefined : undefined,
    radarAreaMin: radarAreaMin ? Number(radarAreaMin) : undefined,
    radarBedrooms: radarBedrooms ? Number(radarBedrooms) : undefined,
  }

  const hasCriteria = hasAnyRadarField(currentLead)

  const scored = hasCriteria
    ? properties
        .filter(p => {
          if (currentLead.radarValueMin !== undefined && p.value < currentLead.radarValueMin) return false
          if (currentLead.radarValueMax !== undefined && p.value > currentLead.radarValueMax) return false
          return true
        })
        .map(p => ({ p, score: scoreProperty(p, currentLead) }))
        .filter(({ score }) => score >= 1)
        .sort((a, b) => b.score - a.score || a.p.value - b.p.value)
        .slice(0, 8)
    : []

  const inputClass = 'w-full bg-s3/50 border border-line rounded-xl px-3 py-2 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/25'
  const labelClass = 'text-xs font-medium text-t3 uppercase tracking-wider'

  return (
    <div className="space-y-4">
      {/* Perfil form */}
      <div className="bg-s2/50 border border-line rounded-xl p-3 space-y-3">
        <p className="text-xs font-semibold text-t3 uppercase tracking-wider">Perfil de Busca</p>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Tipo</label>
            <select
              value={radarPropertyType}
              onChange={e => handleType(e.target.value)}
              className={inputClass}
            >
              <option value="">Qualquer</option>
              {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Região</label>
            <input
              type="text"
              value={radarRegion}
              onChange={e => handleRegion(e.target.value)}
              placeholder="Bairro..."
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Valor mín (R$)</label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-t4 pointer-events-none">R$</span>
              <input
                type="text"
                inputMode="numeric"
                value={radarValueMin}
                onChange={e => handleValueMin(e.target.value)}
                onBlur={blurValueMin}
                placeholder="500.000"
                className={`${inputClass} pl-8`}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Valor máx (R$)</label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-t4 pointer-events-none">R$</span>
              <input
                type="text"
                inputMode="numeric"
                value={radarValueMax}
                onChange={e => handleValueMax(e.target.value)}
                onBlur={blurValueMax}
                placeholder="1.500.000"
                className={`${inputClass} pl-8`}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Área mín (m²)</label>
            <input
              type="number"
              inputMode="numeric"
              value={radarAreaMin}
              onChange={e => handleAreaMin(e.target.value)}
              placeholder="60"
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Quartos</label>
            <select
              value={radarBedrooms}
              onChange={e => handleBedrooms(e.target.value)}
              className={inputClass}
            >
              <option value="">Qualquer</option>
              {[1, 2, 3, 4, 5].map(n => (
                <option key={n} value={n}>{n === 5 ? '5+' : n}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Results */}
      <div>
        <p className="text-xs font-semibold text-t3 uppercase tracking-wider mb-2">Imóveis compatíveis</p>

        {!hasCriteria ? (
          <div className="bg-s2/50 border border-line rounded-xl p-4 text-center">
            <p className="text-sm text-t3">Preencha o perfil acima para ver sugestões</p>
          </div>
        ) : scored.length === 0 ? (
          <div className="bg-s2/50 border border-line rounded-xl p-4 text-center">
            <p className="text-sm text-t3">Nenhum imóvel compatível na base</p>
          </div>
        ) : (
          <div className="space-y-2">
            {scored.map(({ p, score }) => (
              <div key={p.id} className="bg-s2/50 border border-line rounded-xl p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-t1 truncate">{p.name}</p>
                  <p className="text-xs text-t3 truncate">{p.neighborhood} · {TYPE_LABELS[p.type] ?? p.type}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-sm font-semibold text-violet-400">{formatCurrencyFull(p.value)}</span>
                  <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${
                    score >= 5 ? 'bg-green-500/20 text-green-300' :
                    score >= 3 ? 'bg-blue-500/20 text-blue-300' :
                    'bg-s3/70 text-t3'
                  }`}>
                    {score}/6 critérios
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
