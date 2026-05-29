import { useState, useEffect } from 'react'
import { Modal }  from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { useLeadListsStore } from '../../store/useLeadListsStore'
import { LeadList, BaseLeadProfile } from '../../types'
import { generateId } from '../../lib/formatters'

const PROPERTY_TYPES = [
  { value: 'apartment',          label: 'Apartamento' },
  { value: 'apartment_duplex',   label: 'Apartamento Duplex' },
  { value: 'penthouse_duplex',   label: 'Cobertura Duplex' },
  { value: 'house',              label: 'Casa' },
  { value: 'commercial',         label: 'Comercial' },
  { value: 'land',               label: 'Terreno' },
]

interface Props {
  isOpen:  boolean
  onClose: () => void
  list?:   LeadList
}

export function LeadListForm({ isOpen, onClose, list }: Props) {
  const { save } = useLeadListsStore()

  const [name,        setName]        = useState('')
  const [description, setDescription] = useState('')
  const [type,        setType]        = useState('')
  const [region,      setRegion]      = useState('')
  const [valueMin,    setValueMin]    = useState('')
  const [valueMax,    setValueMax]    = useState('')
  const [bedrooms,    setBedrooms]    = useState('')
  const [source,      setSource]      = useState('')
  const [saving,      setSaving]      = useState(false)

  useEffect(() => {
    if (!isOpen) return
    if (list) {
      setName(list.name)
      setDescription(list.description ?? '')
      const p = list.productProfile ?? {}
      setType(p.type ?? '')
      setRegion(p.region ?? '')
      setValueMin(p.valueMin ? String(p.valueMin) : '')
      setValueMax(p.valueMax ? String(p.valueMax) : '')
      setBedrooms(p.bedrooms ? String(p.bedrooms) : '')
      setSource(p.source ?? '')
    } else {
      setName(''); setDescription(''); setType(''); setRegion('')
      setValueMin(''); setValueMax(''); setBedrooms(''); setSource('')
    }
  }, [isOpen, list])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    const profile: BaseLeadProfile = {}
    if (type)     profile.type     = type
    if (region)   profile.region   = region.trim()
    if (valueMin) profile.valueMin = Number(valueMin)
    if (valueMax) profile.valueMax = Number(valueMax)
    if (bedrooms) profile.bedrooms = Number(bedrooms)
    if (source)   profile.source   = source.trim()

    const now = new Date().toISOString()
    const updated: LeadList = {
      id:             list?.id ?? generateId(),
      name:           name.trim(),
      description:    description.trim() || undefined,
      productProfile: Object.keys(profile).length > 0 ? profile : undefined,
      totalCount:     list?.totalCount ?? 0,
      status:         list?.status ?? 'active',
      createdAt:      list?.createdAt ?? now,
      updatedAt:      now,
    }

    setSaving(true)
    try {
      await save(updated)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full bg-s2 border border-line rounded-xl px-3 py-2 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:border-brand transition-colors'
  const labelCls = 'block text-xs font-semibold text-t3 mb-1.5'

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={list ? 'Editar Lista' : 'Nova Lista de Leads'}
      subtitle="Dê um nome, defina o perfil do produto de interesse e importe leads depois."
      size="md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Nome */}
        <div>
          <label className={labelCls}>Nome da lista *</label>
          <input
            className={inputCls}
            placeholder="Ex: Meta Ads Janeiro/25"
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />
        </div>

        {/* Descrição */}
        <div>
          <label className={labelCls}>Observação</label>
          <textarea
            className={`${inputCls} resize-none`}
            rows={2}
            placeholder="Contexto da lista, origem, data de captação…"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>

        {/* Perfil do produto */}
        <div>
          <p className="text-xs font-bold text-t3 uppercase tracking-wide mb-3">Perfil de imóvel de interesse</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Tipo</label>
              <select
                className={inputCls}
                value={type}
                onChange={e => setType(e.target.value)}
              >
                <option value="">Qualquer tipo</option>
                {PROPERTY_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Bairro / Região</label>
              <input
                className={inputCls}
                placeholder="Ex: Bela Vista"
                value={region}
                onChange={e => setRegion(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Valor mínimo (R$)</label>
              <input
                className={inputCls}
                type="number"
                placeholder="300000"
                value={valueMin}
                onChange={e => setValueMin(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Valor máximo (R$)</label>
              <input
                className={inputCls}
                type="number"
                placeholder="600000"
                value={valueMax}
                onChange={e => setValueMax(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Quartos</label>
              <input
                className={inputCls}
                type="number"
                min={1}
                max={10}
                placeholder="2"
                value={bedrooms}
                onChange={e => setBedrooms(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Fonte / Origem</label>
              <input
                className={inputCls}
                placeholder="Ex: Meta Ads, Portal"
                value={source}
                onChange={e => setSource(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" className="flex-1" disabled={saving || !name.trim()}>
            {saving ? 'Salvando…' : list ? 'Salvar alterações' : 'Criar lista'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
