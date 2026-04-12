export const OPEN_AUTH_SCREEN_EVENT = 'taskflow:open-auth-screen'

export const requestAuthScreen = (): void => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(OPEN_AUTH_SCREEN_EVENT))
}
