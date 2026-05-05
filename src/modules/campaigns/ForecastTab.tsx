import { useState, useEffect } from 'react'
import { Sparkles, RotateCcw, Save, TrendingUp, AlertCircle, Pencil, Check, X } from 'lucide-react'
import { Campaign, CampaignLead, FunnelStage } from '../../types'
import { FUNNEL_STAGES, DEFAULT_CONVERSION_RATES } from './config'
import { useCampaignsStore } from '../../store/useCampaignsStore'
import toast from 'react-hot-toast'

interface ForecastTabProps {
  leads:    CampaignLead[]
  campaign: Campaign
}

function fmtCurrency(value: number): string {
  if (value >= 1_000_000)
    return 'R$ ' + (value / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + ' M'
  if (value >= 1_000)
    return 'R$ ' + (value / 1_000).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' K'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })
}

function fmtFull(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function parseBRL(raw: string): number {
  return parseFloat(raw.replace(/\./g, '').replace(',', '.')) || 0
}

function formatBRLInput(value: number): string {
  if (!value) return ''
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function buildRates(campaign: Campaign): Record<FunnelStage, number> {
  const base = { ...DEFAULT_CONVERSION_RATES } as Record<FunnelStage, number>
  if (campaign.conversionRates) {
    Object.assign(base, campaign.conversionRates)
  }
  return base
}

export function ForecastTab({ leads, campaign }: ForecastTabProps) {
  const { update } = useCampaignsStore()

  const [rates, setRates]           = useState<Record<FunnelStage, number>>(() => buildRates(campaign))
  const [dirty, setDirty]           = useState(false)
  const [editingTicket, setEditingTicket] = useState(false)
  const [ticketRaw, setTicketRaw]   = useState(campaign.averageTicket ? formatBRLInput(campaign.averageTicket) : '')

  // Keep in sync if campaign changes externally
  useEffect(() => {
    setRates(buildRates(campaign))
    setTicketRaw(campaign.averageTicket ? formatBRLInput(campaign.averageTicket) : '')
    setDirty(false)
  }, [campaign.id])

  const ticket = campaign.averageTicket ?? 0

  // Count active leads (sem situação negativa) por etapa
  const countByStage = FUNNEL_STAGES.reduce((acc, s) => {
    acc[s.value] = leads.filter(l => l.funnelStage === s.value && !l.situation).length
    return acc
  }, {} as Record<FunnelStage, number>)

  const rows = FUNNEL_STAGES.map(s => {
    const count        = countByStage[s.value]
    const rate         = rates[s.value]
    const suggested    = DEFAULT_CONVERSION_RATES[s.value]
    const isCustom     = rate !== suggested
    const expectedSales = count * rate / 100
    const expectedVGV   = expectedSales * ticket
    return { stage: s, count, rate, suggested, isCustom, expectedSales, expectedVGV }
  })

  const totalLeads    = rows.reduce((sum, r) => sum + r.count, 0)
  const totalSales    = rows.reduce((sum, r) => sum + r.expectedSales, 0)
  const totalVGV      = rows.reduce((sum, r) => sum + r.expectedVGV, 0)
  const hasTicket     = ticket > 0

  function handleRateChange(stage: FunnelStage, val: string) {
    const n = Math.min(100, Math.max(0, parseFloat(val) || 0))
    setRates(r => ({ ...r, [stage]: n }))
    setDirty(true)
  }

  function saveRates() {
    update(campaign.id, { conversionRates: rates })
    setDirty(false)
    toast.success('Taxas de conversão salvas')
  }

  function resetRates() {
    const defaults = { ...DEFAULT_CONVERSION_RATES } as Record<FunnelStage, number>
    setRates(defaults)
    update(campaign.id, { conversionRates: undefined })
    setDirty(false)
    toast.success('Taxas redefinidas para sugeridas')
  }

  function saveTicket() {
    const val = parseBRL(ticketRaw)
    if (val <= 0) { toast.error('Informe um valor válido'); return }
    const formatted = formatBRLInput(val)
    setTicketRaw(formatted)
    update(campaign.id, { averageTicket: val })
    setEditingTicket(false)
    toast.success('Ticket médio salvo')
  }

  const hasCustomRates = campaign.conversionRates && Object.keys(campaign.conversionRates).length > 0

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* Header cards */}
      <div className="grid grid-cols-3 gap-4">

        {/* Ticket médio */}
        <div className="bg-white/4 border border-white/8 rounded-2xl p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 uppercase tracking-wider">Ticket Médio</span>
            {!editingTicket && (
              <button
                onClick={() => setEditingTicket(true)}
                className="text-slate-600 hover:text-slate-300 transition-colors cursor-pointer"
              >
                <Pencil size={12} />
              </button>
            )}
          </div>

          {editingTicket ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">R$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  value={ticketRaw}
                  onChange={e => setTicketRaw(e.target.value.replace(/[^\d.,]/g, ''))}
                  onKeyDown={e => { if (e.key === 'Enter') saveTicket(); if (e.key === 'Escape') setEditingTicket(false) }}
                  placeholder="0"
                  className="w-full bg-white/5 border border-indigo-500/50 rounded-lg pl-8 pr-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none"
                />
              </div>
              <button onClick={saveTicket} className="text-green-400 hover:text-green-300 cursor-pointer transition-colors"><Check size={14} /></button>
              <button onClick={() => { setEditingTicket(false); setTicketRaw(campaign.averageTicket ? formatBRLInput(campaign.averageTicket) : '') }} className="text-slate-500 hover:text-slate-300 cursor-pointer transition-colors"><X size={14} /></button>
            </div>
          ) : (
            <div className="text-xl font-bold text-slate-100">
              {hasTicket ? fmtFull(ticket) : <span className="text-sm text-slate-500 font-normal">Não definido</span>}
            </div>
          )}
          <p className="text-[11px] text-slate-600">valor médio do produto desta campanha</p>
        </div>

        {/* VGV total esperado */}
        <div className="bg-indigo-500/8 border border-indigo-500/20 rounded-2xl p-4 flex flex-col gap-2">
          <span className="text-xs text-indigo-400/70 uppercase tracking-wider">VGV Esperado Total</span>
          <div className="text-xl font-bold text-indigo-300">
            {hasTicket ? fmtCurrency(totalVGV) : <span className="text-sm text-slate-500 font-normal">Defina o ticket</span>}
          </div>
          <p className="text-[11px] text-indigo-400/50">soma de todas as etapas do funil</p>
        </div>

        {/* Vendas projetadas */}
        <div className="bg-green-500/8 border border-green-500/20 rounded-2xl p-4 flex flex-col gap-2">
          <span className="text-xs text-green-400/70 uppercase tracking-wider">Vendas Projetadas</span>
          <div className="text-xl font-bold text-green-300">
            {totalSales.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          </div>
          <p className="text-[11px] text-green-400/50">de {totalLeads} leads ativos no funil</p>
        </div>
      </div>

      {/* Alerta sem ticket */}
      {!hasTicket && (
        <div className="flex items-start gap-3 bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3">
          <AlertCircle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300/80">
            Defina o <strong>ticket médio</strong> do produto desta campanha para calcular o VGV esperado. Clique no lápis acima.
          </p>
        </div>
      )}

      {/* Tabela de etapas */}
      <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">

        {/* Cabeçalho */}
        <div className="grid grid-cols-[1fr_80px_130px_100px_120px] gap-0 px-5 py-3 border-b border-white/8 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
          <span>Etapa do Funil</span>
          <span className="text-center">Leads</span>
          <span className="text-center">% Conversão</span>
          <span className="text-center">Vendas Est.</span>
          <span className="text-right">VGV Projetado</span>
        </div>

        {rows.map(({ stage, count, rate, suggested, isCustom, expectedSales, expectedVGV }) => (
          <div
            key={stage.value}
            className="grid grid-cols-[1fr_80px_130px_100px_120px] gap-0 px-5 py-3.5 border-b border-white/5 last:border-0 items-center hover:bg-white/2 transition-colors"
          >
            {/* Etapa */}
            <div className="flex items-center gap-2.5">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${stage.dot}`} />
              <span className="text-sm text-slate-300">{stage.label}</span>
              {isCustom && (
                <span className="text-[9px] text-indigo-400 bg-indigo-500/15 border border-indigo-500/25 px-1.5 py-0.5 rounded-full">custom</span>
              )}
            </div>

            {/* Leads */}
            <div className="text-center">
              <span className="text-sm font-semibold text-slate-200">{count}</span>
            </div>

            {/* % Conversão — editável */}
            <div className="flex items-center justify-center gap-1.5">
              <div className="relative w-20">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={rate}
                  onChange={e => handleRateChange(stage.value, e.target.value)}
                  className="w-full bg-white/6 border border-white/12 rounded-lg px-2 py-1 text-sm text-slate-100 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">%</span>
              </div>
              {isCustom && (
                <span className="text-[10px] text-slate-600">
                  ({suggested}% sug.)
                </span>
              )}
            </div>

            {/* Vendas estimadas */}
            <div className="text-center">
              <span className={`text-sm font-medium ${expectedSales > 0 ? 'text-green-400' : 'text-slate-600'}`}>
                {expectedSales > 0
                  ? expectedSales.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                  : '—'}
              </span>
            </div>

            {/* VGV projetado */}
            <div className="text-right">
              {hasTicket && expectedVGV > 0 ? (
                <span className="text-sm font-semibold text-indigo-300">{fmtCurrency(expectedVGV)}</span>
              ) : (
                <span className="text-sm text-slate-700">—</span>
              )}
            </div>
          </div>
        ))}

        {/* Rodapé total */}
        <div className="grid grid-cols-[1fr_80px_130px_100px_120px] gap-0 px-5 py-3.5 bg-white/4 border-t border-white/10 items-center">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <TrendingUp size={12} /> Total
          </span>
          <span className="text-center text-sm font-bold text-slate-200">{totalLeads}</span>
          <span />
          <span className="text-center text-sm font-bold text-green-400">
            {totalSales.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          </span>
          <span className="text-right text-sm font-bold text-indigo-300">
            {hasTicket ? fmtCurrency(totalVGV) : '—'}
          </span>
        </div>
      </div>

      {/* Ações de taxas */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] text-slate-600">
          <Sparkles size={11} className="text-indigo-500" />
          Taxas sugeridas baseadas em benchmarks do mercado imobiliário brasileiro.
          {hasCustomRates && <span className="text-indigo-400"> Você tem taxas personalizadas ativas.</span>}
        </div>

        <div className="flex items-center gap-2">
          {hasCustomRates && (
            <button
              onClick={resetRates}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 bg-white/5 hover:bg-white/8 border border-white/10 rounded-xl px-3 py-1.5 transition-all cursor-pointer"
            >
              <RotateCcw size={11} /> Usar sugeridas
            </button>
          )}
          {dirty && (
            <button
              onClick={saveRates}
              className="flex items-center gap-1.5 text-xs text-indigo-300 hover:text-indigo-200 bg-indigo-500/15 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-xl px-3 py-1.5 transition-all cursor-pointer"
            >
              <Save size={11} /> Salvar taxas
            </button>
          )}
        </div>
      </div>

    </div>
  )
}
