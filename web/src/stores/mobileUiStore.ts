/**
 * mobileUiStore — 移动端 UI 全局状态（Zustand）
 *
 * 职责：集中管理手机端所有 UI 状态，避免在 WorkspaceApp 中分散的
 * useState 导致无关组件重渲染。
 *
 * 使用方式：
 *   import { useMobileUiStore } from '@/stores/mobileUiStore'
 *   const { mobileTab, setMobileTab } = useMobileUiStore()
 */

import { create } from 'zustand'

export type MobileTab = 'focus' | 'calendar' | 'matrix' | 'me'
export type MobileFocusScope = 'all' | 'today' | 'week' | 'list'
export type MobileMatrixViewMode = 'matrix' | 'kanban' | 'timeline'
export type MobileFocusSortMode = 'planned' | 'deadline'

export interface MobileCompletionToast {
  taskId: string
  title: string
  nextDueLabel?: string
}

interface MobileUiState {
  // ─── 导航 ───────────────────────────────────────────────────
  mobileTab: MobileTab
  setMobileTab: (tab: MobileTab) => void

  // ─── Tab 淡入淡出过渡 ────────────────────────────────────────
  mobileTabFading: boolean
  setMobileTabFading: (fading: boolean) => void

  // ─── 焦点视图 ────────────────────────────────────────────────
  mobileFocusScope: MobileFocusScope
  mobileFocusScopeListId: string | null
  mobileFocusScopeMenuOpen: boolean
  setMobileFocusScope: (scope: MobileFocusScope, listId?: string | null) => void
  setMobileFocusScopeMenuOpen: (open: boolean) => void

  // ─── 焦点视图 Upcoming 折叠 ──────────────────────────────────
  mobileFocusUpcomingCollapsed: boolean
  setMobileFocusUpcomingCollapsed: (collapsed: boolean) => void

  // ─── 日历视图 ────────────────────────────────────────────────
  mobileCalendarMode: 'month' | 'week' | 'agenda'
  mobileCalendarModeMenuOpen: boolean
  setMobileCalendarMode: (mode: 'month' | 'week' | 'agenda') => void
  setMobileCalendarModeMenuOpen: (open: boolean) => void

  // ─── 任务底部抽屉 ────────────────────────────────────────────
  selectedTaskId: string | null
  taskSheetOpen: boolean
  openTaskSheet: (taskId: string) => void
  closeTaskSheet: () => void

  // ─── 快速创建 ────────────────────────────────────────────────
  quickCreateOpen: boolean
  quickCreateDefaultDueAt: string | null
  openQuickCreate: (defaultDueAt?: string | null) => void
  closeQuickCreate: () => void

  // ─── 完成 Toast ──────────────────────────────────────────────
  completionToast: MobileCompletionToast | null
  showCompletionToast: (toast: MobileCompletionToast) => void
  hideCompletionToast: () => void

  // ─── 矩阵/看板/时间线视图模式 ────────────────────────────────
  mobileMatrixViewMode: MobileMatrixViewMode
  setMobileMatrixViewMode: (mode: MobileMatrixViewMode) => void

  mobileMatrixModeMenuOpen: boolean
  setMobileMatrixModeMenuOpen: (open: boolean) => void

  // ─── 焦点视图排序模式 ────────────────────────────────────────
  mobileFocusSortMode: MobileFocusSortMode
  setMobileFocusSortMode: (mode: MobileFocusSortMode) => void

  // ─── 我的 / 项目 ─────────────────────────────────────────────
  meShowProjects: boolean
  setMeShowProjects: (show: boolean) => void

  mobileProjectListId: string | null
  setMobileProjectListId: (id: string | null) => void
}

export const useMobileUiStore = create<MobileUiState>((set) => ({
  // 导航
  mobileTab: 'focus',
  setMobileTab: (tab) => set({ mobileTab: tab }),

  // Tab 过渡
  mobileTabFading: false,
  setMobileTabFading: (fading) => set({ mobileTabFading: fading }),

  // 焦点视图
  mobileFocusScope: 'all',
  mobileFocusScopeListId: null,
  mobileFocusScopeMenuOpen: false,
  setMobileFocusScope: (scope, listId = null) =>
    set({ mobileFocusScope: scope, mobileFocusScopeListId: listId }),
  setMobileFocusScopeMenuOpen: (open) => set({ mobileFocusScopeMenuOpen: open }),

  // 折叠
  mobileFocusUpcomingCollapsed: true,
  setMobileFocusUpcomingCollapsed: (collapsed) => set({ mobileFocusUpcomingCollapsed: collapsed }),

  // 日历
  mobileCalendarMode: 'month',
  mobileCalendarModeMenuOpen: false,
  setMobileCalendarMode: (mode) => set({ mobileCalendarMode: mode }),
  setMobileCalendarModeMenuOpen: (open) => set({ mobileCalendarModeMenuOpen: open }),

  // 任务底部抽屉
  selectedTaskId: null,
  taskSheetOpen: false,
  openTaskSheet: (taskId) => set({ selectedTaskId: taskId, taskSheetOpen: true }),
  closeTaskSheet: () => set({ taskSheetOpen: false }),

  // 快速创建
  quickCreateOpen: false,
  quickCreateDefaultDueAt: null,
  openQuickCreate: (defaultDueAt = null) =>
    set({ quickCreateOpen: true, quickCreateDefaultDueAt: defaultDueAt }),
  closeQuickCreate: () => set({ quickCreateOpen: false, quickCreateDefaultDueAt: null }),

  // 完成 Toast
  completionToast: null,
  showCompletionToast: (toast) => set({ completionToast: toast }),
  hideCompletionToast: () => set({ completionToast: null }),

  // 矩阵视图模式
  mobileMatrixViewMode: 'matrix',
  setMobileMatrixViewMode: (mode) => set({ mobileMatrixViewMode: mode }),

  mobileMatrixModeMenuOpen: false,
  setMobileMatrixModeMenuOpen: (open) => set({ mobileMatrixModeMenuOpen: open }),

  // 焦点排序模式
  mobileFocusSortMode: 'planned',
  setMobileFocusSortMode: (mode) => set({ mobileFocusSortMode: mode }),

  // 我的 / 项目
  meShowProjects: false,
  setMeShowProjects: (show) => set({ meShowProjects: show }),

  mobileProjectListId: null,
  setMobileProjectListId: (id) => set({ mobileProjectListId: id }),
}))
