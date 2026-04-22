import { useEffect, useState } from 'react'
import {
  UserPlus, Phone, MessageSquare, CheckCircle2, Lock, Unlock,
  ChevronDown, ChevronUp, StickyNote, Calendar, TrendingUp, PlusCircle, Pencil
} from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { useDailyLogsStore } from '../../store/useDailyLogsStore'
import { DailyLog, DAILY_TARGETS } from '../../types'
import toast from 'react-hot-toast'

const WEEKDAY = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MONTH_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function formatDateFull(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return `${WEEKDAY[d.getDay()]}, ${d.getDate()} de ${MONTH_PT[d.getMonth()]} de ${d.getFullYear()}`
}

function formatDateShort(dateStr: string) {
  return dateStr.split('-').reverse().join('/')
}

function pct(value: number, target: number) {
  return Math.min(100, Math.round((value / target) * 100))
}

interface CounterProps {
  label:    string
  icon:     React.ReactNode
  value:    number
  target:   number
  disabled: boolean
  accent:   string
  barColor: string
  onChange: (v: number) => void
}

function Counter({ label, icon, value, target, disabled, accent, barColor, onChange }: CounterProps) {
  const done = value >= target
  const p    = pct(value, target)

  return (
    <Card className={`flex flex-col gap-4 border ${done ? 'border-green-500/30' : 'border-white/5'} transition-all duration-300`}>
      <div className="flex items-center gap-2.5">
        <div className={`w-8 h-8 ${accent} rounded-xl flex items-center justify-center`}>
          {icon}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-200">{label}</p>
          <p className="text-xs text-slate-600">Meta: {target}/dia</p>
        </div>
        {done && <CheckCircle2 size={16} className="text-green-400" />}
      </div>

      {/* Stepper */}
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          disabled={disabled || value <= 0}
          onClick={() => onChange(Math.max(0, value - 1))}
          className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 text-xl font-light transition-all cursor-pointer flex items-center justify-center"
        >
          −
        </button>
        <span className={`text-4xl font-bold tabular-nums w-16 text-center
          ${done ? 'text-green-400' : 'text-slate-100'}`}>
          {value}
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(value + 1)}
          className="w-10 h-10 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 disabled:opacity-30 disabled:cursor-not-allowed text-indigo-300 text-xl font-light transition-all cursor-pointer flex items-center justify-center"
        >
          +
        </button>
      </div>

      {/* Progress bar */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className={`text-xs font-medium ${done ? 'text-green-400' : 'text-slate-500'}`}>
            {done ? 'Meta atingida!' : `${value} de ${target}`}
          </span>
          <span className="text-xs text-slate-600 tabular-nums">{p}%</span>
        </div>
        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${done ? 'bg-green-500' : barColor}`}
            style={{ width: `${p}%` }}
          />
        </div>
      </div>
    </Card>
  )
}

interface PastLogModalProps {
  isOpen:   boolean
  log?:     DailyLog
  onClose:  () => void
}

function PastLogModal({ isOpen, log, onClose }: PastLogModalProps) {
  const { upsertLog } = useDailyLogsStore()
  const todayStr = new Date().toISOString().split('T')[0]

  const [date,         setDate]         = useState('')
  const [newLeads,     setNewLeads]     = useState(0)
  const [ownerCalls,   setOwnerCalls]   = useState(0)
  const [funnelFollowup, setFunnel]     = useState(false)
  const [notes,        setNotes]        = useState('')
  const [closed,       setClosed]       = useState(true)

  useEffect(() => {
    if (!isOpen) return
    setDate(log?.date ?? '')
    setNewLeads(log?.newLeads ?? 0)
    setOwnerCalls(log?.ownerCalls ?? 0)
    setFunnel(log?.funnelFollowup ?? false)
    setNotes(log?.notes ?? '')
    setClosed(log?.closed ?? true)
  }, [isOpen, log])

  function handleSave() {
    if (!date || date >= todayStr) {
      toast.error('Selecione uma data anterior a hoje.')
      return
    }
    upsertLog(date, { newLeads, ownerCalls, funnelFollowup, notes, closed })
    toast.success(`Dia ${formatDateShort(date)} salvo!`)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={log ? 'Editar dia anterior' : 'Lançar dia anterior'} size="sm">
      <div className="flex flex-col gap-4">
        {/* Date */}
        <div>
          <label className="text-xs text-slate-500 mb-1.5 block">Data</label>
          <input
            type="date"
            max={new Date(Date.now() - 86400000).toISOString().split('T')[0]}
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
        </div>

        {/* Counters */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Novos leads', value: newLeads,   set: setNewLeads,   color: 'text-indigo-400' },
            { label: 'Proprietários', value: ownerCalls, set: setOwnerCalls, color: 'text-cyan-400'   },
          ].map(({ label, value, set, color }) => (
            <div key={label} className="bg-white/5 rounded-xl p-3 flex flex-col items-center gap-2">
              <span className="text-xs text-slate-500">{label}</span>
              <div className="flex items-center gap-3">
                <button onClick={() => set(Math.max(0, value - 1))}
                  className="w-7 h-7 rounded-lg bg-white/8 hover:bg-white/15 text-slate-300 text-lg flex items-center justify-center cursor-pointer">−</button>
                <span className={`text-2xl font-bold tabular-nums ${color}`}>{value}</span>
                <button onClick={() => set(value + 1)}
                  className="w-7 h-7 rounded-lg bg-white/8 hover:bg-white/15 text-slate-300 text-lg flex items-center justify-center cursor-pointer">+</button>
              </div>
            </div>
          ))}
        </div>

        {/* Funnel toggle */}
        <div className="flex items-center gap-3 px-3 py-2.5 bg-white/5 rounded-xl">
          <MessageSquare size={14} className="text-green-400 flex-shrink-0" />
          <span className="flex-1 text-sm text-slate-300">Followup do funil</span>
          <button
            onClick={() => setFunnel(v => !v)}
            className={`relative w-12 h-6 rounded-full transition-all duration-300 cursor-pointer flex-shrink-0 ${funnelFollowup ? 'bg-green-500' : 'bg-white/10'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-300 ${funnelFollowup ? 'left-6' : 'left-0.5'}`} />
          </button>
          {funnelFollowup && <CheckCircle2 size={14} className="text-green-400 flex-shrink-0" />}
        </div>

        {/* Notes */}
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          placeholder="Observações (opcional)"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
        />

        {/* Closed toggle */}
        <div className="flex items-center gap-3 px-3 py-2 bg-white/5 rounded-xl">
          <Lock size={13} className="text-slate-500 flex-shrink-0" />
          <span className="flex-1 text-xs text-slate-400">Marcar dia como fechado</span>
          <button
            onClick={() => setClosed(v => !v)}
            className={`relative w-11 rounded-full transition-all cursor-pointer h-6 ${closed ? 'bg-amber-500' : 'bg-white/10'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${closed ? 'left-5' : 'left-0.5'}`} />
          </button>
        </div>

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={handleSave}>Salvar</Button>
        </div>
      </div>
    </Modal>
  )
}

function HistoryRow({ log, onEdit }: { log: DailyLog; onEdit: (log: DailyLog) => void }) {
  const leadsOk  = log.newLeads  >= DAILY_TARGETS.newLeads
  const callsOk  = log.ownerCalls >= DAILY_TARGETS.ownerCalls
  const score    = (log.newLeads >= DAILY_TARGETS.newLeads ? 1 : 0)
               + (log.ownerCalls >= DAILY_TARGETS.ownerCalls ? 1 : 0)
               + (log.funnelFollowup ? 1 : 0)

  const scoreColor = score === 3 ? 'text-green-400' : score >= 1 ? 'text-yellow-400' : 'text-red-400'

  return (
    <div className="group flex items-center gap-4 py-3 px-4 rounded-xl hover:bg-white/3 transition-colors -mx-4">
      <div className="w-20 flex-shrink-0">
        <p className="text-sm font-medium text-slate-300 tabular-nums">{formatDateShort(log.date)}</p>
        {log.closed && <p className="text-[10px] text-slate-600">Fechado</p>}
      </div>
      <div className={`flex items-baseline gap-0.5 w-16 ${leadsOk ? 'text-green-400' : 'text-slate-400'}`}>
        <span className="text-sm font-bold tabular-nums">{log.newLeads}</span>
        <span className="text-xs text-slate-600">/{DAILY_TARGETS.newLeads}</span>
      </div>
      <div className={`flex items-baseline gap-0.5 w-16 ${callsOk ? 'text-green-400' : 'text-slate-400'}`}>
        <span className="text-sm font-bold tabular-nums">{log.ownerCalls}</span>
        <span className="text-xs text-slate-600">/{DAILY_TARGETS.ownerCalls}</span>
      </div>
      <div className="w-16 flex items-center">
        {log.funnelFollowup
          ? <CheckCircle2 size={14} className="text-green-400" />
          : <span className="text-xs text-slate-600">—</span>
        }
      </div>
      <div className={`text-xs font-semibold ${scoreColor}`}>{score}/3</div>
      <button
        onClick={() => onEdit(log)}
        className="ml-auto opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-white/8 text-slate-600 hover:text-slate-300 transition-all cursor-pointer"
      >
        <Pencil size={12} />
      </button>
    </div>
  )
}

export function DailyProductivityTab() {
  const { logs, load, getTodayLog, updateToday, closeDay, reopenDay } = useDailyLogsStore()
  const [showNotes,    setShowNotes]    = useState(false)
  const [pastModalOpen, setPastModal]  = useState(false)
  const [editingLog,    setEditingLog] = useState<DailyLog | undefined>()

  useEffect(() => { load() }, [load])

  const today = getTodayLog()
  const locked = today.closed

  const history = logs
    .filter(l => l.date !== today.date)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 14)

  function handleClose() {
    closeDay()
    toast.success('Dia fechado! Bom descanso.')
  }

  function handleReopen() {
    reopenDay()
    toast.success('Dia reaberto.')
  }

  // Week summary (Mon–Sun containing today)
  const now = new Date()
  const dayOfWeek = now.getDay()
  const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(now); monday.setDate(now.getDate() + diffToMon)
  const weekStart = monday.toISOString().split('T')[0]
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
  const weekEnd = sunday.toISOString().split('T')[0]

  const weekLogs      = logs.filter(l => l.date >= weekStart && l.date <= weekEnd)
  const weekLeads     = weekLogs.reduce((a, l) => a + l.newLeads, 0)
  const weekCalls     = weekLogs.reduce((a, l) => a + l.ownerCalls, 0)
  const weekFunnel    = weekLogs.filter(l => l.funnelFollowup).length
  const weekDayClosed = weekLogs.filter(l => l.closed).length

  // Metas semanais fixas: leads = 7 dias × 5, ligações = seg-sex × 5, funil = seg-sáb
  const WEEK_TARGET_LEADS  = 7 * DAILY_TARGETS.newLeads   // 35
  const WEEK_TARGET_CALLS  = 5 * DAILY_TARGETS.ownerCalls // 25 (seg-sex)
  const WEEK_TARGET_FUNNEL = 6                            // seg-sáb

  function openEdit(log: DailyLog) {
    setEditingLog(log)
    setPastModal(true)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header card */}
      <Card accent="indigo" className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-500/20 rounded-xl flex items-center justify-center">
            <Calendar size={16} className="text-indigo-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-200 capitalize">{formatDateFull(today.date)}</p>
            <p className="text-xs text-slate-500">
              {locked
                ? `Dia fechado às ${today.closedAt ? new Date(today.closedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}`
                : 'Registre suas atividades de hoje'
              }
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setEditingLog(undefined); setPastModal(true) }}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3 py-2 transition-all cursor-pointer"
          >
            <PlusCircle size={13} /> Lançar dia anterior
          </button>
          {locked ? (
            <Button variant="secondary" onClick={handleReopen} className="gap-2 flex items-center">
              <Unlock size={13} /> Reabrir
            </Button>
          ) : (
            <Button onClick={handleClose} className="gap-2 flex items-center bg-green-600 hover:bg-green-500">
              <Lock size={13} /> Fechar dia
            </Button>
          )}
        </div>
      </Card>

      {/* Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Counter
          label="Novos Leads Gerados"
          icon={<UserPlus size={15} className="text-indigo-400" />}
          value={today.newLeads}
          target={DAILY_TARGETS.newLeads}
          disabled={locked}
          accent="bg-indigo-500/15"
          barColor="bg-indigo-500"
          onChange={v => updateToday({ newLeads: v })}
        />
        <Counter
          label="Proprietários Contatados"
          icon={<Phone size={15} className="text-cyan-400" />}
          value={today.ownerCalls}
          target={DAILY_TARGETS.ownerCalls}
          disabled={locked}
          accent="bg-cyan-500/15"
          barColor="bg-cyan-500"
          onChange={v => updateToday({ ownerCalls: v })}
        />
      </div>

      {/* Funnel followup toggle */}
      <Card className={`flex items-center gap-4 border transition-all duration-300
        ${today.funnelFollowup ? 'border-green-500/30' : 'border-white/5'}`}>
        <div className="w-9 h-9 bg-green-500/15 rounded-xl flex items-center justify-center flex-shrink-0">
          <MessageSquare size={16} className="text-green-400" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-200">Followup do Funil (WhatsApp)</p>
          <p className="text-xs text-slate-500">Percorreu todos os leads do funil hoje?</p>
        </div>
        <button
          type="button"
          disabled={locked}
          onClick={() => updateToday({ funnelFollowup: !today.funnelFollowup })}
          className={`relative w-12 h-6 rounded-full transition-all duration-300 flex-shrink-0 cursor-pointer
            disabled:opacity-50 disabled:cursor-not-allowed
            ${today.funnelFollowup ? 'bg-green-500' : 'bg-white/10'}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-300
            ${today.funnelFollowup ? 'left-6' : 'left-0.5'}`} />
        </button>
        {today.funnelFollowup && (
          <CheckCircle2 size={16} className="text-green-400 flex-shrink-0" />
        )}
      </Card>

      {/* Notes toggle */}
      <div>
        <button
          type="button"
          onClick={() => setShowNotes(v => !v)}
          className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer mb-3"
        >
          <StickyNote size={13} />
          {showNotes ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          Observações do dia (opcional)
        </button>
        {showNotes && (
          <textarea
            disabled={locked}
            value={today.notes ?? ''}
            onChange={e => updateToday({ notes: e.target.value })}
            rows={3}
            placeholder="Como foi o dia? Algum destaque, oportunidade ou ponto de atenção..."
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none disabled:opacity-50"
          />
        )}
      </div>

      {/* Week summary strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Leads esta semana',       value: weekLeads,      sub: `meta ${WEEK_TARGET_LEADS} (7 dias)`,   color: 'text-indigo-400' },
          { label: 'Ligações esta semana',     value: weekCalls,      sub: `meta ${WEEK_TARGET_CALLS} (seg–sex)`, color: 'text-cyan-400'   },
          { label: 'Dias de funil',            value: weekFunnel,     sub: `meta ${WEEK_TARGET_FUNNEL} (seg–sáb)`,color: 'text-green-400'  },
          { label: 'Dias fechados na semana',  value: weekDayClosed,  sub: 'de 5 dias úteis',                    color: 'text-amber-400'  },
        ].map(s => (
          <Card key={s.label} className="!py-4">
            <p className="text-xs text-slate-600 mb-1 truncate">{s.label}</p>
            <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-700 mt-0.5">{s.sub}</p>
          </Card>
        ))}
      </div>

      {/* History */}
      {history.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={14} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-300">Histórico recente</h2>
          </div>
          <div className="flex items-center gap-4 px-4 mb-2">
            <span className="w-20 text-xs text-slate-600 uppercase tracking-wider">Data</span>
            <span className="w-16 text-xs text-slate-600 uppercase tracking-wider">Leads</span>
            <span className="w-16 text-xs text-slate-600 uppercase tracking-wider">Propr.</span>
            <span className="w-16 text-xs text-slate-600 uppercase tracking-wider">Funil</span>
            <span className="text-xs text-slate-600 uppercase tracking-wider">Score</span>
          </div>
          <div className="flex flex-col">
            {history.map(log => <HistoryRow key={log.id} log={log} onEdit={openEdit} />)}
          </div>
        </Card>
      )}

      <PastLogModal
        isOpen={pastModalOpen}
        log={editingLog}
        onClose={() => { setPastModal(false); setEditingLog(undefined) }}
      />
    </div>
  )
}
