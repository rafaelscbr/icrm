import { supabase } from './supabase'
import { getCurrentUserId } from './auth'

export async function logActivity(
  action: string,
  details?: Record<string, unknown>,
  page?: string,
) {
  const brokerId = getCurrentUserId()
  if (!brokerId) return
  // fire-and-forget — don't block UI
  supabase.from('activity_logs').insert({
    broker_id: brokerId,
    action,
    details:   details ?? null,
    page:      page ?? window.location.pathname,
  }).then()
}
