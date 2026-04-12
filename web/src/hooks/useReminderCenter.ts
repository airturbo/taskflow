import { useCallback, useEffect, useRef, useState } from 'react'
import { getNowIso } from '../utils/dates'
import {
  getInitialNotificationPermission,
  getNotificationPermission,
  requestNotificationAccess,
  sendAppNotification,
  type AppNotificationPermission,
} from '../utils/notifications'
import type { ReminderSound, ReminderTone } from '../utils/reminder-engine'

const makeFeedId = () => `feed-${Math.random().toString(36).slice(2, 9)}`

export type ReminderFeedItem = {
  id: string
  title: string
  body: string
  tone: ReminderTone
  createdAt: string
  taskId?: string | null
  allowSnooze?: boolean
}

type ReminderFeedInput = {
  title: string
  body: string
  tone?: ReminderTone
  taskId?: string | null
  allowSnooze?: boolean
}

type NotifySurfaceInput = ReminderFeedInput & {
  sound?: ReminderSound
}

export const useReminderCenter = () => {
  const [reminderFeed, setReminderFeed] = useState<ReminderFeedItem[]>([])
  const [notificationPermission, setNotificationPermission] = useState<AppNotificationPermission>(() => getInitialNotificationPermission())
  const audioContextRef = useRef<AudioContext | null>(null)

  const appendReminderFeed = useCallback(({ title, body, tone = 'default', taskId = null, allowSnooze = false }: ReminderFeedInput) => {
    setReminderFeed((items) => [{ id: makeFeedId(), title, body, tone, createdAt: getNowIso(), taskId, allowSnooze }, ...items].slice(0, 6))
  }, [])

  const audioUnlockedRef = useRef(false)
  const pendingSoundsRef = useRef<ReminderSound[]>([])

  const playCueWithContext = useCallback((audioContext: AudioContext, _kind: ReminderSound = 'reminder') => {
    const notes = [880, 988]
    notes.forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator()
      const gain = audioContext.createGain()
      const startAt = audioContext.currentTime + index * 0.16
      const duration = 0.12

      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, startAt)
      gain.gain.exponentialRampToValueAtTime(0.08, startAt + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)
      oscillator.connect(gain)
      gain.connect(audioContext.destination)
      oscillator.start(startAt)
      oscillator.stop(startAt + duration)
    })
  }, [])

  const unlockAudioContext = useCallback(async () => {
    if (typeof window === 'undefined') return null
    const AudioCtor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtor) return null

    if (!audioContextRef.current) audioContextRef.current = new AudioCtor()

    try {
      if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume()
    } catch {
      return null
    }

    if (audioContextRef.current.state !== 'running') return null
    audioUnlockedRef.current = true

    if (pendingSoundsRef.current.length > 0) {
      const queuedSounds = [...pendingSoundsRef.current]
      pendingSoundsRef.current = []
      queuedSounds.forEach((sound) => playCueWithContext(audioContextRef.current as AudioContext, sound))
    }

    return audioContextRef.current
  }, [playCueWithContext])

  const playCue = useCallback(
    async (kind: ReminderSound = 'reminder') => {
      const audioContext = audioContextRef.current
      if (!audioContext || !audioUnlockedRef.current) {
        pendingSoundsRef.current = [...pendingSoundsRef.current.slice(-2), kind]
        return
      }

      try {
        if (audioContext.state === 'suspended') await audioContext.resume()
      } catch {
        pendingSoundsRef.current = [...pendingSoundsRef.current.slice(-2), kind]
        return
      }

      if (audioContext.state !== 'running') {
        pendingSoundsRef.current = [...pendingSoundsRef.current.slice(-2), kind]
        return
      }

      playCueWithContext(audioContext, kind)
    },
    [playCueWithContext],
  )

  const requestNotificationPermission = useCallback(async () => {
    void unlockAudioContext()
    const permission = await requestNotificationAccess()
    setNotificationPermission(permission)
    return permission
  }, [unlockAudioContext])

  const notifySurface = useCallback(
    async ({ title, body, tone = 'default', sound = 'reminder', taskId = null, allowSnooze = false }: NotifySurfaceInput) => {
      appendReminderFeed({ title, body, tone, taskId, allowSnooze })

      const result = await sendAppNotification({ title, body, sound })
      if (!result.usedNativeSound) void playCue(sound)
    },
    [appendReminderFeed, playCue],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return

    const gestureEvents: Array<keyof WindowEventMap> = ['pointerdown', 'keydown']
    const handleGesture = () => {
      if (audioUnlockedRef.current) return
      void unlockAudioContext()
    }

    gestureEvents.forEach((eventName) => window.addEventListener(eventName, handleGesture, { passive: true }))
    return () => {
      gestureEvents.forEach((eventName) => window.removeEventListener(eventName, handleGesture))
    }
  }, [unlockAudioContext])

  const dismissReminderFeedItem = useCallback((feedId: string) => {
    setReminderFeed((items) => items.filter((item) => item.id !== feedId))
  }, [])

  const clearReminderFeed = useCallback(() => {
    setReminderFeed([])
  }, [])

  const markReminderSnoozed = useCallback((feedId: string) => {
    setReminderFeed((items) => items.map((item) => (item.id === feedId ? { ...item, allowSnooze: false } : item)))
  }, [])

  useEffect(() => {
    const syncPermission = async () => {
      setNotificationPermission(await getNotificationPermission())
    }

    void syncPermission()
    if (typeof window === 'undefined') return

    const handleFocus = () => {
      void syncPermission()
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  return {
    reminderFeed,
    notificationPermission,
    appendReminderFeed,
    notifySurface,
    requestNotificationPermission,
    dismissReminderFeedItem,
    clearReminderFeed,
    markReminderSnoozed,
  }
}
