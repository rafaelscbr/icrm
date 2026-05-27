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
