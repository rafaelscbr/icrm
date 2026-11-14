import { supabase } from './supabase'

/**
 * Web Push — inscrição do dispositivo para receber notificações de lead
 * (novo, transferido, recapturado por SLA) mesmo com o app fechado.
 * iOS exige o PWA instalado na tela de início (16.4+).
 */

// Chave pública VAPID — par da privada guardada no Vault do Supabase
const VAPID_PUBLIC_KEY =
  'BFV0TSJMAJztImSbG_LLH2VNra-i08GmP8A0cpaKJLXLvedOGyWuwisTMEtBwATMAwYAsnJYU-J307EkNRHJQ1A'

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(b64)
  const arr = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  return pushSupported() ? Notification.permission : 'unsupported'
}

export type EnablePushResult = 'ok' | 'denied' | 'unsupported' | 'error'

/** Pede permissão (se necessário), inscreve o dispositivo e salva no banco. */
export async function enablePush(userId: string): Promise<EnablePushResult> {
  if (!pushSupported()) return 'unsupported'

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'

  try {
    const registration = await navigator.serviceWorker.ready
    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    }

    const json = subscription.toJSON()
    if (!json.keys?.p256dh || !json.keys?.auth) throw new Error('Inscrição sem chaves')

    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id:    userId,
      endpoint:   subscription.endpoint,
      p256dh:     json.keys.p256dh,
      auth:       json.keys.auth,
      user_agent: navigator.userAgent,
    }, { onConflict: 'endpoint' })
    if (error) throw error

    return 'ok'
  } catch (err) {
    console.error('[push] enable:', err)
    return 'error'
  }
}

/**
 * Mantém a inscrição viva nos logins seguintes — sem prompt (permissão já dada).
 * Devolve o resultado para quem chama mostrar a falha: inscrição que não salva
 * é aviso de lead que não chega, e isso não pode ficar só no console.
 */
export async function syncPushSubscription(userId: string): Promise<EnablePushResult | 'skipped'> {
  if (!pushSupported() || Notification.permission !== 'granted') return 'skipped'
  return enablePush(userId)
}

function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/**
 * Estado real dos avisos NESTE aparelho — não só a permissão do navegador.
 *
 * Permissão 'granted' não garante nada: depois de atualizar o iOS o iPhone
 * passa a usar outro endereço de push, e a Apple segue aceitando envio no
 * endereço antigo sem avisar (o servidor loga "entregue" e nada aparece).
 * Por isso 'active' só vale quando a inscrição deste aparelho está no banco.
 */
export type PushDeviceState =
  | 'ios-browser'  // iPhone/iPad no Safari: push só existe no app instalado
  | 'unsupported'  // navegador sem Web Push
  | 'default'      // permissão nunca pedida
  | 'denied'       // bloqueado pelo navegador
  | 'missing'      // permissão dada, mas este aparelho não está inscrito no banco
  | 'active'       // inscrição deste aparelho confirmada no banco

export async function pushDeviceState(): Promise<PushDeviceState> {
  if (isIOS() && !isStandalone()) return 'ios-browser'
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'default') return 'default'
  if (Notification.permission === 'denied') return 'denied'

  // getRegistration e não .ready: sem service worker, .ready nunca resolve.
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return 'missing'

  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('id')
    .eq('endpoint', subscription.endpoint)
    .maybeSingle()
  if (error) throw error
  return data ? 'active' : 'missing'
}
