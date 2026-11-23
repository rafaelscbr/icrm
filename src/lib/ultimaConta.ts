/**
 * Última conta que entrou neste aparelho (22/11/2026) — para a tela de entrada
 * reconhecer quem volta: "É você, Ryan?", com a foto e o e-mail preenchido.
 *
 * Fica só no aparelho (localStorage) e guarda só o que já aparece na tela:
 * nome, foto e e-mail. Nunca a senha. "Não é você?" apaga.
 */

export interface UltimaConta { email: string; nome: string; foto?: string }

const CHAVE = 'icrm:ultima-conta'

export function lerUltimaConta(): UltimaConta | null {
  try {
    const bruto = localStorage.getItem(CHAVE)
    if (!bruto) return null
    const c = JSON.parse(bruto) as Partial<UltimaConta>
    return typeof c.email === 'string' && typeof c.nome === 'string' && c.email && c.nome
      ? { email: c.email, nome: c.nome, foto: typeof c.foto === 'string' ? c.foto : undefined }
      : null
  } catch { return null }
}

export function guardarUltimaConta(c: UltimaConta): void {
  try { localStorage.setItem(CHAVE, JSON.stringify(c)) } catch { /* modo privado: só não lembra */ }
}

export function esquecerUltimaConta(): void {
  try { localStorage.removeItem(CHAVE) } catch { /* nada a apagar */ }
}
