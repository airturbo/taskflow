/**
 * useTaskActions — all task mutation handlers extracted from App.tsx.
 * Pure refactor: no behavior changes.
 */
import type { Dispatch, SetStateAction } from 'react'
import type {
  Comment,
  Priority,
  Tag,
  Task,
  TaskAttachment,
  TaskStatus,
} from '../types/domain'
import type { MatrixQuadrantKey } from '@taskflow/core'
import {
  normalizeTaskPatch,
  getFieldsForQuadrant,
  getQuadrantLabel,
  getTaskDisplayTimeValue,
  priorityMeta,
  statusMeta,
  SPECIAL_TAG_IDS,
} from '@taskflow/core'
import { getDateTimeValueFromMs } from '@taskflow/core'
import {
  diffDateKeys,
  formatDateTime,
  formatDayLabel,
  getNowIso,
  isOverdue,
  isToday,
  isWithinDays,
  shiftDateTimeByDays,
} from '../utils/dates'
import { formatTaskWindow } from '../utils/reminder-engine'
import { createNextRepeatTask, describeRepeatRule } from '../utils/repeat-rule'
import { openPath } from '@tauri-apps/plugin-opener'
import {
  makeId,
  normalizeTagName,
  upsertTaskInCache,
  formatSnoozeLabel,
  MINUTE,
  type TagMutationResult,
} from '../utils/app-helpers'

// ---- Types for the hook params ----

export interface TaskActionsParams {
  tasks: Task[]
  setTasks: Dispatch<SetStateAction<Task[]>>
  tags: Tag[]
  setTags: Dispatch<SetStateAction<Tag[]>>
  lists: { id: string; name: string }[]
  setLists: Dispatch<SetStateAction<any[]>>
  folders: any[]
  setFolders: Dispatch<SetStateAction<any[]>>
  filters: any[]
  selectedTaskId: string | null
  setSelectedTaskId: (id: string | null) => void
  selectedTagIds: string[]
  setSelectedTagIds: Dispatch<SetStateAction<string[]>>
  activeSelection: string
  setActiveSelection: (sel: string) => void
  setCurrentView: (view: any) => void
  selectionTimeModes: Record<string, string> | Partial<Record<string, string>> | null | undefined
  bulkSelectedIds: Set<string>
  clearBulkSelect: () => void
  setStatusChangeFeedback: (feedback: any) => void
  statusChangeFeedback: any
  setQuickTagIds: Dispatch<SetStateAction<string[]>>
  setInlineCreate: Dispatch<SetStateAction<any>>
  markReminderSnoozed: (feedId: string) => void
  appendReminderFeed: (item: any) => void
}

const SYSTEM_TAG_IDS_LIST = Object.values(SPECIAL_TAG_IDS)
const isSystemTagId = (tagId: string) => SYSTEM_TAG_IDS_LIST.includes(tagId as (typeof SYSTEM_TAG_IDS_LIST)[number])

export function useTaskActions(params: TaskActionsParams) {
  const {
    tasks, setTasks, tags, setTags, setLists, setFolders,
    selectedTaskId, setSelectedTaskId, setSelectedTagIds,
    activeSelection, setActiveSelection, setCurrentView, selectionTimeModes,
    bulkSelectedIds, clearBulkSelect,
    setStatusChangeFeedback, statusChangeFeedback,
    setQuickTagIds, setInlineCreate,
    markReminderSnoozed, appendReminderFeed,
  } = params

  const getTaskByIdFromCache = (taskId: string) => tasks.find((task) => task.id === taskId) ?? null

  const applyTaskMutation = (taskId: string, transform: (task: Task) => Task | null) => {
    const current = getTaskByIdFromCache(taskId)
    if (!current) return null
    const nextTask = transform(current)
    if (!nextTask) return null
    setTasks((items) => items.map((task) => (task.id === taskId ? nextTask : task)))
    return nextTask
  }

  const updateTask = (taskId: string, patch: Partial<Task>) => {
    const currentTask = getTaskByIdFromCache(taskId)
    if (!currentTask) return
    applyTaskMutation(taskId, (task) => normalizeTaskPatch(task, patch))
  }

  const toggleTaskComplete = (taskId: string) => {
    const currentTask = getTaskByIdFromCache(taskId)
    if (!currentTask) return

    const completing = !currentTask.completed

    applyTaskMutation(taskId, (task) => {
      return normalizeTaskPatch(task, {
        completed: completing,
        activity: [
          { id: makeId('act'), content: completing ? '\u5B8C\u6210\u4EFB\u52A1' : '\u91CD\u65B0\u6253\u5F00\u4EFB\u52A1', createdAt: getNowIso() },
          ...task.activity,
        ],
      })
    })

    // Repeat task: auto-generate next cycle on completion
    if (completing && currentTask.repeatRule) {
      const nextTaskData = createNextRepeatTask(currentTask)
      if (nextTaskData) {
        const nextTask: Task = {
          ...nextTaskData,
          id: makeId('task'),
          createdAt: getNowIso(),
          updatedAt: getNowIso(),
          activity: [
            { id: makeId('act'), content: `\u7531\u91CD\u590D\u4EFB\u52A1\u81EA\u52A8\u751F\u6210\uFF08${describeRepeatRule(currentTask.repeatRule)}\uFF09`, createdAt: getNowIso() },
          ],
        }
        setTasks(prev => [...prev, nextTask])
      }
    }
  }

  const moveTaskToStatus = (taskId: string, status: TaskStatus) => {
    applyTaskMutation(taskId, (task) =>
      normalizeTaskPatch(task, {
        status,
        activity:
          task.status === status
            ? task.activity
            : [{ id: makeId('act'), content: `\u5C06\u72B6\u6001\u8C03\u6574\u4E3A${statusMeta[status]}`, createdAt: getNowIso() }, ...task.activity],
      }),
    )
  }

  const applyStatusChangeFeedback = (taskId: string, status: TaskStatus) => {
    const task = getTaskByIdFromCache(taskId)
    if (!task || task.status === status) return
    moveTaskToStatus(taskId, status)
    setStatusChangeFeedback({
      taskId,
      title: task.title,
      fromStatus: task.status,
      toStatus: status,
    })
  }

  const applyKanbanDropFeedback = (taskId: string, status: TaskStatus) => {
    applyStatusChangeFeedback(taskId, status)
  }

  const updateTaskPriority = (taskId: string, priority: Priority) => {
    const task = getTaskByIdFromCache(taskId)
    if (!task || task.priority === priority) return
    applyTaskMutation(taskId, (current) =>
      normalizeTaskPatch(current, {
        priority,
        activity: [{ id: makeId('act'), content: `\u5C06\u4F18\u5148\u7EA7\u8C03\u6574\u4E3A${priorityMeta[priority].label}`, createdAt: getNowIso() }, ...current.activity],
      }),
    )
  }

  const moveTaskToQuadrant = (taskId: string, quadrant: MatrixQuadrantKey) => {
    applyTaskMutation(taskId, (task) => {
      const { isUrgent, isImportant } = getFieldsForQuadrant(quadrant)
      if (task.isUrgent === isUrgent && task.isImportant === isImportant) {
        return task
      }
      return normalizeTaskPatch(task, {
        isUrgent,
        isImportant,
        activity: [{ id: makeId('act'), content: `\u901A\u8FC7\u56DB\u8C61\u9650\u62D6\u52A8\u8C03\u6574\u4E3A${getQuadrantLabel(quadrant)}`, createdAt: getNowIso() }, ...task.activity],
      })
    })
  }

  const undoStatusChange = () => {
    if (!statusChangeFeedback) return
    moveTaskToStatus(statusChangeFeedback.taskId, statusChangeFeedback.fromStatus)
    setStatusChangeFeedback(null)
  }

  const rescheduleTask = (taskId: string, startAt: string, dueAt: string) => {
    applyTaskMutation(taskId, (task) =>
      normalizeTaskPatch(task, {
        startAt,
        dueAt,
        activity: [{ id: makeId('act'), content: `\u901A\u8FC7\u65F6\u95F4\u7EBF\u8C03\u6574\u4E3A ${formatTaskWindow(startAt, dueAt)}`, createdAt: getNowIso() }, ...task.activity],
      }),
    )
  }

  const moveTaskToDate = (taskId: string, fromDateKey: string, toDateKey: string) => {
    if (fromDateKey === toDateKey) return
    const offsetDays = diffDateKeys(fromDateKey, toDateKey)
    applyTaskMutation(taskId, (task) =>
      normalizeTaskPatch(task, {
        startAt: shiftDateTimeByDays(task.startAt, offsetDays),
        dueAt: shiftDateTimeByDays(task.dueAt, offsetDays),
        activity: [{ id: makeId('act'), content: `\u901A\u8FC7\u65E5\u5386\u62D6\u52A8\u6539\u671F\u5230 ${formatDayLabel(toDateKey)}`, createdAt: getNowIso() }, ...task.activity],
      }),
    )
  }

  // ---- Bulk operations ----

  const bulkComplete = () => {
    const now = getNowIso()
    setTasks(prev => prev.map(t =>
      bulkSelectedIds.has(t.id)
        ? { ...t, completed: true, status: 'done' as TaskStatus, updatedAt: now }
        : t
    ))
    clearBulkSelect()
  }

  const bulkDelete = () => {
    const now = getNowIso()
    setTasks(prev => prev.map(t =>
      bulkSelectedIds.has(t.id)
        ? { ...t, deleted: true, updatedAt: now }
        : t
    ))
    clearBulkSelect()
  }

  const bulkMoveToList = (listId: string) => {
    const now = getNowIso()
    setTasks(prev => prev.map(t =>
      bulkSelectedIds.has(t.id)
        ? { ...t, listId, updatedAt: now }
        : t
    ))
    clearBulkSelect()
  }

  const bulkAddTag = (tagId: string) => {
    const now = getNowIso()
    setTasks(prev => prev.map(t =>
      bulkSelectedIds.has(t.id) && !t.tagIds.includes(tagId)
        ? { ...t, tagIds: [...t.tagIds, tagId], updatedAt: now }
        : t
    ))
    clearBulkSelect()
  }

  const softDeleteTask = (taskId: string) => {
    applyTaskMutation(taskId, (task) => ({
      ...task,
      deleted: true,
      updatedAt: getNowIso(),
      activity: [{ id: makeId('act'), content: '\u79FB\u5165\u56DE\u6536\u7AD9', createdAt: getNowIso() }, ...task.activity],
    }))
    if (selectedTaskId === taskId) setSelectedTaskId(null)
  }

  const restoreTask = (taskId: string) => {
    const task = getTaskByIdFromCache(taskId)
    if (!task) return

    const todayProbe = getTaskDisplayTimeValue(task, (selectionTimeModes?.today as any) ?? 'planned')
    const upcomingProbe = getTaskDisplayTimeValue(task, (selectionTimeModes?.upcoming as any) ?? 'planned')

    updateTask(taskId, { deleted: false })
    setSelectedTaskId(taskId)
    setCurrentView('list')

    if (task.completed) {
      setActiveSelection('system:completed')
    } else if (isToday(todayProbe) || isOverdue(todayProbe)) {
      setActiveSelection('system:today')
    } else if (isWithinDays(upcomingProbe, 7)) {
      setActiveSelection('system:upcoming')
    } else {
      setActiveSelection(`list:${task.listId}`)
    }
  }

  const duplicateTask = (taskId: string) => {
    const current = getTaskByIdFromCache(taskId)
    if (!current) return
    const now = getNowIso()
    const duplicate: Task = {
      ...current,
      id: makeId('task'),
      title: `${current.title}\uFF08\u526F\u672C\uFF09`,
      comments: [],
      activity: [{ id: makeId('act'), content: '\u4ECE\u539F\u4EFB\u52A1\u590D\u5236\u800C\u6765', createdAt: now }],
      completed: false,
      deleted: false,
      completedPomodoros: 0,
      focusMinutes: 0,
      createdAt: now,
      updatedAt: now,
    }
    setTasks((items) => upsertTaskInCache(items, duplicate, true))
    setSelectedTaskId(duplicate.id)
  }

  const addReminder = (taskId: string, label: string, value: string, kind: 'relative' | 'absolute') => {
    const task = getTaskByIdFromCache(taskId)
    if (!task) return
    const duplicated = task.reminders.some((item) => item.label === label && item.value === value && item.kind === kind)
    if (duplicated) return
    updateTask(taskId, {
      reminders: [...task.reminders, { id: makeId('rem'), label, value, kind }],
      activity: [{ id: makeId('act'), content: `\u65B0\u589E\u63D0\u9192\uFF1A${label}`, createdAt: getNowIso() }, ...task.activity],
    })
  }

  const removeReminder = (taskId: string, reminderId: string) => {
    const task = getTaskByIdFromCache(taskId)
    if (!task) return
    const reminder = task.reminders.find((item) => item.id === reminderId)
    if (!reminder) return
    updateTask(taskId, {
      reminders: task.reminders.filter((item) => item.id !== reminderId),
      activity: [{ id: makeId('act'), content: `\u79FB\u9664\u63D0\u9192\uFF1A${reminder.label}`, createdAt: getNowIso() }, ...task.activity],
    })
  }

  const snoozeReminder = (feedId: string, taskId: string, minutes: number) => {
    const task = getTaskByIdFromCache(taskId)
    if (!task) return
    const reminderAt = getDateTimeValueFromMs(Date.now() + minutes * MINUTE)
    markReminderSnoozed(feedId)
    updateTask(taskId, {
      reminders: [...task.reminders, { id: makeId('rem'), label: `\u7A0D\u540E ${formatSnoozeLabel(minutes)}`, value: reminderAt, kind: 'absolute' }],
      activity: [{ id: makeId('act'), content: `\u5C06\u63D0\u9192\u7A0D\u540E ${formatSnoozeLabel(minutes)}`, createdAt: getNowIso() }, ...task.activity],
    })
    appendReminderFeed({
      title: `\u5DF2\u7A0D\u540E\u63D0\u9192 \u00B7 ${task.title}`,
      body: `\u5C06\u5728 ${formatDateTime(reminderAt)} \u518D\u6B21\u63D0\u9192\u4F60\u3002`,
      tone: 'success',
    })
  }

  const addSubtask = (taskId: string, title: string) => {
    const task = getTaskByIdFromCache(taskId)
    if (!task || !title.trim()) return
    updateTask(taskId, {
      subtasks: [...task.subtasks, { id: makeId('sub'), title: title.trim(), completed: false }],
      activity: [{ id: makeId('act'), content: `\u65B0\u589E\u5B50\u4EFB\u52A1\uFF1A${title.trim()}`, createdAt: getNowIso() }, ...task.activity],
    })
  }

  const toggleSubtask = (taskId: string, subtaskId: string) => {
    const task = getTaskByIdFromCache(taskId)
    if (!task) return
    updateTask(taskId, {
      subtasks: task.subtasks.map((subtask) =>
        subtask.id === subtaskId ? { ...subtask, completed: !subtask.completed } : subtask,
      ),
    })
  }

  const addComment = (taskId: string, comment: Comment) => {
    const task = getTaskByIdFromCache(taskId)
    if (!task) return
    updateTask(taskId, {
      comments: [comment, ...task.comments],
      activity: [{ id: makeId('act'), content: '\u6DFB\u52A0\u4E86\u4E00\u6761\u8BC4\u8BBA', createdAt: getNowIso() }, ...task.activity],
    })
  }

  const addAttachments = (taskId: string, attachments: TaskAttachment[]) => {
    const task = getTaskByIdFromCache(taskId)
    const nextAttachments = attachments.filter((attachment) => attachment.name.trim())
    if (!task || nextAttachments.length === 0) return
    updateTask(taskId, {
      attachments: [...task.attachments, ...nextAttachments],
      activity: [{ id: makeId('act'), content: `\u6DFB\u52A0\u4E86 ${nextAttachments.length} \u4E2A\u9644\u4EF6`, createdAt: getNowIso() }, ...task.activity],
    })
  }

  const removeAttachment = (taskId: string, attachmentId: string) => {
    const task = getTaskByIdFromCache(taskId)
    if (!task) return
    const attachment = task.attachments.find((item) => item.id === attachmentId)
    if (!attachment) return
    updateTask(taskId, {
      attachments: task.attachments.filter((item) => item.id !== attachmentId),
      activity: [{ id: makeId('act'), content: `\u79FB\u9664\u4E86\u9644\u4EF6\uFF1A${attachment.name}`, createdAt: getNowIso() }, ...task.activity],
    })
  }

  const openAttachment = async (attachment: TaskAttachment) => {
    if (attachment.path) {
      try {
        await openPath(attachment.path)
        return
      } catch {
        // continue to fallback below
      }
    }
    if (attachment.dataUrl && typeof window !== 'undefined') {
      const anchor = document.createElement('a')
      anchor.href = attachment.dataUrl
      anchor.download = attachment.name
      anchor.rel = 'noreferrer'
      anchor.target = '_blank'
      anchor.click()
    }
  }

  // ---- Tag CRUD ----

  const validateTagMutation = (name: string, excludeId?: string) => {
    const normalized = normalizeTagName(name)
    if (!normalized) return '\u6807\u7B7E\u540D\u4E0D\u80FD\u4E3A\u7A7A'
    const duplicate = tags.some((tag) => normalizeTagName(tag.name).toLowerCase() === normalized.toLowerCase() && tag.id !== excludeId)
    if (duplicate) return `\u6807\u7B7E\u201C${normalized}\u201D\u5DF2\u5B58\u5728`
    return null
  }

  const createTagDefinition = (name: string, color: string): TagMutationResult => {
    const normalized = normalizeTagName(name)
    const validationError = validateTagMutation(normalized)
    if (validationError) return { ok: false, message: validationError }
    const nextTagId = makeId('tag')
    setTags((current) => [...current, { id: nextTagId, name: normalized, color }])
    return { ok: true, tagId: nextTagId }
  }

  const updateTagDefinition = (tagId: string, name: string, color: string): TagMutationResult => {
    if (isSystemTagId(tagId)) {
      return { ok: false, message: '\u7CFB\u7EDF\u6807\u7B7E\u6682\u4E0D\u652F\u6301\u91CD\u547D\u540D\u6216\u6539\u8272' }
    }
    const normalized = normalizeTagName(name)
    const validationError = validateTagMutation(normalized, tagId)
    if (validationError) return { ok: false, message: validationError }
    setTags((current) => current.map((tag) => (tag.id === tagId ? { ...tag, name: normalized, color } : tag)))
    return { ok: true, tagId }
  }

  const deleteTagDefinition = (tagId: string): TagMutationResult => {
    if (isSystemTagId(tagId)) {
      return { ok: false, message: '\u7CFB\u7EDF\u6807\u7B7E\u6682\u4E0D\u652F\u6301\u5220\u9664' }
    }
    const tagExists = tags.some((tag) => tag.id === tagId)
    if (!tagExists) {
      return { ok: false, message: '\u8981\u5220\u9664\u7684\u6807\u7B7E\u4E0D\u5B58\u5728' }
    }
    const now = getNowIso()
    setTags((current) => current.filter((tag) => tag.id !== tagId))
    setSelectedTagIds((current) => current.filter((item) => item !== tagId))
    setQuickTagIds((current) => current.filter((item) => item !== tagId))
    setInlineCreate((current: any) =>
      current
        ? { ...current, tagIds: current.tagIds.filter((item: string) => item !== tagId) }
        : current,
    )
    setTasks((current) =>
      current.map((task) =>
        task.tagIds.includes(tagId)
          ? { ...task, tagIds: task.tagIds.filter((item) => item !== tagId), updatedAt: now }
          : task,
      ),
    )
    return { ok: true, tagId }
  }

  // ---- Folder CRUD ----

  const createFolder = (name: string, color = '#6c63ff') => {
    const trimmed = name.trim()
    if (!trimmed) return
    const id = makeId('folder')
    setFolders((prev: any[]) => [...prev, { id, name: trimmed, color }])
  }

  const renameFolder = (folderId: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setFolders((prev: any[]) => prev.map((f: any) => f.id === folderId ? { ...f, name: trimmed } : f))
  }

  const updateFolderColor = (folderId: string, color: string) => {
    setFolders((prev: any[]) => prev.map((f: any) => f.id === folderId ? { ...f, color } : f))
  }

  const deleteFolder = (folderId: string) => {
    setLists((prev: any[]) => prev.map((l: any) => l.folderId === folderId ? { ...l, folderId: null } : l))
    setFolders((prev: any[]) => prev.filter((f: any) => f.id !== folderId))
  }

  // ---- List CRUD ----

  const createList = (name: string, folderId: string | null = null, color = '#6c63ff') => {
    const trimmed = name.trim()
    if (!trimmed) return
    const id = makeId('list')
    setLists((prev: any[]) => [...prev, { id, name: trimmed, color, folderId, kind: 'custom' }])
  }

  const renameList = (listId: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setLists((prev: any[]) => prev.map((l: any) => l.id === listId ? { ...l, name: trimmed } : l))
  }

  const updateListColor = (listId: string, color: string) => {
    setLists((prev: any[]) => prev.map((l: any) => l.id === listId ? { ...l, color } : l))
  }

  const updateListFolder = (listId: string, folderId: string | null) => {
    setLists((prev: any[]) => prev.map((l: any) => l.id === listId ? { ...l, folderId } : l))
  }

  const deleteList = (listId: string) => {
    const now = getNowIso()
    setTasks(prev => prev.map(t =>
      t.listId === listId ? { ...t, listId: 'inbox', updatedAt: now } : t
    ))
    setLists((prev: any[]) => prev.filter((l: any) => l.id !== listId))
    if (activeSelection === `list:${listId}`) setActiveSelection('system:all')
  }

  return {
    updateTask,
    toggleTaskComplete,
    moveTaskToStatus,
    applyStatusChangeFeedback,
    applyKanbanDropFeedback,
    updateTaskPriority,
    moveTaskToQuadrant,
    undoStatusChange,
    rescheduleTask,
    moveTaskToDate,
    bulkComplete,
    bulkDelete,
    bulkMoveToList,
    bulkAddTag,
    softDeleteTask,
    restoreTask,
    duplicateTask,
    addReminder,
    removeReminder,
    snoozeReminder,
    addSubtask,
    toggleSubtask,
    addComment,
    addAttachments,
    removeAttachment,
    openAttachment,
    createTagDefinition,
    updateTagDefinition,
    deleteTagDefinition,
    createFolder,
    renameFolder,
    updateFolderColor,
    deleteFolder,
    createList,
    renameList,
    updateListColor,
    updateListFolder,
    deleteList,
  }
}
