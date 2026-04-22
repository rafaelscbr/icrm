import { createClient } from '@supabase/supabase-js'

const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Garante https:// no início da URL caso esteja faltando
const url = rawUrl
  ? rawUrl.startsWith('http') ? rawUrl.replace(/\/$/, '') : `https://${rawUrl.replace(/\/$/, '')}`
  : ''

const key = rawKey ?? ''

// Log de diagnóstico — aparece no Console do browser (F12)
console.log('[iCRM] Supabase URL:', url ? `${url.slice(0, 35)}...` : '⚠️ NÃO CONFIGURADA')
console.log('[iCRM] Supabase Key:', key ? `${key.slice(0, 20)}... (${key.length} chars)` : '⚠️ NÃO CONFIGURADA')

if (!url || !key) {
  console.error('[iCRM] ❌ Variáveis de ambiente do Supabase não encontradas no build.')
  console.error('[iCRM] Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no Vercel e faça um novo deploy.')
}

export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  key || 'placeholder'
)
