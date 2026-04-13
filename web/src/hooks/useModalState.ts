import { useState } from 'react'

export type ProjectionInsightMode = 'unscheduled' | 'outside'

export function useModalState() {
  const [tagManagerOpen, setTagManagerOpen] = useState(false)
  const [shortcutPanelOpen, setShortcutPanelOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [exportPanelOpen, setExportPanelOpen] = useState(false)
  const [navigationDrawerOpen, setNavigationDrawerOpen] = useState(false)
  const [utilityDrawerOpen, setUtilityDrawerOpen] = useState(false)
  const [taskSheetOpen, setTaskSheetOpen] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [projectionInsightMode, setProjectionInsightMode] = useState<ProjectionInsightMode | null>(null)

  return {
    tagManagerOpen, setTagManagerOpen,
    shortcutPanelOpen, setShortcutPanelOpen,
    commandPaletteOpen, setCommandPaletteOpen,
    exportPanelOpen, setExportPanelOpen,
    navigationDrawerOpen, setNavigationDrawerOpen,
    utilityDrawerOpen, setUtilityDrawerOpen,
    taskSheetOpen, setTaskSheetOpen,
    sidebarExpanded, setSidebarExpanded,
    projectionInsightMode, setProjectionInsightMode,
  }
}
