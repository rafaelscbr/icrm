/**
 * Mensagem de falha legível. O `Error` cru do supabase-js às vezes vem sem
 * `message` útil; nesse caso dizemos o que dá para dizer com honestidade.
 */
export function mensagemDeErro(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string' && err) return err
  return 'Falha de comunicação com o banco.'
}
