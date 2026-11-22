import { db } from './db'

/**
 * Registro de presença para o relatório de Performance (migração 098).
 *
 * Dois momentos só: abrir o sistema e voltar à aba. Quem garante "no máximo um
 * registro a cada 15 minutos por usuário" é o banco (registrar_presenca); esta
 * camada apenas evita gastar uma chamada quando já sabe que o banco recusaria —
 * o horário da última gravação fica no aparelho.
 *
 * Falha aqui não interrompe nada nem incomoda o corretor com aviso: presença é
 * medição de fundo. O erro vai para o console com contexto, para ser achado.
 */

export const INTERVALO_PRESENCA_MS = 15 * 60 * 1000

const chave = (userId: string) => `souza:presenca:${userId}`

/** Vale chamar o banco? Só se a última gravação conhecida tem mais de 15 minutos. */
export function deveRegistrar(ultima: number | null, agora: number): boolean {
  return ultima === null || !Number.isFinite(ultima) || agora - ultima >= INTERVALO_PRESENCA_MS || agora < ultima
}

function lerUltima(userId: string): number | null {
  try {
    const v = localStorage.getItem(chave(userId))
    return v === null ? null : Number(v)
  } catch {
    return null
  }
}

function gravarUltima(userId: string, quando: number) {
  try { localStorage.setItem(chave(userId), String(quando)) } catch { /* sem armazenamento: o banco continua limitando */ }
}

let emVoo = false

export async function registrarPresenca(userId: string, acao: 'abriu' | 'voltou'): Promise<void> {
  const agora = Date.now()
  if (emVoo || !deveRegistrar(lerUltima(userId), agora)) return
  emVoo = true
  try {
    await db.performance.registrarPresenca(acao)
    // Gravou ou o banco disse que já havia um registro recente: nos dois casos
    // não adianta tentar de novo antes de 15 minutos.
    gravarUltima(userId, agora)
  } catch (e) {
    console.error('[presença] não foi possível registrar', acao, e)
  } finally {
    emVoo = false
  }
}
