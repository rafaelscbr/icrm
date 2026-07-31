import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

/**
 * Presença em modo OBSERVADOR.
 *
 * O Pulse entra no mesmo canal 'broker-presence' que o app usa, mas nunca chama
 * track(). Isso é essencial: a chave de presença é o userId, e o iPad está
 * logado com a conta do admin. Se o quiosque se registrasse, apareceria como
 * "Rafael online em /pulse" 12 horas por dia e MASCARARIA a atividade real do
 * Rafael no radar — o painel mentiria justamente sobre o que veio medir.
 *
 * Por isso não reutiliza usePresenceStore (que registra ao iniciar): o quiosque
 * observa, não participa.
 */

interface PresencaBruta {
  name?:        string
  currentPage?: string
  lastSeen?:    string
}

export interface CorretorOnline {
  brokerId:    string
  nome:        string
  paginaAtual: string
}

/** Tópico compartilhado com o PresenceTracker do app — é onde os corretores se registram. */
const TOPICO = 'broker-presence'

export function usePulsePresence(): CorretorOnline[] {
  const [online, setOnline] = useState<CorretorOnline[]>([])

  useEffect(() => {
    // Guard contra canal duplicado numa remontagem (StrictMode em dev, por ex.).
    if (supabase.getChannels().some(c => c.topic === `realtime:${TOPICO}`)) return

    const channel = supabase.channel(TOPICO, {
      config: { presence: { key: `pulse-observer-${Date.now()}` } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresencaBruta>()
        const lista: CorretorOnline[] = Object.entries(state)
          .filter(([uid]) => !uid.startsWith('pulse-observer-'))
          .map(([uid, presencas]) => {
            const arr = presencas as PresencaBruta[]
            const recente = arr.reduce((a, b) =>
              new Date(a.lastSeen ?? 0) >= new Date(b.lastSeen ?? 0) ? a : b
            )
            return {
              brokerId:    uid,
              nome:        recente.name ?? '—',
              paginaAtual: recente.currentPage ?? '',
            }
          })
        setOnline(lista)
      })
      .subscribe()   // sem track() — apenas escuta

    return () => { supabase.removeChannel(channel) }
  }, [])

  return online
}
