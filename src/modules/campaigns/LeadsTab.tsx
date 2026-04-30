import { useState, useEffect, useRef, useCallback } from 'react'
import {
  MessageCircle, FileText, Pencil, Trash2, Search, ChevronDown, ThumbsUp, Loader2,
  Clock, ChevronRight, Moon,
} from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { EmptyState } from '../../components/ui/EmptyState'
import { LeadParecerModal } from './LeadParecerModal'
import { LeadEditModal } from './LeadEditModal'
import { CampaignLead, FunnelStage, Campaign } from '../../types'
import { useCampaignLeadsStore } from '../../store/useCampaignLeadsStore'
import { FUNNEL_STAGES, SITUATION_CONFIG } from './config'
import { formatPhone, whatsappUrl } from '../../lib/formatters'
import { DAILY_WARN, DAILY_LIMIT, useDailyCounter } from './dailyCounter'
import { DailyLimitBar } from './DailyLimitBar'
import toast from 'react-hot-toast'

// ─── Cooldown global: bloqueia TODOS os botões após cada disparo ──────────────
// Duração aleatória entre 45s e 150s para parecer comportamento humano

function randomCooldownMs() {
  // Valores possíveis (segundos): 45, 55, 60, 75, 90, 110, 120, 150
  const options = [45, 55, 60, 75, 90, 110, 120, 150]
  return options[Math.floor(Math.random() * options.length)] * 1000
}

async function fireReadyNotification() {
  const title = 'Souza Imobiliária 🚀'
  const body  = 'Chefe, já dá para enviar mais mensagem, boraaa! 💬'
  const opts  = {
    body,
    icon:               '/icon.svg',
    tag:                'cooldown-done',
    requireInteraction: true,   // fica até o usuário fechar no X
    renotify:           true,   // força aparecer mesmo com mesmo tag
  }

  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      // Service Worker: aparece em qualquer aba/janela, mesmo fora de foco
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready
        await reg.showNotification(title, opts)
        return
      }
    } catch (_) { /* fallback abaixo */ }

    // Fallback direto (sem SW)
    new Notification(title, opts)
    return
  }

  // Último recurso: toast persistente dentro do sistema
  toast(body, { icon: '🚀', duration: Infinity })
}

function useGlobalCooldown() {
  const [, setTick]    = useState(0)
  const expiresAtRef   = useRef(0)   // ref evita closure stale no interval
  const wasActiveRef   = useRef(false)

  // Pede permissão de notificação na montagem (Chrome aceita sem gesto)
  // Safari exige gesto — será pedido também no primeiro envio
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Interval único (sem deps) — lê sempre o ref atualizado
  useEffect(() => {
    const id = setInterval(() => {
      setTick(t => t + 1)

      const secs = Math.max(0, Math.ceil((expiresAtRef.current - Date.now()) / 1000))
      if (wasActiveRef.current && secs === 0) {
        wasActiveRef.current = false
        fireReadyNotification().catch(() => {
          toast('🚀 Chefe, já dá para enviar mais mensagem, boraaa!', { duration: Infinity })
        })
      }
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const remaining = () => Math.max(0, Math.ceil((expiresAtRef.current - Date.now()) / 1000))

  const start = () => {
    const ms = randomCooldownMs()
    expiresAtRef.current = Date.now() + ms
    wasActiveRef.current = true
    setTick(t => t + 1)
    return Math.ceil(ms / 1000)
  }

  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission()
    }
  }

  return { remaining, start, requestNotificationPermission }
}

// ─── Horário comercial (8h – 20h) ─────────────────────────────────────────────

function isBusinessHours(): boolean {
  const h = new Date().getHours()
  return h >= 8 && h < 20
}

// ─── Modal para escolher qual mensagem enviar ─────────────────────────────────

interface MessagePickerProps {
  isOpen:    boolean
  onClose:   () => void
  templates: string[]         // todos os templates (já com {nome} substituído)
  onPick:    (msg: string) => void
}

function MessagePickerModal({ isOpen, onClose, templates, onPick }: MessagePickerProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Qual mensagem enviar?" size="sm">
      <p className="text-xs text-slate-500 -mt-2 mb-4">
        Escolha um template diferente a cada envio para reduzir risco de bloqueio.
      </p>
      <div className="flex flex-col gap-2">
        {templates.map((t, i) => (
          <button
            key={i}
            onClick={() => { onPick(t); onClose() }}
            className="flex items-start gap-3 text-left p-3 rounded-xl bg-white/4 border border-white/8 hover:bg-indigo-500/10 hover:border-indigo-500/30 transition-all cursor-pointer group"
          >
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 text-[11px] font-bold flex items-center justify-center mt-0.5">
              {i + 1}
            </span>
            <p className="flex-1 text-xs text-slate-300 line-clamp-3 leading-relaxed">{t}</p>
            <ChevronRight size={14} className="text-slate-700 group-hover:text-indigo-400 transition-colors flex-shrink-0 mt-0.5" />
          </button>
        ))}
      </div>
    </Modal>
  )
}

interface LeadsTabProps {
  leads:      CampaignLead[]
  campaign:   Campaign
  stickyTop?: number
}

const PAGE_SIZE = 50

const stageFilterOptions = [
  { value: 'all', label: 'Todas as etapas' },
  ...FUNNEL_STAGES.map(s => ({ value: s.value, label: s.label })),
]

function StageBadge({ stage }: { stage: FunnelStage }) {
  const cfg = FUNNEL_STAGES.find(s => s.value === stage)!
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-lg ${cfg.bg} ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.short}
    </span>
  )
}

function SituationBadge({ situation }: { situation: CampaignLead['situation'] }) {
  if (!situation) return null
  const cfg = SITUATION_CONFIG.find(s => s.value === situation)!
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-lg ${cfg.bg} ${cfg.color}`} title={cfg.label}>
      {cfg.short}
    </span>
  )
}

export function LeadsTab({ leads, campaign, stickyTop = 0 }: LeadsTabProps) {
  const { remove, markContacted, update } = useCampaignLeadsStore()

  const [search,       setSearch]       = useState('')
  const [stageFilter,  setStageFilter]  = useState<FunnelStage | 'all'>('all')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [parecerLead,  setParecerLead]  = useState<CampaignLead | undefined>()
  const [editLead,     setEditLead]     = useState<CampaignLead | undefined>()
  const [deleteLead,   setDeleteLead]   = useState<CampaignLead | undefined>()

  // ── Cooldown global + picker de mensagem + contador diário ───────────────
  const { remaining, start, requestNotificationPermission } = useGlobalCooldown()
  const { count: dailyCount, increment: dailyIncrement } = useDailyCounter()
  const [pickerLead,    setPickerLead]    = useState<CampaignLead | undefined>()
  const [forceOffHours, setForceOffHours] = useState(false)

  const sentinelRef = useRef<HTMLDivElement>(null)

  // Filtragem
  const filtered = leads.filter(l => {
    const q = search.trim().toLowerCase()
    const matchSearch = !q || l.name.toLowerCase().includes(q) || l.phone.includes(q)
    const matchStage  = stageFilter === 'all' || l.funnelStage === stageFilter
    return matchSearch && matchStage
  })

  const visible = filtered.slice(0, visibleCount)
  const hasMore = visibleCount < filtered.length

  // Resetar paginação quando filtro muda
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [search, stageFilter])

  // Scroll infinito via IntersectionObserver
  const loadMore = useCallback(() => {
    setVisibleCount(c => Math.min(c + PAGE_SIZE, filtered.length))
  }, [filtered.length])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) return

    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) loadMore() },
      { rootMargin: '300px' }   // carrega 300 px antes do fim
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loadMore])

  // ── Ações ────────────────────────────────────────────────────────────────────

  // Todos os templates da campanha (principal + extras), com {nome} substituído
  function getTemplates(lead: CampaignLead): string[] {
    const firstName = lead.name.trim().split(/\s+/)[0]
    const all = [campaign.message, ...(campaign.messages ?? [])]
    return all.map(m => m.replace(/\{nome\}/gi, firstName))
  }

  function sendWhatsApp(lead: CampaignLead, msg: string) {
    window.open(whatsappUrl(lead.phone, msg), '_blank')  // primeiro — usa o gesto do clique
    requestNotificationPermission()   // depois — async, não bloqueia o open
    const secs  = start()             // cooldown global aleatório
    const total = dailyIncrement()    // incrementa contador do dia
    setForceOffHours(false)

    const wasNew = lead.funnelStage === 'new'
    markContacted(lead.id)

    if (total >= DAILY_WARN && total < DAILY_LIMIT) {
      toast(`⚠️ ${total} disparos hoje — limite recomendado é ${DAILY_WARN}. Cuidado com o banimento!`,
        { duration: 5000, icon: '⚠️' })
    } else if (wasNew) {
      toast.success(`1ª mensagem enviada! Próximo envio em ${secs}s.`)
    } else {
      toast.success(`Mensagem enviada. Próximo envio em ${secs}s.`)
    }
  }

  function handleWhatsApp(lead: CampaignLead) {
    // 1. Cooldown global ainda ativo?
    const secs = remaining()
    if (secs > 0) {
      toast.error(`Aguarde ${secs}s antes do próximo envio.`)
      return
    }

    // 2. Fora do horário comercial (8h–20h)?
    if (!isBusinessHours() && !forceOffHours) {
      toast(
        t => (
          <span className="flex flex-col gap-1.5">
            <span className="font-semibold text-amber-300 flex items-center gap-1.5">
              🌙 Fora do horário comercial
            </span>
            <span className="text-xs text-slate-300">
              Enviar mensagens entre 20h e 8h aumenta o risco de banimento.
            </span>
            <button
              onClick={() => { toast.dismiss(t.id); setForceOffHours(true) }}
              className="mt-1 text-xs underline text-amber-400 text-left cursor-pointer"
            >
              Enviar mesmo assim →
            </button>
          </span>
        ),
        { duration: 8000, style: { background: '#1e1a0e', border: '1px solid #92400e' } }
      )
      return
    }

    // 3. Limite diário atingido?
    if (dailyCount >= DAILY_LIMIT) {
      toast.error(`Limite de ${DAILY_LIMIT} disparos diários atingido. Retome amanhã para proteger seu número.`,
        { duration: 6000 })
      return
    }

    const templates = getTemplates(lead)
    if (templates.length > 1) {
      setPickerLead(lead)
    } else {
      sendWhatsApp(lead, templates[0])
    }
  }

  function handleAdvanceFunnel(lead: CampaignLead) {
    const STAGES: FunnelStage[] = ['new', 'sent', 'attended', 'scheduled', 'presentation', 'proposal', 'sale']
    const currentIdx = STAGES.indexOf(lead.funnelStage)
    if (lead.funnelStage === 'attended') {
      toast('Lead já está em "Demonstrou Interesse"', { icon: '👍' })
      return
    }
    if (currentIdx >= STAGES.indexOf('attended')) {
      toast('Lead já está em uma etapa avançada', { icon: 'ℹ️' })
      return
    }
    update(lead.id, { funnelStage: 'attended' })
    toast.success(`${lead.name} avançou para "Demonstrou Interesse"!`)
  }

  function handleDelete() {
    if (!deleteLead) return
    remove(deleteLead.id)
    toast.success('Lead removido')
    setDeleteLead(undefined)
  }

  // ── Summary chips ─────────────────────────────────────────────────────────────

  const total      = leads.length
  const contacted  = leads.filter(l => l.firstContactAt).length
  const interested = leads.filter(l => l.funnelStage === 'attended').length
  const engaging   = leads.filter(l => ['attended','scheduled','presentation','proposal','sale'].includes(l.funnelStage)).length
  const proposals  = leads.filter(l => l.funnelStage === 'proposal').length
  const sales      = leads.filter(l => l.funnelStage === 'sale').length

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">

      {/* ── Barra de limite diário — sticky, acompanha o scroll ──────────── */}
      <div className="sticky z-20 -mx-4 px-4 pb-2 pt-1 bg-[#0d0f1a]" style={{ top: stickyTop }}>
        <DailyLimitBar count={dailyCount} />

        {/* Cooldown + fora de horário — abaixo da barra quando ativos */}
        {(remaining() > 0 || !isBusinessHours()) && (
          <div className="flex flex-wrap gap-2 mt-2">
            {remaining() > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-500/10 border border-slate-500/20 text-slate-400 text-xs">
                <Clock size={11} />
                <span className="tabular-nums font-bold">{remaining()}s</span>
                <span className="text-slate-600">aguardando</span>
              </div>
            )}
            {!isBusinessHours() && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
                <Moon size={11} />
                <span>Fora do horário comercial</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'Total',                 value: total,      color: 'text-slate-400',  bg: 'bg-white/5'         },
          { label: 'Acionados',             value: contacted,  color: 'text-blue-400',   bg: 'bg-blue-500/10'     },
          { label: 'Demonstrou Interesse',  value: interested, color: 'text-cyan-400',   bg: 'bg-cyan-500/10'     },
          { label: 'Em andamento',          value: engaging,   color: 'text-violet-400', bg: 'bg-violet-500/10'   },
          { label: 'Propostas',             value: proposals,  color: 'text-amber-400',  bg: 'bg-amber-500/10'    },
          { label: 'Vendas',                value: sales,      color: 'text-green-400',  bg: 'bg-green-500/10'    },
        ].map(s => (
          <div key={s.label} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl ${s.bg} border border-white/8`}>
            <span className={`text-sm font-bold tabular-nums ${s.color}`}>{s.value.toLocaleString('pt-BR')}</span>
            <span className="text-xs text-slate-500">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
        </div>
        <div className="relative">
          <select
            value={stageFilter}
            onChange={e => { setStageFilter(e.target.value as FunnelStage | 'all') }}
            className="appearance-none bg-white/5 border border-white/10 rounded-xl pl-3 pr-8 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
          >
            {stageFilterOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        </div>
      </div>

      {/* Contador de resultados */}
      {filtered.length > 0 && (
        <p className="text-xs text-slate-600">
          Exibindo{' '}
          <span className="text-slate-400 font-medium">{Math.min(visibleCount, filtered.length).toLocaleString('pt-BR')}</span>
          {' '}de{' '}
          <span className="text-slate-400 font-medium">{filtered.length.toLocaleString('pt-BR')}</span>
          {' '}leads{stageFilter !== 'all' || search ? ' (filtrado)' : ''}
        </p>
      )}

      {/* Tabela */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Search size={24} />}
          title={search || stageFilter !== 'all' ? 'Nenhum lead encontrado' : 'Nenhum lead importado'}
          description={search || stageFilter !== 'all' ? 'Tente ajustar os filtros.' : 'Importe uma lista XLSX para começar.'}
        />
      ) : (
        <Card className="!p-0 overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_140px_170px_160px_120px] gap-0 px-5 py-3 border-b border-white/8 text-xs text-slate-600 uppercase tracking-wider font-medium">
            <span>Nome</span>
            <span>Telefone</span>
            <span>Etapa</span>
            <span>Situação</span>
            <span className="text-right">Ações</span>
          </div>

          <div className="divide-y divide-white/5">
            {visible.map(lead => {
              const secs = remaining()
              const onCd = secs > 0
              return (
              <div
                key={lead.id}
                className="grid grid-cols-[1fr_140px_170px_160px_120px] gap-0 px-5 py-3.5 items-center hover:bg-white/3 transition-colors group"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{lead.name}</p>
                  {lead.email && <p className="text-xs text-slate-600 truncate">{lead.email}</p>}
                </div>
                <span className="text-sm text-slate-400 tabular-nums">{formatPhone(lead.phone)}</span>
                <span><StageBadge stage={lead.funnelStage} /></span>
                <span>
                  {lead.situation
                    ? <SituationBadge situation={lead.situation} />
                    : <span className="text-xs text-slate-700">—</span>
                  }
                </span>
                <div className="flex items-center justify-end gap-1">
                  {/* Countdown: fixo e sempre visível enquanto ativo, some quando termina */}
                  {onCd && (
                    <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-500/10 border border-slate-500/20 text-slate-400 text-[10px] font-bold tabular-nums select-none">
                      <Clock size={11} />
                      {secs}s
                    </span>
                  )}

                  {/* Botões de ação: só aparecem no hover */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* WhatsApp: só quando não há cooldown */}
                    {!onCd && (
                      <button
                        onClick={() => handleWhatsApp(lead)}
                        className="p-1.5 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 transition-colors cursor-pointer"
                        title="Abrir WhatsApp"
                      >
                        <MessageCircle size={13} />
                      </button>
                    )}
                    <button
                      onClick={() => setParecerLead(lead)}
                      className="p-1.5 rounded-lg hover:bg-indigo-500/10 text-slate-600 hover:text-indigo-400 transition-colors cursor-pointer"
                      title="Parecer"
                    >
                      <FileText size={13} />
                    </button>
                    <button
                      onClick={() => setEditLead(lead)}
                      className="p-1.5 rounded-lg hover:bg-white/8 text-slate-600 hover:text-slate-300 transition-colors cursor-pointer"
                      title="Editar"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleAdvanceFunnel(lead)}
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        lead.funnelStage === 'attended' || ['scheduled','presentation','proposal','sale'].includes(lead.funnelStage)
                          ? 'text-cyan-500/40 cursor-default'
                          : 'hover:bg-cyan-500/10 text-slate-600 hover:text-cyan-400'
                      }`}
                      title="Avançar para Demonstrou Interesse"
                    >
                      <ThumbsUp size={13} />
                    </button>
                    <button
                      onClick={() => setDeleteLead(lead)}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-colors cursor-pointer"
                      title="Excluir"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            )})}
          </div>

          {/* Sentinel para scroll infinito */}
          <div ref={sentinelRef} className="h-1" />

          {/* Indicador de carregando mais */}
          {hasMore && (
            <div className="flex items-center justify-center gap-2 py-4 border-t border-white/5">
              <Loader2 size={14} className="animate-spin text-indigo-400" />
              <span className="text-xs text-slate-500">
                Carregando mais leads...
              </span>
            </div>
          )}
        </Card>
      )}

      <LeadParecerModal
        isOpen={Boolean(parecerLead)}
        onClose={() => setParecerLead(undefined)}
        lead={parecerLead}
        campaign={campaign}
      />
      <LeadEditModal
        isOpen={Boolean(editLead)}
        onClose={() => setEditLead(undefined)}
        lead={editLead}
      />

      {/* Picker de mensagem */}
      <MessagePickerModal
        isOpen={Boolean(pickerLead)}
        onClose={() => setPickerLead(undefined)}
        templates={pickerLead ? getTemplates(pickerLead) : []}
        onPick={msg => pickerLead && sendWhatsApp(pickerLead, msg)}
      />

      <Modal isOpen={Boolean(deleteLead)} onClose={() => setDeleteLead(undefined)} title="Remover lead" size="sm">
        <p className="text-sm text-slate-400 mb-6">
          Remover <span className="text-slate-200 font-medium">"{deleteLead?.name}"</span> desta campanha?
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setDeleteLead(undefined)}>Cancelar</Button>
          <Button variant="danger"    className="flex-1" onClick={handleDelete}>Remover</Button>
        </div>
      </Modal>
    </div>
  )
}
