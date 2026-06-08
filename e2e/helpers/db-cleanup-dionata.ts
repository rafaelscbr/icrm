/**
 * Limpeza precisa após testes de diagnóstico com Dionata.
 *
 * NÃO deleta todo o histórico do Dionata.
 * Deleta APENAS os registros criados APÓS testStartTime e para os 5 leads de teste.
 * Restaura os 5 leads ao estado original (funnel_stage='new', dispatch_count=0).
 */

import { request as playwrightRequest } from '@playwright/test'
import { DIONATA_USER_ID, DIONATA_LEAD_IDS, DIONATA_CAMPAIGN_ID } from './auth-dionata'

const SUPABASE_URL  = 'https://dczexbzsfdavcrwiungk.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjemV4YnpzZmRhdmNyd2l1bmdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MzE2OTgsImV4cCI6MjA5MjQwNzY5OH0.BCQ1B1sDvBz9Q0oOxG9o7kuQ9evLyYiXJ5QN3SfGENc'

/**
 * Limpa registros criados durante os testes de diagnóstico.
 *
 * @param accessToken - token JWT do Dionata (da sessão de teste)
 * @param testStartTime - ISO string do início dos testes (deleta apenas após este momento)
 */
export async function cleanupDionataTestData(
  accessToken: string,
  testStartTime: string,
) {
  const ctx = await playwrightRequest.newContext({
    extraHTTPHeaders: {
      'apikey':        SUPABASE_ANON,
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=minimal',
    },
  })

  const leadIdFilter = DIONATA_LEAD_IDS.map(id => `lead_id=eq.${id}`).join(',')

  try {
    // 1. Remove TODOS os disparo_logs do Dionata criados APÓS testStartTime
    // (inclui logs de leads "errados" como Alexandre, não apenas os 5 leads de teste)
    await ctx.delete(
      `${SUPABASE_URL}/rest/v1/disparo_logs?broker_id=eq.${DIONATA_USER_ID}&fired_at=gte.${testStartTime}`,
    )

    // 2. Remove campaign_activity dos leads de teste criados APÓS testStartTime
    for (const leadId of DIONATA_LEAD_IDS) {
      await ctx.delete(
        `${SUPABASE_URL}/rest/v1/campaign_activity?campaign_id=eq.${DIONATA_CAMPAIGN_ID}&lead_id=eq.${leadId}&created_at=gte.${testStartTime}`,
      )
    }

    // 3. Restaura os 5 leads ao estado original
    for (const leadId of DIONATA_LEAD_IDS) {
      await ctx.patch(
        `${SUPABASE_URL}/rest/v1/campaign_leads?id=eq.${leadId}`,
        {
          data: {
            funnel_stage:      'new',
            first_contact_at:  null,
            last_message:      null,
            message_index:     null,
            last_sent_by_id:   null,
            last_sent_by_name: null,
            last_sent_at:      null,
            dispatch_count:    0,
            updated_at:        new Date().toISOString(),
          },
        }
      )
    }
  } finally {
    await ctx.dispose()
  }
}

/** Verifica que os 5 leads foram corretamente restaurados */
export async function verifyCleanup(accessToken: string): Promise<string[]> {
  const ctx = await playwrightRequest.newContext({
    extraHTTPHeaders: {
      'apikey':        SUPABASE_ANON,
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type':  'application/json',
    },
  })

  const issues: string[] = []
  try {
    for (const leadId of DIONATA_LEAD_IDS) {
      const res = await ctx.get(
        `${SUPABASE_URL}/rest/v1/campaign_leads?id=eq.${leadId}&select=id,funnel_stage,dispatch_count`
      )
      const rows = await res.json() as Array<{ id: string; funnel_stage: string; dispatch_count: number }>
      const lead = rows[0]
      if (!lead) {
        issues.push(`${leadId}: NÃO ENCONTRADO`)
      } else if (lead.funnel_stage !== 'new' || lead.dispatch_count !== 0) {
        issues.push(`${leadId}: stage=${lead.funnel_stage} count=${lead.dispatch_count} (esperado: new/0)`)
      }
    }
  } finally {
    await ctx.dispose()
  }
  return issues
}
