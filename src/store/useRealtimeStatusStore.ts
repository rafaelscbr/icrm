import { create } from 'zustand'

/**
 * Status global da conexão realtime (canal de leads é o sinal de referência).
 * Alimenta o indicador "Tempo real ativo / Reconectando" no funil.
 */
interface RealtimeStatusStore {
  connected: boolean
  setConnected: (v: boolean) => void
}

export const useRealtimeStatusStore = create<RealtimeStatusStore>(set => ({
  connected: false,
  setConnected: (v) => set(s => (s.connected === v ? s : { connected: v })),
}))
