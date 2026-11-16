/**
 * Pausa no recebimento de leads — a parte que calcula, sem tela e sem rede.
 *
 * O corretor pausa pelo menu do perfil e escolhe o intervalo; enquanto a pausa
 * vale, nenhum rodízio entrega lead para ele (migração 089). A volta é
 * automática: a pausa tem hora de fim e quem decide se ela está em vigor é o
 * relógio do banco. Aqui ficam só os rótulos e as frases que a tela mostra.
 */
import type { LeadPause, LeadPausePreset } from '../types'
import { localDateStr } from './formatters'

export const PRESETS_PAUSA: { id: LeadPausePreset; rotulo: string }[] = [
  { id: '30min', rotulo: '30 min' },
  { id: '1h',    rotulo: '1 h' },
  { id: '2h',    rotulo: '2 h' },
  { id: '3h',    rotulo: '3 h' },
  { id: 'dia',   rotulo: 'Dia todo' },
]

/** A pausa ainda vale? (para a tela; a roleta usa o relógio do banco) */
export function pausaEmVigor(p: Pick<LeadPause, 'untilAt'>, agora: number = Date.now()): boolean {
  return new Date(p.untilAt).getTime() > agora
}

/** A pausa de um corretor, se estiver em vigor. */
export function pausaDe(pausas: LeadPause[], brokerId: string | null | undefined, agora: number = Date.now()): LeadPause | undefined {
  if (!brokerId) return undefined
  return pausas.find(p => p.brokerId === brokerId && pausaEmVigor(p, agora))
}

/** "às 14:30" no mesmo dia; "amanhã" quando o fim cai no dia seguinte (dia todo). */
export function horaDaVolta(untilAt: string, agora: number = Date.now()): string {
  const fim = new Date(untilAt)
  if (localDateStr(fim) !== localDateStr(new Date(agora))) {
    // "Dia todo" termina à meia-noite: dizer "às 00:00" confunde, "amanhã" não.
    const hora = fim.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    return hora === '00:00' ? 'amanhã' : `amanhã às ${hora}`
  }
  return `às ${fim.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

/** "42 min", "1 h 20 min", "3 h" — quanto falta para a volta. */
export function tempoRestante(untilAt: string, agora: number = Date.now()): string {
  const min = Math.max(1, Math.ceil((new Date(untilAt).getTime() - agora) / 60_000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** "volta às 14:30 · faltam 42 min" · "volta amanhã". */
export function fraseDaVolta(untilAt: string, agora: number = Date.now()): string {
  const quando = horaDaVolta(untilAt, agora)
  if (quando === 'amanhã') return 'volta amanhã'
  return `volta ${quando} · ${tempoRestante(untilAt, agora) === '1 min' ? 'falta 1 min' : `faltam ${tempoRestante(untilAt, agora)}`}`
}

/** Quanto falta, em ms, para a primeira pausa acabar; null sem pausa em vigor. */
export function msAteProximaVolta(pausas: LeadPause[], agora: number = Date.now()): number | null {
  const fins = pausas.map(p => new Date(p.untilAt).getTime()).filter(t => t > agora)
  return fins.length === 0 ? null : Math.min(...fins) - agora
}
