import { useMemo, useState } from 'react'
import {
  ArrowLeftRight, Home, Car, Building2, Users, Zap, ChevronRight,
  Search, ChevronDown, BedDouble, Maximize2, MapPin, Building, ShowerHead,
} from 'lucide-react'
import { useContactsStore } from '../../store/useContactsStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { formatCurrencyFull } from '../../lib/formatters'
import { Contact, PermutaItem, Property } from '../../types'

// ─── Matching logic ───────────────────────────────────────────────────────────

interface PermutaMatch {
  contact: Contact
  item: PermutaItem           // qual bem do contato foi usado no match
  property: Property
  score: number
  reasons: string[]
}

function matchItemToProperty(contact: Contact, item: PermutaItem, property: Property): PermutaMatch | null {
  if (!property.acceptsPermuta) return null

  const reasons: string[] = []
  let score = 0

  const propAccepts = property.permutaTypes ?? []

  // Type match
  if (propAccepts.includes(item.type)) {
    score += 2
    reasons.push(item.type === 'imovel' ? 'Aceita imóvel em permuta' : 'Aceita carro em permuta')
  } else if (propAccepts.length === 0) {
    score += 1
    reasons.push('Aceita permuta (tipo flexível)')
  } else {
    return null // tipo incompatível
  }

  // Region match (imovel only)
  if (item.type === 'imovel' && item.region) {
    const propRegions = property.permutaRegions ?? []
    const q = item.region.toLowerCase()
    const hit = propRegions.some(r => r.toLowerCase().includes(q) || q.includes(r.toLowerCase()))
    if (hit) {
      score += 2
      reasons.push(`Região compatível (${item.region})`)
    }
  }

  // Value match ±40%
  const offerValue = item.type === 'imovel' ? item.value : item.carValue
  if (offerValue && property.value) {
    const min = property.value * 0.6
    const max = property.value * 1.4
    if (offerValue >= min && offerValue <= max) {
      score += 2
      reasons.push(`Valor compatível (${formatCurrencyFull(offerValue)} vs ${formatCurrencyFull(property.value)})`)
    } else if (offerValue >= property.value * 0.4 && offerValue <= property.value * 2) {
      score += 1
      reasons.push(`Valor aproximado (${formatCurrencyFull(offerValue)})`)
    }
  }

  if (score === 0) return null

  return { contact, item, property, score, reasons }
}

const TYPE_LABELS: Record<string, string> = {
  apartment:        'Apartamento',
  apartment_duplex: 'Apt. Duplex',
  penthouse_duplex: 'Cobertura',
  house:            'Casa',
  commercial:       'Comercial',
  land:             'Terreno',
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 5 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
    score >= 3 ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                 'bg-s3/70 text-t3 border-line'
  const label =
    score >= 5 ? 'Ótimo match' :
    score >= 3 ? 'Bom match' : 'Match parcial'
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {label} · {score}pts
    </span>
  )
}

function PropertyDetails({ property }: { property: Property }) {
  return (
    <div className="mt-2 pt-2 border-t border-line flex flex-wrap gap-x-4 gap-y-1">
      {property.neighborhood && (
        <span className="text-xs text-t3 flex items-center gap-1">
          <MapPin size={10} className="text-t3" /> <span className="text-t2">{property.neighborhood}</span>
        </span>
      )}
      {property.city && (
        <span className="text-xs text-t3 flex items-center gap-1">
          <Building2 size={10} className="text-t3" /> <span className="text-t2">{property.city}</span>
        </span>
      )}
      {property.type && (
        <span className="text-xs text-t3 flex items-center gap-1">
          <Building size={10} className="text-t3" /> <span className="text-t2">{TYPE_LABELS[property.type] ?? property.type}</span>
        </span>
      )}
      {property.bedrooms !== undefined && (
        <span className="text-xs text-t3 flex items-center gap-1">
          <BedDouble size={10} className="text-t3" />
          <span className="text-t2">{property.bedrooms} dorm.</span>
        </span>
      )}
      {property.suites !== undefined && (
        <span className="text-xs text-t3 flex items-center gap-1">
          <ShowerHead size={10} className="text-t3" /> <span className="text-t2">{property.suites} suíte{property.suites !== 1 ? 's' : ''}</span>
        </span>
      )}
      {property.areaSqm !== undefined && (
        <span className="text-xs text-t3 flex items-center gap-1">
          <Maximize2 size={10} className="text-t3" />
          <span className="text-t2">{property.areaSqm} m²</span>
        </span>
      )}
      {property.condoFee !== undefined && property.condoFee > 0 && (
        <span className="text-xs text-t3 flex items-center gap-1">
          <Building size={10} className="text-t3" /> Cond. <span className="text-t2">{formatCurrencyFull(property.condoFee)}/mês</span>
        </span>
      )}
      {property.notes && (
        <p className="w-full text-xs text-t3 italic mt-0.5">"{property.notes}"</p>
      )}
    </div>
  )
}

function ContactCard({ contact }: { contact: Contact }) {
  const items = contact.permutaItems ?? []
  return (
    <div className="bg-s2/50 border border-line rounded-xl p-3">
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-7 h-7 rounded-lg bg-orange-500/15 flex items-center justify-center flex-shrink-0">
          <Users size={13} className="text-orange-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-t1 truncate">{contact.name}</p>
          <p className="text-xs text-t3 truncate">{contact.phone}</p>
        </div>
        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 font-semibold flex-shrink-0">
          {items.length} item{items.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {items.map(item => (
          <div key={item.id} className="flex items-start gap-2 bg-s2/50 rounded-lg px-2.5 py-1.5">
            <span className="flex-shrink-0 mt-0.5">
              {item.type === 'imovel' ? <Home size={11} className="text-brand" /> : <Car size={11} className="text-amber-400" />}
            </span>
            <div className="flex-1 min-w-0 text-xs">
              {item.type === 'imovel' ? (
                <span className="text-t2">
                  {item.region && `${item.region}`}{item.region && item.value && ' · '}{item.value && formatCurrencyFull(item.value)}
                  {!item.region && !item.value && <span className="text-t4">Imóvel (sem detalhes)</span>}
                </span>
              ) : (
                <span className="text-t2">
                  {item.carModel && `${item.carModel}`}{item.carModel && item.carValue && ' · '}{item.carValue && formatCurrencyFull(item.carValue)}
                  {!item.carModel && !item.carValue && <span className="text-t4">Carro (sem detalhes)</span>}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PropertyCard({ property }: { property: Property }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="bg-s2/50 border border-line rounded-xl p-3">
      <div className="flex items-start gap-3">
        <div className="w-7 h-7 rounded-lg bg-violet-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Building2 size={13} className="text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-t1 truncate">{property.name}</p>
          <p className="text-xs text-t3 truncate">{property.neighborhood}{property.city ? ` · ${property.city}` : ''}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">
              {formatCurrencyFull(property.value)}
            </span>
            {(property.permutaTypes ?? []).map(t => (
              <span key={t} className="text-[11px] px-1.5 py-0.5 rounded-md bg-s3/50 text-t3 border border-line">
                {t === 'imovel' ? 'Aceita imóvel' : 'Aceita carro'}
              </span>
            ))}
          </div>
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex-shrink-0 flex items-center gap-1 text-[11px] text-t3 hover:text-t2 px-2 py-1 rounded-lg bg-s3/50 hover:bg-s3/70 border border-line transition-all"
        >
          + info
          <ChevronDown size={10} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {expanded && <PropertyDetails property={property} />}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function PermutaPage() {
  const contacts   = useContactsStore(s => s.contacts)
  const properties = usePropertiesStore(s => s.properties)
  const [search, setSearch]     = useState('')
  const [activeTab, setActiveTab] = useState<'cruzamento' | 'contatos' | 'imoveis'>('cruzamento')

  const contactsWithPermuta   = useMemo(() => contacts.filter(c => (c.permutaItems ?? []).length > 0), [contacts])
  const propertiesWithPermuta = useMemo(() => properties.filter(p => p.acceptsPermuta), [properties])

  // Gera todos os matches (cada item de cada contato vs cada imóvel)
  const allMatches = useMemo<PermutaMatch[]>(() => {
    const results: PermutaMatch[] = []
    for (const contact of contactsWithPermuta) {
      for (const item of contact.permutaItems ?? []) {
        for (const property of propertiesWithPermuta) {
          const match = matchItemToProperty(contact, item, property)
          if (match) results.push(match)
        }
      }
    }
    return results.sort((a, b) => b.score - a.score)
  }, [contactsWithPermuta, propertiesWithPermuta])

  const filteredMatches = useMemo(() => {
    if (!search.trim()) return allMatches
    const q = search.toLowerCase()
    return allMatches.filter(m =>
      m.contact.name.toLowerCase().includes(q) ||
      m.property.name.toLowerCase().includes(q) ||
      m.property.neighborhood.toLowerCase().includes(q)
    )
  }, [allMatches, search])

  const filteredContacts = useMemo(() => {
    if (!search.trim()) return contactsWithPermuta
    const q = search.toLowerCase()
    return contactsWithPermuta.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q))
  }, [contactsWithPermuta, search])

  const filteredProperties = useMemo(() => {
    if (!search.trim()) return propertiesWithPermuta
    const q = search.toLowerCase()
    return propertiesWithPermuta.filter(p => p.name.toLowerCase().includes(q) || p.neighborhood.toLowerCase().includes(q))
  }, [propertiesWithPermuta, search])

  const tabs = [
    { id: 'cruzamento' as const, label: 'Cruzamentos', count: allMatches.length,           icon: Zap       },
    { id: 'contatos'   as const, label: 'Contatos',    count: contactsWithPermuta.length,   icon: Users     },
    { id: 'imoveis'    as const, label: 'Imóveis',     count: propertiesWithPermuta.length, icon: Building2 },
  ]

  return (
    <div className="p-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-orange-500/15 flex items-center justify-center">
            <ArrowLeftRight size={18} className="text-orange-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Cruzamento de Permutas</h1>
            <p className="text-xs text-t3 mt-0.5">
              Contatos com perfil de permuta vs imóveis que aceitam permuta
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-s2/50 border border-line rounded-xl px-4 py-3 flex items-center gap-3">
          <Users size={16} className="text-orange-400 flex-shrink-0" />
          <div>
            <p className="text-xl font-bold text-slate-100">{contactsWithPermuta.length}</p>
            <p className="text-xs text-t3">Contatos c/ permuta</p>
          </div>
        </div>
        <div className="bg-s2/50 border border-line rounded-xl px-4 py-3 flex items-center gap-3">
          <Building2 size={16} className="text-violet-400 flex-shrink-0" />
          <div>
            <p className="text-xl font-bold text-slate-100">{propertiesWithPermuta.length}</p>
            <p className="text-xs text-t3">Imóveis c/ permuta</p>
          </div>
        </div>
        <div className="bg-s2/50 border border-orange-500/20 rounded-xl px-4 py-3 flex items-center gap-3">
          <Zap size={16} className="text-amber-400 flex-shrink-0" />
          <div>
            <p className="text-xl font-bold text-amber-300">{allMatches.length}</p>
            <p className="text-xs text-t3">Matches encontrados</p>
          </div>
        </div>
      </div>

      {/* Busca */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t3 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por contato ou imóvel..."
          className="w-full bg-s3/50 border border-line rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-100 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-orange-500/40 transition-all"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-s2/50 border border-line rounded-xl p-1">
        {tabs.map(({ id, label, count, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              activeTab === id
                ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                : 'text-t3 hover:text-t2'
            }`}
          >
            <Icon size={13} />
            {label}
            <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-semibold ${
              activeTab === id ? 'bg-orange-500/30 text-orange-200' : 'bg-s3/70 text-t3'
            }`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Conteúdo das tabs */}
      {activeTab === 'cruzamento' && (
        <div className="space-y-3">
          {filteredMatches.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center mx-auto mb-3">
                <ArrowLeftRight size={20} className="text-orange-400/50" />
              </div>
              <p className="text-sm font-medium text-t3">
                {contactsWithPermuta.length === 0
                  ? 'Nenhum contato com perfil de permuta'
                  : propertiesWithPermuta.length === 0
                  ? 'Nenhum imóvel aceita permuta ainda'
                  : 'Nenhum cruzamento encontrado'}
              </p>
              <p className="text-xs text-t4 mt-1">
                {contactsWithPermuta.length === 0
                  ? 'Cadastre o perfil de permuta no contato ou via aba Permuta no lead'
                  : propertiesWithPermuta.length === 0
                  ? 'Ative "Aceita Permuta" no cadastro do imóvel'
                  : 'Ajuste os perfis de permuta dos contatos ou imóveis'}
              </p>
            </div>
          ) : (
            filteredMatches.map((match, i) => (
              <MatchCard key={`${match.contact.id}-${match.item.id}-${match.property.id}-${i}`} match={match} />
            ))
          )}
        </div>
      )}

      {activeTab === 'contatos' && (
        <div className="space-y-2">
          {filteredContacts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-t3">
                {search ? 'Nenhum contato encontrado' : 'Nenhum contato com perfil de permuta'}
              </p>
            </div>
          ) : (
            filteredContacts.map(c => <ContactCard key={c.id} contact={c} />)
          )}
        </div>
      )}

      {activeTab === 'imoveis' && (
        <div className="space-y-2">
          {filteredProperties.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-t3">
                {search ? 'Nenhum imóvel encontrado' : 'Nenhum imóvel aceita permuta'}
              </p>
              <p className="text-xs text-t4 mt-1">Ative "Aceita Permuta" no cadastro do imóvel</p>
            </div>
          ) : (
            filteredProperties.map(p => <PropertyCard key={p.id} property={p} />)
          )}
        </div>
      )}
    </div>
  )
}

// ─── Card de match ────────────────────────────────────────────────────────────

function MatchCard({ match }: { match: PermutaMatch }) {
  const [propertyExpanded, setPropertyExpanded] = useState(false)
  const { item, contact, property } = match
  const offerValue = item.type === 'imovel' ? item.value : item.carValue

  return (
    <div className="bg-s2/50 border border-line hover:border-white/14 rounded-xl p-4 transition-all">
      {/* Badge + reasons */}
      <div className="flex items-center flex-wrap gap-1.5 mb-3">
        <ScoreBadge score={match.score} />
        {match.reasons.map(r => (
          <span key={r} className="text-[11px] text-t3 bg-s3/50 px-1.5 py-0.5 rounded-md border border-line">
            {r}
          </span>
        ))}
      </div>

      {/* Contato ↔ Imóvel */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
        {/* Lado contato */}
        <div className="bg-s2/50 border border-orange-500/15 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-6 h-6 rounded-lg bg-orange-500/15 flex items-center justify-center flex-shrink-0">
              {item.type === 'imovel' ? <Home size={11} className="text-orange-400" /> : <Car size={11} className="text-orange-400" />}
            </div>
            <p className="text-xs font-semibold text-t2 truncate">{contact.name}</p>
          </div>
          <div className="flex flex-wrap gap-1">
            <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-orange-500/10 text-orange-400 border border-orange-500/20">
              Quer dar {item.type === 'imovel' ? 'imóvel' : 'carro'}
            </span>
            {item.type === 'imovel' && item.region && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-s3/50 text-t3 border border-line">{item.region}</span>
            )}
            {item.type === 'carro' && item.carModel && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-s3/50 text-t3 border border-line">{item.carModel}</span>
            )}
            {offerValue && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-s3/50 text-t3 border border-line">
                {formatCurrencyFull(offerValue)}
              </span>
            )}
          </div>
        </div>

        {/* Seta */}
        <div className="flex items-center justify-center pt-4">
          <div className="w-7 h-7 rounded-full bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
            <ChevronRight size={12} className="text-amber-400" />
          </div>
        </div>

        {/* Lado imóvel */}
        <div className="bg-s2/50 border border-violet-500/15 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-6 h-6 rounded-lg bg-violet-500/15 flex items-center justify-center flex-shrink-0">
              <Building2 size={11} className="text-violet-400" />
            </div>
            <p className="text-xs font-semibold text-t2 truncate">{property.name}</p>
          </div>
          <div className="flex flex-wrap gap-1 mb-2">
            <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-violet-500/10 text-violet-400 border border-violet-500/20">
              {formatCurrencyFull(property.value)}
            </span>
            {(property.permutaTypes ?? []).map(t => (
              <span key={t} className="text-[11px] px-1.5 py-0.5 rounded-md bg-s3/50 text-t3 border border-line">
                {t === 'imovel' ? 'Aceita imóvel' : 'Aceita carro'}
              </span>
            ))}
          </div>
          <button
            onClick={() => setPropertyExpanded(v => !v)}
            className="flex items-center gap-1 text-[11px] text-t3 hover:text-t2 transition-colors"
          >
            <ChevronDown size={10} className={`transition-transform ${propertyExpanded ? 'rotate-180' : ''}`} />
            {propertyExpanded ? 'Menos detalhes' : '+ informações'}
          </button>
          {propertyExpanded && <PropertyDetails property={property} />}
        </div>
      </div>
    </div>
  )
}
