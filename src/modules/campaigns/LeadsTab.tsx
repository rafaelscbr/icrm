import { useState, useEffect, useRef, useCallback } from 'react'
import {
  MessageCircle, FileText, Pencil, Trash2, Search, ChevronDown,
  ThumbsUp, Loader2, Clock, Moon, ChevronRight,
} from 'lucide-react'
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
import { useDisparosStore } from '../../store/useDisparosStore'
import { DailyLimitBar } from './DailyLimitBar'
import toast from 'react-hot-toast'

// ─── Cooldown ─────────────────────────────────────────────────────────────────

function randomCooldownMs() {
  const options = [45, 55, 60, 75, 90, 110, 120, 150]
  return options[Math.floor(Math.random() * options.length)] * 1000
}

// Retorna uma promise que rejeita após N ms — evita que serviceWorker.ready trave para sempre
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

async function fireReadyNotification() {
  const title = '⚡ Pronto para disparar!'
  const body  = 'Rafinha, cooldown encerrou — pode mandar a próxima mensagem! 🚀'

  const opts = {
    body,
    icon:               '/icon-192x192.png',
    badge:              '/icon-192x192.png',
    tag:                'cooldown-ready',
    requireInteraction: true,   // fica na tela até clicar ou fechar
    renotify:           true,   // força reaparecer mesmo com tag igual
    silent:             false,
  } as NotificationOptions & { renotify: boolean; silent: boolean; badge: string }

  if (!('Notification' in window) || Notification.permission !== 'granted') return false

  // Tenta via Service Worker (funciona mesmo sem foco na aba)
  if ('serviceWorker' in navigator) {
    try {
      const reg = await withTimeout(navigator.serviceWorker.ready, 3000)
      await reg.showNotification(title, opts)
      return true
    } catch (_) { /* fallback abaixo */ }
  }

  // Fallback: Notification API direto
  try {
    const n = new Notification(title, opts)
    n.onclick = () => { window.focus(); n.close() }
    return true
  } catch (_) { return false }
}

function useGlobalCooldown() {
  const [, setTick]   = useState(0)
  const [isReady, setIsReady] = useState(false)  // banner interno quando cooldown termina
  const expiresAtRef  = useRef(0)
  const wasActiveRef  = useRef(false)

  // Intervalo de 1s — lê refs atualizados sem closure stale
  useEffect(() => {
    const id = setInterval(() => {
      setTick(t => t + 1)
      const secs = Math.max(0, Math.ceil((expiresAtRef.current - Date.now()) / 1000))
      if (wasActiveRef.current && secs === 0) {
        wasActiveRef.current = false
        setIsReady(true)
        // Tenta notificação nativa; se falhar usa toast persistente como último recurso
        fireReadyNotification().then(ok => {
          if (!ok) toast('⚡ Pronto! Pode disparar a próxima mensagem.', { icon: '🚀', duration: Infinity })
        }).catch(() => {
          toast('⚡ Pronto! Pode disparar a próxima mensagem.', { icon: '🚀', duration: Infinity })
        })
      }
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const remaining = () => Math.max(0, Math.ceil((expiresAtRef.current - Date.now()) / 1000))

  const start = () => {
    // Pede permissão aqui — ainda dentro do gesto do clique do usuário
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()  // fire-and-forget intencional
    }
    const ms = randomCooldownMs()
    expiresAtRef.current = Date.now() + ms
    wasActiveRef.current = true
    setIsReady(false)
    setTick(t => t + 1)
    return Math.ceil(ms / 1000)
  }

  const clearReady = () => setIsReady(false)

  return { remaining, start, isReady, clearReady }
}

function isBusinessHours(): boolean {
  const h = new Date().getHours()
  return h >= 8 && h < 20
}

// ─── Message picker ───────────────────────────────────────────────────────────

function MessagePickerModal({ isOpen, onClose, templates, onPick }: {
  isOpen: boolean; onClose: () => void
  templates: string[]; onPick: (msg: string, index: number) => void
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Qual mensagem enviar?" size="sm">
      <p className="text-xs text-slate-500 -mt-2 mb-4">
        Varie os templates a cada envio para reduzir risco de bloqueio.
      </p>
      <div className="flex flex-col gap-2">
        {templates.map((t, i) => (
          <button key={i} onClick={() => { onPick(t, i); onClose() }}
            className="flex items-start gap-3 text-left p-3 rounded-xl bg-white/4 border border-white/8 hover:bg-indigo-500/10 hover:border-indigo-500/30 transition-all cursor-pointer group">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 text-[11px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
            <p className="flex-1 text-xs text-slate-300 line-clamp-3 leading-relaxed">{t}</p>
            <ChevronRight size={14} className="text-slate-700 group-hover:text-indigo-400 transition-colors flex-shrink-0 mt-0.5" />
          </button>
        ))}
      </div>
    </Modal>
  )
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function StageBadge({ stage }: { stage: FunnelStage }) {
  const cfg = FUNNEL_STAGES.find(s => s.value === stage)!
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-lg ${cfg.bg} ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.short}
    </span>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface LeadsTabProps {
  leads:      CampaignLead[]
  campaign:   Campaign
  stickyTop?: number
}

const PAGE_SIZE = 60

// ─── Componente ───────────────────────────────────────────────────────────────

export function LeadsTab({ leads, campaign, stickyTop = 0 }: LeadsTabProps) {
  const { remove, markContacted, update } = useCampaignLeadsStore()

  const [search,          setSearch]          = useState('')
  const [visibleQueue,    setVisibleQueue]    = useState(PAGE_SIZE)
  const [visibleContacted,setVisibleContacted]= useState(PAGE_SIZE)
  const [parecerLead,     setParecerLead]     = useState<CampaignLead | undefined>()
  const [editLead,        setEditLead]        = useState<CampaignLead | undefined>()
  const [deleteLead,      setDeleteLead]      = useState<CampaignLead | undefined>()
  const [showContacted,   setShowContacted]   = useState(true)
  const [showDisqualified,setShowDisqualified]= useState(false)
  const [pickerLead,      setPickerLead]      = useState<CampaignLead | undefined>()
  const [forceOffHours,   setForceOffHours]   = useState(false)
  const [excludedIds,     setExcludedIds]     = useState<Set<string>>(new Set())

  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sentinelQRef     = useRef<HTMLDivElement>(null)
  const sentinelCRef     = useRef<HTMLDivElement>(null)

  const { remaining, start, isReady, clearReady }        = useGlobalCooldown()
  const { count: dailyCount, increment: dailyIncrement } = useDailyCounter()
  const { increment: persistDisparo }                    = useDisparosStore()

  // ── Filtragem e agrupamento ───────────────────────────────────────────────

  const q = search.trim().toLowerCase()
  const matchSearch = (l: CampaignLead) =>
    !q || l.name.toLowerCase().includes(q) || l.phone.includes(q)

  const allFiltered = leads.filter(l => !excludedIds.has(l.id) && matchSearch(l))

  // 1. Fila: nunca contatados, sem situação especial — mais antigos primeiro
  const queueLeads = allFiltered
    .filter(l => l.funnelStage === 'new' && !l.situation)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  // 2. Já acionados: tiveram contato ou avançaram no funil
  const contactedLeads = allFiltered
    .filter(l => l.funnelStage !== 'new' && !l.situation)
    .sort((a, b) => {
      const aT = a.stageUpdatedAt ?? a.firstContactAt ?? a.updatedAt ?? a.createdAt
      const bT = b.stageUpdatedAt ?? b.firstContactAt ?? b.updatedAt ?? b.createdAt
      return bT.localeCompare(aT)
    })

  // 3. Desqualificados: têm situação (sem interesse / inválido / parar msgs)
  const disqualLeads = allFiltered
    .filter(l => !!l.situation)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  // Scroll infinito
  useEffect(() => { setVisibleQueue(PAGE_SIZE); setVisibleContacted(PAGE_SIZE) }, [search])

  const loadMoreQueue     = useCallback(() => setVisibleQueue    (c => Math.min(c + PAGE_SIZE, queueLeads.length)),     [queueLeads.length])
  const loadMoreContacted = useCallback(() => setVisibleContacted(c => Math.min(c + PAGE_SIZE, contactedLeads.length)), [contactedLeads.length])

  useEffect(() => {
    const el = sentinelQRef.current
    if (!el || visibleQueue >= queueLeads.length) return
    const obs = new IntersectionObserver(e => { if (e[0].isIntersecting) loadMoreQueue() }, { rootMargin: '300px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [visibleQueue, queueLeads.length, loadMoreQueue])

  useEffect(() => {
    const el = sentinelCRef.current
    if (!el || visibleContacted >= contactedLeads.length) return
    const obs = new IntersectionObserver(e => { if (e[0].isIntersecting) loadMoreContacted() }, { rootMargin: '300px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [visibleContacted, contactedLeads.length, loadMoreContacted])

  // ── Ações ─────────────────────────────────────────────────────────────────

  function getTemplates(lead: CampaignLead): string[] {
    const firstName = lead.name.trim().split(/\s+/)[0]
    const all = [campaign.message, ...(campaign.messages ?? [])]
    return all.map(m => m.replace(/\{nome\}/gi, firstName))
  }

  function sendWhatsApp(lead: CampaignLead, msg: string, templateIndex: number) {
    window.open(whatsappUrl(lead.phone, msg), '_blank')
    clearReady()          // esconde o banner "pronto" ao iniciar novo disparo
    const secs  = start() // pede permissão de notificação + inicia cooldown
    const total = dailyIncrement()
    persistDisparo()      // persiste no Supabase (fonte de verdade para metas)
    setForceOffHours(false)
    const wasNew = lead.funnelStage === 'new'
    markContacted(lead.id, msg, templateIndex)
    if (total >= DAILY_WARN && total < DAILY_LIMIT) {
      toast(`⚠️ ${total} disparos hoje — limite ${DAILY_WARN} recomendado. Cuidado com o ban!`, { duration: 5000, icon: '⚠️' })
    } else if (wasNew) {
      toast.success(`1ª mensagem enviada! Próximo disparo em ${secs}s.`)
    } else {
      toast.success(`Mensagem enviada. Próximo disparo em ${secs}s.`)
    }
  }

  function handleWhatsApp(lead: CampaignLead) {
    const secs = remaining()
    if (secs > 0) { toast.error(`Aguarde ${secs}s antes do próximo envio.`); return }
    if (!isBusinessHours() && !forceOffHours) {
      toast(t => (
        <span className="flex flex-col gap-1.5">
          <span className="font-semibold text-amber-300 flex items-center gap-1.5">🌙 Fora do horário comercial</span>
          <span className="text-xs text-slate-300">Enviar entre 20h e 8h aumenta o risco de banimento.</span>
          <button onClick={() => { toast.dismiss(t.id); setForceOffHours(true) }}
            className="mt-1 text-xs underline text-amber-400 text-left cursor-pointer">
            Enviar mesmo assim →
          </button>
        </span>
      ), { duration: 8000, style: { background: '#1e1a0e', border: '1px solid #92400e' } })
      return
    }
    if (dailyCount >= DAILY_LIMIT) {
      toast.error(`Limite de ${DAILY_LIMIT} disparos diários atingido. Retome amanhã.`, { duration: 6000 })
      return
    }
    const templates = getTemplates(lead)
    if (templates.length > 1) setPickerLead(lead)
    else sendWhatsApp(lead, templates[0], 0)
  }

  function handleInterested(lead: CampaignLead) {
    if (['attended','scheduled','presentation','proposal','sale'].includes(lead.funnelStage)) {
      toast('Lead já está em etapa avançada', { icon: 'ℹ️' }); return
    }
    update(lead.id, { funnelStage: 'attended' })
    toast.success(`${lead.name} marcado como interessado!`)
  }

  function handleDelete() {
    if (!deleteLead) return
    const lead = deleteLead
    setDeleteLead(undefined)
    setExcludedIds(prev => new Set([...prev, lead.id]))
    deleteTimeoutRef.current = setTimeout(() => {
      remove(lead.id)
      setExcludedIds(prev => { const s = new Set(prev); s.delete(lead.id); return s })
    }, 5000)
    toast(t => (
      <div className="flex items-center gap-3">
        <span className="text-sm">Lead removido</span>
        <button onClick={() => {
          clearTimeout(deleteTimeoutRef.current!)
          setExcludedIds(prev => { const s = new Set(prev); s.delete(lead.id); return s })
          toast.dismiss(t.id)
        }} className="text-xs text-indigo-400 font-semibold underline cursor-pointer">Desfazer</button>
      </div>
    ), { duration: 5000 })
  }

  // ── Cooldown global ───────────────────────────────────────────────────────

  const secs  = remaining()
  const onCd  = secs > 0
  const atLim = dailyCount >= DAILY_LIMIT

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-0">

      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <div className="sticky z-20 -mx-6 px-6 pb-3 pt-1 nav-bg" style={{ top: stickyTop }}>
        <DailyLimitBar count={dailyCount} />

          {/* ── Banner PRONTO — fixo, só some quando dispara de novo ── */}
        {isReady && !atLim && (
          <div className="mt-2 flex items-center gap-3 px-4 py-3 rounded-xl bg-green-500/15 border border-green-400/40 ring-1 ring-green-400/20 animate-pulse-once">
            <span className="text-xl">⚡</span>
            <div className="flex-1">
              <p className="text-sm font-bold text-green-300 leading-none">Pronto para disparar!</p>
              <p className="text-[11px] text-green-500/80 mt-0.5">Cooldown encerrou — clique em Disparar para enviar a próxima mensagem.</p>
            </div>
            <button
              onClick={clearReady}
              className="text-green-600 hover:text-green-400 transition-colors p-1"
              title="Fechar"
            >
              ✕
            </button>
          </div>
        )}

        {/* Status global de cooldown — one place, not per-row */}
        {(onCd || !isBusinessHours() || atLim) && (
          <div className="flex flex-wrap gap-2 mt-2">
            {atLim && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/25 text-red-400 text-xs font-semibold">
                🚫 Limite diário atingido — retome amanhã
              </div>
            )}
            {!atLim && onCd && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-slate-300 text-xs">
                <Clock size={12} className="text-slate-500" />
                <span>Próximo disparo em</span>
                <span className="font-black tabular-nums text-white text-sm">{secs}s</span>
              </div>
            )}
            {!isBusinessHours() && !atLim && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
                <Moon size={11} /> Fora do horário comercial (8h–20h)
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Busca + resumo ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar nome ou telefone…"
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
        </div>
        {/* Mini resumo inline */}
        <div className="flex items-center gap-3 text-xs text-slate-500 flex-shrink-0">
          <span><span className="text-white font-bold tabular-nums">{queueLeads.length}</span> na fila</span>
          <span className="text-white/10">|</span>
          <span><span className="text-cyan-400 font-bold tabular-nums">{contactedLeads.length}</span> acionados</span>
          <span className="text-white/10">|</span>
          <span><span className="text-green-400 font-bold tabular-nums">{leads.filter(l => l.funnelStage === 'sale').length}</span> vendas</span>
        </div>
      </div>

      {leads.length === 0 ? (
        <EmptyState icon={<MessageCircle size={24} />} title="Nenhum lead importado"
          description="Importe uma lista XLSX para começar a disparar." />
      ) : (
        <>

        {/* ══════════════════════════════════════════════════════════════════
            SEÇÃO 1 — FILA DE DISPARO
        ══════════════════════════════════════════════════════════════════ */}
        <div className="mb-6">
          {/* Header da seção */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <h3 className="text-sm font-bold text-white">Fila de disparo</h3>
            </div>
            <span className="text-xs bg-green-500/15 text-green-400 border border-green-500/25 px-2.5 py-0.5 rounded-full font-bold tabular-nums">
              {queueLeads.length}
            </span>
            <div className="flex-1 h-px bg-white/6" />
            <span className="text-[10px] text-slate-600 uppercase tracking-wider">não acionados · mais antigos primeiro</span>
          </div>

          {queueLeads.length === 0 ? (
            <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-green-500/5 border border-green-500/15">
              <span className="text-2xl">✅</span>
              <div>
                <p className="text-sm font-semibold text-green-400">Fila zerada!</p>
                <p className="text-xs text-slate-500">Todos os leads desta campanha já foram acionados.</p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-white/8 overflow-hidden bg-[#0D1117]">
              {/* Header da tabela */}
              <div className="grid grid-cols-[1fr_160px_auto] gap-4 px-5 py-2.5 border-b border-white/6 text-[10px] text-slate-600 uppercase tracking-wider font-semibold">
                <span>Nome</span>
                <span>Telefone</span>
                <span className="w-28 text-center">Ação</span>
              </div>

              <div className="divide-y divide-white/5">
                {queueLeads.slice(0, visibleQueue).map((lead, idx) => {
                  const isNext = idx === 0 && !onCd && !atLim
                  return (
                    <div key={lead.id}
                      className={`grid grid-cols-[1fr_160px_auto] gap-4 px-5 py-3 items-center transition-colors
                        ${isNext ? 'bg-green-500/5' : 'hover:bg-white/3'}`}>

                      <div className="flex items-center gap-3 min-w-0">
                        {/* Avatar */}
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0
                          ${isNext ? 'bg-green-500/20 text-green-300' : 'bg-white/6 text-slate-400'}`}>
                          {lead.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-medium truncate ${isNext ? 'text-white' : 'text-slate-300'}`}>
                            {lead.name}
                          </p>
                          {lead.extra && (
                            <p className="text-[10px] text-slate-600 truncate">{lead.extra}</p>
                          )}
                        </div>
                      </div>

                      <span className="text-sm text-slate-500 tabular-nums font-mono">
                        {formatPhone(lead.phone)}
                      </span>

                      {/* Botão de disparo — sempre visível */}
                      <div className="w-28 flex justify-center">
                        {atLim ? (
                          <span className="text-[11px] text-red-400/60">limite atingido</span>
                        ) : onCd ? (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/50 border border-white/8 text-slate-400 text-xs tabular-nums">
                            <Clock size={11} /> {secs}s
                          </div>
                        ) : (
                          <button
                            onClick={() => handleWhatsApp(lead)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95
                              ${isNext
                                ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-600/20'
                                : 'bg-green-500/15 hover:bg-green-500/25 text-green-400 border border-green-500/25'
                              }`}
                          >
                            <MessageCircle size={13} />
                            {isNext ? 'Disparar agora' : 'Disparar'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div ref={sentinelQRef} className="h-1" />
              {visibleQueue < queueLeads.length && (
                <div className="flex items-center justify-center gap-2 py-3 border-t border-white/5">
                  <Loader2 size={13} className="animate-spin text-slate-600" />
                  <span className="text-xs text-slate-600">Carregando mais…</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            SEÇÃO 2 — JÁ ACIONADOS
        ══════════════════════════════════════════════════════════════════ */}
        {contactedLeads.length > 0 && (
          <div className="mb-6">
            <button
              onClick={() => setShowContacted(v => !v)}
              className="flex items-center gap-3 w-full mb-3 group"
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                <h3 className="text-sm font-bold text-slate-400 group-hover:text-slate-200 transition-colors">Já acionados</h3>
              </div>
              <span className="text-xs bg-blue-500/15 text-blue-400 border border-blue-500/20 px-2.5 py-0.5 rounded-full font-bold tabular-nums">
                {contactedLeads.length}
              </span>
              <div className="flex-1 h-px bg-white/6" />
              <ChevronDown size={13} className={`text-slate-600 transition-transform ${showContacted ? 'rotate-180' : ''}`} />
            </button>

            {showContacted && (
              <div className="rounded-xl border border-white/8 overflow-hidden bg-[#0D1117]">
                <div className="grid grid-cols-[140px_1fr_160px_auto] gap-4 px-5 py-2.5 border-b border-white/6 text-[10px] text-slate-600 uppercase tracking-wider font-semibold">
                  <span>Etapa</span>
                  <span>Nome</span>
                  <span>Telefone</span>
                  <span className="w-24 text-right">Ações</span>
                </div>

                <div className="divide-y divide-white/5">
                  {contactedLeads.slice(0, visibleContacted).map(lead => {
                    const cdActive = onCd || atLim
                    const situCfg  = lead.situation ? SITUATION_CONFIG.find(s => s.value === lead.situation) : null
                    return (
                      <div key={lead.id}
                        className="grid grid-cols-[140px_1fr_160px_auto] gap-4 px-5 py-2.5 items-center hover:bg-white/3 transition-colors group">

                        <div className="flex items-center gap-2">
                          <StageBadge stage={lead.funnelStage} />
                          {situCfg && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${situCfg.bg} ${situCfg.color}`}>
                              {situCfg.short}
                            </span>
                          )}
                        </div>

                        <p className="text-sm text-slate-300 truncate">{lead.name}</p>

                        <span className="text-sm text-slate-600 tabular-nums font-mono">
                          {formatPhone(lead.phone)}
                        </span>

                        {/* Ações — visíveis no hover */}
                        <div className="w-24 flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          {!cdActive && (
                            <button onClick={() => handleWhatsApp(lead)}
                              className="p-1.5 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 transition-colors cursor-pointer"
                              title="WhatsApp">
                              <MessageCircle size={13} />
                            </button>
                          )}
                          <button onClick={() => handleInterested(lead)}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              ['attended','scheduled','presentation','proposal','sale'].includes(lead.funnelStage)
                                ? 'text-cyan-500/30 cursor-default'
                                : 'hover:bg-cyan-500/10 text-slate-600 hover:text-cyan-400'
                            }`}
                            title="Marcar como interessado">
                            <ThumbsUp size={13} />
                          </button>
                          <button onClick={() => setParecerLead(lead)}
                            className="p-1.5 rounded-lg hover:bg-indigo-500/10 text-slate-600 hover:text-indigo-400 transition-colors cursor-pointer"
                            title="Parecer">
                            <FileText size={13} />
                          </button>
                          <button onClick={() => setEditLead(lead)}
                            className="p-1.5 rounded-lg hover:bg-white/8 text-slate-600 hover:text-slate-300 transition-colors cursor-pointer"
                            title="Editar">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => setDeleteLead(lead)}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-colors cursor-pointer"
                            title="Remover">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div ref={sentinelCRef} className="h-1" />
                {visibleContacted < contactedLeads.length && (
                  <div className="flex items-center justify-center gap-2 py-3 border-t border-white/5">
                    <Loader2 size={13} className="animate-spin text-slate-600" />
                    <span className="text-xs text-slate-600">Carregando mais…</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            SEÇÃO 3 — DESQUALIFICADOS (colapsável, fechado por padrão)
        ══════════════════════════════════════════════════════════════════ */}
        {disqualLeads.length > 0 && (
          <div className="mb-4">
            <button
              onClick={() => setShowDisqualified(v => !v)}
              className="flex items-center gap-3 w-full mb-3 group"
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-slate-600" />
                <h3 className="text-sm font-bold text-slate-600 group-hover:text-slate-400 transition-colors">Sem interesse / Inválidos</h3>
              </div>
              <span className="text-xs bg-white/5 text-slate-600 border border-white/8 px-2.5 py-0.5 rounded-full font-bold tabular-nums">
                {disqualLeads.length}
              </span>
              <div className="flex-1 h-px bg-white/4" />
              <ChevronDown size={13} className={`text-slate-700 transition-transform ${showDisqualified ? 'rotate-180' : ''}`} />
            </button>

            {showDisqualified && (
              <div className="rounded-xl border border-white/5 overflow-hidden opacity-60">
                <div className="divide-y divide-white/4">
                  {disqualLeads.map(lead => {
                    const situCfg = SITUATION_CONFIG.find(s => s.value === lead.situation)
                    return (
                      <div key={lead.id}
                        className="flex items-center gap-4 px-5 py-2.5 hover:bg-white/2 transition-colors group">
                        <span className={`text-[11px] px-2 py-0.5 rounded-lg font-medium ${situCfg?.bg ?? 'bg-white/5'} ${situCfg?.color ?? 'text-slate-500'}`}>
                          {situCfg?.short ?? '—'}
                        </span>
                        <p className="flex-1 text-sm text-slate-500 truncate">{lead.name}</p>
                        <span className="text-xs text-slate-700 tabular-nums font-mono">{formatPhone(lead.phone)}</span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setEditLead(lead)}
                            className="p-1.5 rounded-lg hover:bg-white/8 text-slate-700 hover:text-slate-400 transition-colors cursor-pointer">
                            <Pencil size={12} />
                          </button>
                          <button onClick={() => setDeleteLead(lead)}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-700 hover:text-red-400 transition-colors cursor-pointer">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        </>
      )}

      {/* ── Modais ────────────────────────────────────────────────────────── */}
      <LeadParecerModal
        isOpen={Boolean(parecerLead)} onClose={() => setParecerLead(undefined)}
        lead={parecerLead} campaign={campaign}
      />
      <LeadEditModal
        isOpen={Boolean(editLead)} onClose={() => setEditLead(undefined)} lead={editLead}
      />
      <MessagePickerModal
        isOpen={Boolean(pickerLead)} onClose={() => setPickerLead(undefined)}
        templates={pickerLead ? getTemplates(pickerLead) : []}
        onPick={(msg, idx) => pickerLead && sendWhatsApp(pickerLead, msg, idx)}
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
