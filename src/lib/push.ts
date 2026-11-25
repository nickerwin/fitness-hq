/** Lock-screen notifications (Web Push). On iPhone this needs iOS 16.4+ and the app opened from the Home Screen. */
import { deletePushSubscription, savePushSubscription } from './sync'

// Public half of the coach's VAPID key pair (the private half stays with the coach).
export const VAPID_PUBLIC_KEY = 'BDpsQCI4diilAbtcSasWQmAz8X-UayFI2_d7CvKz_Jb3IDQngYOxJj6zu6VRN-D-1NAgUf1DqtZ0nFdGcI0ZwFE'

export type PushState = 'unsupported' | 'needs-home-screen' | 'denied' | 'off' | 'on'

const b64uToBytes = (s: string) => {
  const b = atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}
const bytesToB64u = (buf: ArrayBuffer | null) =>
  buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : ''

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
}

export async function pushState(): Promise<PushState> {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
  if (ios && !isStandalone()) return 'needs-home-screen'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

/** Must be called from a tap. */
export async function enablePush() {
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Notifications were not allowed. You can change this in iPhone Settings → Notifications → Fitness HQ.')
  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(VAPID_PUBLIC_KEY) }))
  await savePushSubscription({ endpoint: sub.endpoint, p256dh: bytesToB64u(sub.getKey('p256dh')), auth: bytesToB64u(sub.getKey('auth')) })
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await deletePushSubscription(sub.endpoint).catch(() => {})
  await sub.unsubscribe()
}

/** A local test that shows a notification without the server, to confirm permission works. */
export async function testNotification() {
  const reg = await navigator.serviceWorker.ready
  await reg.showNotification('Fitness HQ', { body: 'Notifications are on. Coach notes will show up here after each workout.', icon: './icon-192.png', tag: 'test' })
}
