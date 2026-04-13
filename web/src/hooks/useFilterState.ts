import { useEffect, useRef, useState } from 'react'
import { parseQueryParams } from './useRouterSync'

const SEARCH_QUERY_DEBOUNCE_MS = 140

/** Read URL hash query params once at startup for initial state hydration */
function getUrlQueryParams() {
  const hash = window.location.hash
  const queryStr = hash.includes('?') ? hash.slice(hash.indexOf('?')) : ''
  return parseQueryParams(queryStr)
}

export function useFilterState(initialSelectedTagIds: string[]) {
  const urlParams = getUrlQueryParams()
  const initialTagIds = urlParams.selectedTagIds ?? initialSelectedTagIds
  const initialSearch = urlParams.searchKeyword ?? ''

  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(initialTagIds)
  const [searchInput, setSearchInput] = useState(initialSearch)
  const [searchKeyword, setSearchKeyword] = useState(initialSearch)
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

  return {
    selectedTagIds, setSelectedTagIds,
    searchInput, setSearchInput,
    searchKeyword, setSearchKeyword,
    searchInputRef,
    toggleSelectedTag,
    clearSelectedTags,
  }
}
