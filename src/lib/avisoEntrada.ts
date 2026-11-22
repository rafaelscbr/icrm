import { db } from './db'

/**
 * Aviso de entrada do corretor (migração 099).
 *
 * Na primeira vez do dia em que o corretor abre o sistema — ou volta a uma aba
 * que ficou aberta desde ontem — o banco avisa os admins. "Uma vez por dia" é
 * garantido pelo banco (registrar_entrada_do_dia); aqui só se evita gastar uma
 * chamada quando o aparelho já sabe que hoje já foi registrado.
 *
 * O dia é o de São Paulo, o mesmo que o banco usa: um corretor em outro fuso
 * não "entra duas vezes" na virada.
 *
 * Falha aqui não interrompe nada nem incomoda o corretor: o erro vai para o
 * console com contexto, e a próxima volta à aba tenta de novo.
 */

const chave = (userId: string) => `souza:entrada-do-dia:${userId}`

/** 'AAAA-MM-DD' no horário de São Paulo. */
export function diaDeSaoPaulo(agora: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora)
}

function lerDia(userId: string): string | null {
  try { return localStorage.getItem(chave(userId)) } catch { return null }
}

function gravarDia(userId: string, dia: string) {
  try { localStorage.setItem(chave(userId), dia) } catch { /* sem armazenamento: o banco continua limitando */ }
}

let emVoo = false

export async function registrarEntradaDoDia(userId: string): Promise<void> {
  const hoje = diaDeSaoPaulo(new Date())
  if (emVoo || lerDia(userId) === hoje) return
  emVoo = true
  try {
    // true = avisou agora; false = já tinha entrado hoje, ou é admin. Nos dois
    // casos não há o que fazer de novo até amanhã.
    await db.notifications.registrarEntradaDoDia()
    gravarDia(userId, hoje)
  } catch (e) {
    console.error('[entrada do dia] não foi possível registrar', e)
  } finally {
    emVoo = false
  }
}
