import { useEffect, useRef, useState } from 'react'
import type { Priority, TaskStatus } from '../types/domain'
import { parseQueryParams } from './useRouterSync'

const SEARCH_QUERY_DEBOUNCE_MS = 140

/** Read URL hash query params once at startup for initial state hydration */
function getUrlQueryParams() {
  const hash = window.location.hash
  const queryStr = hash.includes('?') ? hash.slice(hash.indexOf('?')) : ''
  return parseQueryParams(queryStr)
}

export type FilterDue = 'overdue' | 'today' | 'week' | null

export interface FilterStateExtended {
  selectedTagIds: string[]
  setSelectedTagIds: (ids: string[]) => void
  searchInput: string
  setSearchInput: (v: string) => void
  searchKeyword: string
  setSearchKeyword: (v: string) => void
  searchInputRef: React.RefObject<HTMLInputElement | null>
  toggleSelectedTag: (tagId: string) => void
  clearSelectedTags: () => void
  /** Priority filter (empty = no filter) */
  filterPriority: Priority[]
  setFilterPriority: (p: Priority[]) => void
  clearFilterPriority: () => void
  /** Status filter (empty = no filter) */
  filterStatus: TaskStatus[]
  setFilterStatus: (s: TaskStatus[]) => void
  clearFilterStatus: () => void
  /** Due filter (null = no filter) */
  filterDue: FilterDue
  setFilterDue: (d: FilterDue) => void
  clearFilterDue: () => void
  /** Clear all active filters */
  clearAllFilters: () => void
}

export function useFilterState(initialSelectedTagIds: string[]): FilterStateExtended {
  const urlParams = getUrlQueryParams()
  const initialTagIds = urlParams.selectedTagIds ?? initialSelectedTagIds
  const initialSearch = urlParams.searchKeyword ?? ''
  const initialPriority = urlParams.filterPriority ?? []
  const initialStatus = urlParams.filterStatus ?? []
  const initialDue = urlParams.filterDue ?? null

  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(initialTagIds)
  const [searchInput, setSearchInput] = useState(initialSearch)
  const [searchKeyword, setSearchKeyword] = useState(initialSearch)
  const [filterPriority, setFilterPriority] = useState<Priority[]>(initialPriority)
  const [filterStatus, setFilterStatus] = useState<TaskStatus[]>(initialStatus)
  const [filterDue, setFilterDue] = useState<FilterDue>(initialDue)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Debounce search input → searchKeyword
  useEffect(() => {
    if (!searchInput.trim()) {
      setSearchKeyword((current) => (current ? '' : current))
      return
    }
    const timer = window.setTimeout(() => setSearchKeyword(searchInput), SEARCH_QUERY_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const toggleSelectedTag = (tagId: string) => {
    setSelectedTagIds((current) =>
      current.includes(tagId)
        ? current.filter((item) => item !== tagId)
        : [...current, tagId],
    )
  }

  const clearSelectedTags = () => setSelectedTagIds([])
  const clearFilterPriority = () => setFilterPriority([])
  const clearFilterStatus = () => setFilterStatus([])
  const clearFilterDue = () => setFilterDue(null)
  const clearAllFilters = () => {
    setSelectedTagIds([])
    setSearchInput('')
    setFilterPriority([])
    setFilterStatus([])
    setFilterDue(null)
  }

  return {
    selectedTagIds, setSelectedTagIds,
    searchInput, setSearchInput,
    searchKeyword, setSearchKeyword,
    searchInputRef,
    toggleSelectedTag,
    clearSelectedTags,
    filterPriority, setFilterPriority, clearFilterPriority,
    filterStatus, setFilterStatus, clearFilterStatus,
    filterDue, setFilterDue, clearFilterDue,
    clearAllFilters,
  }
}
