import { isTauri } from '@tauri-apps/api/core'

export const isDesktopApp = () => {
  if (typeof window === 'undefined') return false

  try {
    return isTauri()
  } catch {
    return false
  }
}
