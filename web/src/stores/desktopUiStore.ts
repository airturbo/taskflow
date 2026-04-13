/**
 * desktopUiStore — 桌面端 UI 全局状态（Zustand）
 *
 * 职责：集中管理桌面端所有 modal/panel UI 状态，替代 useModalState hook 中的 useState。
 * 同时管理任务完成动画状态（completingTaskIds）和完成 Undo Toast（completionFeedback）。
 *
 * 使用方式：
 *   import { useDesktopUiStore } from '@/stores/desktopUiStore'
 *   const { tagManagerOpen, setTagManagerOpen } = useDesktopUiStore()
 */

import { create } from 'zustand'

export type ProjectionInsightMode = 'unscheduled' | 'outside'

export interface CompletionFeedback {
  taskId: string
  title: string
  nextDueLabel?: string
}

interface DesktopUiState {
  // ─── Modals / Panels ────────────────────────────────────────
  tagManagerOpen: boolean
  setTagManagerOpen: (v: boolean) => void

  shortcutPanelOpen: boolean
  setShortcutPanelOpen: (v: boolean) => void

  commandPaletteOpen: boolean
  setCommandPaletteOpen: (v: boolean) => void

  exportPanelOpen: boolean
  setExportPanelOpen: (v: boolean) => void

  navigationDrawerOpen: boolean
  setNavigationDrawerOpen: (v: boolean) => void

  utilityDrawerOpen: boolean
  setUtilityDrawerOpen: (v: boolean) => void

  taskSheetOpen: boolean
  setTaskSheetOpen: (v: boolean) => void

  sidebarExpanded: boolean
  setSidebarExpanded: (v: boolean) => void

  projectionInsightMode: ProjectionInsightMode | null
  setProjectionInsightMode: (v: ProjectionInsightMode | null) => void

  // ─── Task Completion Animation (UX-02) ──────────────────────
  completingTaskIds: Set<string>
  addCompletingTask: (taskId: string) => void
  removeCompletingTask: (taskId: string) => void

  // ─── Completion Undo Toast (UX-02) ──────────────────────────
  completionFeedback: CompletionFeedback | null
  showCompletionFeedback: (feedback: CompletionFeedback) => void
  hideCompletionFeedback: () => void
}

export const useDesktopUiStore = create<DesktopUiState>((set) => ({
  // Modals
  tagManagerOpen: false,
  setTagManagerOpen: (v) => set({ tagManagerOpen: v }),

  shortcutPanelOpen: false,
  setShortcutPanelOpen: (v) => set({ shortcutPanelOpen: v }),

  commandPaletteOpen: false,
  setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),

  exportPanelOpen: false,
  setExportPanelOpen: (v) => set({ exportPanelOpen: v }),

  navigationDrawerOpen: false,
  setNavigationDrawerOpen: (v) => set({ navigationDrawerOpen: v }),

  utilityDrawerOpen: false,
  setUtilityDrawerOpen: (v) => set({ utilityDrawerOpen: v }),

  taskSheetOpen: false,
  setTaskSheetOpen: (v) => set({ taskSheetOpen: v }),

  sidebarExpanded: false,
  setSidebarExpanded: (v) => set({ sidebarExpanded: v }),

  projectionInsightMode: null,
  setProjectionInsightMode: (v) => set({ projectionInsightMode: v }),

  // Completion animation
  completingTaskIds: new Set<string>(),
  addCompletingTask: (taskId) => {
    set((state) => ({ completingTaskIds: new Set([...state.completingTaskIds, taskId]) }))
    // Auto-remove after animation completes (bounce 0.5s + strikethrough + slide-out 0.85s + 0.4s = ~1.4s)
    window.setTimeout(() => {
      set((state) => {
        const next = new Set(state.completingTaskIds)
        next.delete(taskId)
        return { completingTaskIds: next }
      })
    }, 1500)
  },
  removeCompletingTask: (taskId) => {
    set((state) => {
      const next = new Set(state.completingTaskIds)
      next.delete(taskId)
      return { completingTaskIds: next }
    })
  },

  // Completion Undo Toast
  completionFeedback: null,
  showCompletionFeedback: (feedback) => set({ completionFeedback: feedback }),
  hideCompletionFeedback: () => set({ completionFeedback: null }),
}))
