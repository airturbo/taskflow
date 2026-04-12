import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

export function ResponsiveDrawer({
  title,
  onClose,
  children,
  side = 'right',
  width,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  side?: 'left' | 'right'
  width?: number
}) {
  // 打开时锁定背景滚动
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <div className={`drawer-layer drawer-layer--${side}`} role="dialog" aria-modal="true" aria-label={title}>
      <button className="drawer-backdrop" aria-label={`关闭${title}`} onClick={onClose} />
      <section
        className={`drawer-panel drawer-panel--${side} panel`}
        style={width ? { width: Math.min(width, window.innerWidth * 0.92) } : undefined}
      >
        <div className="panel-header drawer-panel__header">
          <div>
            <p className="eyebrow">快速访问</p>
            <h3>{title}</h3>
          </div>
          <button className="drawer-close-btn" onClick={onClose} aria-label="关闭">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <div className="drawer-panel__body">{children}</div>
      </section>
    </div>
  )
}

// ---- 手机端底部 Sheet ----
export function TaskBottomSheet({
  onClose,
  children,
}: {
  onClose: () => void
  children: ReactNode
}) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  // Gesture tracking
  const gestureRef = useRef<{
    startY: number
    startTime: number
    currentY: number
    isDragging: boolean
    source: 'handle' | 'body'
  } | null>(null)

  // 锁定背景滚动
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const DISMISS_DISTANCE = 72
  const DISMISS_VELOCITY = 0.45 // px/ms

  const applySheetTransform = (translateY: number) => {
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${Math.max(0, translateY)}px)`
      sheetRef.current.style.transition = 'none'
    }
  }

  const resetSheetTransform = () => {
    if (sheetRef.current) {
      sheetRef.current.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)'
      sheetRef.current.style.transform = 'translateY(0)'
    }
  }

  // Handle area: always allow drag
  const handleHandleTouchStart = (e: React.TouchEvent) => {
    gestureRef.current = {
      startY: e.touches[0].clientY,
      startTime: Date.now(),
      currentY: e.touches[0].clientY,
      isDragging: true,
      source: 'handle',
    }
  }

  // Body area: only allow drag when scrolled to top
  const handleBodyTouchStart = (e: React.TouchEvent) => {
    const bodyEl = bodyRef.current
    const isAtTop = !bodyEl || bodyEl.scrollTop <= 0
    gestureRef.current = {
      startY: e.touches[0].clientY,
      startTime: Date.now(),
      currentY: e.touches[0].clientY,
      isDragging: false,
      source: 'body',
    }
    if (isAtTop) {
      // Don't set isDragging yet; wait for actual downward movement in touchmove
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const g = gestureRef.current
    if (!g) return
    const clientY = e.touches[0].clientY
    g.currentY = clientY
    const delta = clientY - g.startY

    if (g.source === 'handle') {
      // Handle area: always track
      if (delta > 0) {
        e.preventDefault()
        applySheetTransform(delta)
      }
    } else if (g.source === 'body') {
      const bodyEl = bodyRef.current
      const isAtTop = !bodyEl || bodyEl.scrollTop <= 0
      if (!g.isDragging && isAtTop && delta > 8) {
        // Entering dismiss gesture from body when scrolled to top
        g.isDragging = true
        g.startY = clientY // reset start point
        g.startTime = Date.now()
      }
      if (g.isDragging && delta > 0) {
        e.preventDefault()
        applySheetTransform(clientY - g.startY)
      }
    }
  }

  const handleTouchEnd = () => {
    const g = gestureRef.current
    if (!g) return
    const delta = g.currentY - g.startY
    const elapsed = Date.now() - g.startTime
    const velocity = elapsed > 0 ? delta / elapsed : 0

    if (g.isDragging || g.source === 'handle') {
      if (delta > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY) {
        // Dismiss with slide-down animation
        if (sheetRef.current) {
          sheetRef.current.style.transition = 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)'
          sheetRef.current.style.transform = 'translateY(100%)'
        }
        window.setTimeout(onClose, 250)
      } else {
        // Elastic snap back
        resetSheetTransform()
      }
    }
    gestureRef.current = null
  }

  return (
    <div className="task-sheet-layer" role="dialog" aria-modal="true" aria-label="任务详情">
      <button className="task-sheet-backdrop" onClick={onClose} aria-label="关闭任务详情" />
      <div
        ref={sheetRef}
        className="task-sheet panel"
      >
        {/* 顶部拖动条 — 始终触发下滑关闭 */}
        <div
          className="task-sheet__handle-area"
          onTouchStart={handleHandleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="task-sheet__handle" />
        </div>
        {/* 关闭按钮 */}
        <button className="task-sheet__close" onClick={onClose} aria-label="关闭">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        <div
          ref={bodyRef}
          className="task-sheet__body"
          onTouchStart={handleBodyTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
