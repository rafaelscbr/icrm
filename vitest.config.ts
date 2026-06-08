import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      include: [
        'src/modules/campaigns/LeadsTab.tsx',
        'src/store/useCampaignLeadsStore.ts',
        'src/store/useDisparosStore.ts',
      ],
    },
  },
})
