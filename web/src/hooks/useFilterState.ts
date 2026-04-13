import { useEffect, useRef, useState } from 'react'

const SEARCH_QUERY_DEBOUNCE_MS = 140

export function useFilterState(initialSelectedTagIds: string[]) {
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(initialSelectedTagIds)
  const [searchInput, setSearchInput] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
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
