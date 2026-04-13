import { useRef, useState } from 'react'
import type { Priority, TaskStatus, WorkspaceView } from '../types/domain'

export type InlineCreatePositionMode = 'floating' | 'top-docked'

export type InlineCreatePosition = {
  x: number
  y: number
  mode: InlineCreatePositionMode
}

export type InlineCreateDraft = {
  view: WorkspaceView
  title: string
  note: string
  listId: string
  priority: Priority
  tagIds: string[]
  status: TaskStatus
  dateKey: string
  time: string
  guidance: string
  position: InlineCreatePosition
}

export type QuickCreateFeedback = {
  title: string
  listId: string
  listName: string
  visibleInWorkspace: boolean
  workspaceLabel: string
}

export type StatusChangeFeedback = {
  taskId: string
  title: string
  fromStatus: TaskStatus
  toStatus: TaskStatus
}

export function useQuickCreate() {
  const [quickEntry, setQuickEntry] = useState('')
  const [quickListId, setQuickListId] = useState('inbox')
  const [quickPriority, setQuickPriority] = useState<Priority>('normal')
  const [quickTagIds, setQuickTagIds] = useState<string[]>([])
  const quickCreateInputRef = useRef<HTMLInputElement>(null)

  const [inlineCreate, setInlineCreate] = useState<InlineCreateDraft | null>(null)
  const [createFeedback, setCreateFeedback] = useState<QuickCreateFeedback | null>(null)
  const [statusChangeFeedback, setStatusChangeFeedback] = useState<StatusChangeFeedback | null>(null)

  const toggleQuickTag = (tagId: string) => {
    setQuickTagIds((current) =>
      current.includes(tagId)
        ? current.filter((item) => item !== tagId)
        : [...current, tagId],
    )
  }

  const toggleInlineCreateTag = (tagId: string) => {
    setInlineCreate((current) => {
      if (!current) return current
      return {
        ...current,
        tagIds: current.tagIds.includes(tagId)
          ? current.tagIds.filter((item) => item !== tagId)
          : [...current.tagIds, tagId],
      }
    })
  }

  return {
    quickEntry, setQuickEntry,
    quickListId, setQuickListId,
    quickPriority, setQuickPriority,
    quickTagIds, setQuickTagIds,
    quickCreateInputRef,
    inlineCreate, setInlineCreate,
    createFeedback, setCreateFeedback,
    statusChangeFeedback, setStatusChangeFeedback,
    toggleQuickTag,
    toggleInlineCreateTag,
  }
}
