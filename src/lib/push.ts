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

/** Mantém a inscrição viva nos logins seguintes — sem prompt (permissão já dada). */
export async function syncPushSubscription(userId: string): Promise<void> {
  if (!pushSupported() || Notification.permission !== 'granted') return
  await enablePush(userId)
}
