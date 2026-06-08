/**
 * Credenciais temporárias do Dionata para testes de diagnóstico.
 *
 * ATENÇÃO:
 * - Senha temporária definida via SQL antes dos testes
 * - Hash original DEVE ser restaurado após os testes
 * - Hash original: $2a$10$FFMX9ytuxCQb3Q5YhTUvR.u7SKk9PB.ccaqhPdVpIZ9zs7bu.NtqK
 *
 * Campanha: Porto Velas (ID: 1780418828582-9fxwqgs) — 7082 leads reais
 * 5 leads escolhidos em 'new' com dispatch_count=0 para os testes
 */

import { Page, request as playwrightRequest } from '@playwright/test'
import { SupabaseSession } from './auth'

const SUPABASE_URL  = 'https://dczexbzsfdavcrwiungk.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjemV4YnpzZmRhdmNyd2l1bmdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MzE2OTgsImV4cCI6MjA5MjQwNzY5OH0.BCQ1B1sDvBz9Q0oOxG9o7kuQ9evLyYiXJ5QN3SfGENc'

export const DIONATA_EMAIL    = 'dionataalves1@gmail.com'
export const DIONATA_PASSWORD = 'TempTest@2026!'
export const DIONATA_USER_ID  = '54fd0e07-124f-43e6-aded-e17589e9c9ff'
export const DIONATA_CAMPAIGN_ID = '1780418828582-9fxwqgs'
export const DIONATA_CAMPAIGN_NAME = 'Porto Velas'

/** IDs dos 5 leads escolhidos em 'new' / dispatch_count=0 para os testes */
export const DIONATA_LEAD_IDS = [
  '1780418835093-qwd9lh5',  // Ale
  '1780418835093-gpakjpo',  // Aline Melo
  '1780418835093-qkok2sb',  // Bruno Mendes
  '1780418835093-cq1poob',  // Carol
  '1780418835093-lyuszcb',  // Ana Carina Kovalski Sanchez
] as const

export const DIONATA_LEAD_NAMES = {
  ale:           'Ale',
  alineMelo:     'Aline Melo',
  brunoMendes:   'Bruno Mendes',
  carol:         'Carol',
  anaCarina:     'Ana Carina Kovalski Sanchez',
} as const

/** Telefones dos 5 leads — usados para busca exata (evita matches de substring) */
export const DIONATA_LEAD_PHONES = {
  ale:           '47999999999',   // lead 1780418835093-qwd9lh5
  alineMelo:     '47988332517',   // lead 1780418835093-gpakjpo
  brunoMendes:   '47996699504',   // lead 1780418835093-qkok2sb
  carol:         '34984248167',   // lead 1780418835093-cq1poob
  anaCarina:     '47999443439',   // lead 1780418835093-lyuszcb
} as const

/**
 * Obtém sessão real do Dionata via Supabase REST.
 * Requer que a senha temporária TempTest@2026! esteja ativa.
 */
export async function getDionataSession(): Promise<SupabaseSession> {
  const ctx = await playwrightRequest.newContext()
  const res = await ctx.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      headers: {
        'apikey':       SUPABASE_ANON,
        'Content-Type': 'application/json',
      },
      data: { email: DIONATA_EMAIL, password: DIONATA_PASSWORD },
    }
  )
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`[DIONATA AUTH] Falha: ${res.status()} ${body}`)
  }
  const session = await res.json() as SupabaseSession
  await ctx.dispose()
  return session
}

/**
 * Injeta sessão do Dionata no localStorage.
 */
export async function injectDionataSession(page: Page, session: SupabaseSession) {
  const storageKey = 'sb-dczexbzsfdavcrwiungk-auth-token'
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
  // Usa 'domcontentloaded' — não 'networkidle' porque Dionata tem 7082 leads
  // que são carregados via 8 requests sequenciais, mantendo a rede não-idle.
  await page.reload({ waitUntil: 'domcontentloaded' })
}
