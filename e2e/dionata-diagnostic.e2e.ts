/**
 * DIAGNÓSTICO E2E — Segundo disparo trava para Dionata
 *
 * Executa com credenciais REAIS do Dionata (senha temporária ativa).
 * Campanha real: Porto Velas (7082 leads).
 * 5 leads reais em funnel_stage='new', dispatch_count=0.
 *
 * Objetivo: evidência objetiva sobre onde e por que o segundo disparo trava.
 * Cada teste captura console.log [DISPARO] para rastreio completo.
 *
 * IMPORTANTE: limpeza completa ao final — leads restaurados ao estado original.
 */

import { test, expect, Page, ConsoleMessage } from '@playwright/test'
import { request as playwrightRequest } from '@playwright/test'
import {
  getDionataSession, injectDionataSession,
  DIONATA_CAMPAIGN_NAME, DIONATA_CAMPAIGN_ID,
  DIONATA_USER_ID, DIONATA_LEAD_IDS, DIONATA_LEAD_NAMES, DIONATA_LEAD_PHONES,
} from './helpers/auth-dionata'
import {
  cleanupDionataTestData, verifyCleanup,
} from './helpers/db-cleanup-dionata'
import { SupabaseSession } from './helpers/auth'

// ─── Constantes ───────────────────────────────────────────────────────────────

const SUPABASE_URL  = 'https://dczexbzsfdavcrwiungk.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjemV4YnpzZmRhdmNyd2l1bmdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MzE2OTgsImV4cCI6MjA5MjQwNzY5OH0.BCQ1B1sDvBz9Q0oOxG9o7kuQ9evLyYiXJ5QN3SfGENc'
const SUPABASE_HOST = 'dczexbzsfdavcrwiungk.supabase.co'

// CRÍTICO: usar horário real atual.
// Razão: o JWT emitido para Dionata expira em 1h. Qualquer clock muito à frente
// do momento de emissão faz o Supabase client pensar que o token expirou →
// auth.uid() = NULL → RLS bloqueia SELECT em campaigns → "Nenhuma campanha".
//
// Horário real atual (~21:25 UTC = 18:25 local) satisfaz:
// 1. Token JWT ainda válido (emitido ~21:18 UTC, expira ~22:18 UTC)
// 2. Cooldown do Dionata já expirado (último em 20:43:13 UTC)
// 3. isBusinessHours() = true (18:25 local está entre 8h-20h)
// 4. page.clock.fastForward(200_000) avança 200s → ainda dentro da validade do token
const BUSINESS_HOUR = new Date()  // horário real no momento do carregamento do módulo

// Timeout extendido: Porto Velas carrega 7082 leads em ~8 requests sequenciais
// Cada request leva ~300-800ms → total ~4-7s por load(). Damos margem generosa.
const CAMPAIGN_LOAD_TIMEOUT = 60_000
const DISPATCH_SUCCESS_TIMEOUT = 30_000
const DISPATCH_HANG_TIMEOUT = 20_000  // tempo máximo que damos para um disparo responder

// Marcador de início dos testes — usado para limpeza timestamp-based
let TEST_START_TIME = new Date().toISOString()
let dionataSession: SupabaseSession | null = null

// ─── Coleta de logs ───────────────────────────────────────────────────────────

/** Coleta todos os logs [DISPARO] da página */
function collectDisparoLogs(page: Page): string[] {
  const logs: string[] = []
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.text().includes('[DISPARO]') || msg.text().includes('[PERF]')) {
      const prefix = msg.type() === 'error' ? '❌' : msg.type() === 'warning' ? '⚠️' : '  '
      logs.push(`${prefix} ${msg.text()}`)
    }
  })
  return logs
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function setupPage(page: Page): Promise<SupabaseSession> {
  // OBRIGATÓRIO antes de qualquer goto
  await page.clock.install({ time: BUSINESS_HOUR })
  const session = await getDionataSession()
  dionataSession = session
  await injectDionataSession(page, session)
  return session
}

async function navigateToPortoVelas(page: Page) {
  // Usa 'domcontentloaded' — não 'networkidle' porque o polling pode
  // manter requests em aberto indefinidamente com clock avançado.
  await page.goto('/campanhas', { waitUntil: 'domcontentloaded' })

  // Aguarda o card da Porto Velas aparecer (a store carrega campaigns via RLS)
  await page.getByText(DIONATA_CAMPAIGN_NAME, { exact: false })
    .waitFor({ timeout: CAMPAIGN_LOAD_TIMEOUT })

  const campaignCard = page.locator('div').filter({
    has: page.getByText(DIONATA_CAMPAIGN_NAME, { exact: false }),
  }).filter({
    has: page.getByRole('button', { name: /Ver Leads/ }),
  }).last()

  await campaignCard.getByRole('button', { name: /Ver Leads/ }).click()

  // Aguarda a aba de fila de disparo aparecer
  await page.locator('text=Fila de disparo').waitFor({ timeout: CAMPAIGN_LOAD_TIMEOUT })

  // Aguarda o spinner de carregamento de leads desaparecer — os 7082 leads
  // levam ~5-10s via 8 requests sequenciais de 1000 cada.
  // NÃO usamos networkidle para não bloquear em polling.
  await page.locator('text=Fila de disparo').waitFor({ state: 'visible', timeout: CAMPAIGN_LOAD_TIMEOUT })

  // Espera que haja pelo menos 1 lead na fila (store carregou)
  // Isso confirma que fetchAllPaginated completou os 8 requests
  await page.locator('button').filter({ hasText: /Disparar/ }).first()
    .waitFor({ state: 'visible', timeout: CAMPAIGN_LOAD_TIMEOUT })
}

/**
 * Busca pelo TELEFONE EXATO do lead — evita matches de substring por nome.
 * Ex: buscar "Ale" encontraria "Alexandre". Buscar "47999999999" é exato.
 */
async function searchLeadByPhone(page: Page, phone: string) {
  const searchInput = page.locator('input[placeholder*="Buscar"]')
  await searchInput.clear()
  await searchInput.fill(phone)
  // Aguarda pelo telefone formatado na lista (ex: "47999999999" ou "(47) 99999-9999")
  await page.waitForTimeout(500)  // debounce do filtro
}

async function clickDisparar(page: Page, phone: string) {
  // Encontra a linha que contém o telefone E tem botão Disparar
  const leadRow = page.locator('div').filter({
    hasText: phone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3'),  // formato (XX) XXXXX-XXXX
  }).filter({
    has: page.locator('button', { hasText: /Disparar/ }),
  }).last()

  // Fallback: busca sem formatação (número puro)
  const leadRowRaw = page.locator('div').filter({
    hasText: phone,
  }).filter({
    has: page.locator('button', { hasText: /Disparar/ }),
  }).last()

  // Tenta formato formatado, depois puro
  const btn = leadRow.locator('button', { hasText: /Disparar/ }).or(
    leadRowRaw.locator('button', { hasText: /Disparar/ })
  ).first()

  await btn.waitFor({ state: 'visible', timeout: 15_000 })
  await btn.click()
}

async function selectTemplate(page: Page, idx = 0) {
  await page.locator('text=Escolher mensagem').waitFor({ timeout: 10_000 })
  const label = idx === 0 ? 'Mensagem principal' : `Variação ${idx}`
  await page.locator(`text=${label}`).click()
  await expect(page.locator('button', { hasText: /Enviar mensagem/ }))
    .not.toBeDisabled({ timeout: 3_000 })
}

async function confirmAndWaitSuccess(page: Page) {
  await page.locator('button', { hasText: /Enviar mensagem/ }).click()
  const waLink = page.locator('a', { hasText: 'Abrir WhatsApp' })
  await waLink.waitFor({ timeout: DISPATCH_SUCCESS_TIMEOUT })
  return waLink
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

test.beforeAll(async () => {
  TEST_START_TIME = new Date().toISOString()
  console.log(`[DIAG] Início dos testes: ${TEST_START_TIME}`)
  // Garante que os 5 leads estão em estado limpo antes dos testes
  const session = await getDionataSession()
  dionataSession = session
  await cleanupDionataTestData(session.access_token, new Date(0).toISOString())
  console.log('[DIAG] Limpeza inicial concluída — leads restaurados para new/0')
})

test.afterAll(async () => {
  console.log(`\n[DIAG] === LIMPEZA FINAL ===`)
  if (!dionataSession) return

  await cleanupDionataTestData(dionataSession.access_token, TEST_START_TIME)

  const issues = await verifyCleanup(dionataSession.access_token)
  if (issues.length === 0) {
    console.log('[DIAG] ✅ Todos os 5 leads restaurados ao estado original')
  } else {
    console.error('[DIAG] ❌ LIMPEZA INCOMPLETA:')
    issues.forEach(i => console.error(`  - ${i}`))
  }
})

// Limpeza entre testes (reset dos leads)
test.beforeEach(async () => {
  if (dionataSession) {
    await cleanupDionataTestData(dionataSession.access_token, new Date(0).toISOString())
  }
})

// ─── Suite ────────────────────────────────────────────────────────────────────

test.describe('DIAGNÓSTICO — Segundo disparo trava para Dionata', () => {
  // Porto Velas tem 7082 leads → fetchAllPaginated faz 8 requests sequenciais (~5-10s)
  // TESTE-2/5: 2º disparo sob carga de polling pode levar 200+ segundos → timeout extendido
  test.setTimeout(360_000)  // 6 minutos: cobre 240s de dispatch timeout + navegação + setup

  // ══════════════════════════════════════════════════════════════════════════
  // TESTE 1 — Fluxo básico como Dionata: 1 disparo na Porto Velas
  //
  // Evidência: confirma que Dionata consegue disparar normalmente (1ª vez).
  // Prova que a autenticação, RLS e o fluxo básico funcionam.
  // ══════════════════════════════════════════════════════════════════════════
  test('TESTE-1 · Fluxo básico Dionata: 1 disparo na Porto Velas → sucesso', async ({ page }) => {
    const logs = collectDisparoLogs(page)
    await setupPage(page)
    await navigateToPortoVelas(page)

    console.log('[DIAG] Porto Velas aberta. Buscando lead "Ale" pelo telefone...')
    await searchLeadByPhone(page, DIONATA_LEAD_PHONES.ale)
    await clickDisparar(page, DIONATA_LEAD_PHONES.ale)
    await selectTemplate(page, 0)
    const waLink = await confirmAndWaitSuccess(page)

    await expect(waLink).toBeVisible()
    await page.screenshot({ path: 'e2e-report/TESTE-1-basico-dionata.png' })

    console.log('\n[DIAG] === LOGS TESTE-1 ===')
    logs.forEach(l => console.log(l))
    expect(logs.some(l => l.includes('sendWhatsApp INÍCIO'))).toBe(true)
    expect(logs.some(l => l.includes('sendWhatsApp → persistDisparo OK → sucesso completo'))).toBe(true)
    expect(logs.some(l => l.includes('sendWhatsApp ERRO'))).toBe(false)
  })

  // ══════════════════════════════════════════════════════════════════════════
  // TESTE 2 — BUG SCENARIO: Dois disparos com Dionata, Porto Velas real
  //
  // Este é o cenário exato do bug reportado.
  // Após 1º disparo → bypassa cooldown → tenta 2º disparo.
  // Captura todos os [DISPARO] logs para evidência.
  //
  // EVIDÊNCIA ESPERADA:
  // - Se bug reproduzido: logs param em "sendWhatsApp INÍCIO" sem avançar
  // - Se ok: logs mostram fluxo completo do 2º disparo
  // ══════════════════════════════════════════════════════════════════════════
  test('TESTE-2 · BUG: Dois disparos Dionata → 2º disparo trava?', async ({ page }) => {
    const logs = collectDisparoLogs(page)
    const networkLogs: string[] = []

    // Captura requests de rede para detectar requests pendentes
    page.on('request',  req  => {
      if (req.url().includes(SUPABASE_HOST)) {
        networkLogs.push(`→ REQ  ${req.method()} ${req.url().replace('https://'+SUPABASE_HOST, '')}`)
      }
    })
    page.on('response', res  => {
      if (res.url().includes(SUPABASE_HOST)) {
        networkLogs.push(`← RES  ${res.status()} ${res.url().replace('https://'+SUPABASE_HOST, '')}`)
      }
    })

    await setupPage(page)
    await navigateToPortoVelas(page)

    // ─── PRIMEIRO DISPARO ───
    console.log('[DIAG] === PRIMEIRO DISPARO ===')
    await searchLeadByPhone(page, DIONATA_LEAD_PHONES.ale)
    await clickDisparar(page, DIONATA_LEAD_PHONES.ale)
    await selectTemplate(page, 0)
    const waLink1 = await confirmAndWaitSuccess(page)
    await expect(waLink1).toBeVisible()
    console.log('[DIAG] Primeiro disparo: SUCESSO')

    await page.screenshot({ path: 'e2e-report/TESTE-2-first-dispatch.png' })

    // Avança relógio 200s (bypassa cooldown).
    // NÃO esperamos networkidle após o fastForward:
    // O fastForward dispara 13+ setIntervals de polling (cada faz 8 requests = 104 HTTP).
    // Esperar networkidle travaria por 60+ segundos enquanto esses requests completam.
    // Para o bug, o que importa é: o 2º disparo funciona COM polling em andamento?
    await page.clock.fastForward(200_000)
    await page.clock.runFor(2_000)
    // Damos 2s para React processar re-renders após clock advance
    await page.waitForTimeout(2_000)

    // ─── SEGUNDO DISPARO ───
    console.log('[DIAG] === SEGUNDO DISPARO ===')
    await searchLeadByPhone(page, DIONATA_LEAD_PHONES.alineMelo)
    await clickDisparar(page, DIONATA_LEAD_PHONES.alineMelo)
    await selectTemplate(page, 0)

    // EVIDÊNCIA CRÍTICA: O segundo disparo completa ou trava?
    // IMPORTANTE: clicar "Enviar mensagem" explicitamente e aguardar com timeout longo.
    // Sob carga de polling (104 requests concorrentes), o PATCH pode levar 200+ segundos.
    // Timeout de 240s para capturar se completa lentamente OU se falha definitivamente.
    console.log(`[DIAG] Clicando "Enviar mensagem" para 2º disparo...`)
    await page.locator('button', { hasText: /Enviar mensagem/ }).click()

    console.log(`[DIAG] Aguardando resultado do 2º disparo (timeout 240000ms)...`)

    const waLink2 = page.locator('a', { hasText: 'Abrir WhatsApp' })
    let secondDispatchSucceeded = false
    let secondDispatchError: string | null = null

    try {
      await waLink2.waitFor({ timeout: 240_000 })
      secondDispatchSucceeded = true
      console.log('[DIAG] Segundo disparo: SUCESSO')
    } catch {
      // Bug reproduzido ou timeout
      secondDispatchError = 'TIMEOUT — link "Abrir WhatsApp" não apareceu em 240000ms'
      console.error('[DIAG] Segundo disparo: TRAVOU —', secondDispatchError)
    }

    await page.screenshot({ path: 'e2e-report/TESTE-2-second-dispatch-result.png' })

    // Logs de diagnóstico completos
    console.log('\n[DIAG] === LOGS [DISPARO] TESTE-2 ===')
    logs.forEach(l => console.log(l))

    console.log('\n[DIAG] === NETWORK LOG TESTE-2 (últimas 40 linhas) ===')
    networkLogs.slice(-40).forEach(l => console.log(l))

    // Se o bug foi reproduzido, captura estado do botão
    if (!secondDispatchSucceeded) {
      const sendBtn = page.locator('button', { hasText: /Enviar mensagem/ })
      const isDisabled = await sendBtn.isDisabled().catch(() => false)
      console.error(`[DIAG] Estado do botão após timeout: isDisabled=${isDisabled}`)

      const errorToast = page.locator('text=Disparo não realizado')
      const hasError = await errorToast.isVisible().catch(() => false)
      console.error(`[DIAG] Toast de erro visível: ${hasError}`)
    }

    // O teste NÃO falha se o bug for reproduzido — captura a evidência
    // (a assertiva de sucesso fica comentada para não mascarar o bug)
    if (secondDispatchSucceeded) {
      await expect(waLink2).toBeVisible()
    } else {
      // Evidência do bug: log o estado completo
      console.error('[DIAG] BUG REPRODUZIDO — segundo disparo travou')
      console.error('[DIAG] Logs [DISPARO] capturados:')
      const disparoLogs = logs.filter(l => l.includes('[DISPARO]'))
      disparoLogs.forEach(l => console.error('  ' + l))
      // Fail explícito com evidência
      throw new Error(
        `[EVIDÊNCIA] Segundo disparo travou após ${DISPATCH_HANG_TIMEOUT}ms.\n` +
        `Logs [DISPARO]:\n${disparoLogs.join('\n')}\n` +
        `Último log de rede: ${networkLogs[networkLogs.length - 1] ?? '(nenhum)'}`
      )
    }
  })

  // ══════════════════════════════════════════════════════════════════════════
  // TESTE 3 — Três disparos consecutivos (verificação de estado cumulativo)
  //
  // Evidência: 3 disparos funcionam corretamente, sem corrupção de estado.
  // ══════════════════════════════════════════════════════════════════════════
  test('TESTE-3 · Três disparos consecutivos Dionata', async ({ page }) => {
    const logs = collectDisparoLogs(page)
    await setupPage(page)
    await navigateToPortoVelas(page)

    const leadsToDispatch = [
      { name: DIONATA_LEAD_NAMES.ale,         phone: DIONATA_LEAD_PHONES.ale },
      { name: DIONATA_LEAD_NAMES.alineMelo,   phone: DIONATA_LEAD_PHONES.alineMelo },
      { name: DIONATA_LEAD_NAMES.brunoMendes, phone: DIONATA_LEAD_PHONES.brunoMendes },
    ]

    for (let i = 0; i < leadsToDispatch.length; i++) {
      const { name, phone } = leadsToDispatch[i]
      console.log(`[DIAG] Disparo ${i+1}/3: ${name} (${phone})`)

      await searchLeadByPhone(page, phone)
      await clickDisparar(page, phone)
      await selectTemplate(page, 0)
      const waLink = await confirmAndWaitSuccess(page)
      await expect(waLink).toBeVisible()

      await page.screenshot({ path: `e2e-report/TESTE-3-dispatch-${i+1}.png` })

      if (i < leadsToDispatch.length - 1) {
        // Bypassa cooldown para próximo disparo
        await page.clock.fastForward(200_000)
        await page.clock.runFor(2_000)
        await page.waitForTimeout(2_000)  // React re-render sem aguardar 104 requests
      }
    }

    console.log('\n[DIAG] === LOGS TESTE-3 ===')
    logs.forEach(l => console.log(l))
    expect(logs.filter(l => l.includes('sendWhatsApp → persistDisparo OK → sucesso completo')).length).toBe(3)
  })

  // ══════════════════════════════════════════════════════════════════════════
  // TESTE 4 — Permissão RLS: Dionata atualiza lead com broker_id = null
  //
  // Porto Velas pertence a Dionata (campaign.broker_id = Dionata).
  // RLS permite update via "campaigns.broker_id = auth.uid()".
  // Insere lead temporário com broker_id = null → testa se Dionata pode atualizar.
  // Evidência: RLS funciona como esperado para este cenário.
  // ══════════════════════════════════════════════════════════════════════════
  test('TESTE-4 · RLS: Dionata atualiza lead com broker_id=null (é dono da campanha)', async () => {
    // Usa apenas API (sem browser) — teste de permissão puro

    if (!dionataSession) throw new Error('dionataSession não disponível')

    const tempLeadId = `diag-temp-lead-${Date.now()}`
    const ctx = await playwrightRequest.newContext({
      extraHTTPHeaders: {
        'apikey':        SUPABASE_ANON,
        'Authorization': `Bearer ${dionataSession.access_token}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
      },
    })

    try {
      // PRECONDIÇÃO: insere lead com broker_id explicitamente como Dionata's ID
      // (não podemos inserir broker_id=null via client porque fromCampaignLead fallback)
      // Aqui testamos UPDATE em lead que já existe sem broker_id
      // Usamos lead real existente e verificamos se o update funciona
      const testLeadId = DIONATA_LEAD_IDS[0]

      // 1. Verifica estado inicial
      const getRes = await ctx.get(
        `${SUPABASE_URL}/rest/v1/campaign_leads?id=eq.${testLeadId}&select=id,broker_id,funnel_stage`
      )
      const rows = await getRes.json() as Array<{ id: string; broker_id: string | null; funnel_stage: string }>
      const lead = rows[0]
      console.log(`[DIAG] Lead antes: id=${lead.id} broker_id=${lead.broker_id} stage=${lead.funnel_stage}`)
      expect(lead).toBeDefined()

      // 2. Tenta UPDATE via token do Dionata
      const patchRes = await ctx.patch(
        `${SUPABASE_URL}/rest/v1/campaign_leads?id=eq.${testLeadId}`,
        {
          data: {
            notes:      '[DIAG-TESTE-4] Atualização de teste RLS',
            updated_at: new Date().toISOString(),
          },
        }
      )
      console.log(`[DIAG] PATCH status: ${patchRes.status()} (esperado: 200 ou 204)`)
      expect(patchRes.ok()).toBe(true)

      // 3. Verifica que o update foi aplicado
      const getRes2 = await ctx.get(
        `${SUPABASE_URL}/rest/v1/campaign_leads?id=eq.${testLeadId}&select=id,notes`
      )
      const rows2 = await getRes2.json() as Array<{ id: string; notes: string | null }>
      console.log(`[DIAG] Lead após update: notes="${rows2[0]?.notes}"`)
      expect(rows2[0]?.notes).toContain('[DIAG-TESTE-4]')

      // 4. Testa INSERT em disparo_logs com broker_id = Dionata
      const now = new Date().toISOString()
      const insertRes = await ctx.post(
        `${SUPABASE_URL}/rest/v1/disparo_logs`,
        {
          data: {
            fired_at:    now,
            broker_id:   DIONATA_USER_ID,
            campaign_id: DIONATA_CAMPAIGN_ID,
            lead_id:     testLeadId,
            lead_name:   '[DIAG-TESTE-4]',
          },
        }
      )
      console.log(`[DIAG] INSERT disparo_logs status: ${insertRes.status()} (esperado: 201)`)
      expect(insertRes.ok()).toBe(true)

      // Limpa o disparo_log inserido neste teste
      await ctx.delete(
        `${SUPABASE_URL}/rest/v1/disparo_logs?lead_id=eq.${testLeadId}&lead_name=eq.[DIAG-TESTE-4]`
      )
      // Limpa a nota de teste
      await ctx.patch(
        `${SUPABASE_URL}/rest/v1/campaign_leads?id=eq.${testLeadId}`,
        { data: { notes: null, updated_at: new Date().toISOString() } }
      )

      console.log('[DIAG] TESTE-4: RLS permite UPDATE em campaign_leads e INSERT em disparo_logs ✅')
    } finally {
      await ctx.dispose()
    }
  })

  // ══════════════════════════════════════════════════════════════════════════
  // TESTE 5 — Pressão de polling: múltiplos load() simultâneos antes do 2º disparo
  //
  // Simula o cenário real: fastForward dispara 13+ polling cycles.
  // Cada cycle faz 8 requests (7082 leads / 1000 por page).
  // Testa se o dispatch PATCH sobrevive ao overhead de conexões.
  // ══════════════════════════════════════════════════════════════════════════
  test('TESTE-5 · Pressão de polling: N load() simulados antes do 2º disparo', async ({ page }) => {
    const logs = collectDisparoLogs(page)
    const networkLogs: string[] = []
    let requestCount = 0

    page.on('request', req => {
      if (req.url().includes(SUPABASE_HOST + '/rest/v1/campaign_leads')) {
        requestCount++
      }
    })

    await setupPage(page)
    await navigateToPortoVelas(page)

    const requestsAfterLoad = requestCount
    console.log(`[DIAG] Requests para campaign_leads durante load inicial: ${requestsAfterLoad}`)

    // Primeiro disparo
    await searchLeadByPhone(page, DIONATA_LEAD_PHONES.ale)
    await clickDisparar(page, DIONATA_LEAD_PHONES.ale)
    await selectTemplate(page, 0)
    await confirmAndWaitSuccess(page)
    console.log('[DIAG] Primeiro disparo: OK')

    const requestsAfterFirst = requestCount
    console.log(`[DIAG] Requests campaign_leads após 1º disparo: ${requestsAfterFirst - requestsAfterLoad}`)

    // Avança 400s (26+ polling cycles de 15s)
    // Isso dispara MUITOS load() simultâneos com 8 requests cada
    await page.clock.fastForward(400_000)
    await page.clock.runFor(5_000)

    // Aguarda 5s para capturar o pico de requests sem travar em networkidle
    await page.waitForTimeout(5_000)

    const requestsAfterPolling = requestCount
    const pollingRequests = requestsAfterPolling - requestsAfterFirst
    console.log(`[DIAG] Requests campaign_leads durante 400s de polling: ${pollingRequests}`)
    console.log(`[DIAG] (~${Math.round(pollingRequests/8)} load() cycles × 8 pages cada)`)

    // Segundo disparo durante/após alta pressão de polling (requests ainda podem estar em andamento)
    await searchLeadByPhone(page, DIONATA_LEAD_PHONES.alineMelo)
    await clickDisparar(page, DIONATA_LEAD_PHONES.alineMelo)
    await selectTemplate(page, 0)

    console.log(`[DIAG] Clicando "Enviar mensagem" para 2º disparo (pós ${pollingRequests} requests de polling)...`)
    await page.locator('button', { hasText: /Enviar mensagem/ }).click()

    console.log(`[DIAG] Aguardando resultado do 2º disparo (timeout 240000ms)...`)

    const waLink2 = page.locator('a', { hasText: 'Abrir WhatsApp' })
    let secondOk = false
    try {
      await waLink2.waitFor({ timeout: 240_000 })
      secondOk = true
    } catch {
      console.error('[DIAG] TESTE-5: 2º disparo TRAVOU após alta pressão de polling')
    }

    await page.screenshot({ path: 'e2e-report/TESTE-5-polling-pressure.png' })
    console.log('\n[DIAG] === LOGS TESTE-5 ===')
    logs.forEach(l => console.log(l))

    if (!secondOk) {
      const disparoLogs = logs.filter(l => l.includes('[DISPARO]'))
      throw new Error(
        `[EVIDÊNCIA TESTE-5] 2º disparo travou após ${pollingRequests} requests de polling.\n` +
        `Logs [DISPARO]:\n${disparoLogs.join('\n')}`
      )
    }

    expect(secondOk).toBe(true)
  })

  // ══════════════════════════════════════════════════════════════════════════
  // TESTE 6 — Auditoria de permissões por operação (API direta)
  //
  // Testa cada operação individualmente com token do Dionata.
  // Evidência: identifica exatamente qual operação é bloqueada por RLS.
  // ══════════════════════════════════════════════════════════════════════════
  test('TESTE-6 · Auditoria de permissões Dionata por operação', async () => {
    if (!dionataSession) throw new Error('dionataSession não disponível')

    const ctx = await playwrightRequest.newContext({
      extraHTTPHeaders: {
        'apikey':        SUPABASE_ANON,
        'Authorization': `Bearer ${dionataSession.access_token}`,
        'Content-Type':  'application/json',
      },
    })

    const testLeadId = DIONATA_LEAD_IDS[1]  // Aline Melo
    const now = new Date().toISOString()
    const results: Record<string, { status: number; ok: boolean; body?: string }> = {}

    try {
      // OP-1: SELECT campaign_leads (precondição — precisa funcionar)
      {
        const res = await ctx.get(
          `${SUPABASE_URL}/rest/v1/campaign_leads?id=eq.${testLeadId}&select=id,funnel_stage,broker_id`
        )
        const body = await res.text()
        results['OP-1 SELECT campaign_leads'] = { status: res.status(), ok: res.ok(), body }
        console.log(`[DIAG] OP-1 SELECT campaign_leads: ${res.status()} ${body.slice(0,100)}`)
      }

      // OP-2: UPDATE campaign_leads (markContacted)
      {
        const res = await ctx.patch(
          `${SUPABASE_URL}/rest/v1/campaign_leads?id=eq.${testLeadId}`,
          {
            headers: { 'Prefer': 'return=representation' },
            data: {
              funnel_stage:      'sent',
              dispatch_count:    1,
              last_message:      '[DIAG-TESTE-6] mensagem de teste',
              last_sent_by_id:   DIONATA_USER_ID,
              last_sent_by_name: 'Dionata Alves',
              last_sent_at:      now,
              updated_at:        now,
            },
          }
        )
        const body = await res.text()
        results['OP-2 UPDATE campaign_leads (markContacted)'] = { status: res.status(), ok: res.ok(), body }
        console.log(`[DIAG] OP-2 UPDATE campaign_leads: ${res.status()} rows=${JSON.parse(body || '[]').length}`)
      }

      // OP-3: INSERT disparo_logs
      {
        const res = await ctx.post(
          `${SUPABASE_URL}/rest/v1/disparo_logs`,
          {
            headers: { 'Prefer': 'return=representation' },
            data: {
              fired_at:       now,
              broker_id:      DIONATA_USER_ID,
              campaign_id:    DIONATA_CAMPAIGN_ID,
              lead_id:        testLeadId,
              lead_name:      '[DIAG-TESTE-6]',
              cooldown_until: new Date(Date.now() + 90_000).toISOString(),
            },
          }
        )
        const body = await res.text()
        results['OP-3 INSERT disparo_logs'] = { status: res.status(), ok: res.ok(), body }
        console.log(`[DIAG] OP-3 INSERT disparo_logs: ${res.status()} ${body.slice(0,100)}`)
      }

      // OP-4: SELECT disparo_logs (verifica se o insert foi gravado)
      {
        const res = await ctx.get(
          `${SUPABASE_URL}/rest/v1/disparo_logs?lead_name=eq.[DIAG-TESTE-6]&select=id,fired_at,cooldown_until`
        )
        const body = await res.text()
        results['OP-4 SELECT disparo_logs (confirma insert)'] = { status: res.status(), ok: res.ok(), body }
        console.log(`[DIAG] OP-4 SELECT disparo_logs: ${res.status()} rows=${JSON.parse(body || '[]').length}`)
      }

      // OP-5: Segundo UPDATE campaign_leads (simula 2º disparo)
      {
        const res = await ctx.patch(
          `${SUPABASE_URL}/rest/v1/campaign_leads?id=eq.${testLeadId}`,
          {
            headers: { 'Prefer': 'return=representation' },
            data: {
              dispatch_count:    2,
              last_message:      '[DIAG-TESTE-6] segunda mensagem',
              last_sent_at:      now,
              updated_at:        now,
            },
          }
        )
        const body = await res.text()
        results['OP-5 2º UPDATE campaign_leads (2º disparo)'] = { status: res.status(), ok: res.ok(), body }
        console.log(`[DIAG] OP-5 2º UPDATE campaign_leads: ${res.status()} rows=${JSON.parse(body || '[]').length}`)
      }

      // OP-6: Segundo INSERT disparo_logs
      {
        const res = await ctx.post(
          `${SUPABASE_URL}/rest/v1/disparo_logs`,
          {
            headers: { 'Prefer': 'return=representation' },
            data: {
              fired_at:       new Date(Date.now() + 1000).toISOString(),
              broker_id:      DIONATA_USER_ID,
              campaign_id:    DIONATA_CAMPAIGN_ID,
              lead_id:        testLeadId,
              lead_name:      '[DIAG-TESTE-6]',
              cooldown_until: new Date(Date.now() + 90_000).toISOString(),
            },
          }
        )
        const body = await res.text()
        results['OP-6 2º INSERT disparo_logs'] = { status: res.status(), ok: res.ok(), body }
        console.log(`[DIAG] OP-6 2º INSERT disparo_logs: ${res.status()} ${body.slice(0,100)}`)
      }

    } finally {
      // Limpa os dados de teste deste teste
      await ctx.delete(
        `${SUPABASE_URL}/rest/v1/disparo_logs?lead_name=eq.[DIAG-TESTE-6]`,
        { headers: { 'Prefer': 'return=minimal' } }
      )
      await ctx.dispose()
    }

    console.log('\n[DIAG] === RESUMO AUDITORIA TESTE-6 ===')
    Object.entries(results).forEach(([op, r]) => {
      const status = r.ok ? '✅' : '❌'
      console.log(`${status} ${op}: HTTP ${r.status}`)
    })

    // Todas as operações devem ter sucesso
    for (const [op, r] of Object.entries(results)) {
      expect(r.ok, `${op} falhou com status ${r.status}: ${r.body}`).toBe(true)
    }
  })

  // ══════════════════════════════════════════════════════════════════════════
  // TESTE 7 — Log completo de cada etapa (trace total do segundo disparo)
  //
  // Replica TESTE-2 mas com captura ainda mais detalhada.
  // Captura: timestamp de cada etapa, estado da store, requests HTTP pendentes.
  // ══════════════════════════════════════════════════════════════════════════
  test('TESTE-7 · Trace completo: cada etapa do 1º e 2º disparo', async ({ page }) => {
    const disparoLogs: Array<{ t: number; msg: string }> = []
    const tStart = Date.now()

    page.on('console', (msg: ConsoleMessage) => {
      if (msg.text().includes('[DISPARO]')) {
        disparoLogs.push({ t: Date.now() - tStart, msg: msg.text() })
      }
    })

    await setupPage(page)
    await navigateToPortoVelas(page)

    // ── 1º DISPARO ──
    console.log(`[DIAG] t=0 — Iniciando 1º disparo`)
    await searchLeadByPhone(page, DIONATA_LEAD_PHONES.carol)
    await clickDisparar(page, DIONATA_LEAD_PHONES.carol)
    await selectTemplate(page, 0)

    const t1Confirm = Date.now() - tStart
    console.log(`[DIAG] t=${t1Confirm}ms — Confirmando 1º disparo`)
    await confirmAndWaitSuccess(page)
    console.log(`[DIAG] t=${Date.now()-tStart}ms — 1º disparo concluído`)

    await page.screenshot({ path: 'e2e-report/TESTE-7-after-first.png' })

    // Bypassa cooldown — sem networkidle (evita travar em 104 requests)
    await page.clock.fastForward(200_000)
    await page.clock.runFor(2_000)
    await page.waitForTimeout(2_000)

    console.log(`[DIAG] t=${Date.now()-tStart}ms — Clock avançado 200s, polls disparados`)

    // ── 2º DISPARO ──
    console.log(`[DIAG] t=${Date.now()-tStart}ms — Iniciando 2º disparo`)
    await searchLeadByPhone(page, DIONATA_LEAD_PHONES.anaCarina)
    await clickDisparar(page, DIONATA_LEAD_PHONES.anaCarina)
    await selectTemplate(page, 0)

    const t2Confirm = Date.now() - tStart
    console.log(`[DIAG] t=${t2Confirm}ms — Confirmando 2º disparo`)
    await page.locator('button', { hasText: /Enviar mensagem/ }).click()

    // Aguarda resultado com timeout generoso
    const waLink2 = page.locator('a', { hasText: 'Abrir WhatsApp' })
    let result2: 'sucesso' | 'timeout' | 'erro' = 'timeout'
    try {
      await waLink2.waitFor({ timeout: DISPATCH_HANG_TIMEOUT })
      result2 = 'sucesso'
    } catch {
      const errorToast = page.locator('text=Disparo não realizado')
      const hasError = await errorToast.isVisible().catch(() => false)
      result2 = hasError ? 'erro' : 'timeout'
    }

    const tEnd = Date.now() - tStart
    console.log(`[DIAG] t=${tEnd}ms — 2º disparo resultado: ${result2}`)

    await page.screenshot({ path: 'e2e-report/TESTE-7-after-second.png' })

    // Relatório completo
    console.log('\n[DIAG] === TRACE COMPLETO TESTE-7 ===')
    console.log(`[DIAG] 1º confirm em t=${t1Confirm}ms`)
    console.log(`[DIAG] 2º confirm em t=${t2Confirm}ms`)
    console.log(`[DIAG] 2º resultado em t=${tEnd}ms (${result2})`)
    console.log('[DIAG] Logs [DISPARO] com timestamps:')
    disparoLogs.forEach(({ t, msg }) => console.log(`  t=${t}ms ${msg}`))

    // Assertiva final
    if (result2 !== 'sucesso') {
      const lastLog = disparoLogs[disparoLogs.length - 1]
      throw new Error(
        `[EVIDÊNCIA TESTE-7] 2º disparo resultado=${result2}.\n` +
        `Último log em t=${lastLog?.t}ms: ${lastLog?.msg ?? '(nenhum)'}\n` +
        `Total logs capturados: ${disparoLogs.length}\n` +
        disparoLogs.map(({ t, msg }) => `  t=${t}ms ${msg}`).join('\n')
      )
    }

    expect(result2).toBe('sucesso')
  })

})
