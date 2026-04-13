import { useState } from 'react'

export function useTaskSelection(initialTaskId: string | null) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(initialTaskId)
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set())
  const [bulkMode, setBulkMode] = useState(false)

  const toggleBulkSelect = (taskId: string) => {
    setBulkSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  const selectAllBulk = (taskIds: string[]) => {
    setBulkSelectedIds(new Set(taskIds))
  }

  const clearBulkSelect = () => {
    setBulkSelectedIds(new Set())
    setBulkMode(false)
  }

  return {
    selectedTaskId, setSelectedTaskId,
    bulkSelectedIds, setBulkSelectedIds,
    bulkMode, setBulkMode,
    toggleBulkSelect,
    selectAllBulk,
    clearBulkSelect,
  }
}
