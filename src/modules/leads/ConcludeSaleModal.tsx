import { useEffect, useMemo, useState } from 'react'
import { Trophy, DollarSign } from 'lucide-react'
import toast from 'react-hot-toast'
import { Lead } from '../../types'
import { useLeadsStore } from '../../store/useLeadsStore'
import { useDevelopmentsStore } from '../../store/useDevelopmentsStore'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { localDateStr } from '../../lib/formatters'

interface ConcludeSaleModalProps {
  lead: Lead
  onClose: () => void
}

/**
 * Encerra um lead ganho: captura valor + data + PRODUTO VENDIDO e cria a venda
 * no módulo Vendas (via store.concludeSale). O lead sai do funil ativo e vira
 * faturamento real.
 *
 * O produto vem marcado com o do lead, mas pode ser outro: o lead que entrou
 * pelo San Pellegrino e fechou Porto Velas é venda cruzada, e o funil precisa
 * saber disso (migração 113).
 */

const FORA = '__fora__'
export function ConcludeSaleModal({ lead, onClose }: ConcludeSaleModalProps) {
  const { concludeSale } = useLeadsStore()
  const [valueRaw, setValueRaw] = useState(lead.averageTicket ? String(Math.round(lead.averageTicket)) : '')
  const [date, setDate]         = useState(localDateStr())
  const [saving, setSaving]     = useState(false)
  const { developments, carregarCarteira } = useDevelopmentsStore()
  useEffect(() => { void carregarCarteira() }, [carregarCarteira])
  const lancamentos = useMemo(() => developments
    .filter(d => d.active || d.id === lead.developmentId)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [developments, lead.developmentId])
  const [produto, setProduto]   = useState<string>(lead.developmentId ?? (lead.propertyName ? FORA : ''))
  const [nomeFora, setNomeFora] = useState(lead.developmentId ? '' : (lead.propertyName ?? ''))
  const entrada = lead.developmentId ?? null
  const cruzada = Boolean(entrada && produto && produto !== FORA && produto !== entrada)

  const value   = Number(valueRaw.replace(/\D/g, ''))
  const display = value > 0 ? value.toLocaleString('pt-BR') : ''
  const produtoOk = produto !== '' && (produto !== FORA || nomeFora.trim() !== '')
  const valid   = value > 0 && !!date && produtoOk

  async function handleConfirm() {
    if (!valid) { toast.error(produtoOk ? 'Informe o valor da venda' : 'Informe o produto vendido'); return }
    setSaving(true)
    try {
      await concludeSale(lead.id, {
        value, date,
        developmentId: produto === FORA ? null : produto,
        propertyName: produto === FORA ? nomeFora.trim() : undefined,
      })
      toast.success(`Venda concluída — R$ ${value.toLocaleString('pt-BR')}`)
      onClose()
    } catch {
      /* erro já toastado pela camada db — modal permanece aberto */
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Concluir venda"
      subtitle={`${lead.name} sai do funil e vira faturamento no módulo Vendas`}
      size="sm"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} className="flex-1" disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} className="flex-1" disabled={!valid || saving}>
            <Trophy size={14} /> {saving ? 'Concluindo…' : 'Concluir venda'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="conclude-produto" className="text-xs font-medium text-t2">Produto vendido *</label>
          <select
            id="conclude-produto"
            value={produto}
            onChange={e => setProduto(e.target.value)}
            className="w-full bg-surface border border-line-input rounded-lg px-3 py-2.5 text-sm text-t1 focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand transition-all cursor-pointer"
          >
            {produto === '' && <option value="">Escolha o produto</option>}
            {lancamentos.map(d => (
              <option key={d.id} value={d.id}>{d.name}{d.id === entrada ? ' · produto do lead' : ''}</option>
            ))}
            <option value={FORA}>Outro imóvel, fora da carteira</option>
          </select>
          {produto === FORA && (
            <input
              aria-label="Nome do imóvel vendido"
              value={nomeFora}
              onChange={e => setNomeFora(e.target.value)}
              placeholder="Ex.: Residencial Jasmim 504"
              className="w-full bg-surface border border-line-input rounded-lg px-3 py-2.5 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand transition-all"
            />
          )}
          {cruzada && (
            <p className="text-[11px] text-t4">
              Venda cruzada: o lead entrou por {lead.propertyName ?? 'outro produto'} e fechou outro produto. O funil mostra as duas coisas.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="conclude-value" className="text-xs font-medium text-t2">Valor da venda (R$) *</label>
          <div className="relative">
            <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t3" />
            <input
              id="conclude-value"
              inputMode="numeric"
              value={display}
              onChange={e => setValueRaw(e.target.value)}
              placeholder="Ex: 650.000"
              className="w-full bg-surface border border-line-input rounded-lg pl-9 pr-3 py-2.5 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand transition-all"
            />
          </div>
          {lead.averageTicket && (
            <p className="text-[11px] text-t4">Sugerido pelo ticket do produto — ajuste para o valor real fechado.</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="conclude-date" className="text-xs font-medium text-t2">Data da venda *</label>
          <input
            id="conclude-date"
            type="date"
            value={date}
            max={localDateStr()}
            onChange={e => setDate(e.target.value)}
            className="w-full bg-surface border border-line-input rounded-lg px-3 py-2.5 text-sm text-t1 focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand transition-all"
            style={{ colorScheme: 'dark' }}
          />
          <p className="text-[11px] text-t4">Define o mês em que a venda entra no VGL.</p>
        </div>
      </div>
    </Modal>
  )
}
