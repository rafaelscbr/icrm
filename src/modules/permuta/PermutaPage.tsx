import { useMemo, useState } from 'react'
import { ArrowLeftRight, Home, Car, Building2, Users, Zap, ChevronRight, Search } from 'lucide-react'
import { useContactsStore } from '../../store/useContactsStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { formatCurrencyFull } from '../../lib/formatters'
import { Contact, Property } from '../../types'

// ─── Matching logic ───────────────────────────────────────────────────────────

interface PermutaMatch {
  contact: Contact
  property: Property
  score: number
  reasons: string[]
}

function matchContactToProperty(contact: Contact, property: Property): PermutaMatch | null {
  if (!property.acceptsPermuta) return null
  if (!contact.permutaType) return null

  const reasons: string[] = []
  let score = 0

  // Type match
  const wantsImovel = contact.permutaType === 'imovel'
  const wantsCarro  = contact.permutaType === 'carro'
  const propAccepts = property.permutaTypes ?? []

  if (wantsImovel && propAccepts.includes('imovel')) {
    score += 2
    reasons.push('Aceita imóvel em permuta')
  } else if (wantsCarro && propAccepts.includes('carro')) {
    score += 2
    reasons.push('Aceita carro em permuta')
  } else if (propAccepts.length === 0) {
    // property accepts any permuta type — partial match
    score += 1
    reasons.push('Aceita permuta (tipo flexível)')
  } else {
    return null // type mismatch, no match
  }

  // Region match (for imovel)
  if (wantsImovel && contact.permutaPropertyRegion) {
    const propRegions = property.permutaRegions ?? []
    const contactRegion = contact.permutaPropertyRegion.toLowerCase()
    const regionMatch = propRegions.some(r => r.toLowerCase().includes(contactRegion) || contactRegion.includes(r.toLowerCase()))
    if (regionMatch) {
      score += 2
      reasons.push(`Região compatível (${contact.permutaPropertyRegion})`)
    }
  }

  // Value match (contact's offer value vs property value range ±30%)
  const contactValue = wantsImovel ? contact.permutaPropertyValue : contact.permutaCarValue
  if (contactValue && property.value) {
    const min = property.value * 0.6
    const max = property.value * 1.4
    if (contactValue >= min && contactValue <= max) {
      score += 2
      reasons.push(`Valor compatível (${formatCurrencyFull(contactValue)} vs ${formatCurrencyFull(property.value)})`)
    } else if (contactValue >= property.value * 0.4 && contactValue <= property.value * 2) {
      score += 1
      reasons.push(`Valor aproximado (${formatCurrencyFull(contactValue)})`)
    }
  }

  if (score === 0) return null

  return { contact, property, score, reasons }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 5 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
    score >= 3 ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                 'bg-white/8 text-slate-400 border-white/10'
  const label =
    score >= 5 ? 'Ótimo match' :
    score >= 3 ? 'Bom match' :
                 'Match parcial'
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${color}`}>
      {label} · {score}pts
    </span>
  )
}

function ContactCard({ contact }: { contact: Contact }) {
  const hasImovel = contact.permutaType === 'imovel'
  return (
    <div className="bg-white/3 border border-white/8 rounded-xl p-3 flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-orange-500/15 flex items-center justify-center flex-shrink-0">
        {hasImovel
          ? <Home size={14} className="text-orange-400" />
          : <Car size={14} className="text-orange-400" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-200 truncate">{contact.name}</p>
        <p className="text-xs text-slate-500 truncate">{contact.phone}</p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">
            {hasImovel ? 'Imóvel' : 'Carro'}
          </span>
          {hasImovel && contact.permutaPropertyRegion && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/5 text-slate-400 border border-white/8">
              {contact.permutaPropertyRegion}
            </span>
          )}
          {!hasImovel && contact.permutaCarModel && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/5 text-slate-400 border border-white/8">
              {contact.permutaCarModel}
            </span>
          )}
          {(hasImovel ? contact.permutaPropertyValue : contact.permutaCarValue) && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/5 text-slate-400 border border-white/8">
              {formatCurrencyFull(hasImovel ? contact.permutaPropertyValue! : contact.permutaCarValue!)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function PropertyCard({ property }: { property: Property }) {
  return (
    <div className="bg-white/3 border border-white/8 rounded-xl p-3 flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center flex-shrink-0">
        <Building2 size={14} className="text-violet-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-200 truncate">{property.name}</p>
        <p className="text-xs text-slate-500 truncate">{property.neighborhood}</p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">
            {formatCurrencyFull(property.value)}
          </span>
          {(property.permutaTypes ?? []).map(t => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/5 text-slate-400 border border-white/8">
              {t === 'imovel' ? 'Aceita imóvel' : 'Aceita carro'}
            </span>
          ))}
          {(property.permutaRegions ?? []).slice(0, 2).map(r => (
            <span key={r} className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/5 text-slate-400 border border-white/8">
              {r}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function PermutaPage() {
  const contacts   = useContactsStore(s => s.contacts)
  const properties = usePropertiesStore(s => s.properties)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'cruzamento' | 'contatos' | 'imoveis'>('cruzamento')

  const contactsWithPermuta   = useMemo(() => contacts.filter(c => c.permutaType), [contacts])
  const propertiesWithPermuta = useMemo(() => properties.filter(p => p.acceptsPermuta), [properties])

  // All matches, sorted by score desc
  const allMatches = useMemo<PermutaMatch[]>(() => {
    const results: PermutaMatch[] = []
    for (const contact of contactsWithPermuta) {
      for (const property of propertiesWithPermuta) {
        const match = matchContactToProperty(contact, property)
        if (match) results.push(match)
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
    return contactsWithPermuta.filter(c =>
      c.name.toLowerCase().includes(q) || c.phone.includes(q)
    )
  }, [contactsWithPermuta, search])

  const filteredProperties = useMemo(() => {
    if (!search.trim()) return propertiesWithPermuta
    const q = search.toLowerCase()
    return propertiesWithPermuta.filter(p =>
      p.name.toLowerCase().includes(q) || p.neighborhood.toLowerCase().includes(q)
    )
  }, [propertiesWithPermuta, search])

  const tabs = [
    { id: 'cruzamento' as const, label: 'Cruzamentos', count: allMatches.length,           icon: Zap      },
    { id: 'contatos'   as const, label: 'Contatos',    count: contactsWithPermuta.length,   icon: Users    },
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
            <p className="text-xs text-slate-500 mt-0.5">
              Contatos com perfil de permuta vs imóveis que aceitam permuta
            </p>
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white/3 border border-white/8 rounded-xl px-4 py-3 flex items-center gap-3">
          <Users size={16} className="text-orange-400 flex-shrink-0" />
          <div>
            <p className="text-xl font-bold text-slate-100">{contactsWithPermuta.length}</p>
            <p className="text-[11px] text-slate-500">Contatos c/ permuta</p>
          </div>
        </div>
        <div className="bg-white/3 border border-white/8 rounded-xl px-4 py-3 flex items-center gap-3">
          <Building2 size={16} className="text-violet-400 flex-shrink-0" />
          <div>
            <p className="text-xl font-bold text-slate-100">{propertiesWithPermuta.length}</p>
            <p className="text-[11px] text-slate-500">Imóveis c/ permuta</p>
          </div>
        </div>
        <div className="bg-white/3 border border-orange-500/20 rounded-xl px-4 py-3 flex items-center gap-3">
          <Zap size={16} className="text-amber-400 flex-shrink-0" />
          <div>
            <p className="text-xl font-bold text-amber-300">{allMatches.length}</p>
            <p className="text-[11px] text-slate-500">Matches encontrados</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por contato ou imóvel..."
          className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-500/40 transition-all"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-white/3 border border-white/8 rounded-xl p-1">
        {tabs.map(({ id, label, count, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              activeTab === id
                ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Icon size={13} />
            {label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
              activeTab === id ? 'bg-orange-500/30 text-orange-200' : 'bg-white/8 text-slate-500'
            }`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'cruzamento' && (
        <div className="space-y-3">
          {filteredMatches.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center mx-auto mb-3">
                <ArrowLeftRight size={20} className="text-orange-400/50" />
              </div>
              <p className="text-sm font-medium text-slate-400">
                {contactsWithPermuta.length === 0
                  ? 'Nenhum contato com perfil de permuta'
                  : propertiesWithPermuta.length === 0
                  ? 'Nenhum imóvel aceita permuta ainda'
                  : 'Nenhum cruzamento encontrado'}
              </p>
              <p className="text-xs text-slate-600 mt-1">
                {contactsWithPermuta.length === 0
                  ? 'Cadastre o perfil de permuta no contato ou via aba Permuta no lead'
                  : propertiesWithPermuta.length === 0
                  ? 'Ative "Aceita Permuta" no cadastro de imóvel'
                  : 'Tente ajustar os perfis de permuta dos contatos ou imóveis'}
              </p>
            </div>
          ) : (
            filteredMatches.map((match, i) => (
              <div key={`${match.contact.id}-${match.property.id}-${i}`}
                className="bg-white/3 border border-white/8 hover:border-white/14 rounded-xl p-4 transition-all">

                {/* Match header */}
                <div className="flex items-center justify-between mb-3">
                  <ScoreBadge score={match.score} />
                  <div className="flex flex-wrap gap-1">
                    {match.reasons.map(r => (
                      <span key={r} className="text-[10px] text-slate-500 bg-white/5 px-1.5 py-0.5 rounded-md border border-white/8">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Match body: contact ↔ property */}
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  {/* Contact side */}
                  <div className="bg-white/3 border border-orange-500/15 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-lg bg-orange-500/15 flex items-center justify-center flex-shrink-0">
                        {match.contact.permutaType === 'imovel'
                          ? <Home size={11} className="text-orange-400" />
                          : <Car size={11} className="text-orange-400" />
                        }
                      </div>
                      <p className="text-xs font-semibold text-slate-300 truncate">{match.contact.name}</p>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">{match.contact.phone}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-orange-500/10 text-orange-400 border border-orange-500/20">
                        Quer dar {match.contact.permutaType === 'imovel' ? 'imóvel' : 'carro'}
                      </span>
                      {match.contact.permutaType === 'imovel' && match.contact.permutaPropertyRegion && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/5 text-slate-400 border border-white/8">
                          {match.contact.permutaPropertyRegion}
                        </span>
                      )}
                      {match.contact.permutaType === 'carro' && match.contact.permutaCarModel && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/5 text-slate-400 border border-white/8">
                          {match.contact.permutaCarModel}
                        </span>
                      )}
                      {(match.contact.permutaType === 'imovel'
                        ? match.contact.permutaPropertyValue
                        : match.contact.permutaCarValue
                      ) && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/5 text-slate-400 border border-white/8">
                          {formatCurrencyFull(
                            match.contact.permutaType === 'imovel'
                              ? match.contact.permutaPropertyValue!
                              : match.contact.permutaCarValue!
                          )}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-7 h-7 rounded-full bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
                      <ChevronRight size={12} className="text-amber-400" />
                    </div>
                  </div>

                  {/* Property side */}
                  <div className="bg-white/3 border border-violet-500/15 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-lg bg-violet-500/15 flex items-center justify-center flex-shrink-0">
                        <Building2 size={11} className="text-violet-400" />
                      </div>
                      <p className="text-xs font-semibold text-slate-300 truncate">{match.property.name}</p>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">{match.property.neighborhood}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-violet-500/10 text-violet-400 border border-violet-500/20">
                        {formatCurrencyFull(match.property.value)}
                      </span>
                      {(match.property.permutaTypes ?? []).map(t => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/5 text-slate-400 border border-white/8">
                          {t === 'imovel' ? 'Aceita imóvel' : 'Aceita carro'}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'contatos' && (
        <div className="space-y-2">
          {filteredContacts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-slate-500">
                {search ? 'Nenhum contato encontrado' : 'Nenhum contato com perfil de permuta'}
              </p>
              <p className="text-xs text-slate-600 mt-1">
                Cadastre o perfil de permuta na aba Permuta do lead ou diretamente no contato
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
              <p className="text-sm text-slate-500">
                {search ? 'Nenhum imóvel encontrado' : 'Nenhum imóvel aceita permuta'}
              </p>
              <p className="text-xs text-slate-600 mt-1">
                Ative "Aceita Permuta" no cadastro do imóvel para ele aparecer aqui
              </p>
            </div>
          ) : (
            filteredProperties.map(p => <PropertyCard key={p.id} property={p} />)
          )}
        </div>
      )}
    </div>
  )
}
