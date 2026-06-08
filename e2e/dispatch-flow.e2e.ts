/**
 * VALIDAÇÃO E2E DEFINITIVA — Fluxo de Disparo WhatsApp
 *
 * Testes com browser real (Chromium), cliques reais, estado real do banco.
 * Sem mocks, sem simulações, sem try/catch silencioso.
 *
 * Usuário de teste: e2e_test_dispatch@souza.test
 * Campanha de teste: [E2E TEST] Campanha de Disparo (e2e-camp-001)
 * Leads: Lead E2E Um…Cinco (e2e-lead-001…005)
 */

import { test, expect, Page } from '@playwright/test'
import { getE2ESession, injectSession } from './helpers/auth'
import { cleanupAfterTest } from './helpers/db-cleanup'

// ─── Constantes ───────────────────────────────────────────────────────────────

const SUPABASE_HOST = 'dczexbzsfdavcrwiungk.supabase.co'

// 10h AM — dentro do horário comercial (8h–20h) para passar isBusinessHours()
// Sem isso, o app exibe aviso de fora do horário e bloqueia o fluxo de disparo.
const BUSINESS_HOUR = new Date('2026-06-08T10:00:00')

// Nomes dos leads E2E (exatamente como estão no banco)
const LEAD = {
  um:     'Lead E2E Um',
  dois:   'Lead E2E Dois',
  tres:   'Lead E2E Tres',
  quatro: 'Lead E2E Quatro',
  cinco:  'Lead E2E Cinco',
} as const

// Token de acesso reutilizado pelo afterAll para limpeza final
let sharedAccessToken = ''

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Prepara a página para cada teste:
 * 1. Instala relógio falso em horário comercial (DEVE ser antes de qualquer goto)
 * 2. Autentica via Supabase REST API (Node.js, fora do browser)
 * 3. Injeta sessão no localStorage e recarrega
 */
async function setupPage(page: Page): Promise<string> {
  // Passo 1 — OBRIGATÓRIO antes de qualquer page.goto()
  await page.clock.install({ time: BUSINESS_HOUR })

  const session = await getE2ESession()
  sharedAccessToken = session.access_token
  await injectSession(page, session)

  return session.access_token
}

/**
 * Navega para /campanhas, encontra a campanha E2E e abre o CampaignDetail.
 * Espera a aba "Fila de disparo" estar visível antes de retornar.
 */
async function navigateToCampaign(page: Page) {
  await page.goto('/campanhas', { waitUntil: 'networkidle' })

  // Aguarda a campanha aparecer na listagem
  await page.getByText('[E2E TEST] Campanha de Disparo', { exact: false })
    .waitFor({ timeout: 20_000 })

  // Encontra o card específico da campanha E2E e clica em "Ver Leads"
  // Usa .last() para pegar o div mais interno (row) que contém ambos os elementos
  const campaignCard = page.locator('div').filter({
    has: page.getByText('[E2E TEST] Campanha de Disparo', { exact: false }),
  }).filter({
    has: page.getByRole('button', { name: /Ver Leads/ }),
  }).last()

  await campaignCard.getByRole('button', { name: /Ver Leads/ }).click()

  // Aguarda LeadsTab carregar com a seção de fila
  await page.locator('text=Fila de disparo').waitFor({ timeout: 15_000 })
}

/**
 * Filtra leads pelo nome no campo de busca e aguarda o lead aparecer na lista.
 */
async function searchLead(page: Page, leadName: string) {
  const searchInput = page.locator('input[placeholder*="Buscar"]')
  await searchInput.clear()
  await searchInput.fill(leadName)
  // Aguarda o lead aparecer no DOM após filtragem
  await page.getByText(leadName).first().waitFor({ timeout: 8_000 })
}

/**
 * Clica no botão "Disparar" (ou "Disparar agora") na linha do lead especificado.
 * Usa filter duplo para encontrar a linha que contém TANTO o nome QUANTO o botão.
 */
async function clickDispararForLead(page: Page, leadName: string) {
  // Encontra a div-linha que contém o nome E um botão de disparo
  const leadRow = page.locator('div').filter({
    hasText: leadName,
  }).filter({
    has: page.locator('button', { hasText: /Disparar/ }),
  }).last() // .last() pega o container mais interno (a linha da grid)

  const btn = leadRow.locator('button', { hasText: /Disparar/ }).first()
  await btn.waitFor({ state: 'visible', timeout: 8_000 })
  await btn.click()
}

/**
 * Dentro do MessagePickerModal aberto, seleciona um template pelo índice
 * (0 = "Mensagem principal", 1 = "Variação 1", 2 = "Variação 2").
 */
async function selectTemplate(page: Page, idx = 0) {
  await page.locator('text=Escolher mensagem').waitFor({ timeout: 8_000 })

  const label = idx === 0 ? 'Mensagem principal' : `Variação ${idx}`
  await page.locator(`text=${label}`).click()

  // Botão de confirmação deve ficar habilitado após seleção
  await expect(page.locator('button', { hasText: /Enviar mensagem/ }))
    .not.toBeDisabled({ timeout: 3_000 })
}

/**
 * Clica em "Enviar mensagem N" e aguarda o toast de sucesso com link "Abrir WhatsApp".
 * Retorna o locator do link para assertivas adicionais do teste.
 */
async function confirmAndWaitSuccess(page: Page) {
  await page.locator('button', { hasText: /Enviar mensagem/ }).click()

  // EVIDÊNCIA PRINCIPAL: link "Abrir WhatsApp" no toast de sucesso
  const waLink = page.locator('a', { hasText: 'Abrir WhatsApp' })
  await waLink.waitFor({ timeout: 20_000 })
  return waLink
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

test.afterAll(async () => {
  // Limpeza definitiva após todos os testes
  if (sharedAccessToken) {
    await cleanupAfterTest(sharedAccessToken)
  }
})

// ─── Suite ────────────────────────────────────────────────────────────────────

test.describe('Fluxo de Disparo WhatsApp — Validação E2E', () => {

  // Isolamento: banco limpo antes de cada teste
  test.beforeEach(async () => {
    const session = await getE2ESession()
    await cleanupAfterTest(session.access_token)
  })

  // ══════════════════════════════════════════════════════════════════════════
  // E2E-01 · Primeiro disparo — fluxo completo do zero
  //
  // Prova: clique real no "Disparar" → modal abre → template selecionado →
  //        DB gravado → modal fecha → toast com link "Abrir WhatsApp"
  // ══════════════════════════════════════════════════════════════════════════
  test('E2E-01 · Primeiro disparo: clique → modal → template → toast "Abrir WhatsApp"', async ({ page }) => {
    await setupPage(page)
    await navigateToCampaign(page)

    // Localiza e inicia disparo
    await searchLead(page, LEAD.um)
    await clickDispararForLead(page, LEAD.um)

    // Modal deve abrir (sem erro de "fora do horário", sem cooldown)
    await expect(page.locator('text=Escolher mensagem')).toBeVisible()
    await expect(page.locator('text=Mensagem principal')).toBeVisible()

    await selectTemplate(page, 0)
    const waLink = await confirmAndWaitSuccess(page)

    // Assertivas de evidência
    await expect(waLink).toBeVisible()
    // Modal deve ter fechado após sucesso
    await expect(page.locator('text=Escolher mensagem')).not.toBeVisible()

    await page.screenshot({ path: 'e2e-report/E2E-01-first-dispatch.png' })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // E2E-02 · Segundo disparo após bypass de cooldown
  //
  // Este é o bug original: o segundo disparo ficava preso após o primeiro.
  // Prova: fluxo idêntico funciona na segunda vez, sem estado stale.
  // page.clock.fastForward() avança o relógio além do cooldown máximo (150s).
  // ══════════════════════════════════════════════════════════════════════════
  test('E2E-02 · Segundo disparo: após cooldown bypass → toast "Abrir WhatsApp" (igual ao primeiro)', async ({ page }) => {
    await setupPage(page)
    await navigateToCampaign(page)

    // — Primeiro disparo
    await searchLead(page, LEAD.um)
    await clickDispararForLead(page, LEAD.um)
    await selectTemplate(page, 0)
    await confirmAndWaitSuccess(page)

    // Avança relógio 200s (> 150s máximo de cooldown)
    // Aciona todos os setInterval do useGlobalCooldown → remaining() → 0
    await page.clock.fastForward(200_000)
    // runFor(2_000) dá tempo para React processar as atualizações de estado
    await page.clock.runFor(2_000)

    // Aguarda botão de disparo ficar disponível (não mostra mais o contador de cooldown)
    await searchLead(page, LEAD.dois)
    await page.locator('button', { hasText: /Disparar/ }).first()
      .waitFor({ state: 'visible', timeout: 5_000 })

    // — Segundo disparo (lead diferente — Lead E2E Dois está na fila)
    await clickDispararForLead(page, LEAD.dois)

    // Modal deve abrir sem estado stale do primeiro disparo
    await expect(page.locator('text=Escolher mensagem')).toBeVisible()
    // Nenhum template pré-selecionado (key prop garante remount completo)
    await expect(page.locator('button', { hasText: /Enviar mensagem$/ })).toBeDisabled()

    await selectTemplate(page, 1) // usa variação 1 para diversificar
    const waLink = await confirmAndWaitSuccess(page)

    await expect(waLink).toBeVisible()
    await page.screenshot({ path: 'e2e-report/E2E-02-second-dispatch.png' })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // E2E-03 · Disparo após page.reload()
  //
  // Prova: ao recarregar, a store lê cooldown_until do banco.
  // Após cleanup do banco (sem disparo_logs), cooldown_until = null → disparo livre.
  // ══════════════════════════════════════════════════════════════════════════
  test('E2E-03 · Disparo após reload: estado restaurado do banco, disparo funciona', async ({ page }) => {
    await setupPage(page)
    await navigateToCampaign(page)

    // Primeiro disparo
    await searchLead(page, LEAD.tres)
    await clickDispararForLead(page, LEAD.tres)
    await selectTemplate(page, 0)
    await confirmAndWaitSuccess(page)

    // Remove disparo_logs do banco → cooldown_until não existirá após reload
    // (beforeEach também poderia ter feito isso, mas fazemos aqui por clareza)
    await cleanupAfterTest(sharedAccessToken)

    // Recarrega — page.clock persiste via addInitScript, relógio em 10h00
    await page.reload({ waitUntil: 'networkidle' })

    // CampaignDetail não sobrevive ao reload (estado React zerado)
    // — navega novamente para a campanha
    await navigateToCampaign(page)

    // Lead E2E Tres foi resetado para 'new' pelo cleanup → está na fila novamente
    await searchLead(page, LEAD.tres)
    await clickDispararForLead(page, LEAD.tres)
    await selectTemplate(page, 0)
    const waLink = await confirmAndWaitSuccess(page)

    await expect(waLink).toBeVisible()
    await page.screenshot({ path: 'e2e-report/E2E-03-after-reload.png' })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // E2E-04 · Falha de banco: toast de erro, modal permanece aberto, sem WhatsApp
  //
  // Prova: "Banco é única fonte de verdade"
  // Bloqueia a escrita no Supabase APÓS o modal abrir →
  //   - toast de erro aparece
  //   - modal NÃO fecha (para retry)
  //   - link "Abrir WhatsApp" NUNCA aparece
  // ══════════════════════════════════════════════════════════════════════════
  test('E2E-04 · Falha de banco: error toast, modal aberto para retry, sem "Abrir WhatsApp"', async ({ page }) => {
    await setupPage(page)
    await navigateToCampaign(page)

    await searchLead(page, LEAD.quatro)
    await clickDispararForLead(page, LEAD.quatro)

    // Aguarda modal abrir (checkPreDispatch concluiu com sucesso)
    await page.locator('text=Escolher mensagem').waitFor({ timeout: 10_000 })

    // Bloqueia escrita no Supabase APÓS o modal estar aberto
    // Intercepta PATCH em campaign_leads (markContacted) e INSERT em disparo_logs
    await page.route(`**/${SUPABASE_HOST}/rest/v1/campaign_leads*`, route => route.abort('failed'))
    await page.route(`**/${SUPABASE_HOST}/rest/v1/disparo_logs*`,   route => route.abort('failed'))

    // Seleciona template e tenta confirmar (vai falhar)
    await page.locator('text=Mensagem principal').click()
    await page.locator('button', { hasText: /Enviar mensagem 1/ }).click()

    // Assertiva 1: toast de erro aparece
    const errorToast = page.locator('text=Disparo não realizado')
    await errorToast.waitFor({ timeout: 15_000 })
    await expect(errorToast).toBeVisible()

    // Assertiva 2: modal PERMANECE aberto (não fechou por erro)
    await expect(page.locator('text=Escolher mensagem')).toBeVisible()

    // Assertiva 3: "Abrir WhatsApp" NUNCA apareceu
    await expect(page.locator('a', { hasText: 'Abrir WhatsApp' })).not.toBeVisible()

    await page.screenshot({ path: 'e2e-report/E2E-04-db-failure.png' })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // E2E-05 · Retry após falha restaura o fluxo
  //
  // Continua de E2E-04: modal aberto após falha.
  // Restaura conexão → retry pelo mesmo botão → sucesso.
  // ══════════════════════════════════════════════════════════════════════════
  test('E2E-05 · Retry: falha → modal aberto → restaura rede → retry → "Abrir WhatsApp"', async ({ page }) => {
    await setupPage(page)
    await navigateToCampaign(page)

    await searchLead(page, LEAD.quatro)
    await clickDispararForLead(page, LEAD.quatro)
    await page.locator('text=Escolher mensagem').waitFor({ timeout: 10_000 })

    // — Fase 1: induz falha
    await page.route(`**/${SUPABASE_HOST}/rest/v1/campaign_leads*`, route => route.abort('failed'))
    await page.route(`**/${SUPABASE_HOST}/rest/v1/disparo_logs*`,   route => route.abort('failed'))

    await page.locator('text=Mensagem principal').click()
    await page.locator('button', { hasText: /Enviar mensagem 1/ }).click()
    await page.locator('text=Disparo não realizado').waitFor({ timeout: 15_000 })

    // Confirmação: modal aberto após falha
    await expect(page.locator('text=Escolher mensagem')).toBeVisible()
    await page.screenshot({ path: 'e2e-report/E2E-05-modal-open-after-failure.png' })

    // — Fase 2: restaura conexão e retenta
    await page.unrouteAll()

    // Template já selecionado — botão imediatamente habilitado
    await page.locator('button', { hasText: /Enviar mensagem 1/ }).click()

    // Sucesso no retry
    const waLink = page.locator('a', { hasText: 'Abrir WhatsApp' })
    await waLink.waitFor({ timeout: 20_000 })
    await expect(waLink).toBeVisible()

    await page.screenshot({ path: 'e2e-report/E2E-05-retry-success.png' })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // E2E-06 · Tab switching: visibilitychange → store recarrega → disparo ok
  //
  // Simula o fluxo real: corretor sai para o WhatsApp (aba some de foco)
  // e volta (aba ganha foco). O evento visibilitychange dispara loadDisparos().
  // Prova que o estado da store é restaurado do banco corretamente.
  // ══════════════════════════════════════════════════════════════════════════
  test('E2E-06 · Tab switching: visibilitychange → loadDisparos() → disparo funciona', async ({ page }) => {
    await setupPage(page)
    await navigateToCampaign(page)

    // Simula perda de foco da aba (usuário vai para o WhatsApp)
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // Simula retorno de foco (usuário volta do WhatsApp)
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // Aguarda requisição de reload da store (loadDisparos() após visibilitychange)
    await page.waitForLoadState('networkidle')

    // Dispara normalmente após voltar à aba
    await searchLead(page, LEAD.cinco)
    await clickDispararForLead(page, LEAD.cinco)
    await selectTemplate(page, 0)
    const waLink = await confirmAndWaitSuccess(page)
    await expect(waLink).toBeVisible()

    await page.screenshot({ path: 'e2e-report/E2E-06-tab-switch.png' })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // E2E-07 · CampaignDetail reopen: navegar e voltar não quebra o fluxo
  //
  // Prova: remontar o CampaignDetail (navegando para outra rota e voltando)
  // não introduz estado stale nem bloqueia disparos subsequentes.
  // ══════════════════════════════════════════════════════════════════════════
  test('E2E-07 · CampaignDetail reopen: navegar p/ outra rota e voltar → disparo funciona', async ({ page }) => {
    await setupPage(page)
    await navigateToCampaign(page)

    // Primeiro disparo
    await searchLead(page, LEAD.um)
    await clickDispararForLead(page, LEAD.um)
    await selectTemplate(page, 0)
    await confirmAndWaitSuccess(page)

    // Avança clock para limpar cooldown antes de navegar
    await page.clock.fastForward(200_000)
    await page.clock.runFor(2_000)

    // Navega para outra rota (desmonta CampaignDetail) e volta (remonta)
    await page.goto('/contatos', { waitUntil: 'networkidle' })
    await navigateToCampaign(page)

    // Lead E2E Dois ainda está na fila (Lead E2E Um foi acionado e saiu)
    await searchLead(page, LEAD.dois)
    await clickDispararForLead(page, LEAD.dois)

    // Modal deve abrir limpo (sem estado do primeiro disparo)
    await expect(page.locator('text=Escolher mensagem')).toBeVisible()

    await selectTemplate(page, 0)
    const waLink = await confirmAndWaitSuccess(page)
    await expect(waLink).toBeVisible()

    await page.screenshot({ path: 'e2e-report/E2E-07-reopen.png' })
  })
})
