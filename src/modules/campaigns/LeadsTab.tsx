import { useState, useEffect, useRef, useCallback } from 'react'
import {
  MessageCircle, FileText, Pencil, Trash2, Search, ChevronDown,
  ThumbsUp, Loader2, Clock, Moon, AlertCircle,
} from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { EmptyState } from '../../components/ui/EmptyState'
import { LeadParecerModal } from './LeadParecerModal'
import { LeadEditModal } from './LeadEditModal'
import { CampaignLead, FunnelStage, Campaign } from '../../types'
import { useCampaignLeadsStore } from '../../store/useCampaignLeadsStore'
import { useAuthStore } from '../../store/useAuthStore'
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

function MessagePickerModal({ isOpen, onClose, templates, onPick, leadName }: {
  isOpen: boolean; onClose: () => void
  templates: string[]; onPick: (msg: string, index: number) => void
  leadName?: string
}) {
  const [selected, setSelected] = useState<number | null>(null)

  // Reset ao abrir
  useEffect(() => { if (isOpen) setSelected(null) }, [isOpen])

  function handleConfirm() {
    if (selected === null) return
    onPick(templates[selected], selected)
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      size="md"
      footer={
        <div className="flex items-center gap-3 w-full">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-t3 hover:text-t1 border border-line hover:border-line-strong bg-surface transition-all cursor-pointer">
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={selected === null}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-brand hover:bg-brand-dark text-[#0F1730] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <MessageCircle size={14} />
            Enviar mensagem {selected !== null ? `${selected + 1}` : ''}
          </button>
        </div>
      }
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center flex-shrink-0">
          <MessageCircle size={18} className="text-green-400" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-t1">Escolher mensagem</h2>
          {leadName && <p className="text-xs text-t4 mt-0.5">Para: <span className="text-t2 font-medium">{leadName}</span></p>}
        </div>
      </div>

      <p className="text-xs text-t4 mb-4 leading-relaxed">
        Selecione qual template enviar. Varie entre eles a cada contato para reduzir risco de bloqueio.
      </p>

      <div className="flex flex-col gap-2.5 max-h-[60vh] overflow-y-auto pr-0.5">
        {templates.map((t, i) => {
          const isSelected = selected === i
          return (
            <button
              key={i}
              onClick={() => setSelected(i)}
              className={`group w-full text-left rounded-2xl border-2 transition-all duration-150 overflow-hidden cursor-pointer
                ${isSelected
                  ? 'border-brand bg-brand/8 shadow-sm shadow-brand/10'
                  : 'border-line bg-surface hover:border-brand/30 hover:bg-brand/4'
                }`}
            >
              {/* Badge + seleção */}
              <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold transition-all
                    ${isSelected ? 'bg-brand text-[#0F1730]' : 'bg-s3/70 text-t3'}`}>
                    {i + 1}
                  </div>
                  <span className={`text-xs font-semibold transition-colors ${isSelected ? 'text-brand' : 'text-t3'}`}>
                    {i === 0 ? 'Mensagem principal' : `Variação ${i}`}
                  </span>
                </div>
                {/* Indicador de seleção */}
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all
                  ${isSelected ? 'border-brand bg-brand' : 'border-line'}`}>
                  {isSelected && (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path d="M1.5 4L3.5 6L6.5 2" stroke="#0F1730" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
              </div>

              {/* Balão WhatsApp */}
              <div className="px-4 pb-4">
                <div className={`relative rounded-2xl rounded-tl-sm px-4 py-3 transition-all
                  ${isSelected ? 'bg-green-500/15 border border-green-500/20' : 'bg-s2/80 border border-line'}`}>
                  {/* Bolinha do balão */}
                  <div className={`absolute -top-px left-0 w-3 h-3 transition-all
                    ${isSelected ? 'text-green-500/20' : 'text-line'}`}>
                    <svg viewBox="0 0 12 12" fill="currentColor">
                      <path d="M0 0 Q12 0 12 12 L0 12 Z"/>
                    </svg>
                  </div>
                  <p className="text-[13px] leading-[1.55] text-t1 whitespace-pre-wrap break-words">
                    {t}
                  </p>
                  {/* Timestamp fake */}
                  <div className="flex items-center justify-end gap-1 mt-2">
                    <span className="text-[10px] text-t5">agora</span>
                    <svg width="14" height="8" viewBox="0 0 16 9" fill="none" className={isSelected ? 'text-green-400' : 'text-t5'}>
                      <path d="M1 4.5L4 7.5L9 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M7 4.5L10 7.5L15 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>
              </div>
            </button>
          )
        })}
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
  const { profile } = useAuthStore()
  const sentBy = profile ? { id: profile.id, name: profile.name } : undefined

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

  // Histórico de disparos anteriores por lead (outras campanhas)
  const [dispatchHistory, setDispatchHistory] = useState<Record<string, { campaignId: string; dispatchedAt: string }[]>>({})

  async function loadDispatchHistory(lead: CampaignLead) {
    if (!lead.phone) return
    try {
      const { data: contact } = await (await import('../../lib/supabase')).supabase
        .from('contacts').select('id').eq('phone', lead.phone.replace(/\D/g, '')).maybeSingle()
      if (!contact) return
      const { data } = await (await import('../../lib/supabase')).supabase
        .from('lead_campaign_dispatches')
        .select('campaign_id, dispatched_at')
        .eq('contact_id', contact.id)
        .neq('campaign_id', campaign.id)   // exclui a campanha atual
        .order('dispatched_at', { ascending: false })
        .limit(5)
      if (data && data.length > 0) {
        setDispatchHistory(prev => ({
          ...prev,
          [lead.id]: (data as { campaign_id: string; dispatched_at: string }[]).map(d => ({
            campaignId:   d.campaign_id,
            dispatchedAt: d.dispatched_at,
          })),
        }))
      }
    } catch { /* silencioso */ }
  }

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
    persistDisparo({      // persiste no Supabase com contexto completo
      brokerId:   profile?.id,
      campaignId: campaign.id,
      leadId:     lead.id,
      leadName:   lead.name,
    })
    setForceOffHours(false)
    const wasNew = lead.funnelStage === 'new'
    markContacted(lead.id, msg, templateIndex, sentBy)
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
          <span className="text-xs text-t2">Enviar entre 20h e 8h aumenta o risco de banimento.</span>
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
    // Carrega histórico de campanhas anteriores (fire-and-forget)
    if (!dispatchHistory[lead.id]) {
      loadDispatchHistory(lead)
    }
    const templates = getTemplates(lead)
    if (templates.length > 1) setPickerLead(lead)
    else sendWhatsApp(lead, templates[0], 0)
  }

  function handleInterested(lead: CampaignLead) {
    if (['attended','scheduled'].includes(lead.funnelStage)) {
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
        }} className="text-xs text-brand font-semibold underline cursor-pointer">Desfazer</button>
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
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-line text-t2 text-xs">
                <Clock size={12} className="text-t3" />
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
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-t4 pointer-events-none" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar nome ou telefone…"
            className="w-full bg-s3/50 border border-line rounded-xl pl-9 pr-4 py-2 text-sm text-slate-100 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
        </div>
        {/* Mini resumo inline */}
        <div className="flex items-center gap-3 text-xs text-t3 flex-shrink-0">
          <span><span className="text-t1 font-bold tabular-nums">{queueLeads.length}</span> na fila</span>
          <span className="text-line">|</span>
          <span><span className="text-cyan-400 font-bold tabular-nums">{contactedLeads.length}</span> acionados</span>
          <span className="text-line">|</span>
          <span><span className="text-violet-400 font-bold tabular-nums">{leads.filter(l => l.funnelStage === 'scheduled').length}</span> agendados</span>
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
              <h3 className="text-sm font-bold text-t1">Fila de disparo</h3>
            </div>
            <span className="text-xs bg-green-500/15 text-green-400 border border-green-500/25 px-2.5 py-0.5 rounded-full font-bold tabular-nums">
              {queueLeads.length}
            </span>
            <div className="flex-1 h-px bg-white/6" />
            <span className="text-[10px] text-t4 uppercase tracking-wider">não acionados · mais antigos primeiro</span>
          </div>

          {queueLeads.length === 0 ? (
            <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-green-500/5 border border-green-500/15">
              <span className="text-2xl">✅</span>
              <div>
                <p className="text-sm font-semibold text-green-400">Fila zerada!</p>
                <p className="text-xs text-t3">Todos os leads desta campanha já foram acionados.</p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-line overflow-hidden bg-page">
              {/* Header da tabela */}
              <div className="grid grid-cols-[1fr_160px_auto] gap-4 px-5 py-2.5 border-b border-line text-[10px] text-t4 uppercase tracking-wider font-semibold">
                <span>Nome</span>
                <span>Telefone</span>
                <span className="w-28 text-center">Ação</span>
              </div>

              <div className="divide-y divide-line">
                {queueLeads.slice(0, visibleQueue).map((lead, idx) => {
                  const isNext = idx === 0 && !onCd && !atLim
                  return (
                    <div key={lead.id}
                      className={`grid grid-cols-[1fr_160px_auto] gap-4 px-5 py-3 items-center transition-colors
                        ${isNext ? 'bg-green-500/5' : 'hover:bg-s2/50'}`}>

                      <div className="flex items-center gap-3 min-w-0">
                        {/* Avatar */}
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0
                          ${isNext ? 'bg-green-500/20 text-green-300' : 'bg-white/6 text-t3'}`}>
                          {lead.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-medium truncate ${isNext ? 'text-t1' : 'text-t3'}`}>
                            {lead.name}
                          </p>
                          {/* Aviso informativo: lead já recebeu disparo em outra campanha */}
                          {dispatchHistory[lead.id]?.length > 0 && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <AlertCircle size={9} className="text-amber-400 flex-shrink-0" />
                              <span className="text-[10px] text-amber-400/80 truncate">
                                Disparado em {dispatchHistory[lead.id].length} campanha{dispatchHistory[lead.id].length > 1 ? 's' : ''} anterior{dispatchHistory[lead.id].length > 1 ? 'es' : ''} · último: {new Date(dispatchHistory[lead.id][0].dispatchedAt).toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                          )}
                          {lead.extra && (
                            <p className="text-[10px] text-t4 truncate">{lead.extra}</p>
                          )}
                        </div>
                      </div>

                      <span className="text-sm text-t3 tabular-nums font-mono">
                        {formatPhone(lead.phone)}
                      </span>

                      {/* Botão de disparo — sempre visível */}
                      <div className="w-28 flex justify-center">
                        {atLim ? (
                          <span className="text-[11px] text-red-400/60">limite atingido</span>
                        ) : onCd ? (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/50 border border-line text-t3 text-xs tabular-nums">
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
                <div className="flex items-center justify-center gap-2 py-3 border-t border-line">
                  <Loader2 size={13} className="animate-spin text-t4" />
                  <span className="text-xs text-t4">Carregando mais…</span>
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
                <h3 className="text-sm font-bold text-t3 group-hover:text-t1 transition-colors">Já acionados</h3>
              </div>
              <span className="text-xs bg-s3/70 text-blue-400 border border-blue-500/20 px-2.5 py-0.5 rounded-full font-bold tabular-nums">
                {contactedLeads.length}
              </span>
              <div className="flex-1 h-px bg-white/6" />
              <ChevronDown size={13} className={`text-t4 transition-transform ${showContacted ? 'rotate-180' : ''}`} />
            </button>

            {showContacted && (
              <div className="rounded-xl border border-line overflow-hidden bg-page">
                <div className="grid grid-cols-[140px_1fr_160px_auto] gap-4 px-5 py-2.5 border-b border-line text-[10px] text-t4 uppercase tracking-wider font-semibold">
                  <span>Etapa</span>
                  <span>Nome</span>
                  <span>Telefone</span>
                  <span className="w-24 text-right">Ações</span>
                </div>

                <div className="divide-y divide-line">
                  {contactedLeads.slice(0, visibleContacted).map(lead => {
                    const cdActive = onCd || atLim
                    const situCfg  = lead.situation ? SITUATION_CONFIG.find(s => s.value === lead.situation) : null
                    return (
                      <div key={lead.id}
                        className="grid grid-cols-[140px_1fr_160px_auto] gap-4 px-5 py-2.5 items-center hover:bg-s2/50 transition-colors group">

                        <div className="flex items-center gap-2">
                          <StageBadge stage={lead.funnelStage} />
                          {situCfg && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${situCfg.bg} ${situCfg.color}`}>
                              {situCfg.short}
                            </span>
                          )}
                        </div>

                        <div className="min-w-0">
                          <p className="text-sm text-t2 truncate">{lead.name}</p>
                          {lead.lastSentByName && (
                            <p className="text-[10px] text-violet-400/70 truncate">
                              💬 {lead.lastSentByName}{lead.lastSentAt ? ` · ${new Date(lead.lastSentAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
                              {lead.messageIndex !== undefined ? ` · Msg ${lead.messageIndex + 1}` : ''}
                            </p>
                          )}
                        </div>

                        <span className="text-sm text-t4 tabular-nums font-mono">
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
                              ['attended','scheduled'].includes(lead.funnelStage)
                                ? 'text-cyan-500/30 cursor-default'
                                : 'hover:bg-cyan-500/10 text-t4 hover:text-cyan-400'
                            }`}
                            title="Marcar como interessado">
                            <ThumbsUp size={13} />
                          </button>
                          <button onClick={() => setParecerLead(lead)}
                            className="p-1.5 rounded-lg hover:bg-indigo-500/10 text-t4 hover:text-brand transition-colors cursor-pointer"
                            title="Parecer">
                            <FileText size={13} />
                          </button>
                          <button onClick={() => setEditLead(lead)}
                            className="p-1.5 rounded-lg hover:bg-s3/70 text-t4 hover:text-t2 transition-colors cursor-pointer"
                            title="Editar">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => setDeleteLead(lead)}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-t4 hover:text-red-400 transition-colors cursor-pointer"
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
                  <div className="flex items-center justify-center gap-2 py-3 border-t border-line">
                    <Loader2 size={13} className="animate-spin text-t4" />
                    <span className="text-xs text-t4">Carregando mais…</span>
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
                <h3 className="text-sm font-bold text-t4 group-hover:text-t3 transition-colors">Sem interesse / Inválidos</h3>
              </div>
              <span className="text-xs bg-s3/50 text-t4 border border-line px-2.5 py-0.5 rounded-full font-bold tabular-nums">
                {disqualLeads.length}
              </span>
              <div className="flex-1 h-px bg-s2/60" />
              <ChevronDown size={13} className={`text-t5 transition-transform ${showDisqualified ? 'rotate-180' : ''}`} />
            </button>

            {showDisqualified && (
              <div className="rounded-xl border border-line overflow-hidden opacity-60">
                <div className="divide-y divide-white/4">
                  {disqualLeads.map(lead => {
                    const situCfg = SITUATION_CONFIG.find(s => s.value === lead.situation)
                    return (
                      <div key={lead.id}
                        className="flex items-center gap-4 px-5 py-2.5 hover:bg-s2/30 transition-colors group">
                        <span className={`text-[11px] px-2 py-0.5 rounded-lg font-medium ${situCfg?.bg ?? 'bg-s3/50'} ${situCfg?.color ?? 'text-t3'}`}>
                          {situCfg?.short ?? '—'}
                        </span>
                        <p className="flex-1 text-sm text-t3 truncate">{lead.name}</p>
                        <span className="text-xs text-t5 tabular-nums font-mono">{formatPhone(lead.phone)}</span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setEditLead(lead)}
                            className="p-1.5 rounded-lg hover:bg-s3/70 text-t5 hover:text-t3 transition-colors cursor-pointer">
                            <Pencil size={12} />
                          </button>
                          <button onClick={() => setDeleteLead(lead)}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-t5 hover:text-red-400 transition-colors cursor-pointer">
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
        leadName={pickerLead?.name}
        onPick={(msg, idx) => pickerLead && sendWhatsApp(pickerLead, msg, idx)}
      />
      <Modal isOpen={Boolean(deleteLead)} onClose={() => setDeleteLead(undefined)} title="Remover lead" size="sm">
        <p className="text-sm text-t3 mb-6">
          Remover <span className="text-t1 font-medium">"{deleteLead?.name}"</span> desta campanha?
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setDeleteLead(undefined)}>Cancelar</Button>
          <Button variant="danger"    className="flex-1" onClick={handleDelete}>Remover</Button>
        </div>
      </Modal>
    </div>
  )
}
