import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { localDateStr } from '../../lib/formatters'

/**
 * Sobrevivência de quiosque.
 *
 * O requisito difícil do Pulse não é desenhar a tela — é ela ainda estar CERTA
 * às 19h, depois de 12h ligada num iPad. Este hook cuida dos quatro modos de
 * falha que travariam o painel em silêncio.
 */

/** Hora da recarga preventiva (madrugada) — limpa a memória do Safari. */
const HORA_RECARGA_DIARIA = 4

interface KioskOptions {
  /** chamado à meia-noite, quando "hoje" deixa de ser hoje */
  onViradaDoDia: () => void
}

export function useKiosk({ onViradaDoDia }: KioskOptions) {
  const diaRef = useRef(localDateStr())
  const recarregouRef = useRef(false)

  // ── 1. Tela sempre acesa ────────────────────────────────────────────────────
  // O bloqueio automático do iPad continua sendo a proteção principal (ajustar
  // para "Nunca" + Acesso Guiado); o Wake Lock cobre o caso de o iPad ter sido
  // configurado sem isso. É re-solicitado a cada retorno de visibilidade porque
  // o navegador libera o lock sozinho ao esconder a aba.
  useEffect(() => {
    type WakeLockSentinel = { release: () => Promise<void> }
    type WakeLockNavigator = Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> }
    }

    let sentinel: WakeLockSentinel | null = null
    let cancelado = false

    async function solicitar() {
      const nav = navigator as WakeLockNavigator
      if (!nav.wakeLock) return
      try {
        const s = await nav.wakeLock.request('screen')
        if (cancelado) { s.release(); return }
        sentinel = s
      } catch {
        // Navegador negou (aba oculta, bateria baixa). Sem alarde — o
        // Bloqueio Automático do iOS é a garantia real.
      }
    }

    function aoVoltar() {
      if (document.visibilityState === 'visible') solicitar()
    }

    solicitar()
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      cancelado = true
      document.removeEventListener('visibilitychange', aoVoltar)
      sentinel?.release().catch(() => {})
    }
  }, [])

  // ── 2. Token renovado → socket reautenticado ────────────────────────────────
  // O App.tsx faz isso no 'visibilitychange', que numa aba SEMPRE visível nunca
  // dispara. Sem este efeito, ~1h depois o JWT vence, os canais com RLS param
  // de entregar e a tela congela sem nenhum sinal de erro.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((evento, session) => {
      if (evento === 'TOKEN_REFRESHED' && session?.access_token) {
        supabase.realtime.setAuth(session.access_token)
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  // ── 3. Virada do dia + recarga preventiva ───────────────────────────────────
  // Um único timer local de 30s. Não toca na rede: só compara datas e horas.
  useEffect(() => {
    const timer = setInterval(() => {
      const agora = new Date()
      const hoje = localDateStr(agora)

      if (hoje !== diaRef.current) {
        diaRef.current = hoje
        recarregouRef.current = false
        onViradaDoDia()
      }

      // Recarga preventiva de madrugada: uma vez por dia, quando ninguém olha.
      // Custo: um bootstrap. Ganho: 12h de heap limpo no Safari.
      if (agora.getHours() === HORA_RECARGA_DIARIA && !recarregouRef.current) {
        recarregouRef.current = true
        window.location.reload()
      }
    }, 30_000)

    return () => clearInterval(timer)
  }, [onViradaDoDia])
}

/**
 * Relógio isolado num hook próprio para que só o componente do relógio
 * re-renderize a cada segundo — o resto da tela fica parado.
 */
export function useRelogio(): Date {
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return agora
}

/** Tick lento (30s) para tempos relativos e recálculo do clima. JS puro. */
export function useTickLento(onTick: () => void) {
  useEffect(() => {
    const t = setInterval(onTick, 30_000)
    return () => clearInterval(t)
  }, [onTick])
}
