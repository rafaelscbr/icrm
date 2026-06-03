import { supabase } from './supabase'

let _currentUserId: string | null = null

supabase.auth.onAuthStateChange((_event, session) => {
  _currentUserId = session?.user?.id ?? null
})

supabase.auth.getSession().then(({ data }) => {
  _currentUserId = data.session?.user?.id ?? null
})

export function getCurrentUserId(): string | null {
  return _currentUserId
}

/**
 * Retorna o broker_id obrigatório.
 * Se não autenticado, loga o erro e retorna null — a RLS do banco bloqueará a gravação.
 */
export function requireBrokerId(): string | null {
  const id = _currentUserId
  if (!id) {
    console.error('[iCRM] broker_id obrigatório mas usuário não está autenticado. Operação será bloqueada pela RLS.')
  }
  return id
}
