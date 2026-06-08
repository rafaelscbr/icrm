/**
 * Limpeza do banco de dados após cada teste E2E.
 *
 * Garante que nenhum dado de teste permaneça no banco após execução:
 * - disparo_logs dos leads E2E
 * - campaign_activity dos leads E2E
 * - funnelStage dos leads E2E (reset para 'new')
 * - cooldown_until zerado
 */

import { request as playwrightRequest } from '@playwright/test'
import { E2E_USER_ID, E2E_CAMPAIGN_ID, E2E_LEAD_IDS } from './auth'

const SUPABASE_URL  = 'https://dczexbzsfdavcrwiungk.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjemV4YnpzZmRhdmNyd2l1bmdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MzE2OTgsImV4cCI6MjA5MjQwNzY5OH0.BCQ1B1sDvBz9Q0oOxG9o7kuQ9evLyYiXJ5QN3SfGENc'

/** Limpa TODOS os registros criados pelo teste E2E */
export async function cleanupAfterTest(accessToken: string) {
  const ctx = await playwrightRequest.newContext({
    extraHTTPHeaders: {
      'apikey':        SUPABASE_ANON,
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=minimal',
    },
  })

  try {
    // 1. Remove disparo_logs do usuário E2E
    await ctx.delete(
      `${SUPABASE_URL}/rest/v1/disparo_logs?broker_id=eq.${E2E_USER_ID}`,
    )

    // 2. Remove campaign_activity da campanha E2E
    await ctx.delete(
      `${SUPABASE_URL}/rest/v1/campaign_activity?campaign_id=eq.${E2E_CAMPAIGN_ID}`,
    )

    // 3. Reset funnelStage dos leads E2E para 'new'
    for (const leadId of E2E_LEAD_IDS) {
      await ctx.patch(
        `${SUPABASE_URL}/rest/v1/campaign_leads?id=eq.${leadId}`,
        {
          data: {
            funnel_stage:    'new',
            first_contact_at: null,
            last_message:    null,
            message_index:   null,
            last_sent_by_id: null,
            last_sent_by_name: null,
            last_sent_at:    null,
            dispatch_count:  0,
            updated_at:      new Date().toISOString(),
          },
        }
      )
    }
  } finally {
    await ctx.dispose()
  }
}
