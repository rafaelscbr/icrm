import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  MessageCircle, FileText, Pencil, Trash2, Search, ChevronDown,
  ThumbsUp, Loader2, Clock, Moon, AlertCircle, ShoppingBag, Circle,
} from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { ListContainer } from '../../components/ui/ListContainer'
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
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

// ─── Tipos internos ───────────────────────────────────────────────────────────

/** Registro de disparo cross-campanha (da tabela disparo_logs). */
interface CrossDispatch {
  firedAt:      string
  campaignId:   string
  campaignName: string
  brokerId:     string | null
  brokerName?:  string
}

/** Verde = nunca abordado / >7d | Amarelo = 2-7d | Vermelho = <48h */
type DispatchColor = 'green' | 'yellow' | 'red'

/**
 * Fisher-Yates com semente determinística (FNV-1a + xorshift32).
 * Mesmo brokerId + campaignId → mesma ordem; brokers diferentes → ordens diferentes.
 */
function seededShuffle<T>(arr: T[], seed: string): T[] {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0
  }
  const rand = () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5
    return (h >>> 0) / 0xffffffff
  }
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

interface PreDispatchWarning {
  lead:      CampaignLead
  items:     { icon: string; text: string }[]
  onConfirm: () => void
}

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

  // Fonte de verdade: cooldown_until persistido no banco via useDisparosStore.
  // Sobrevive a navegação, F5, logout/login e troca de dispositivo.
  const cooldownUntil = useDisparosStore(s => s.cooldownUntil)

  // Reconstrói o countdown a partir do banco sempre que o valor mudar
  // (na montagem do componente ou após um novo disparo ser registrado)
  useEffect(() => {
    if (!cooldownUntil) return
    const expiresAt = new Date(cooldownUntil).getTime()
    if (expiresAt > Date.now()) {
      expiresAtRef.current = expiresAt
      wasActiveRef.current = true
      setIsReady(false)
      setTick(t => t + 1)
    }
  }, [cooldownUntil])

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

  // Recebe a duração já calculada (a mesma gravada no banco) — evita re-sortear
  const startWithMs = (ms: number) => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()  // fire-and-forget intencional
    }
    expiresAtRef.current = Date.now() + ms
    wasActiveRef.current = true
    setIsReady(false)
    setTick(t => t + 1)
    return Math.ceil(ms / 1000)
  }

  const clearReady = () => setIsReady(false)

  return { remaining, startWithMs, isReady, clearReady }
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
  const { remove, markContacted, setStage } = useCampaignLeadsStore()
  const { profile } = useAuthStore()
  const sentBy = profile ? { id: profile.id, name: profile.name } : undefined

  const [search,            setSearch]            = useState('')
  const [visibleQueue,      setVisibleQueue]      = useState(PAGE_SIZE)
  const [visibleContacted,  setVisibleContacted]  = useState(PAGE_SIZE)
  const [parecerLead,       setParecerLead]       = useState<CampaignLead | undefined>()
  const [editLead,          setEditLead]          = useState<CampaignLead | undefined>()
  const [deleteLead,        setDeleteLead]        = useState<CampaignLead | undefined>()
  const [showContacted,     setShowContacted]     = useState(true)
  const [showDisqualified,  setShowDisqualified]  = useState(false)
  const [pickerLead,        setPickerLead]        = useState<CampaignLead | undefined>()
  const [forceOffHours,     setForceOffHours]     = useState(false)
  const [excludedIds,       setExcludedIds]       = useState<Set<string>>(new Set())
  const [checkingId,        setCheckingId]        = useState<string | undefined>()
  const [preDispatchWarn,   setPreDispatchWarn]   = useState<PreDispatchWarning | undefined>()

  // Histórico cross-campanha: normPhone → lista de disparos em outras campanhas
  // Carregado em batch ao montar a aba — fonte: disparo_logs (real, não lead_campaign_dispatches)
  const [crossCampaignMap, setCrossCampaignMap] = useState<Record<string, CrossDispatch[]>>({})

  // Histórico inline de disparos em outras campanhas (exibição abaixo do nome)
  const [dispatchHistory, setDispatchHistory] = useState<Record<string, { campaignId: string; dispatchedAt: string; campaignName: string }[]>>({})

  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sentinelQRef     = useRef<HTMLDivElement>(null)
  const sentinelCRef     = useRef<HTMLDivElement>(null)

  const { remaining, startWithMs, isReady, clearReady }  = useGlobalCooldown()
  const { count: dailyCount, increment: dailyIncrement } = useDailyCounter()
  const { increment: persistDisparo, load: loadDisparos, subscribe: subscribeDisparos } = useDisparosStore()

  // ─── Contador de disparos: load do banco + subscribe Realtime ────────────
  // Garante que o contador reflete exatamente o que está no banco ao montar o
  // componente, e permanece sincronizado em tempo real durante a sessão de disparo.
  // No mobile, quando o corretor volta do WhatsApp, o canal Realtime pode ter
  // desconectado — visibilitychange dispara um load() para resgatar o estado real.
  useEffect(() => {
    loadDisparos()
    const unsub = subscribeDisparos()
    function onVisible() { if (document.visibilityState === 'visible') loadDisparos() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { unsub(); document.removeEventListener('visibilitychange', onVisible) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Carregamento de histórico cross-campanha ─────────────────────────────
  // Fonte: disparo_logs (tem dados reais) em vez de lead_campaign_dispatches (vazia).
  // 3 queries pequenas ao montar — bounded pelo tamanho de disparo_logs, não de leads.
  useEffect(() => {
    let cancelled = false
    async function loadCrossCampaign() {
      try {
        // Step 1: disparos em OUTRAS campanhas
        const { data: otherDisparos } = await supabase
          .from('disparo_logs')
          .select('lead_id, fired_at, campaign_id, broker_id')
          .neq('campaign_id', campaign.id)
          .order('fired_at', { ascending: false })
        if (cancelled || !otherDisparos || otherDisparos.length === 0) return

        // Step 2: phones dos leads disparados em outras campanhas
        const leadIds = [...new Set(otherDisparos.map((d: Record<string,unknown>) => d.lead_id as string).filter(Boolean))]
        const { data: otherLeads } = await supabase
          .from('campaign_leads').select('id, phone').in('id', leadIds)

        // Step 3: nomes das campanhas
        const campIds = [...new Set(otherDisparos.map((d: Record<string,unknown>) => d.campaign_id as string).filter(Boolean))]
        const { data: campNames } = await supabase
          .from('campaigns').select('id, name').in('id', campIds)

        if (cancelled) return

        const phoneMap: Record<string, string> = {}
        for (const l of (otherLeads ?? []) as { id: string; phone: string }[]) {
          phoneMap[l.id] = l.phone.replace(/\D/g, '')
        }
        const nameMap: Record<string, string> = {}
        for (const c of (campNames ?? []) as { id: string; name: string }[]) {
          nameMap[c.id] = c.name
        }

        const map: Record<string, CrossDispatch[]> = {}
        for (const d of otherDisparos as { lead_id: string; fired_at: string; campaign_id: string; broker_id: string | null }[]) {
          const phone = phoneMap[d.lead_id]
          if (!phone) continue
          const entry: CrossDispatch = {
            firedAt: d.fired_at, campaignId: d.campaign_id,
            campaignName: nameMap[d.campaign_id] ?? '—', brokerId: d.broker_id,
          }
          map[phone] = map[phone] ? [entry, ...map[phone]] : [entry]
        }
        // Ordena cada telefone por recência
        for (const phone of Object.keys(map)) {
          map[phone].sort((a, b) => b.firedAt.localeCompare(a.firedAt))
        }

        setCrossCampaignMap(map)
      } catch (err) {
        console.error('[crossCampaign] load:', err)
      }
    }
    loadCrossCampaign()
    return () => { cancelled = true }
  }, [campaign.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Cor do cooldown comercial por lead ───────────────────────────────────
  function getDispatchColor(lead: CampaignLead): DispatchColor | null {
    const phone = lead.phone.replace(/\D/g, '')
    const history = crossCampaignMap[phone]
    if (!history || history.length === 0) return null
    const diffMs = Date.now() - new Date(history[0].firedAt).getTime()
    if (diffMs < 48 * 3600_000) return 'red'
    if (diffMs < 7 * 86400_000) return 'yellow'
    return 'green'
  }

  // ─── Verificação pré-disparo ───────────────────────────────────────────────
  // Usa crossCampaignMap (já carregado) para histórico cross-campanha.
  // Faz 1 query adicional apenas para verificar compra de imóvel.
  async function checkPreDispatch(lead: CampaignLead): Promise<{ icon: string; text: string }[]> {
    const doCheck = async (): Promise<{ icon: string; text: string }[]> => {
      const warnings: { icon: string; text: string }[] = []
      try {
        const normPhone = lead.phone.replace(/\D/g, '')

        // Verifica compra de imóvel (lookup por telefone, tolerante a formatos)
        const { data: contacts } = await supabase
          .from('contacts').select('id, phone').ilike('phone', `%${normPhone.slice(-8)}%`).limit(3)
        const contact = (contacts ?? []).find((c: { id: string; phone: string }) =>
          c.phone.replace(/\D/g, '') === normPhone
        )
        if (contact) {
          const { data: sales } = await supabase
            .from('sales').select('date, property_name')
            .eq('client_id', contact.id).order('date', { ascending: false }).limit(1)
          if (sales && sales.length > 0) {
            const s = sales[0] as { date: string; property_name: string }
            warnings.push({
              icon: '🏠',
              text: `Este contato já comprou um imóvel (${s.property_name} em ${new Date(s.date).toLocaleDateString('pt-BR')}).`,
            })
          }
        }

        // Histórico cross-campanha — usa dados pré-carregados (sem nova query)
        const history = crossCampaignMap[normPhone]
        if (history && history.length > 0) {
          const last = history[0]
          const diffMs  = Date.now() - new Date(last.firedAt).getTime()
          const diffH   = Math.floor(diffMs / 3600_000)
          const diffD   = Math.floor(diffMs / 86400_000)
          const tempoStr = diffH < 1 ? 'há menos de 1 hora'
            : diffH < 24 ? `há ${diffH}h`
            : diffD === 1 ? 'há 1 dia'
            : `há ${diffD} dias`

          const icon = diffMs < 48 * 3600_000 ? '🔴' : diffMs < 7 * 86400_000 ? '🟡' : '📨'
          const totalTexto = history.length === 1
            ? `1 campanha anterior`
            : `${history.length} campanhas anteriores`

          warnings.push({
            icon,
            text: `Abordado em ${totalTexto}.\nÚltimo: ${last.campaignName} · ${new Date(last.firedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às ${new Date(last.firedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} (${tempoStr}).`,
          })

          // Popula badge inline com dados completos
          setDispatchHistory(prev => ({
            ...prev,
            [lead.id]: history.map(h => ({ campaignId: h.campaignId, dispatchedAt: h.firedAt, campaignName: h.campaignName })),
          }))
        }
      } catch { /* silencioso — prossegue sem bloquear */ }
      return warnings
    }

    const timeout = new Promise<{ icon: string; text: string }[]>(resolve =>
      setTimeout(() => resolve([]), 3000)
    )
    return Promise.race([doCheck(), timeout])
  }

  // ── Filtragem e agrupamento ───────────────────────────────────────────────

  const q = search.trim().toLowerCase()
  const matchSearch = (l: CampaignLead) =>
    !q || l.name.toLowerCase().includes(q) || l.phone.includes(q)

  // Filtra por campaign.id para excluir leads órfãos (campaign_id = null) e leads
  // de outras campanhas que possam estar no store. Sem esse filtro, leads sem campanha
  // aparecem sempre na fila e nunca saem (RLS bloqueia o updateRow silenciosamente).
  const allFiltered = leads.filter(l =>
    l.campaignId === campaign.id && !excludedIds.has(l.id) && matchSearch(l)
  )

  // 1. Fila: nunca contatados, sem situação especial
  // Ordem embaralhada por semente (brokerId + campaignId) para que cada corretor
  // veja uma sequência diferente — evita múltiplos corretores abordando os mesmos
  // leads simultaneamente. A ordem é estável dentro da sessão do mesmo corretor.
  const queueLeads = useMemo(() => {
    const base = allFiltered.filter(l => l.funnelStage === 'new' && !l.situation)
    const seed  = `${profile?.id ?? 'anon'}-${campaign.id}`
    return seededShuffle(base, seed)
  }, [allFiltered, profile?.id, campaign.id]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // whatsappTab é uma aba em branco aberta SINCRONAMENTE dentro do gesto do usuário,
  // antes de qualquer await. Browsers móveis (iOS Safari) bloqueiam window.open()
  // chamado após operações async — abrir a aba dentro do gesto garante que nunca
  // será bloqueada. Ela é redirecionada ao WhatsApp após confirmação do banco,
  // ou fechada silenciosamente em caso de falha.
  async function sendWhatsApp(lead: CampaignLead, msg: string, templateIndex: number, whatsappTab?: Window | null) {
    const cooldownMs    = randomCooldownMs()
    const cooldownUntil = new Date(Date.now() + cooldownMs).toISOString()

    navigator.clipboard?.writeText(msg).catch(() => {})

    try {
      await persistDisparo({ brokerId: profile?.id, campaignId: campaign.id, leadId: lead.id, leadName: lead.name, cooldownUntil })
      await markContacted(lead.id, msg, templateIndex, sentBy)
    } catch {
      whatsappTab?.close()
      toast.error(
        'Disparo não realizado — não foi possível registrar no sistema. Verifique sua conexão e tente novamente.',
        { duration: 7000 }
      )
      return
    }

    // Banco confirmou — redireciona a aba já aberta para o WhatsApp (sem popup blocker)
    if (whatsappTab && !whatsappTab.closed) {
      whatsappTab.location.href = whatsappUrl(lead.phone, msg)
    } else {
      // Fallback: aba foi fechada (ex: picker de template) — abre diretamente
      window.open(whatsappUrl(lead.phone, msg), '_blank')
    }

    clearReady()
    const secs  = startWithMs(cooldownMs)
    const total = dailyIncrement()
    setForceOffHours(false)
    const wasNew = lead.funnelStage === 'new'
    if (total >= DAILY_WARN && total < DAILY_LIMIT) {
      toast(`⚠️ ${total} disparos hoje — limite ${DAILY_WARN} recomendado. Cuidado com o ban!`, { duration: 5000, icon: '⚠️' })
    } else if (wasNew) {
      toast.success(`1ª mensagem enviada! Próximo disparo em ${secs}s. · Mensagem copiada como backup`)
    } else {
      toast.success(`Mensagem enviada. Próximo disparo em ${secs}s. · Mensagem copiada como backup`)
    }
  }

  async function proceedWithDispatch(lead: CampaignLead, whatsappTab?: Window | null) {
    const templates = getTemplates(lead)
    if (templates.length > 1) {
      whatsappTab?.close()  // fecha aba — usuário vai escolher o template (novo gesto)
      setPickerLead(lead)
    } else {
      await sendWhatsApp(lead, templates[0], 0, whatsappTab)
    }
  }

  async function handleWhatsApp(lead: CampaignLead) {
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

    // Abre aba em branco AGORA — sincronamente dentro do gesto do usuário,
    // antes de qualquer await. Isso garante que nunca será bloqueada pelo browser.
    const whatsappTab = window.open('', '_blank')

    setCheckingId(lead.id)
    try {
      const warnings = await checkPreDispatch(lead)
      if (warnings.length > 0) {
        whatsappTab?.close()  // fecha aba — usuário precisa confirmar antes de disparar
        setPreDispatchWarn({
          lead,
          items: warnings,
          onConfirm: () => {
            setPreDispatchWarn(undefined)
            // Novo gesto (clique em "Disparar mesmo assim") — abre nova aba agora
            const tab = window.open('', '_blank')
            proceedWithDispatch(lead, tab)
          },
        })
        return
      }
      await proceedWithDispatch(lead, whatsappTab)
    } finally {
      setCheckingId(undefined)
    }
  }

  function handleInterested(lead: CampaignLead) {
    if (['attended','scheduled'].includes(lead.funnelStage)) {
      toast('Lead já está em etapa avançada', { icon: 'ℹ️' }); return
    }
    setStage(lead.id, 'attended', undefined, sentBy)
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
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-s2 border border-line text-t2 text-xs">
                <Clock size={12} className="text-t3" />
                <span>Próximo disparo em</span>
                <span className="font-black tabular-nums text-t1 text-sm">{secs}s</span>
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
            <div className="flex-1 h-px bg-s2/60" />
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
            <ListContainer>
              {/* Header da tabela */}
              <div className="grid grid-cols-[1fr_160px_auto] gap-4 px-5 py-2.5 border-b border-line text-[10px] text-t4 uppercase tracking-wider font-semibold bg-s3/30">
                <span>Nome</span>
                <span>Telefone</span>
                <span className="w-28 text-center">Ação</span>
              </div>

              <div className="divide-y divide-line">
                {queueLeads.slice(0, visibleQueue).map((lead, idx) => {
                  const isNext       = idx === 0 && !onCd && !atLim
                  const dispColor    = getDispatchColor(lead)
                  const inlineHist   = dispatchHistory[lead.id] ?? crossCampaignMap[lead.phone.replace(/\D/g, '')] ?? []
                  return (
                    <div key={lead.id}
                      className={`grid grid-cols-[1fr_160px_auto] gap-4 px-5 py-3 items-center transition-colors
                        ${isNext ? 'bg-green-500/5' : 'hover:bg-s3/50 row-accent'}`}>

                      <div className="flex items-center gap-3 min-w-0">
                        {/* Avatar com indicador de cooldown comercial */}
                        <div className="relative flex-shrink-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold
                            ${isNext ? 'bg-green-500/20 text-green-300' : 'bg-s3/60 text-t2'}`}>
                            {lead.name.charAt(0).toUpperCase()}
                          </div>
                          {/* Ponto de cooldown: vermelho <48h | amarelo <7d | verde >7d */}
                          {dispColor && (
                            <Circle
                              size={7}
                              className={`absolute -top-0.5 -right-0.5 rounded-full
                                ${dispColor === 'red'    ? 'fill-red-400 text-red-400'
                                : dispColor === 'yellow' ? 'fill-amber-400 text-amber-400'
                                :                         'fill-green-400 text-green-400'}`}
                            />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-medium truncate ${isNext ? 'text-t1' : 'text-t3'}`}>
                            {lead.name}
                          </p>
                          {/* Badge inline: abordado em outra campanha — usa dados pré-carregados */}
                          {inlineHist.length > 0 && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <AlertCircle size={9}
                                className={`flex-shrink-0 ${dispColor === 'red' ? 'text-red-400' : 'text-amber-400'}`} />
                              <span className={`text-[10px] truncate ${dispColor === 'red' ? 'text-red-400/80' : 'text-amber-400/80'}`}>
                                {inlineHist.length} campanha{inlineHist.length > 1 ? 's' : ''} anterior{inlineHist.length > 1 ? 'es' : ''} · último: {new Date('dispatchedAt' in inlineHist[0] ? (inlineHist[0] as {dispatchedAt: string}).dispatchedAt : (inlineHist[0] as CrossDispatch).firedAt).toLocaleDateString('pt-BR')}
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
                        ) : checkingId === lead.id ? (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/50 border border-line text-t3 text-xs">
                            <Loader2 size={11} className="animate-spin" /> verificando…
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
            </ListContainer>
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
              <div className="flex-1 h-px bg-s2/60" />
              <ChevronDown size={13} className={`text-t4 transition-transform ${showContacted ? 'rotate-180' : ''}`} />
            </button>

            {showContacted && (
              <ListContainer>
                <div className="grid grid-cols-[140px_1fr_160px_auto] gap-4 px-5 py-2.5 border-b border-line text-[10px] text-t4 uppercase tracking-wider font-semibold bg-s3/30">
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
                        className="grid grid-cols-[140px_1fr_160px_auto] gap-4 px-5 py-2.5 items-center hover:bg-s3/50 transition-colors group row-accent">

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
              </ListContainer>
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
              <ListContainer className="opacity-60">
                <div className="divide-y divide-line">
                  {disqualLeads.map(lead => {
                    const situCfg = SITUATION_CONFIG.find(s => s.value === lead.situation)
                    return (
                      <div key={lead.id}
                        className="flex items-center gap-4 px-5 py-2.5 hover:bg-s3/50 transition-colors group row-accent">
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
              </ListContainer>
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
        onPick={(msg, idx) => {
          if (!pickerLead) return
          // Gesto do clique no template — abre aba em branco agora, dentro do gesto
          const tab = window.open('', '_blank')
          sendWhatsApp(pickerLead, msg, idx, tab)
        }}
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

      {/* ── Modal de aviso pré-disparo ────────────────────────────────── */}
      <Modal
        isOpen={Boolean(preDispatchWarn)}
        onClose={() => setPreDispatchWarn(undefined)}
        title="Atenção antes de disparar"
        size="sm"
      >
        {preDispatchWarn && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 pb-1">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                <ShoppingBag size={17} className="text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-t1">{preDispatchWarn.lead.name}</p>
                <p className="text-xs text-t4">{formatPhone(preDispatchWarn.lead.phone)}</p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {preDispatchWarn.items.map((w, i) => (
                <div key={i} className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-amber-500/8 border border-amber-500/20">
                  <span className="text-base leading-none mt-0.5 flex-shrink-0">{w.icon}</span>
                  <p className="text-xs text-amber-300 leading-relaxed whitespace-pre-line">{w.text}</p>
                </div>
              ))}
            </div>

            {/* Histórico completo cross-campanha */}
            {(() => {
              const phone = preDispatchWarn.lead.phone.replace(/\D/g, '')
              const hist  = crossCampaignMap[phone]
              if (!hist || hist.length === 0) return null
              return (
                <div className="flex flex-col gap-1.5 bg-s3/40 rounded-xl px-3 py-2.5 border border-line">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-t4 mb-0.5">
                    Total de abordagens: {hist.length}
                  </p>
                  {hist.slice(0, 5).map((h, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px] text-t3">
                      <span className="w-1.5 h-1.5 rounded-full bg-t5 flex-shrink-0" />
                      <span className="truncate">{h.campaignName}</span>
                      <span className="text-t5 flex-shrink-0 tabular-nums">
                        {new Date(h.firedAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  ))}
                  {hist.length > 5 && (
                    <p className="text-[10px] text-t5">+{hist.length - 5} mais…</p>
                  )}
                </div>
              )
            })()}

            <p className="text-xs text-t4 leading-relaxed">
              Deseja disparar mesmo assim? O contato receberá a mensagem normalmente.
            </p>

            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setPreDispatchWarn(undefined)}>
                Cancelar
              </Button>
              <Button className="flex-1 gap-2" onClick={preDispatchWarn.onConfirm}>
                <MessageCircle size={13} /> Disparar mesmo assim
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
