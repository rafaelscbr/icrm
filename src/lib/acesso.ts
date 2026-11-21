import { supabase } from './supabase'

/**
 * Registro de acesso — o que alimenta o "Ryan Maciel entrou no iCRM às 9h02"
 * e o "Ryan ainda não entrou no iCRM (9h10)" do admin (migração 098).
 *
 * A sessão do Supabase dura dias, então login não diz nada. O que conta é usar:
 *   • abrir o iCRM;
 *   • a aba voltar a ficar visível;
 *   • clicar ou digitar depois de 30 min sem mexer — no computador a aba fica
 *     aberta e visível de um dia para o outro, e sem isso quem já está
 *     trabalhando apareceria como "não entrou".
 *
 * A regra de "no máximo 1 acesso a cada 15 min" é do banco (registrar_acesso).
 * Aqui só se evita chamar o banco à toa: o navegador não pergunta de novo
 * antes de 15 min do último envio.
 */

export type OrigemAcesso = 'abertura' | 'foco' | 'clique'

/** Intervalo mínimo entre chamadas ao banco (o banco aplica o mesmo limite). */
export const INTERVALO_REGISTRO_MS = 15 * 60 * 1000
/** Parado por mais que isso, o próximo clique ou tecla conta como acesso. */
export const OCIOSO_MS = 30 * 60 * 1000

/**
 * Decide se um evento deve virar chamada ao banco.
 * - `ultimoEnvio`: quando o app chamou registrar_acesso pela última vez;
 * - `ultimaAtividade`: último clique/tecla/abertura/foco visto.
 */
export function deveRegistrar(
  origem: OrigemAcesso,
  agora: number,
  ultimoEnvio: number | null,
  ultimaAtividade: number | null,
): boolean {
  if (ultimoEnvio !== null && agora - ultimoEnvio < INTERVALO_REGISTRO_MS) return false
  if (origem === 'clique') {
    // Clique só conta depois de 30 min parado; sem atividade registrada, conta.
    return ultimaAtividade === null || agora - ultimaAtividade >= OCIOSO_MS
  }
  return true
}

async function enviar(origem: OrigemAcesso): Promise<void> {
  const { error } = await supabase.rpc('registrar_acesso', {
    p_origem: origem,
    p_page:   window.location.pathname,
  })
  // Falhar aqui não pode atrapalhar o uso do sistema: só registra no console.
  if (error) console.warn('[acesso] registrar_acesso:', error.message)
}

/**
 * Liga o registro de acesso para o usuário logado. Devolve a função que desliga.
 * `enviarFn` existe para teste.
 */
export function iniciarRegistroDeAcesso(
  enviarFn: (origem: OrigemAcesso) => Promise<void> = enviar,
  relogio: () => number = Date.now,
): () => void {
  let ultimoEnvio: number | null = null
  let ultimaAtividade: number | null = null

  function tentar(origem: OrigemAcesso) {
    const agora = relogio()
    const registrar = deveRegistrar(origem, agora, ultimoEnvio, ultimaAtividade)
    ultimaAtividade = agora
    if (!registrar) return
    ultimoEnvio = agora
    void enviarFn(origem).catch(err => console.warn('[acesso]', err))
  }

  function aoMudarVisibilidade() {
    if (document.visibilityState === 'visible') tentar('foco')
  }
  function aoInteragir() { tentar('clique') }

  tentar('abertura')
  document.addEventListener('visibilitychange', aoMudarVisibilidade)
  window.addEventListener('pointerdown', aoInteragir, { passive: true })
  window.addEventListener('keydown', aoInteragir)

  return () => {
    document.removeEventListener('visibilitychange', aoMudarVisibilidade)
    window.removeEventListener('pointerdown', aoInteragir)
    window.removeEventListener('keydown', aoInteragir)
  }
}
