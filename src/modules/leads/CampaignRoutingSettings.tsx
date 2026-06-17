import { useEffect, useState } from 'react'
import { Megaphone, Check, Users, Loader2, Info } from 'lucide-react'
import { db } from '../../lib/db'
import { useAuthStore } from '../../store/useAuthStore'
import { MetaFormRouting } from '../../types'
import toast from 'react-hot-toast'

/**
 * Distribuição de leads por campanha (formulário Meta → corretores).
 * Admin escolhe quem recebe os leads de cada formulário. Sem corretores
 * marcados, o formulário cai no rodízio global (fallback). Auto-descoberta:
 * cada formulário que recebe lead aparece sozinho na lista.
 */
export function CampaignRoutingSettings() {
  const { allProfiles, fetchAllProfiles } = useAuthStore()
  const [rules,   setRules]   = useState<MetaFormRouting[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    if (allProfiles.length === 0) fetchAllProfiles()
    db.metaFormRouting.fetchAll()
      .then(setRules)
      .catch(() => { /* erro já toastado */ })
      .finally(() => setLoading(false))
  }, [])

  const brokers = allProfiles.filter(p => p.active)

  async function toggleBroker(rule: MetaFormRouting, brokerId: string) {
    const next = rule.brokerIds.includes(brokerId)
      ? rule.brokerIds.filter(id => id !== brokerId)
      : [...rule.brokerIds, brokerId]
    setSavingId(rule.formId)
    try {
      await db.metaFormRouting.setBrokers(rule.formId, next)
      setRules(rs => rs.map(r => r.formId === rule.formId ? { ...r, brokerIds: next } : r))
    } catch { /* erro já toastado */ }
    finally { setSavingId(null) }
  }

  async function toggleActive(rule: MetaFormRouting) {
    setSavingId(rule.formId)
    try {
      await db.metaFormRouting.setActive(rule.formId, !rule.active)
      setRules(rs => rs.map(r => r.formId === rule.formId ? { ...r, active: !r.active } : r))
      toast.success(rule.active ? 'Campanha pausada' : 'Campanha ativada')
    } catch { /* erro já toastado */ }
    finally { setSavingId(null) }
  }

  // Atualiza localmente os campos de produto enquanto o admin digita
  function updateLocal(formId: string, patch: Partial<MetaFormRouting>) {
    setRules(rs => rs.map(r => r.formId === formId ? { ...r, ...patch } : r))
  }

  // Salva produto + ticket no blur (idempotente — herdados pelo lead que entrar)
  async function saveProduct(rule: MetaFormRouting) {
    setSavingId(rule.formId)
    try {
      await db.metaFormRouting.setProduct(
        rule.formId,
        rule.productName?.trim() || null,
        rule.productTicket != null && !Number.isNaN(rule.productTicket) ? rule.productTicket : null,
      )
      toast.success('Produto salvo')
    } catch { /* erro já toastado */ }
    finally { setSavingId(null) }
  }

  return (
    <div className="rounded-[14px] border border-line bg-s2/40 overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-3.5 border-b border-line">
        <div className="w-9 h-9 rounded-[10px] bg-brand-tint border border-brand/25 flex items-center justify-center flex-shrink-0">
          <Megaphone size={15} strokeWidth={1.6} className="text-brand" />
        </div>
        <div className="min-w-0">
          <h3 className="font-heading text-sm font-bold text-t1">Distribuição de campanhas</h3>
          <p className="text-xs text-t3 mt-0.5">
            Quem recebe os leads de cada formulário. Vários corretores = rodízio entre eles.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={18} className="animate-spin text-brand" strokeWidth={1.6} />
        </div>
      ) : rules.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center px-4">
          <Megaphone size={22} strokeWidth={1.6} className="text-t4" />
          <p className="text-sm font-medium text-t2">Nenhuma campanha detectada ainda</p>
          <p className="text-xs text-t4">Os formulários aparecem aqui assim que o primeiro lead chega</p>
        </div>
      ) : (
        <div className="divide-y divide-line">
          {rules.map(rule => {
            const empty  = rule.brokerIds.length === 0
            const saving = savingId === rule.formId
            return (
              <div key={rule.formId} className={`px-4 py-3.5 ${!rule.active ? 'opacity-55' : ''}`}>
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="font-heading text-sm font-bold text-t1 truncate">
                    {rule.formName ?? `Formulário ${rule.formId.slice(0, 8)}…`}
                  </span>
                  <span className="flex items-center gap-1 font-label text-[10px] text-t4 tabular-nums flex-shrink-0">
                    <Users size={10} strokeWidth={1.6} /> {rule.leadCount}
                  </span>
                  {saving && <Loader2 size={12} className="animate-spin text-brand flex-shrink-0" strokeWidth={1.6} />}

                  {/* Toggle ativo/pausado */}
                  <button
                    onClick={() => toggleActive(rule)}
                    role="switch"
                    aria-checked={rule.active}
                    aria-label={rule.active ? 'Pausar campanha' : 'Ativar campanha'}
                    title={rule.active ? 'Campanha ativa — clique para pausar' : 'Campanha pausada — clique para ativar'}
                    className="ml-auto relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
                    style={{ background: rule.active ? 'var(--brand)' : 'var(--line-strong)' }}
                  >
                    <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                      style={{ left: rule.active ? '1.125rem' : '2px' }} />
                  </button>
                </div>

                {/* Chips de corretores */}
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Corretores de ${rule.formName ?? 'formulário'}`}>
                  {brokers.map(b => {
                    const on = rule.brokerIds.includes(b.id)
                    return (
                      <button
                        key={b.id}
                        onClick={() => toggleBroker(rule, b.id)}
                        disabled={saving || !rule.active}
                        aria-pressed={on}
                        className={`flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border text-xs font-medium transition-all duration-150 disabled:cursor-not-allowed
                          ${on
                            ? 'bg-brand-tint border-brand/40 text-brand-text'
                            : 'bg-s2 border-line text-t3 hover:border-line-strong hover:text-t2'}`}
                      >
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center font-heading text-[10px] font-bold flex-shrink-0
                          ${on ? 'bg-brand text-[#0F1730]' : 'bg-s3 text-t3'}`}>
                          {on ? <Check size={11} strokeWidth={2.5} /> : b.name.charAt(0).toUpperCase()}
                        </span>
                        {b.name.split(' ')[0]}
                      </button>
                    )
                  })}
                </div>

                {/* Produto + ticket do formulário — herdados pelo lead que entrar */}
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 mt-2.5">
                  <label className="flex flex-col gap-1">
                    <span className="font-label text-[10px] uppercase tracking-wide text-t4">Produto deste formulário</span>
                    <input
                      type="text"
                      value={rule.productName ?? ''}
                      onChange={e => updateLocal(rule.formId, { productName: e.target.value })}
                      onBlur={() => saveProduct(rule)}
                      placeholder="Ex.: Residencial Aurora"
                      className="w-full bg-s2 border border-line rounded-[10px] px-3 py-2 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/40"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="font-label text-[10px] uppercase tracking-wide text-t4">Ticket (R$)</span>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={rule.productTicket ?? ''}
                      onChange={e => updateLocal(rule.formId, { productTicket: e.target.value === '' ? undefined : Number(e.target.value) })}
                      onBlur={() => saveProduct(rule)}
                      placeholder="0"
                      className="w-full sm:w-36 bg-s2 border border-line rounded-[10px] px-3 py-2 text-sm text-t1 tabular-nums placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/40"
                    />
                  </label>
                </div>
                <p className="text-[11px] text-t4 mt-1.5">
                  Quando um lead entrar por este formulário, o produto e o ticket já vêm preenchidos (alimenta a previsão de VGL).
                </p>

                {/* Aviso de fallback */}
                {empty && rule.active && (
                  <p className="flex items-center gap-1.5 mt-2 text-[11px] text-warning">
                    <Info size={11} strokeWidth={1.6} className="flex-shrink-0" />
                    Sem corretores definidos — cai no rodízio global (Dionata ↔ Rafael)
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
