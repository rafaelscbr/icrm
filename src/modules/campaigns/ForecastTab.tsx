import { useState, useEffect } from 'react'
import { Sparkles, RotateCcw, Save, TrendingUp, AlertCircle, Pencil, Check, X, Minus, Plus } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Campaign, CampaignLead, FunnelStage } from '../../types'
import { FUNNEL_STAGES, DEFAULT_CONVERSION_RATES } from './config'
import { useCampaignsStore } from '../../store/useCampaignsStore'
import toast from 'react-hot-toast'

interface ForecastTabProps {
  leads:    CampaignLead[]
  campaign: Campaign
}

// ─── Formatação ───────────────────────────────────────────────────────────────

function fmtCompact(value: number): string {
  if (value >= 1_000_000)
    return 'R$ ' + (value / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + 'M'
  if (value >= 1_000)
    return 'R$ ' + (value / 1_000).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + 'K'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })
}

function fmtFull(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function parseBRL(raw: string): number {
  return parseFloat(raw.replace(/\./g, '').replace(',', '.')) || 0
}

function fmtBRLInput(v: number): string {
  if (!v) return ''
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function buildRates(campaign: Campaign): Record<FunnelStage, number> {
  const base = { ...DEFAULT_CONVERSION_RATES } as Record<FunnelStage, number>
  if (campaign.conversionRates) Object.assign(base, campaign.conversionRates)
  return base
}

// ─── Stepper de % ─────────────────────────────────────────────────────────────

interface StepperProps {
  value:    number
  color:    string   // tailwind text-color class
  onChange: (v: number) => void
}

function RateStepper({ value, color, onChange }: StepperProps) {
  const [editing, setEditing] = useState(false)
  const [raw,     setRaw]     = useState(String(value))

  function commit(raw: string) {
    const n = Math.min(100, Math.max(0, parseFloat(raw) || 0))
    onChange(n)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min={0}
        max={100}
        value={raw}
        onChange={e => setRaw(e.target.value)}
        onBlur={() => commit(raw)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') commit(raw) }}
        style={{ colorScheme: 'dark', backgroundColor: '#13151F' }}
        className="w-14 text-center text-sm font-bold text-slate-100 border border-indigo-500/60 rounded-lg py-1 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
    )
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => { onChange(Math.max(0, value - 1)) }}
        className="w-6 h-6 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-slate-500 hover:text-slate-200 transition-colors cursor-pointer border border-white/8"
      >
        <Minus size={10} />
      </button>
      <button
        onClick={() => setEditing(true)}
        title="Clique para digitar"
        className={`min-w-[3.25rem] text-center text-sm font-bold ${color} bg-white/5 hover:bg-white/10 border border-white/8 rounded-lg px-2 py-1 transition-colors cursor-pointer`}
      >
        {value}%
      </button>
      <button
        onClick={() => { onChange(Math.min(100, value + 1)) }}
        className="w-6 h-6 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-slate-500 hover:text-slate-200 transition-colors cursor-pointer border border-white/8"
      >
        <Plus size={10} />
      </button>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function ForecastTab({ leads, campaign }: ForecastTabProps) {
  const { update } = useCampaignsStore()

  const [rates,         setRates]         = useState<Record<FunnelStage, number>>(() => buildRates(campaign))
  const [dirty,         setDirty]         = useState(false)
  const [editingTicket, setEditingTicket] = useState(false)
  const [ticketRaw,     setTicketRaw]     = useState(campaign.averageTicket ? fmtBRLInput(campaign.averageTicket) : '')

  useEffect(() => {
    setRates(buildRates(campaign))
    setTicketRaw(campaign.averageTicket ? fmtBRLInput(campaign.averageTicket) : '')
    setDirty(false)
  }, [campaign.id])

  const ticket    = campaign.averageTicket ?? 0
  const hasTicket = ticket > 0

  const countByStage = FUNNEL_STAGES.reduce((acc, s) => {
    acc[s.value] = leads.filter(l => l.funnelStage === s.value && !l.situation).length
    return acc
  }, {} as Record<FunnelStage, number>)

  const rows = FUNNEL_STAGES.map(s => {
    const count         = countByStage[s.value]
    const rate          = rates[s.value]
    const suggested     = DEFAULT_CONVERSION_RATES[s.value]
    const isCustom      = rate !== suggested
    const expectedSales = count * rate / 100
    const expectedVGV   = expectedSales * ticket
    return { stage: s, count, rate, suggested, isCustom, expectedSales, expectedVGV }
  })

  const totalLeads = rows.reduce((sum, r) => sum + r.count, 0)
  const totalSales = rows.reduce((sum, r) => sum + r.expectedSales, 0)
  const totalVGV   = rows.reduce((sum, r) => sum + r.expectedVGV, 0)
  const maxVGV     = Math.max(...rows.map(r => r.expectedVGV), 1)

  const hasCustomRates = campaign.conversionRates && Object.keys(campaign.conversionRates).length > 0

  function handleRateChange(stage: FunnelStage, val: number) {
    setRates(r => ({ ...r, [stage]: val }))
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
    setTicketRaw(fmtBRLInput(val))
    update(campaign.id, { averageTicket: val })
    setEditingTicket(false)
    toast.success('Ticket médio salvo')
  }

  // ─── Color helper (rate → semaforo) ────────────────────────────────────────
  function rateColor(rate: number): string {
    if (rate >= 50) return 'text-green-400'
    if (rate >= 20) return 'text-amber-400'
    if (rate >= 5)  return 'text-blue-400'
    return 'text-slate-400'
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">

      {/* ── Hero cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        {/* Ticket médio */}
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Ticket Médio</p>
            {!editingTicket && (
              <button
                onClick={() => { setEditingTicket(true) }}
                className="text-slate-600 hover:text-slate-300 transition-colors cursor-pointer p-1 rounded-lg hover:bg-white/5"
              >
                <Pencil size={12} />
              </button>
            )}
          </div>

          {editingTicket ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 select-none">R$</span>
                <input
                  autoFocus
                  type="text"
                  inputMode="numeric"
                  value={ticketRaw}
                  onChange={e => setTicketRaw(e.target.value.replace(/[^\d.,]/g, ''))}
                  onKeyDown={e => { if (e.key === 'Enter') saveTicket(); if (e.key === 'Escape') setEditingTicket(false) }}
                  placeholder="Ex: 500.000"
                  style={{ colorScheme: 'dark', backgroundColor: '#13151F' }}
                  className="w-full border border-indigo-500/50 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>
              <button onClick={saveTicket}        className="p-1.5 rounded-lg bg-green-500/15 hover:bg-green-500/25 text-green-400 cursor-pointer transition-colors"><Check size={13} /></button>
              <button onClick={() => { setEditingTicket(false); setTicketRaw(campaign.averageTicket ? fmtBRLInput(campaign.averageTicket) : '') }}
                                                 className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-500 cursor-pointer transition-colors"><X size={13} /></button>
            </div>
          ) : (
            <p className={`text-2xl font-bold tabular-nums ${hasTicket ? 'text-slate-100' : 'text-slate-600'}`}>
              {hasTicket ? fmtFull(ticket) : 'Não definido'}
            </p>
          )}
          <p className="text-[11px] text-slate-600 leading-relaxed">
            Valor médio do produto desta campanha
          </p>
        </Card>

        {/* VGV total */}
        <Card accent="indigo" className="flex flex-col gap-3 sm:col-span-1">
          <p className="text-xs font-semibold text-indigo-400/70 uppercase tracking-wider">VGV Esperado</p>
          <p className={`text-2xl font-bold tabular-nums ${hasTicket ? 'text-indigo-300' : 'text-slate-600'}`}>
            {hasTicket ? fmtCompact(totalVGV) : '—'}
          </p>
          <p className="text-[11px] text-indigo-400/50 leading-relaxed">
            Soma projetada de todas as etapas
          </p>
        </Card>

        {/* Vendas projetadas */}
        <Card className="flex flex-col gap-3">
          <p className="text-xs font-semibold text-green-400/70 uppercase tracking-wider">Vendas Projetadas</p>
          <p className="text-2xl font-bold tabular-nums text-green-400">
            {totalSales.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          </p>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            De {totalLeads} lead{totalLeads !== 1 ? 's' : ''} ativos no funil
          </p>
        </Card>
      </div>

      {/* ── Alerta: sem ticket ── */}
      {!hasTicket && (
        <div className="flex items-start gap-3 bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3">
          <AlertCircle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300/80">
            Defina o <strong>ticket médio</strong> do produto para calcular o VGV esperado. Clique no lápis no card acima.
          </p>
        </div>
      )}

      {/* ── Tabela de etapas ── */}
      <Card className="!p-0 overflow-hidden">

        {/* Cabeçalho */}
        <div className="grid grid-cols-[1fr_64px_160px_88px_128px] items-center px-5 py-3 border-b border-white/8">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Etapa do Funil</span>
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-center">Leads</span>
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-center">% Conversão</span>
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-center">Vendas</span>
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-right">VGV Projetado</span>
        </div>

        {rows.map(({ stage, count, rate, suggested, isCustom, expectedSales, expectedVGV }) => {
          const barPct = hasTicket && totalVGV > 0 ? (expectedVGV / maxVGV) * 100 : 0

          return (
            <div key={stage.value} className="group">
              <div className="grid grid-cols-[1fr_64px_160px_88px_128px] items-center px-5 py-4 border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors">

                {/* Etapa */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${stage.dot}`} />
                  <span className="text-sm text-slate-200 truncate">{stage.label}</span>
                  {isCustom && (
                    <span className="hidden group-hover:inline-flex text-[9px] text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">
                      editado
                    </span>
                  )}
                </div>

                {/* Leads */}
                <div className="text-center">
                  <span className={`text-sm font-bold tabular-nums ${count > 0 ? 'text-slate-200' : 'text-slate-600'}`}>
                    {count}
                  </span>
                </div>

                {/* Stepper */}
                <div className="flex flex-col items-center gap-1">
                  <RateStepper
                    value={rate}
                    color={rateColor(rate)}
                    onChange={v => handleRateChange(stage.value, v)}
                  />
                  {isCustom && (
                    <span className="text-[9px] text-slate-600">sugerido: {suggested}%</span>
                  )}
                </div>

                {/* Vendas estimadas */}
                <div className="text-center">
                  <span className={`text-sm font-semibold tabular-nums ${expectedSales > 0 ? 'text-green-400' : 'text-slate-700'}`}>
                    {expectedSales > 0
                      ? expectedSales.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                      : '—'}
                  </span>
                </div>

                {/* VGV */}
                <div className="text-right">
                  <span className={`text-sm font-bold tabular-nums ${hasTicket && expectedVGV > 0 ? 'text-indigo-300' : 'text-slate-700'}`}>
                    {hasTicket && expectedVGV > 0 ? fmtCompact(expectedVGV) : '—'}
                  </span>
                </div>
              </div>

              {/* Barra de proporção VGV */}
              {hasTicket && barPct > 0 && (
                <div className="h-0.5 bg-white/3">
                  <div
                    className={`h-full transition-all duration-500 ${stage.dot.replace('bg-', 'bg-')}`}
                    style={{ width: `${barPct}%`, opacity: 0.5 }}
                  />
                </div>
              )}
            </div>
          )
        })}

        {/* Rodapé totais */}
        <div className="grid grid-cols-[1fr_64px_160px_88px_128px] items-center px-5 py-4 bg-white/3 border-t border-white/10">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <TrendingUp size={12} /> Total
          </span>
          <span className="text-center text-sm font-bold tabular-nums text-slate-200">{totalLeads}</span>
          <span />
          <span className="text-center text-sm font-bold tabular-nums text-green-400">
            {totalSales > 0
              ? totalSales.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
              : '—'}
          </span>
          <span className="text-right text-sm font-bold tabular-nums text-indigo-300">
            {hasTicket && totalVGV > 0 ? fmtCompact(totalVGV) : '—'}
          </span>
        </div>
      </Card>

      {/* ── Rodapé de ações ── */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2 text-[11px] text-slate-600">
          <Sparkles size={11} className="text-indigo-500/70" />
          Taxas baseadas em benchmarks de campanhas outbound no mercado imobiliário.
          {hasCustomRates && (
            <span className="text-indigo-400/80"> Taxas personalizadas ativas.</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {hasCustomRates && (
            <button
              onClick={resetRates}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 bg-white/5 hover:bg-white/8 border border-white/10 rounded-xl px-3 py-1.5 transition-all cursor-pointer"
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
