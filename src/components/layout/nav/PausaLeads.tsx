import { useEffect, useState } from 'react'
import { Loader2, Pause, Play } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLeadPauseStore } from '../../../store/useLeadPauseStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { PRESETS_PAUSA, pausaDe, horaDaVolta, tempoRestante } from '../../../lib/pausaLeads'
import type { LeadPause, LeadPausePreset } from '../../../types'

/**
 * A pausa do usuário logado, com um relógio que anda sozinho.
 *
 * O relógio só existe enquanto há pausa: é ele que faz o "faltam 42 min" andar
 * e o estado virar "Recebendo" no minuto em que o intervalo acaba — sem pedir
 * nada ao banco (o store pergunta de novo uma vez, no fim da pausa).
 */
export function useMinhaPausa(): { pausa: LeadPause | undefined; agora: number } {
  const meuId  = useAuthStore(s => s.profile?.id)
  const pausas = useLeadPauseStore(s => s.pausas)
  const [agora, setAgora] = useState(() => Date.now())
  const temPausa = pausas.length > 0

  useEffect(() => {
    if (!temPausa) return
    setAgora(Date.now())
    const id = setInterval(() => setAgora(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [temPausa])

  return { pausa: pausaDe(pausas, meuId, agora), agora }
}

/**
 * Recebimento de leads — ligar e desligar a própria vez na roleta.
 *
 * Mora no menu do perfil (computador) e na folha "Mais" (celular). Desligar
 * não é um interruptor: o sistema pergunta o tamanho do intervalo, porque a
 * volta é automática — ninguém fica fora da roleta por esquecimento.
 *
 * Banco primeiro: o estado só muda depois que o banco confirmou. Se a leitura
 * falhar, o bloco não afirma nem "recebendo" nem "em pausa".
 */
export function PausaLeads({ tema }: { tema: 'menu' | 'folha' }) {
  const { carregado, carregando, erro, carregar, pausar, retomar } = useLeadPauseStore()
  const meuId = useAuthStore(s => s.profile?.id)
  const { pausa, agora } = useMinhaPausa()
  const [escolhendo, setEscolhendo] = useState(false)
  const [gravando, setGravando] = useState<LeadPausePreset | 'voltar' | null>(null)

  // Cada vez que o menu abre, confirma com o banco (o admin pode ter devolvido
  // o corretor à roleta, ou a pausa pode ter sido feita em outro aparelho).
  useEffect(() => { void carregar() }, [carregar])

  const c = tema === 'menu'
    ? { forte: 'var(--nav-active-text)', mudo: 'var(--nav-muted)', fundo: 'var(--nav-hover-bg)', linha: 'var(--nav-line)', elev: 'var(--nav-elev)' }
    : { forte: 'var(--t1)',              mudo: 'var(--t4)',        fundo: 'var(--surface-2)',    linha: 'var(--line)',     elev: 'var(--surface)' }
  const grande = tema === 'folha'

  async function escolher(preset: LeadPausePreset) {
    setGravando(preset)
    try {
      const nova = await pausar(preset)
      setEscolhendo(false)
      const quando = horaDaVolta(nova.untilAt)
      toast.success(`Recebimento pausado — você volta para a roleta ${quando}`)
    } catch {
      // a camada do banco já mostrou o erro; o estado continua "recebendo"
    } finally {
      setGravando(null)
    }
  }

  async function voltar() {
    if (!meuId) return
    setGravando('voltar')
    try {
      await retomar(meuId)
      toast.success('Você voltou para a roleta de leads')
    } catch {
      // erro já mostrado; a pausa continua valendo
    } finally {
      setGravando(null)
    }
  }

  const titulo = (
    <p className={`font-label font-bold uppercase tracking-[0.14em] ${grande ? 'text-[11.5px] mb-2' : 'text-[11px] mb-1.5'}`}
       style={{ color: c.mudo }}>
      Recebimento de leads
    </p>
  )

  const botao = `flex flex-shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[9px] font-semibold
                 transition-colors disabled:cursor-default disabled:opacity-60
                 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40
                 ${grande ? 'h-10 px-3.5 text-[13.5px]' : 'h-8 px-2.5 text-[12.5px]'}`

  // ── Ainda não se sabe (primeira leitura) ou a leitura falhou ───────────────
  if (!carregado) {
    return (
      <div className={grande ? 'pb-1 pt-3' : 'px-2 pb-1 pt-1'}>
        {titulo}
        {erro ? (
          <div className="flex flex-col items-start gap-2 rounded-lg p-2.5" style={{ background: c.fundo }} role="alert">
            <p className={grande ? 'text-[13.5px]' : 'text-[12.5px]'} style={{ color: c.forte }}>
              Não foi possível ler se você está recebendo leads.
            </p>
            <button type="button" onClick={() => void carregar()} disabled={carregando}
                    className={botao} style={{ background: c.elev, color: c.forte, border: `1px solid ${c.linha}` }}>
              Tentar de novo
            </button>
          </div>
        ) : (
          <div className={`rounded-lg shimmer ${grande ? 'h-14' : 'h-11'}`} aria-hidden />
        )}
      </div>
    )
  }

  // ── Em pausa ───────────────────────────────────────────────────────────────
  if (pausa) {
    const quando = horaDaVolta(pausa.untilAt, agora)
    const falta  = tempoRestante(pausa.untilAt, agora)
    return (
      <div className={grande ? 'pb-1 pt-3' : 'px-2 pb-1 pt-1'}>
        {titulo}
        <div className="rounded-lg border border-warning-line bg-warning-bg p-2.5" role="status">
          <p className={`flex items-center gap-2 leading-tight ${grande ? 'text-[14.5px]' : 'text-[13px]'}`} style={{ color: c.forte }}>
            <span className="h-2 w-2 flex-shrink-0 rounded-full bg-warning" aria-hidden />
            <span className="min-w-0 truncate">
              <span className="font-semibold">Em pausa</span>
              <span className="tabular-nums"> · volta {quando}</span>
            </span>
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className={`tabular-nums ${grande ? 'text-[13px]' : 'text-[12px]'}`} style={{ color: c.mudo }}>
              {quando === 'amanhã' ? 'até o fim do dia' : `${falta === '1 min' ? 'falta' : 'faltam'} ${falta}`}
            </p>
            <button type="button" onClick={() => void voltar()} disabled={gravando !== null}
                    className={botao}
                    style={{ background: 'var(--brand-fill)', color: 'var(--brand-fill-text)' }}>
              {gravando === 'voltar'
                ? <Loader2 size={13} className="animate-spin" aria-hidden />
                : <Play size={12} strokeWidth={2.4} aria-hidden />}
              Voltar agora
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Recebendo: escolhendo o intervalo ──────────────────────────────────────
  if (escolhendo) {
    return (
      <div className={grande ? 'pb-1 pt-3' : 'px-2 pb-1 pt-1'}>
        {titulo}
        <div className="rounded-lg p-2.5" style={{ background: c.fundo }}>
          <p className={`font-semibold ${grande ? 'text-[14.5px]' : 'text-[13px]'}`} style={{ color: c.forte }}>
            Quanto tempo de intervalo?
          </p>
          <p className={`mt-0.5 ${grande ? 'text-[13px]' : 'text-[12px]'}`} style={{ color: c.mudo }}>
            Depois disso você volta sozinho para a roleta.
          </p>
          <div className="mt-2.5 grid grid-cols-3 gap-1.5" role="group" aria-label="Tamanho do intervalo">
            {PRESETS_PAUSA.map(p => (
              <button key={p.id} type="button" onClick={() => void escolher(p.id)} disabled={gravando !== null}
                      className={`${botao} ${p.id === 'dia' ? 'col-span-2' : ''} hover:brightness-[0.97]`}
                      style={{ background: c.elev, color: c.forte, border: `1px solid ${c.linha}` }}>
                {gravando === p.id && <Loader2 size={13} className="animate-spin" aria-hidden />}
                {p.rotulo}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setEscolhendo(false)} disabled={gravando !== null}
                  className={`mt-2 w-full cursor-pointer rounded-md py-1 text-center font-medium hover:underline
                              focus:outline-none focus-visible:underline ${grande ? 'text-[13.5px]' : 'text-[12.5px]'}`}
                  style={{ color: c.mudo }}>
            Continuar recebendo
          </button>
        </div>
      </div>
    )
  }

  // ── Recebendo ──────────────────────────────────────────────────────────────
  return (
    <div className={grande ? 'pb-1 pt-3' : 'px-2 pb-1 pt-1'}>
      {titulo}
      <div className="flex items-center gap-2.5 rounded-lg p-2.5" style={{ background: c.fundo }} role="status">
        <span className="h-2 w-2 flex-shrink-0 rounded-full bg-success" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className={`font-semibold leading-tight ${grande ? 'text-[14.5px]' : 'text-[13px]'}`} style={{ color: c.forte }}>
            Recebendo leads
          </p>
          <p className={`leading-tight mt-0.5 ${grande ? 'text-[13px]' : 'text-[12px]'}`} style={{ color: c.mudo }}>
            Você está na roleta
          </p>
        </div>
        <button type="button" onClick={() => setEscolhendo(true)}
                className={botao} style={{ background: c.elev, color: c.forte, border: `1px solid ${c.linha}` }}>
          <Pause size={12} strokeWidth={2.4} aria-hidden />
          Pausar
        </button>
      </div>
    </div>
  )
}
