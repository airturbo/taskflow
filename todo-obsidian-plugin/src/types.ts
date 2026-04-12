import type {
  Task,
  Tag,
  TodoList,
  Folder,
  SavedFilter,
  Priority,
  TaskStatus,
  Reminder,
  Subtask,
  Comment,
  ActivityItem,
  TaskAttachment,
} from './core/domain';

export type TodoLeafTarget = 'right' | 'main';

/**
 * PluginTask — 插件侧的任务类型，与完整的 Task 领域模型兼容。
 * 包含 Task 的全部字段，使得插件可以直接操作完整的领域数据。
 */
export type PluginTask = Task;

/**
 * TodoTask — 保留向后兼容的别名。
 * 新代码建议直接使用 PluginTask 或 Task。
 */
export type TodoTask = PluginTask;

export interface TodoPluginSettings {
  leafTarget: TodoLeafTarget;
  autoLinkActiveNote: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseEmail: string;
  supabasePassword: string;
  syncEnabled: boolean;
  lastSyncAt: string | null;
  syncDeviceId?: string;
}

export interface TodoPluginData {
  tasks: PluginTask[];
  lists: TodoList[];
  tags: Tag[];
  folders: Folder[];
  filters: SavedFilter[];
  settings: TodoPluginSettings;
}

export const DEFAULT_SETTINGS: TodoPluginSettings = {
  leafTarget: 'right',
  autoLinkActiveNote: true,
  supabaseUrl: '',
  supabaseAnonKey: '',
  supabaseEmail: '',
  supabasePassword: '',
  syncEnabled: false,
  lastSyncAt: null,
};

export const DEFAULT_DATA: TodoPluginData = {
  tasks: [],
  lists: [],
  tags: [],
  folders: [],
  filters: [],
  settings: DEFAULT_SETTINGS,
};

/**
 * CreateTaskPayload — 创建任务时的输入参数。
 */
export interface CreateTaskPayload {
  title: string;
  note?: string;
  listId?: string;
  tagIds?: string[];
  priority?: Priority;
  status?: TaskStatus;
  startAt?: string | null;
  dueAt?: string | null;
  deadlineAt?: string | null;
  repeatRule?: string;
  sourcePath?: string;
}

// Re-export core domain types for convenience
export type {
  Task,
  Tag,
  TodoList,
  Folder,
  SavedFilter,
  Priority,
  TaskStatus,
  Reminder,
  Subtask,
  Comment,
  ActivityItem,
  TaskAttachment,
};
