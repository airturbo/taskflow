/**
 * useWorkspaceEffects — side effects extracted from WorkspaceApp in App.tsx.
 * Handles: theme sync, state persistence, viewport resize, global shortcuts,
 * drawer auto-close, task fallback selection, feedback timers, inline-create
 * escape, context reset, reminder tick.
 * Pure refactor: no behavior changes.
 */
import { useEffect } from 'react'
import { useGlobalShortcuts } from './useGlobalShortcuts'
import { saveState } from '../utils/storage'
import { collectReminderEvents } from '../utils/reminder-engine'
import type { PersistedState, Task } from '../types/domain'

export interface WorkspaceEffectsParams {
  // Theme
  resolvedTheme: string
  // State persistence
  folders: any[]; lists: any[]; tags: any[]; filters: any[]; tasks: Task[]
  theme: any; activeSelection: string; selectedTagIds: string[]
  selectionTimeModes: any; currentView: string; calendarMode: string
  calendarShowCompleted: boolean; timelineScale: any
  firedReminderKeys: any; initialState: PersistedState
  // Viewport
  setViewportWidth: (w: number) => void
  // Global shortcuts
  quickCreateInputRef: any; searchInputRef: any
  setCommandPaletteOpen: (v: any) => void
  setSelectedTaskId: (id: string | null) => void
  setCurrentView: (v: any) => void
  setShortcutPanelOpen: (v: any) => void
  // Drawer auto-close
  viewportWidth: number
  setNavigationDrawerOpen: (v: any) => void; setUtilityDrawerOpen: (v: any) => void
  // Task fallback
  selectedTaskId: string | null
  // Feedback timers
  createFeedback: any; setCreateFeedback: (v: any) => void
  statusChangeFeedback: any; setStatusChangeFeedback: (v: any) => void
  // Inline create
  inlineCreate: any; setInlineCreate: (v: any) => void
  setProjectionInsightMode: (v: any) => void
  searchKeyword: string
  // Reminders
  setFiredReminderKeys: (v: any) => void
  notifySurface: any
}

export function useWorkspaceEffects(p: WorkspaceEffectsParams) {
  useEffect(() => {
    document.documentElement.dataset.theme = p.resolvedTheme
  }, [p.resolvedTheme])

  useEffect(() => {
    void saveState({
      folders: p.folders, lists: p.lists, tags: p.tags, filters: p.filters,
      tasks: p.tasks, theme: p.theme, activeSelection: p.activeSelection,
      selectedTagIds: p.selectedTagIds, selectionTimeModes: p.selectionTimeModes,
      currentView: p.currentView, calendarMode: p.calendarMode,
      calendarShowCompleted: p.calendarShowCompleted, timelineScale: p.timelineScale,
      firedReminderKeys: p.firedReminderKeys, onboarding: p.initialState.onboarding,
    } as any)
  }, [p.activeSelection, p.calendarMode, p.calendarShowCompleted, p.currentView, p.filters, p.firedReminderKeys, p.folders, p.lists, p.selectedTagIds, p.selectionTimeModes, p.tags, p.tasks, p.theme, p.timelineScale])

  useEffect(() => {
    const onResize = () => p.setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useGlobalShortcuts([
    { key: 'n', meta: 'cmdOrCtrl', description: '\u65B0\u5EFA\u4EFB\u52A1', action: () => p.quickCreateInputRef.current?.focus() },
    { key: 'k', meta: 'cmdOrCtrl', description: '\u547D\u4EE4\u9762\u677F', action: () => p.setCommandPaletteOpen((prev: boolean) => !prev) },
    { key: 'Escape', description: '\u53D6\u6D88\u9009\u4E2D', action: () => { p.setSelectedTaskId(null); p.searchInputRef.current?.blur() } },
    { key: '1', description: '\u5207\u6362\u5230\u65E5\u5386\u89C6\u56FE', action: () => p.setCurrentView('calendar') },
    { key: '2', description: '\u5207\u6362\u5230\u5217\u8868\u89C6\u56FE', action: () => p.setCurrentView('list') },
    { key: '3', description: '\u5207\u6362\u5230\u770B\u677F\u89C6\u56FE', action: () => p.setCurrentView('kanban') },
    { key: '4', description: '\u5207\u6362\u5230\u65F6\u95F4\u7EBF\u89C6\u56FE', action: () => p.setCurrentView('timeline') },
    { key: '5', description: '\u5207\u6362\u5230\u56DB\u8C61\u9650\u89C6\u56FE', action: () => p.setCurrentView('matrix') },
    { key: '?', description: '\u5FEB\u6377\u952E\u9762\u677F', action: () => p.setShortcutPanelOpen((prev: boolean) => !prev) },
  ])

  useEffect(() => {
    if (p.viewportWidth > 960) p.setNavigationDrawerOpen(false)
    if (p.viewportWidth > 1280) p.setUtilityDrawerOpen(false)
  }, [p.viewportWidth])

  useEffect(() => {
    if (!p.selectedTaskId) return
    const exists = p.tasks.some((t) => t.id === p.selectedTaskId && !t.deleted)
    if (!exists) {
      const fallback = p.tasks.find((t) => !t.deleted)
      p.setSelectedTaskId(fallback?.id ?? null)
    }
  }, [p.selectedTaskId, p.tasks])

  useEffect(() => {
    if (!p.createFeedback) return
    const timer = window.setTimeout(() => p.setCreateFeedback(null), 4800)
    return () => window.clearTimeout(timer)
  }, [p.createFeedback])

  useEffect(() => {
    if (!p.statusChangeFeedback) return
    const timer = window.setTimeout(() => p.setStatusChangeFeedback(null), 3000)
    return () => window.clearTimeout(timer)
  }, [p.statusChangeFeedback])

  useEffect(() => {
    if (!p.inlineCreate) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') p.setInlineCreate(null) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [p.inlineCreate])

  useEffect(() => {
    p.setInlineCreate(null)
    p.setNavigationDrawerOpen(false)
    p.setProjectionInsightMode(null)
  }, [p.activeSelection, p.calendarMode, p.currentView, p.searchKeyword, p.selectedTagIds, p.timelineScale])

  useEffect(() => {
    let cancelled = false
    const tickReminders = async () => {
      if (cancelled) return
      const { events, nextKeys } = collectReminderEvents(p.tasks, p.firedReminderKeys)
      if (events.length === 0) return
      events.forEach((event: any) => { void p.notifySurface(event) })
      p.setFiredReminderKeys(nextKeys)
    }
    void tickReminders()
    const timer = window.setInterval(() => { void tickReminders() }, 15000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [p.firedReminderKeys, p.notifySurface, p.tasks])
}
