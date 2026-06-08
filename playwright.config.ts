import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.{spec,test,e2e}.ts',
  fullyParallel: false,      // disparos dependem de cooldown — serial
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'e2e-report', open: 'never' }],
  ],
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on',             // captura trace completo para evidência
    screenshot: 'on',        // screenshot em cada step
    video: 'on',             // vídeo completo da execução
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // NÃO usa webServer — dev server já está rodando na porta 5174
})
