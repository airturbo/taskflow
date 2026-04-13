import { useState } from 'react'
import type { PersistedState } from '../types/domain'
import { pathToSelection } from './useRouterSync'

/** Migrate legacy activeSelection values to current format */
function migrateActiveSelection(initialState: PersistedState): {
  activeSelection: string
  selectedTagIds: string[]
} {
  const legacyTagSelectionId = initialState.activeSelection.startsWith('tag:')
    ? initialState.activeSelection.split(':')[1] ?? ''
    : ''
  const activeSelection = ['tool:focus', 'tool:habits'].includes(initialState.activeSelection)
    ? 'system:today'
    : legacyTagSelectionId
      ? 'system:all'
      : initialState.activeSelection
  const selectedTagIds = initialState.selectedTagIds.length
    ? initialState.selectedTagIds
    : legacyTagSelectionId
      ? [legacyTagSelectionId]
      : []
  return { activeSelection, selectedTagIds }
}

/**
 * Get initial activeSelection from URL hash path (if present),
 * falling back to localStorage-persisted value.
 * URL takes priority so that direct links and refreshes restore exact state.
 */
function getInitialSelection(migratedFromStorage: string): string {
  // Read current hash path (e.g. "#/list/abc" → "/list/abc")
  const hash = window.location.hash
  const pathname = hash.startsWith('#') ? hash.slice(1).split('?')[0] : ''
  if (pathname && pathname !== '/') {
    const fromUrl = pathToSelection(pathname)
    if (fromUrl) return fromUrl
  }
  return migratedFromStorage
}

export function useNavigationState(initialState: PersistedState) {
  const migrated = migrateActiveSelection(initialState)
  const initialSelection = getInitialSelection(migrated.activeSelection)
  const [activeSelection, setActiveSelection] = useState(initialSelection)

  // Derived: parsed selection parts
  const selectionParts = activeSelection.split(':')
  const selectionKind = selectionParts[0]
  const selectionId = selectionParts[1] ?? ''
  const isToolSelection = selectionKind === 'tool'

  return {
    activeSelection, setActiveSelection,
    selectionKind,
    selectionId,
    isToolSelection,
    /** Initial selectedTagIds after legacy migration — pass to useFilterState */
    migratedSelectedTagIds: migrated.selectedTagIds,
  }
}
