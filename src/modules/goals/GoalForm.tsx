import { useState, useEffect, FormEvent } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Button } from '../../components/ui/Button'
import { Goal, GoalCategory, GoalPeriod } from '../../types'
import { useGoalsStore } from '../../store/useGoalsStore'
import toast from 'react-hot-toast'

interface GoalFormProps {
  isOpen:  boolean
  onClose: () => void
  goal?:   Goal
}

const CATEGORY_OPTIONS: { value: GoalCategory; label: string }[] = [
  { value: 'visita',       label: 'Visita'       },
  { value: 'agenciamento', label: 'Agenciamento' },
  { value: 'proposta',     label: 'Proposta'     },
  { value: 'venda',        label: 'Venda'        },
]

const PERIOD_OPTIONS: { value: GoalPeriod; label: string }[] = [
  { value: 'weekly',  label: 'Semanal'  },
  { value: 'monthly', label: 'Mensal'   },
]

export function GoalForm({ isOpen, onClose, goal }: GoalFormProps) {
  const { add, update } = useGoalsStore()
  const isEditing = Boolean(goal)

  const [name,     setName]     = useState(goal?.name ?? '')
  const [category, setCategory] = useState<GoalCategory>(goal?.category ?? 'visita')
  const [target,   setTarget]   = useState(String(goal?.target ?? 1))
  const [period,   setPeriod]   = useState<GoalPeriod>(goal?.period ?? 'weekly')
  const [errors,   setErrors]   = useState<Record<string, string>>({})

  useEffect(() => {
    if (!isOpen) return
    setName(goal?.name ?? '')
    setCategory(goal?.category ?? 'visita')
    setTarget(String(goal?.target ?? 1))
    setPeriod(goal?.period ?? 'weekly')
    setErrors({})
  }, [isOpen, goal])

  function validate() {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = 'Nome é obrigatório'
    if (!Number(target) || Number(target) < 1) errs.target = 'Meta deve ser ≥ 1'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!validate()) return

    const data = {
      name:     name.trim(),
      category,
      target:   Number(target),
      period,
      active:   goal?.active ?? true,
    }

    if (isEditing && goal) {
      update(goal.id, data)
      toast.success('Meta atualizada')
    } else {
      add(data)
      toast.success('Meta criada')
    }
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Editar Meta' : 'Nova Meta'} size="sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">

        <Input
          label="Nome da meta"
          required
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          error={errors.name}
          placeholder="Ex: Visitas semanais"
        />

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Categoria"
            value={category}
            onChange={e => setCategory(e.target.value as GoalCategory)}
          >
            {CATEGORY_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>

          <Select
            label="Período"
            value={period}
            onChange={e => setPeriod(e.target.value as GoalPeriod)}
          >
            {PERIOD_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>

        <Input
          label="Quantidade alvo"
          type="number"
          min={1}
          value={target}
          onChange={e => setTarget(e.target.value)}
          error={errors.target}
          placeholder="Ex: 2"
        />

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button type="submit" className="flex-1">{isEditing ? 'Salvar' : 'Criar meta'}</Button>
        </div>
      </form>
    </Modal>
  )
}
