import { useState, useEffect } from 'react'

/**
 * PwaInstallBanner
 *
 * • iOS Safari  → shows a persistent instructional banner:
 *     "点击 分享 按钮，然后选择「添加到主屏幕」"
 *   (Safari never fires beforeinstallprompt, so we can only guide the user.)
 *
 * • Android / Chrome (and other Chromium browsers) → listens for the
 *   `beforeinstallprompt` event, then shows a one-tap "添加到主屏幕" button
 *   that triggers the native install prompt.
 *
 * Once the user dismisses the banner (×) or completes the install, the choice
 * is persisted in localStorage so the banner never shows again on that device.
 */

// Extend Window so TypeScript knows about the non-standard beforeinstallprompt
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent
  }
}

export function PwaInstallBanner() {
  const [showBanner, setShowBanner] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    // Already running as a standalone installed PWA — nothing to do.
    if (window.matchMedia('(display-mode: standalone)').matches) return
    // User already dismissed once — respect that.
    if (localStorage.getItem('pwa-install-dismissed')) return

    const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    if (iOS) {
      // Only show on iOS Safari (not in-app browsers where install isn't possible)
      const isSafari = /safari/i.test(navigator.userAgent) && !/crios|fxios|opios/i.test(navigator.userAgent)
      if (isSafari) {
        setIsIOS(true)
        setShowBanner(true)
      }
      return
    }

    // Android / Chrome path
    const handler = (e: BeforeInstallPromptEvent) => {
      e.preventDefault()           // prevent the mini-infobar from showing automatically
      setDeferredPrompt(e)
      setShowBanner(true)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // If the app gets installed some other way, hide the banner
    const onInstalled = () => setShowBanner(false)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      localStorage.setItem('pwa-install-dismissed', '1')
    }
    setDeferredPrompt(null)
    setShowBanner(false)
  }

  const handleDismiss = () => {
    localStorage.setItem('pwa-install-dismissed', '1')
    setShowBanner(false)
  }

  if (!showBanner) return null

  return (
    <div className="pwa-install-banner" role="banner" aria-label="安装提示">
      <span className="pwa-install-banner__icon">📲</span>

      {isIOS ? (
        <span className="pwa-install-banner__text">
          点击底部 <strong>分享</strong> 按钮，然后选择「<strong>添加到主屏幕</strong>」
        </span>
      ) : (
        <button className="pwa-install-banner__action" onClick={handleInstall}>
          添加到主屏幕
        </button>
      )}

      <button
        className="pwa-install-banner__dismiss"
        onClick={handleDismiss}
        aria-label="关闭安装提示"
      >
        ×
      </button>
    </div>
  )
}
