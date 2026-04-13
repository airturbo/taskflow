import { useState } from 'react'
import type { PersistedState } from '../types/domain'

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

export function useNavigationState(initialState: PersistedState) {
  const migrated = migrateActiveSelection(initialState)
  const [activeSelection, setActiveSelection] = useState(migrated.activeSelection)

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
