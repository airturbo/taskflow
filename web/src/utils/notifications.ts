import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { isDesktopApp } from './runtime'

export type AppNotificationPermission = NotificationPermission | 'unsupported'
export type AppNotificationSound = 'reminder'

const getDesktopSound = (_sound: AppNotificationSound) => 'Ping'

export const getInitialNotificationPermission = (): AppNotificationPermission => {
  if (isDesktopApp()) return 'default'
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return window.Notification.permission
}

export const getNotificationPermission = async (): Promise<AppNotificationPermission> => {
  if (isDesktopApp()) {
    try {
      return (await isPermissionGranted()) ? 'granted' : 'default'
    } catch {
      return 'unsupported'
    }
  }

  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return window.Notification.permission
}

export const requestNotificationAccess = async (): Promise<AppNotificationPermission> => {
  if (isDesktopApp()) {
    try {
      return await requestPermission()
    } catch {
      return 'unsupported'
    }
  }

  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return window.Notification.requestPermission()
}

export const sendAppNotification = async ({
  title,
  body,
  sound = 'reminder',
}: {
  title: string
  body: string
  sound?: AppNotificationSound
}) => {
  if (isDesktopApp()) {
    try {
      const granted = await isPermissionGranted()
      if (!granted) return { delivered: false, usedNativeSound: false }

      sendNotification({
        title,
        body,
        sound: getDesktopSound(sound),
      })

      return { delivered: true, usedNativeSound: true }
    } catch {
      return { delivered: false, usedNativeSound: false }
    }
  }

  if (typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'granted') {
    const notification = new window.Notification(title, { body, silent: true, tag: `${title}-${body}` })
    window.setTimeout(() => notification.close(), 6000)
    return { delivered: true, usedNativeSound: false }
  }

  return { delivered: false, usedNativeSound: false }
}
