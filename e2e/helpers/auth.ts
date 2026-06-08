/**
 * Helpers de autenticação E2E para Supabase.
 *
 * Usa a REST API do Supabase para obter access_token real,
 * depois injeta a sessão no localStorage — assim o app
 * inicia já autenticado sem passar pelo formulário de login.
 */

import { Page, request as playwrightRequest } from '@playwright/test'

const SUPABASE_URL  = 'https://dczexbzsfdavcrwiungk.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjemV4YnpzZmRhdmNyd2l1bmdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MzE2OTgsImV4cCI6MjA5MjQwNzY5OH0.BCQ1B1sDvBz9Q0oOxG9o7kuQ9evLyYiXJ5QN3SfGENc'

// Usuário criado exclusivamente para E2E — não é dado de produção
export const E2E_EMAIL    = 'e2e_test_dispatch@souza.test'
export const E2E_PASSWORD = 'E2eTest@2026!'
export const E2E_USER_ID  = 'e2e00000-0000-0000-0000-000000000001'
export const E2E_CAMPAIGN_ID  = 'e2e-camp-001'
export const E2E_LEAD_IDS = [
  'e2e-lead-001',
  'e2e-lead-002',
  'e2e-lead-003',
  'e2e-lead-004',
  'e2e-lead-005',
]

export interface SupabaseSession {
  access_token:  string
  refresh_token: string
  expires_in:    number
  expires_at:    number
  token_type:    string
  user:          Record<string, unknown>
}

/**
 * Obtém uma sessão válida do Supabase para o usuário E2E.
 * Usa a API REST /auth/v1/token — não abre o browser.
 */
export async function getE2ESession(): Promise<SupabaseSession> {
  const ctx = await playwrightRequest.newContext()
  const res = await ctx.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      headers: {
        'apikey':       SUPABASE_ANON,
        'Content-Type': 'application/json',
      },
      data: { email: E2E_EMAIL, password: E2E_PASSWORD },
    }
  )
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`Falha na autenticação E2E: ${res.status()} ${body}`)
  }
  const session = await res.json() as SupabaseSession
  await ctx.dispose()
  return session
}

/**
 * Injeta a sessão Supabase no localStorage da page,
 * depois recarrega — o app lê o token e inicia autenticado.
 */
export async function injectSession(page: Page, session: SupabaseSession) {
  // Supabase usa chave "sb-<project_ref>-auth-token" no localStorage
  const projectRef = 'dczexbzsfdavcrwiungk'
  const storageKey = `sb-${projectRef}-auth-token`

  await page.goto('/', { waitUntil: 'domcontentloaded' })

  await page.evaluate(
    ({ key, value }) => { localStorage.setItem(key, JSON.stringify(value)) },
    {
      key: storageKey,
      value: {
        access_token:  session.access_token,
        refresh_token: session.refresh_token,
        token_type:    'bearer',
        expires_in:    session.expires_in,
        expires_at:    session.expires_at,
        user:          session.user,
      },
    }
  )

  // Recarrega para que o app inicialize com a sessão injetada
  await page.reload({ waitUntil: 'networkidle' })
}
