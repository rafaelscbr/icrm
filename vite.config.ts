import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt': a versão nova espera e a tela avisa (src/lib/atualizacao.ts).
      // 'autoUpdate' trocava em silêncio e a tela aberta seguia com o código velho.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'badge-96.png'],
      manifest: {
        name: 'Souza Imobiliária',
        short_name: 'Souza Imob',
        description: 'CRM imobiliário para gestão de contatos, vendas e performance',
        // Barra Marinho no topo; abertura do app na Folha clara (tema padrão).
        theme_color: '#0F2759',
        background_color: '#F3F6FB',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        lang: 'pt-BR',
        // "S." Champanhe sobre Marinho — identidade Folha Clara (03/11/2026).
        // PNG primeiro: o Android e a instalação no Chrome escolhem por tamanho.
        icons: [
          { src: '/icon-192.png',          sizes: '192x192', type: 'image/png',     purpose: 'any' },
          { src: '/icon-512.png',          sizes: '512x512', type: 'image/png',     purpose: 'any' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png',     purpose: 'maskable' },
          { src: '/icon.svg',              sizes: 'any',     type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-maskable.svg',     sizes: 'any',     type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // A `xlsx` (424 kB) virou import dinâmico: só quem importa ou exporta
        // planilha paga por ela. Precachear traria o arquivo de volta pela
        // porta dos fundos — o service worker baixaria tudo em segundo plano
        // para todo mundo. Fica de fora; quando o import dinâmico disparar, a
        // rede busca na hora.
        globIgnores: ['**/vendor-xlsx-*.js'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB
        // Web Push: handlers de push/notificationclick anexados ao SW gerado
        importScripts: ['push-sw.js'],
        // Sem runtimeCaching da API do Supabase: o banco é a única fonte de
        // verdade — servir resposta cacheada quando a rede falha mostraria
        // dado velho silenciosamente. Falha de rede deve aparecer como erro.
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':    ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-charts':   ['echarts', 'zrender'],
          'vendor-dnd':      ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          'vendor-xlsx':     ['xlsx'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: process.env.PORT ? parseInt(process.env.PORT) : 5173,
    strictPort: false,
  },
})
