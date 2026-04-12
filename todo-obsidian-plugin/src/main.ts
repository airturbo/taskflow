import { Notice, Plugin, TFile, type Editor, type WorkspaceLeaf } from 'obsidian';
import { TodoWorkspaceSettingTab } from './settings';
import { DEFAULT_DATA, DEFAULT_SETTINGS, type TodoPluginData, type TodoPluginSettings, type CreateTaskPayload } from './types';
import type { Task, Tag, TodoList } from './core/domain';
import { createNextRepeatTask } from './core/repeat-rule';
import { normalizeTaskPatch, getTagIdsForQuadrant } from './core/selectors';
import type { MatrixQuadrantKey } from './core/selectors';
import { diffDateKeys, shiftDateTimeByDays } from './core/dates';
import { TODO_WORKSPACE_VIEW_TYPE, TodoWorkspaceView } from './view';
import { TaskFlowSync } from './sync';

export default class TodoWorkspacePlugin extends Plugin {
  private data: TodoPluginData = { ...DEFAULT_DATA };

  private readonly listeners = new Set<() => void>();

  /** Supabase sync engine — always available, silently skips if not configured */
  sync!: TaskFlowSync;

  async onload() {
    await this.loadPluginState();

    // Initialise sync engine (silent no-op if settings not filled)
    this.sync = new TaskFlowSync(this);
    void this.sync.init();

    this.registerView(TODO_WORKSPACE_VIEW_TYPE, (leaf) => new TodoWorkspaceView(leaf, this));

    this.addRibbonIcon('check-square', 'Open Todo Workspace', () => {
      void this.activateView();
    });

    this.addCommand({
      id: 'open-todo-workspace',
      name: 'Open Todo Workspace',
      callback: () => {
        void this.activateView();
      },
    });

    this.addCommand({
      id: 'capture-task-from-active-note',
      name: 'Capture task from active note',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) {
          void this.createTask({ title: file.basename, sourcePath: file.path });
        }
        return true;
      },
    });

    this.addCommand({
      id: 'taskflow-sync-now',
      name: 'TaskFlow: 立即同步',
      callback: () => {
        void this.sync.syncNow();
      },
    });

    this.addSettingTab(new TodoWorkspaceSettingTab(this.app, this));

    // Render TaskFlow status badges next to checkboxes in notes linked to tasks
    this.registerMarkdownPostProcessor((el, ctx) => {
      const checkboxes = el.querySelectorAll<HTMLInputElement>('li.task-list-item input[type="checkbox"]');

      checkboxes.forEach((checkbox) => {
        const li = checkbox.closest('li');
        if (!li) return;

        const notePath = ctx.sourcePath;
        const tasks = this.getData().tasks;

        // Match tasks whose source note (stored in assignee) is this note
        const linkedTask = tasks.find(t =>
          t.assignee === notePath ||
          t.assignee === notePath.replace(/\.md$/, '')
        );

        if (!linkedTask) return;

        const badge = createEl('span', {
          cls: 'taskflow-status-badge',
          text: linkedTask.status === 'done' ? '✅' : linkedTask.status === 'doing' ? '🔄' : '⬜',
          attr: { title: `TaskFlow: ${linkedTask.title} [${linkedTask.status}]` },
        });

        badge.style.cssText = 'margin-left: 4px; cursor: pointer; font-size: 0.85em;';

        badge.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const newStatus = linkedTask.status === 'done' ? 'todo' : 'done';
          await this.updateTask(linkedTask.id, {
            status: newStatus,
            completed: newStatus === 'done',
          });
          badge.setText(newStatus === 'done' ? '✅' : '⬜');
        });

        li.appendChild(badge);
      });
    });

    // O-P1-3: Frontmatter task sync — watch .md files with `task:` frontmatter
    this.registerEvent(
      this.app.vault.on('modify', async (file) => {
        if (!(file instanceof TFile) || file.extension !== 'md') return;

        // metadataCache may lag; retry once after a short delay
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (!fm?.task) return;

        const fmTask = fm.task as {
          title?: string;
          due?: string;
          priority?: string;
          status?: string;
        };
        if (!fmTask.title) return;

        const data = this.getData();
        const existingTaskId: string | undefined = fm['taskflow_task_id'];

        if (existingTaskId) {
          // Update existing task with frontmatter values
          const idx = data.tasks.findIndex((t) => t.id === existingTaskId);
          if (idx !== -1) {
            const updated = {
              ...data.tasks[idx],
              title: fmTask.title,
              dueAt: fmTask.due ?? data.tasks[idx].dueAt,
              priority: (fmTask.priority as Task['priority']) ?? data.tasks[idx].priority,
              status: (fmTask.status as Task['status']) ?? data.tasks[idx].status,
              updatedAt: new Date().toISOString(),
            };
            this.data = {
              ...data,
              tasks: data.tasks.map((t, i) => (i === idx ? updated : t)),
            };
            await this.persist();
            this.sync.schedulePush();
          }
        } else {
          // Create new task from frontmatter
          const now = new Date().toISOString();
          const newTask: Task = {
            id: crypto.randomUUID(),
            title: fmTask.title,
            note: '',
            status: (fmTask.status as Task['status']) ?? 'todo',
            priority: (fmTask.priority as Task['priority']) ?? 'none',
            dueAt: fmTask.due ?? null,
            deadlineAt: null,
            startAt: null,
            completedAt: null,
            completed: false,
            tagIds: [],
            listId: null,
            assignee: null,
            collaborators: [],
            repeatRule: null,
            repeatEndsAt: null,
            subtasks: [],
            comments: [],
            activity: [],
            attachments: [],
            reminderIds: [],
            sortOrder: null,
            sourcePath: file.path,
            createdAt: now,
            updatedAt: now,
          };
          this.data = { ...data, tasks: [newTask, ...data.tasks] };
          await this.persist();
          this.sync.schedulePush();

          // Write taskflow_task_id back to the note frontmatter
          await this.app.fileManager.processFrontMatter(file, (front) => {
            front['taskflow_task_id'] = newTask.id;
          });
        }
      })
    );
  }

  async onunload() {
    this.sync.destroy();
    await this.app.workspace.detachLeavesOfType(TODO_WORKSPACE_VIEW_TYPE);
  }

  getData() {
    return this.data;
  }

  getSettings() {
    return this.data.settings;
  }

  /**
   * Replace the full in-memory dataset from a sync pull.
   * Credentials are never overwritten from remote; only `lastSyncAt` is taken from incoming.
   */
  async replaceDataFromSync(incoming: TodoPluginData) {
    this.data = {
      ...incoming,
      settings: {
        ...this.data.settings,
        lastSyncAt: incoming.settings.lastSyncAt,
      },
    };
    await this.saveData(this.data);
    this.emitChange();
  }

  /**
   * Persist a settings patch without triggering a sync push.
   * Used by the sync engine to update lastSyncAt / syncDeviceId without causing a push loop.
   */
  async updateSettingsQuiet(patch: Partial<TodoPluginSettings>) {
    this.data = {
      ...this.data,
      settings: { ...this.data.settings, ...patch },
    };
    await this.saveData(this.data);
    // Intentionally no emitChange() or schedulePush() here.
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async updateSettings(patch: Partial<TodoPluginSettings>) {
    this.data = {
      ...this.data,
      settings: { ...this.data.settings, ...patch },
    };
    await this.persist();
  }

  // ─── Task CRUD ─────────────────────────────────────────────────────

  async createTask(payload: CreateTaskPayload) {
    const cleanTitle = payload.title.trim();
    if (!cleanTitle) {
      new Notice('任务标题不能为空');
      return;
    }

    const effectiveSourcePath = payload.sourcePath ?? this.getAutoLinkedSourcePath();
    const now = new Date().toISOString();

    const task: Task = {
      id: createId(),
      title: cleanTitle,
      note: payload.note ?? '',
      listId: payload.listId ?? 'inbox',
      tagIds: payload.tagIds ?? [],
      priority: payload.priority ?? 'normal',
      status: payload.status ?? 'todo',
      startAt: payload.startAt ?? null,
      dueAt: payload.dueAt ?? null,
      deadlineAt: payload.deadlineAt ?? null,
      repeatRule: payload.repeatRule ?? '',
      reminders: [],
      subtasks: [],
      attachments: [],
      assignee: effectiveSourcePath ?? null,
      collaborators: [],
      comments: [],
      activity: [{ id: createId(), content: '创建了任务', createdAt: now }],
      estimatedPomodoros: 0,
      completedPomodoros: 0,
      focusMinutes: 0,
      completed: false,
      deleted: false,
      createdAt: now,
      updatedAt: now,
    };

    this.data = { ...this.data, tasks: [task, ...this.data.tasks] };
    await this.persist();
    new Notice('任务已创建');

    // Write task_id to frontmatter of current note
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile && this.getSettings().autoLinkActiveNote) {
      await this.app.fileManager.processFrontMatter(activeFile, (fm) => {
        // Store as array to support multiple tasks per note
        const existing: string[] = fm['taskflow_task_ids'] ?? [];
        if (!existing.includes(task.id)) {
          fm['taskflow_task_ids'] = [...existing, task.id];
        }
      });
    }
  }

  async updateTask(taskId: string, patch: Partial<Task>) {
    let found = false;
    this.data = {
      ...this.data,
      tasks: this.data.tasks.map((t) => {
        if (t.id !== taskId) return t;
        found = true;
        return normalizeTaskPatch(t, patch);
      }),
    };
    if (found) await this.persist();
  }

  async toggleTask(taskId: string) {
    const now = new Date().toISOString();
    const task = this.data.tasks.find(t => t.id === taskId);
    if (!task) return;

    const completed = !task.completed;
    const updatedTask = normalizeTaskPatch(task, {
      completed,
      status: completed ? 'done' : 'todo',
      activity: [
        ...task.activity,
        { id: createId(), content: completed ? '完成了任务' : '重新打开了任务', createdAt: now },
      ],
    });

    this.data = {
      ...this.data,
      tasks: this.data.tasks.map(t => (t.id === taskId ? updatedTask : t)),
    };

    if (completed && task.repeatRule) {
      const nextData = createNextRepeatTask(task);
      if (nextData) {
        const nextTask: Task = { ...nextData, id: createId() } as Task;
        this.data = { ...this.data, tasks: [nextTask, ...this.data.tasks] };
        new Notice('已生成下一周期重复任务');
      }
    }

    await this.persist();
  }

  async softDeleteTask(taskId: string) {
    const now = new Date().toISOString();
    this.data = {
      ...this.data,
      tasks: this.data.tasks.map(t => {
        if (t.id !== taskId) return t;
        return normalizeTaskPatch(t, {
          deleted: true,
          activity: [...t.activity, { id: createId(), content: '移入回收站', createdAt: now }],
        });
      }),
    };
    await this.persist();
    new Notice('任务已移入回收站');
  }

  async restoreTask(taskId: string) {
    const now = new Date().toISOString();
    this.data = {
      ...this.data,
      tasks: this.data.tasks.map(t => {
        if (t.id !== taskId) return t;
        return normalizeTaskPatch(t, {
          deleted: false,
          activity: [...t.activity, { id: createId(), content: '从回收站恢复', createdAt: now }],
        });
      }),
    };
    await this.persist();
    new Notice('任务已恢复');
  }

  async deleteTask(taskId: string) {
    const nextTasks = this.data.tasks.filter(t => t.id !== taskId);
    if (nextTasks.length === this.data.tasks.length) return;
    this.data = { ...this.data, tasks: nextTasks };
    await this.persist();
    new Notice('任务已永久删除');
  }

  async duplicateTask(taskId: string) {
    const source = this.data.tasks.find(t => t.id === taskId);
    if (!source) return;
    const now = new Date().toISOString();
    const copy: Task = {
      ...source,
      id: createId(),
      completed: false,
      deleted: false,
      status: 'todo',
      createdAt: now,
      updatedAt: now,
      activity: [{ id: createId(), content: `复制自「${source.title}」`, createdAt: now }],
      subtasks: source.subtasks.map(s => ({ ...s, id: createId(), completed: false })),
    };
    this.data = { ...this.data, tasks: [copy, ...this.data.tasks] };
    await this.persist();
    new Notice('任务已复制');
  }

  async addSubtask(taskId: string, title: string) {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    const now = new Date().toISOString();
    this.data = {
      ...this.data,
      tasks: this.data.tasks.map(t => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          subtasks: [...t.subtasks, { id: createId(), title: cleanTitle, completed: false }],
          updatedAt: now,
        };
      }),
    };
    await this.persist();
  }

  async toggleSubtask(taskId: string, subtaskId: string) {
    const now = new Date().toISOString();
    this.data = {
      ...this.data,
      tasks: this.data.tasks.map(t => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          subtasks: t.subtasks.map(s => (s.id === subtaskId ? { ...s, completed: !s.completed } : s)),
          updatedAt: now,
        };
      }),
    };
    await this.persist();
  }

  async addComment(taskId: string, content: string) {
    const cleanContent = content.trim();
    if (!cleanContent) return;
    const now = new Date().toISOString();
    this.data = {
      ...this.data,
      tasks: this.data.tasks.map(t => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          comments: [...t.comments, { id: createId(), author: '本地用户', content: cleanContent, createdAt: now }],
          updatedAt: now,
        };
      }),
    };
    await this.persist();
  }

  async moveTaskToQuadrant(taskId: string, quadrant: MatrixQuadrantKey) {
    const task = this.data.tasks.find(t => t.id === taskId);
    if (!task) return;
    const newTagIds = getTagIdsForQuadrant(task.tagIds, quadrant);
    await this.updateTask(taskId, { tagIds: newTagIds });
  }

  async createTaskInStatus(title: string, status: import('./core/domain').TaskStatus) {
    await this.createTask({ title, status });
  }

  async createTaskInQuadrant(title: string, quadrant: MatrixQuadrantKey) {
    const tagIds = getTagIdsForQuadrant([], quadrant);
    const priority: import('./core/domain').Priority = (quadrant === 'q1' || quadrant === 'q3') ? 'urgent' : 'normal';
    await this.createTask({ title, tagIds, priority });
  }

  async moveTaskToDate(taskId: string, toDateKey: string) {
    const task = this.data.tasks.find(t => t.id === taskId);
    if (!task) return;

    const currentDateValue = task.dueAt ?? task.startAt;
    if (!currentDateValue) {
      // No existing date, just set dueAt
      await this.updateTask(taskId, { dueAt: toDateKey });
      return;
    }

    const fromDateKey = currentDateValue.slice(0, 10);
    const daysDelta = diffDateKeys(fromDateKey, toDateKey);
    if (daysDelta === 0) return;

    const patch: Partial<Task> = {};
    if (task.startAt) patch.startAt = shiftDateTimeByDays(task.startAt, daysDelta);
    if (task.dueAt) patch.dueAt = shiftDateTimeByDays(task.dueAt, daysDelta);
    if (task.deadlineAt) patch.deadlineAt = shiftDateTimeByDays(task.deadlineAt, daysDelta);

    await this.updateTask(taskId, patch);
  }

  // ─── Reminder CRUD ─────────────────────────────────────────────────

  async addReminder(taskId: string, label: string, value: string, kind: 'relative' | 'absolute') {
    const now = new Date().toISOString();
    const task = this.data.tasks.find(t => t.id === taskId);
    if (!task) return;

    // 去重：label+value+kind 一致则跳过
    const dup = task.reminders.find(r => r.label === label && r.value === value && r.kind === kind);
    if (dup) {
      new Notice('相同提醒已存在');
      return;
    }

    this.data = {
      ...this.data,
      tasks: this.data.tasks.map(t => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          reminders: [...t.reminders, { id: createId(), label, value, kind }],
          activity: [...t.activity, { id: createId(), content: `添加了提醒「${label || value}」`, createdAt: now }],
          updatedAt: now,
        };
      }),
    };
    await this.persist();
  }

  async removeReminder(taskId: string, reminderId: string) {
    const now = new Date().toISOString();
    const task = this.data.tasks.find(t => t.id === taskId);
    if (!task) return;
    const reminder = task.reminders.find(r => r.id === reminderId);

    this.data = {
      ...this.data,
      tasks: this.data.tasks.map(t => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          reminders: t.reminders.filter(r => r.id !== reminderId),
          activity: [...t.activity, { id: createId(), content: `移除了提醒「${reminder?.label || reminder?.value || ''}」`, createdAt: now }],
          updatedAt: now,
        };
      }),
    };
    await this.persist();
  }

  snoozeReminder(taskId: string, ruleIndex: number, minutes: number) {
    const task = this.data.tasks.find(t => t.id === taskId);
    if (!task) return;
    const reminder = task.reminders[ruleIndex];
    if (!reminder) return;
    // Store snooze as a new absolute reminder at (now + minutes)
    const snoozeAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    this.data = {
      ...this.data,
      tasks: this.data.tasks.map(t => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          reminders: [...t.reminders, { id: createId(), label: `稍后提醒 (${minutes}分钟)`, value: snoozeAt, kind: 'absolute' as const }],
          activity: [...t.activity, { id: createId(), content: `延后了提醒 ${minutes} 分钟`, createdAt: now }],
          updatedAt: now,
        };
      }),
    };
    void this.persist();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  dismissReminder(_taskId: string, _ruleIndex: number) {
    // Dismissal is tracked in the UI state (firedReminderKeys).
    // No persistence change needed — the reminder rule stays for future triggers.
  }

  clearAllReminders() {
    // Clearing all is also a UI-level operation.
    // The fired keys are tracked in component state.
  }

  // ─── List & Tag management ─────────────────────────────────────────

  async addList(name: string, color: string) {
    const cleanName = name.trim();
    if (!cleanName) return;
    const list: TodoList = { id: createId(), name: cleanName, color, folderId: null, kind: 'custom' };
    this.data = { ...this.data, lists: [...this.data.lists, list] };
    await this.persist();
  }

  async addTag(name: string, color: string) {
    const cleanName = name.trim();
    if (!cleanName) return;
    const tag: Tag = { id: createId(), name: cleanName, color };
    this.data = { ...this.data, tags: [...this.data.tags, tag] };
    await this.persist();
  }

  async updateTag(tagId: string, name: string, color: string) {
    const SYSTEM_TAG_IDS = ['tag-urgent', 'tag-important'];
    if (SYSTEM_TAG_IDS.includes(tagId)) {
      new Notice('系统标签不允许修改');
      return;
    }
    this.data = {
      ...this.data,
      tags: this.data.tags.map(t =>
        t.id === tagId ? { ...t, name: name.trim() || t.name, color: color || t.color } : t,
      ),
    };
    await this.persist();
  }

  async deleteTag(tagId: string) {
    const SYSTEM_TAG_IDS = ['tag-urgent', 'tag-important'];
    if (SYSTEM_TAG_IDS.includes(tagId)) {
      new Notice('系统标签不允许删除');
      return;
    }
    // 级联清理所有任务的 tagIds
    this.data = {
      ...this.data,
      tags: this.data.tags.filter(t => t.id !== tagId),
      tasks: this.data.tasks.map(t =>
        t.tagIds.includes(tagId)
          ? { ...t, tagIds: t.tagIds.filter(id => id !== tagId), updatedAt: new Date().toISOString() }
          : t,
      ),
    };
    await this.persist();
    new Notice('标签已删除');
  }

  // ─── Bulk operations ────────────────────────────────────────────────

  async bulkComplete(ids: string[]) {
    const now = new Date().toISOString();
    this.data = {
      ...this.data,
      tasks: this.data.tasks.map(t => {
        if (!ids.includes(t.id)) return t;
        return normalizeTaskPatch(t, {
          completed: true,
          status: 'done',
          activity: [...t.activity, { id: createId(), content: '批量完成', createdAt: now }],
        });
      }),
    };
    await this.persist();
    new Notice(`已批量完成 ${ids.length} 个任务`);
  }

  async bulkDelete(ids: string[]) {
    const now = new Date().toISOString();
    this.data = {
      ...this.data,
      tasks: this.data.tasks.map(t => {
        if (!ids.includes(t.id)) return t;
        return normalizeTaskPatch(t, {
          deleted: true,
          activity: [...t.activity, { id: createId(), content: '批量移入回收站', createdAt: now }],
        });
      }),
    };
    await this.persist();
    new Notice(`已批量删除 ${ids.length} 个任务`);
  }

  async bulkMoveToList(ids: string[], listId: string) {
    const now = new Date().toISOString();
    this.data = {
      ...this.data,
      tasks: this.data.tasks.map(t => {
        if (!ids.includes(t.id)) return t;
        return normalizeTaskPatch(t, {
          listId,
          activity: [...t.activity, { id: createId(), content: `批量移动到列表`, createdAt: now }],
        });
      }),
    };
    await this.persist();
    new Notice(`已批量移动 ${ids.length} 个任务`);
  }

  async bulkAddTag(ids: string[], tagId: string) {
    const now = new Date().toISOString();
    this.data = {
      ...this.data,
      tasks: this.data.tasks.map(t => {
        if (!ids.includes(t.id) || t.tagIds.includes(tagId)) return t;
        return normalizeTaskPatch(t, {
          tagIds: [...t.tagIds, tagId],
          activity: [...t.activity, { id: createId(), content: `批量添加标签`, createdAt: now }],
        });
      }),
    };
    await this.persist();
    new Notice(`已批量添加标签到 ${ids.length} 个任务`);
  }

  // ─── Folder CRUD ─────────────────────────────────────────────────────

  async createFolder(name: string, color: string) {
    const cleanName = name.trim();
    if (!cleanName) return;
    const folder = { id: createId(), name: cleanName, color };
    this.data = { ...this.data, folders: [...this.data.folders, folder] };
    await this.persist();
    new Notice('文件夹已创建');
  }

  async renameFolder(folderId: string, name: string) {
    const cleanName = name.trim();
    if (!cleanName) return;
    this.data = {
      ...this.data,
      folders: this.data.folders.map(f => (f.id === folderId ? { ...f, name: cleanName } : f)),
    };
    await this.persist();
  }

  async deleteFolder(folderId: string) {
    this.data = {
      ...this.data,
      folders: this.data.folders.filter(f => f.id !== folderId),
      lists: this.data.lists.map(l =>
        l.folderId === folderId ? { ...l, folderId: null } : l,
      ),
    };
    await this.persist();
    new Notice('文件夹已删除，清单已移至顶层');
  }

  async updateFolderColor(folderId: string, color: string) {
    this.data = {
      ...this.data,
      folders: this.data.folders.map(f => (f.id === folderId ? { ...f, color } : f)),
    };
    await this.persist();
  }

  // ─── Filter CRUD ──────────────────────────────────────────────────

  async createFilter(name: string, icon: string, config: { listIds?: string[]; tagIds?: string[]; priority?: import('./core/domain').Priority[]; due?: import('./core/domain').SavedFilter['due'] }) {
    const filter: import('./core/domain').SavedFilter = {
      id: createId(),
      name: name.trim(),
      icon,
      listIds: config.listIds ?? [],
      tagIds: config.tagIds ?? [],
      priority: config.priority ?? [],
      due: config.due ?? 'none',
    };
    this.data = { ...this.data, filters: [...this.data.filters, filter] };
    await this.persist();
    new Notice('智能清单已创建');
  }

  async deleteFilter(filterId: string) {
    this.data = {
      ...this.data,
      filters: this.data.filters.filter(f => f.id !== filterId),
    };
    await this.persist();
    new Notice('智能清单已删除');
  }

  async addListToFolder(listId: string, folderId: string | null) {
    this.data = {
      ...this.data,
      lists: this.data.lists.map(l => (l.id === listId ? { ...l, folderId } : l)),
    };
    await this.persist();
  }

  // ─── List CRUD ─────────────────────────────────────────────────────

  async renameList(listId: string, name: string) {
    const cleanName = name.trim();
    if (!cleanName) return;
    this.data = {
      ...this.data,
      lists: this.data.lists.map(l => (l.id === listId ? { ...l, name: cleanName } : l)),
    };
    await this.persist();
  }

  async deleteList(listId: string) {
    this.data = {
      ...this.data,
      lists: this.data.lists.filter(l => l.id !== listId),
      tasks: this.data.tasks.map(t =>
        t.listId === listId ? { ...t, listId: 'inbox', updatedAt: new Date().toISOString() } : t,
      ),
    };
    await this.persist();
    new Notice('列表已删除，任务已移至收件箱');
  }

  async updateListColor(listId: string, color: string) {
    this.data = {
      ...this.data,
      lists: this.data.lists.map(l => (l.id === listId ? { ...l, color } : l)),
    };
    await this.persist();
  }

  // ─── Vault integration ──────────────────────────────────────────────

  getVaultTags(): string[] {
    const raw = (this.app.metadataCache as unknown as { getTags(): Record<string, number> }).getTags();
    return Object.keys(raw).map(t => t.slice(1));
  }

  // ─── Navigation ────────────────────────────────────────────────────

  async openTaskSource(taskId: string) {
    const task = this.data.tasks.find((item) => item.id === taskId);
    if (!task?.assignee) {
      new Notice('该任务没有关联来源笔记');
      return;
    }

    const maybeFile = this.app.vault.getAbstractFileByPath(task.assignee);
    if (!(maybeFile instanceof TFile)) {
      new Notice('来源笔记不存在或已被移动');
      return;
    }

    await this.app.workspace.getLeaf(true).openFile(maybeFile);
  }

  async activateView() {
    const leaf = this.getTargetLeaf();
    await leaf.setViewState({ type: TODO_WORKSPACE_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  // ─── Private helpers ───────────────────────────────────────────────

  private getTargetLeaf(): WorkspaceLeaf {
    const existingLeaf = this.app.workspace.getLeavesOfType(TODO_WORKSPACE_VIEW_TYPE)[0];
    if (existingLeaf) return existingLeaf;

    if (this.data.settings.leafTarget === 'main') {
      return this.app.workspace.getLeaf(true);
    }

    return this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(true);
  }

  private async loadPluginState() {
    const saved = await this.loadData();
    this.data = {
      ...DEFAULT_DATA,
      ...saved,
      settings: { ...DEFAULT_SETTINGS, ...(saved?.settings ?? {}) },
      tasks: Array.isArray(saved?.tasks) ? saved.tasks : [],
      lists: Array.isArray(saved?.lists) ? saved.lists : [],
      tags: Array.isArray(saved?.tags) ? saved.tags : [],
      folders: Array.isArray(saved?.folders) ? saved.folders : [],
      filters: Array.isArray(saved?.filters) ? saved.filters : [],
    };

    // Seed default filters if empty
    if (this.data.filters.length === 0) {
      this.data.filters = [
        { id: 'filter-overdue', name: '🔥 逾期任务', icon: '🔥', listIds: [], tagIds: [], priority: [], due: 'overdue' },
        { id: 'filter-week', name: '📋 本周待办', icon: '📋', listIds: [], tagIds: [], priority: [], due: 'week' },
      ];
    }
  }

  private async persist() {
    await this.saveData(this.data);
    this.emitChange();
    // Debounced push — collapses rapid mutations into one Supabase request
    this.sync?.schedulePush();
  }

  private emitChange() {
    this.listeners.forEach((listener) => listener());
  }

  private getAutoLinkedSourcePath() {
    if (!this.data.settings.autoLinkActiveNote) return undefined;
    return this.app.workspace.getActiveFile()?.path;
  }
}

function createId() {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
