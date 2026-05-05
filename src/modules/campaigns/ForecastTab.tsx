import { useState, useEffect } from 'react'
import { Sparkles, RotateCcw, Save, AlertCircle, Pencil, Check, X, Minus, Plus, ArrowDown, Trophy } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Campaign, CampaignLead, FunnelStage } from '../../types'
import { DEFAULT_CONVERSION_RATES, TRANSITION_LABELS } from './config'
import { useCampaignsStore } from '../../store/useCampaignsStore'
import toast from 'react-hot-toast'

interface ForecastTabProps {
  leads:    CampaignLead[]
  campaign: Campaign
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtCompact(v: number): string {
  if (v >= 1_000_000)
    return 'R$ ' + (v / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + 'M'
  if (v >= 1_000)
    return 'R$ ' + (v / 1_000).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + 'K'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })
}

function fmtFull(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function parseBRL(raw: string): number {
  return parseFloat(raw.replace(/\./g, '').replace(',', '.')) || 0
}

function fmtBRLInput(v: number): string {
  if (!v) return ''
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtLeads(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })
}

type Rates = { attended: number; scheduled: number; presentation: number; proposal: number; sale: number }

function buildRates(campaign: Campaign): Rates {
  const d = DEFAULT_CONVERSION_RATES
  const c = campaign.conversionRates ?? {}
  return {
    attended:     c.attended     ?? d.attended,
    scheduled:    c.scheduled    ?? d.scheduled,
    presentation: c.presentation ?? d.presentation,
    proposal:     c.proposal     ?? d.proposal,
    sale:         c.sale         ?? d.sale,
  }
}

// ─── Stepper ─────────────────────────────────────────────────────────────────

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [raw,     setRaw]     = useState(String(value))

  function commit(s: string) {
    onChange(Math.min(100, Math.max(0, parseFloat(s) || 0)))
    setEditing(false)
  }

  if (editing) return (
    <input
      autoFocus
      type="number" min={0} max={100}
      value={raw}
      onChange={e => setRaw(e.target.value)}
      onBlur={() => commit(raw)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') commit(raw) }}
      style={{ colorScheme: 'dark', backgroundColor: '#13151F' }}
      className="w-14 text-center text-sm font-bold text-indigo-300 border border-indigo-500/60 rounded-lg py-1 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
    />
  )

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 border border-white/8 text-slate-500 hover:text-slate-200 transition-colors cursor-pointer"
      >
        <Minus size={11} />
      </button>
      <button
        onClick={() => { setRaw(String(value)); setEditing(true) }}
        title="Clique para digitar"
        className="min-w-[3.5rem] text-center text-sm font-bold text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/18 border border-indigo-500/25 rounded-lg px-2 py-1 transition-colors cursor-pointer"
      >
        {value}%
      </button>
      <button
        onClick={() => onChange(Math.min(100, value + 1))}
        className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 border border-white/8 text-slate-500 hover:text-slate-200 transition-colors cursor-pointer"
      >
        <Plus size={11} />
      </button>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function ForecastTab({ leads, campaign }: ForecastTabProps) {
  const { update } = useCampaignsStore()

  const [rates,         setRates]         = useState<Rates>(() => buildRates(campaign))
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

  // Leads ativos por etapa (sem situação negativa)
  const active = (stage: FunnelStage) => leads.filter(l => l.funnelStage === stage && !l.situation).length

  const count = {
    cold:         active('new') + active('sent'),
    attended:     active('attended'),
    scheduled:    active('scheduled'),
    presentation: active('presentation'),
    proposal:     active('proposal'),
    sale:         active('sale'),
  }

  const totalActive = Object.values(count).reduce((a, b) => a + b, 0)

  // ── Projeção em cascata ────────────────────────────────────────────────────
  // Cada lead na etapa X projeta (produto das taxas restantes) vendas.
  // Leads já na etapa Y "pulam" as taxas anteriores a Y.
  const r = {
    att:  rates.attended     / 100,
    sch:  rates.scheduled    / 100,
    pre:  rates.presentation / 100,
    pro:  rates.proposal     / 100,
    sal:  rates.sale         / 100,
  }

  const proj = {
    fromCold:         count.cold         * r.att * r.sch * r.pre * r.pro * r.sal,
    fromAttended:     count.attended     *          r.sch * r.pre * r.pro * r.sal,
    fromScheduled:    count.scheduled    *                  r.pre * r.pro * r.sal,
    fromPresentation: count.presentation *                           r.pro * r.sal,
    fromProposal:     count.proposal     *                                   r.sal,
    alreadySold:      count.sale,
  }

  const totalSales = Object.values(proj).reduce((a, b) => a + b, 0)
  const totalVGV   = totalSales * ticket

  // Projeção acumulada após cada transição (para exibir no funil)
  const projAfter = {
    attended:     count.cold * r.att,
    scheduled:    count.cold * r.att * r.sch,
    presentation: count.cold * r.att * r.sch * r.pre,
    proposal:     count.cold * r.att * r.sch * r.pre * r.pro,
    sale:         count.cold * r.att * r.sch * r.pre * r.pro * r.sal,
  }

  function handleRate(key: keyof Rates, val: number) {
    setRates(r => ({ ...r, [key]: val }))
    setDirty(true)
  }

  function saveRates() {
    update(campaign.id, { conversionRates: rates })
    setDirty(false)
    toast.success('Taxas salvas')
  }

  function resetRates() {
    const d = { ...DEFAULT_CONVERSION_RATES } as unknown as Rates
    setRates(d)
    update(campaign.id, { conversionRates: undefined })
    setDirty(false)
    toast.success('Taxas redefinidas')
  }

  function saveTicket() {
    const val = parseBRL(ticketRaw)
    if (val <= 0) { toast.error('Informe um valor válido'); return }
    setTicketRaw(fmtBRLInput(val))
    update(campaign.id, { averageTicket: val })
    setEditingTicket(false)
    toast.success('Ticket médio salvo')
  }

  const hasCustomRates = !!campaign.conversionRates && Object.keys(campaign.conversionRates).length > 0

  // ── Blocos do funil ────────────────────────────────────────────────────────
  const funnelBlocks = [
    {
      key:         'cold' as const,
      label:       'Base Fria',
      sublabel:    'Não Contactado + 1ª Mensagem',
      dotColor:    'bg-slate-500',
      textColor:   'text-slate-300',
      borderColor: 'border-slate-500/20',
      bgColor:     'bg-slate-500/5',
      realCount:   count.cold,
      projIn:      null as number | null,   // topo do funil, sem entrada projetada
      transitionKey: 'attended' as keyof Rates,
      projOut:     projAfter.attended,
    },
    {
      key:         'attended' as const,
      label:       'Demonstrou Interesse',
      sublabel:    null,
      dotColor:    'bg-cyan-500',
      textColor:   'text-cyan-300',
      borderColor: 'border-cyan-500/20',
      bgColor:     'bg-cyan-500/5',
      realCount:   count.attended,
      projIn:      projAfter.attended,
      transitionKey: 'scheduled' as keyof Rates,
      projOut:     projAfter.scheduled,
    },
    {
      key:         'scheduled' as const,
      label:       'Agendou Apresentação',
      sublabel:    null,
      dotColor:    'bg-violet-500',
      textColor:   'text-violet-300',
      borderColor: 'border-violet-500/20',
      bgColor:     'bg-violet-500/5',
      realCount:   count.scheduled,
      projIn:      projAfter.scheduled,
      transitionKey: 'presentation' as keyof Rates,
      projOut:     projAfter.presentation,
    },
    {
      key:         'presentation' as const,
      label:       'Apresentação',
      sublabel:    null,
      dotColor:    'bg-indigo-500',
      textColor:   'text-indigo-300',
      borderColor: 'border-indigo-500/20',
      bgColor:     'bg-indigo-500/5',
      realCount:   count.presentation,
      projIn:      projAfter.presentation,
      transitionKey: 'proposal' as keyof Rates,
      projOut:     projAfter.proposal,
    },
    {
      key:         'proposal' as const,
      label:       'Proposta',
      sublabel:    null,
      dotColor:    'bg-amber-500',
      textColor:   'text-amber-300',
      borderColor: 'border-amber-500/20',
      bgColor:     'bg-amber-500/5',
      realCount:   count.proposal,
      projIn:      projAfter.proposal,
      transitionKey: 'sale' as keyof Rates,
      projOut:     projAfter.sale,
    },
  ]

  return (
    <div className="max-w-4xl mx-auto space-y-5">

      {/* ── Hero cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">

        {/* Ticket médio */}
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Ticket Médio</p>
            {!editingTicket && (
              <button onClick={() => setEditingTicket(true)} className="p-1 rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-colors cursor-pointer">
                <Pencil size={12} />
              </button>
            )}
          </div>
          {editingTicket ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 select-none">R$</span>
                <input
                  autoFocus type="text" inputMode="numeric"
                  value={ticketRaw}
                  onChange={e => setTicketRaw(e.target.value.replace(/[^\d.,]/g, ''))}
                  onKeyDown={e => { if (e.key === 'Enter') saveTicket(); if (e.key === 'Escape') setEditingTicket(false) }}
                  placeholder="500.000"
                  style={{ colorScheme: 'dark', backgroundColor: '#13151F' }}
                  className="w-full border border-indigo-500/50 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>
              <button onClick={saveTicket} className="p-1.5 rounded-lg bg-green-500/15 hover:bg-green-500/25 text-green-400 cursor-pointer transition-colors"><Check size={13} /></button>
              <button onClick={() => { setEditingTicket(false); setTicketRaw(campaign.averageTicket ? fmtBRLInput(campaign.averageTicket) : '') }} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-500 cursor-pointer transition-colors"><X size={13} /></button>
            </div>
          ) : (
            <p className={`text-2xl font-bold tabular-nums ${hasTicket ? 'text-slate-100' : 'text-slate-600'}`}>
              {hasTicket ? fmtFull(ticket) : 'Não definido'}
            </p>
          )}
          <p className="text-[11px] text-slate-600">Valor médio do produto</p>
        </Card>

        {/* Vendas projetadas */}
        <Card className="flex flex-col gap-3">
          <p className="text-[10px] font-semibold text-green-500/70 uppercase tracking-wider">Vendas Projetadas</p>
          <p className="text-2xl font-bold tabular-nums text-green-400">
            {fmtLeads(totalSales)}
          </p>
          <p className="text-[11px] text-slate-600">de {totalActive} leads ativos no funil</p>
        </Card>

        {/* VGV esperado */}
        <Card accent="indigo" className="flex flex-col gap-3">
          <p className="text-[10px] font-semibold text-indigo-400/70 uppercase tracking-wider">VGV Esperado</p>
          <p className={`text-2xl font-bold tabular-nums ${hasTicket ? 'text-indigo-300' : 'text-slate-600'}`}>
            {hasTicket ? fmtCompact(totalVGV) : '—'}
          </p>
          <p className="text-[11px] text-slate-600">{hasTicket ? `${fmtLeads(totalSales)} vendas × ${fmtFull(ticket)}` : 'Defina o ticket médio'}</p>
        </Card>
      </div>

      {/* Alerta sem ticket */}
      {!hasTicket && (
        <div className="flex items-start gap-3 bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3">
          <AlertCircle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300/80">
            Defina o <strong>ticket médio</strong> do produto para calcular o VGV esperado. Clique no lápis no card acima.
          </p>
        </div>
      )}

      {/* ── Funil cascata ──────────────────────────────────────────────────── */}
      <Card className="!p-0 overflow-hidden">

        <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Funil de Previsibilidade</h3>
            <p className="text-[11px] text-slate-600 mt-0.5">Cada taxa aplica sobre o resultado da etapa anterior em cascata</p>
          </div>
          <div className="flex items-center gap-2">
            {hasCustomRates && (
              <button onClick={resetRates} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 bg-white/5 hover:bg-white/8 border border-white/10 rounded-xl px-3 py-1.5 transition-all cursor-pointer">
                <RotateCcw size={11} /> Sugeridas
              </button>
            )}
            {dirty && (
              <button onClick={saveRates} className="flex items-center gap-1.5 text-xs text-indigo-300 hover:text-indigo-200 bg-indigo-500/15 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-xl px-3 py-1.5 transition-all cursor-pointer">
                <Save size={11} /> Salvar taxas
              </button>
            )}
          </div>
        </div>

        <div className="px-6 py-5 flex flex-col gap-0">
          {funnelBlocks.map((block, idx) => (
            <div key={block.key}>

              {/* Bloco da etapa */}
              <div className={`flex items-center gap-4 rounded-xl border px-4 py-3.5 ${block.bgColor} ${block.borderColor}`}>

                {/* Dot + nome */}
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${block.dotColor}`} />
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${block.textColor}`}>{block.label}</p>
                    {block.sublabel && <p className="text-[11px] text-slate-600">{block.sublabel}</p>}
                  </div>
                </div>

                {/* Leads reais */}
                <div className="text-right flex-shrink-0">
                  <p className="text-[10px] text-slate-600 mb-0.5">leads reais</p>
                  <p className={`text-lg font-bold tabular-nums ${block.realCount > 0 ? 'text-slate-200' : 'text-slate-600'}`}>
                    {block.realCount}
                  </p>
                </div>

                {/* Projeção entrada (exceto topo) */}
                {block.projIn !== null && (
                  <div className="text-right flex-shrink-0 pl-3 border-l border-white/8">
                    <p className="text-[10px] text-slate-600 mb-0.5">proj. da base</p>
                    <p className="text-sm font-semibold tabular-nums text-slate-400">
                      {fmtLeads(block.projIn)}
                    </p>
                  </div>
                )}
              </div>

              {/* Seta de transição */}
              <div className="flex items-center gap-0 my-1.5 pl-4">
                {/* Linha vertical */}
                <div className="flex flex-col items-center w-8 flex-shrink-0">
                  <div className="w-px h-3 bg-white/10" />
                  <ArrowDown size={12} className="text-slate-600" />
                  <div className="w-px h-3 bg-white/10" />
                </div>

                {/* Taxa + label + resultado projetado */}
                <div className="flex items-center gap-3 flex-1 bg-white/2 border border-white/6 rounded-xl px-4 py-2.5">
                  <Stepper
                    value={rates[block.transitionKey]}
                    onChange={v => handleRate(block.transitionKey, v)}
                  />
                  <div className="flex-1">
                    <span className="text-xs text-slate-500">
                      {TRANSITION_LABELS[block.transitionKey]}
                    </span>
                  </div>
                  {idx === 0 && (
                    <div className="text-right">
                      <p className="text-[10px] text-slate-600">projeção</p>
                      <p className="text-sm font-semibold tabular-nums text-slate-300">
                        {fmtLeads(projAfter.attended)} leads
                      </p>
                    </div>
                  )}
                  {idx === 1 && (
                    <div className="text-right">
                      <p className="text-[10px] text-slate-600">projeção</p>
                      <p className="text-sm font-semibold tabular-nums text-slate-300">
                        {fmtLeads(projAfter.scheduled)} leads
                      </p>
                    </div>
                  )}
                  {idx === 2 && (
                    <div className="text-right">
                      <p className="text-[10px] text-slate-600">projeção</p>
                      <p className="text-sm font-semibold tabular-nums text-slate-300">
                        {fmtLeads(projAfter.presentation)} leads
                      </p>
                    </div>
                  )}
                  {idx === 3 && (
                    <div className="text-right">
                      <p className="text-[10px] text-slate-600">projeção</p>
                      <p className="text-sm font-semibold tabular-nums text-slate-300">
                        {fmtLeads(projAfter.proposal)} leads
                      </p>
                    </div>
                  )}
                  {idx === 4 && (
                    <div className="text-right">
                      <p className="text-[10px] text-slate-600">vendas projetadas</p>
                      <p className="text-sm font-bold tabular-nums text-green-400">
                        {fmtLeads(projAfter.sale)}
                      </p>
                    </div>
                  )}
                </div>
              </div>

            </div>
          ))}

          {/* Bloco final — Vendas */}
          <div className="flex items-center gap-4 rounded-xl border border-green-500/25 bg-green-500/8 px-4 py-4 mt-1">
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <Trophy size={16} className="text-green-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-green-300">Vendas Realizadas + Projetadas</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {count.sale} já vendidas · {fmtLeads(proj.fromProposal + proj.fromPresentation + proj.fromScheduled + proj.fromAttended + proj.fromCold)} projetadas da base
                </p>
              </div>
            </div>

            <div className="text-right flex-shrink-0">
              <p className="text-[10px] text-slate-500 mb-0.5">total projetado</p>
              <p className="text-xl font-bold tabular-nums text-green-400">{fmtLeads(totalSales)}</p>
            </div>

            {hasTicket && (
              <div className="text-right flex-shrink-0 pl-3 border-l border-green-500/20">
                <p className="text-[10px] text-slate-500 mb-0.5">VGV esperado</p>
                <p className="text-xl font-bold tabular-nums text-indigo-300">{fmtCompact(totalVGV)}</p>
              </div>
            )}
          </div>

        </div>

        {/* Rodapé info */}
        <div className="px-5 py-3 border-t border-white/8 flex items-center gap-2">
          <Sparkles size={11} className="text-indigo-500/60 flex-shrink-0" />
          <p className="text-[11px] text-slate-600">
            Projeção calculada em cascata a partir da base fria. Leads já avançados no funil contribuem diretamente com as taxas restantes.
            {hasCustomRates && <span className="text-indigo-400/80"> Taxas personalizadas ativas.</span>}
          </p>
        </div>
      </Card>

    </div>
  )
}
