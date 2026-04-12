import Database from '@tauri-apps/plugin-sql'
import type { ActivityItem, Comment, PersistedState, Reminder, Subtask } from '../types/domain'
import { getNowIso } from './dates'

const DESKTOP_DATABASE_PATH = 'sqlite:todo-workspace.db'
const SNAPSHOT_ROW_ID = 1
const STORAGE_SCHEMA_VERSION = 7

type SnapshotRow = {
  payload: string
}

type AppliedMigrationRow = {
  version: number
}

type LegacyTaskCoreRelationsRow = {
  id: string
  tag_ids_json: string
  reminders_json: string
  subtasks_json: string
}

type LegacyTaskExtendedRelationsRow = {
  id: string
  attachments_json: string
  collaborators_json: string
  comments_json: string
  activity_json: string
}

export type DesktopPersistenceSource =
  | 'sqlite-repository'
  | 'sqlite-snapshot'
  | 'tauri-store'
  | 'browser-localstorage'

type Migration = {
  version: number
  name: string
  statements: string[]
  postApply?: (db: Database) => Promise<void>
}

const parseJson = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

const toInteger = (value: boolean) => (value ? 1 : 0)

const backfillTaskCoreRelationTables = async (db: Database) => {
  const rows = await db.select<LegacyTaskCoreRelationsRow[]>(
    'SELECT id, tag_ids_json, reminders_json, subtasks_json FROM tasks ORDER BY sort_order ASC, updated_at DESC, id ASC',
  )

  await db.execute('BEGIN TRANSACTION')

  try {
    await db.execute('DELETE FROM task_subtasks')
    await db.execute('DELETE FROM task_reminders')
    await db.execute('DELETE FROM task_tags')

    for (const row of rows) {
      const tagIds = Array.from(new Set(parseJson<string[]>(row.tag_ids_json, [])))
      const reminders = parseJson<Reminder[]>(row.reminders_json, [])
      const subtasks = parseJson<Subtask[]>(row.subtasks_json, [])

      for (const [index, tagId] of tagIds.entries()) {
        await db.execute('INSERT INTO task_tags (task_id, tag_id, sort_order) VALUES ($1, $2, $3)', [row.id, tagId, index])
      }

      for (const [index, reminder] of reminders.entries()) {
        await db.execute(
          `INSERT INTO task_reminders (task_id, id, label, value, kind, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [row.id, reminder.id, reminder.label, reminder.value, reminder.kind, index],
        )
      }

      for (const [index, subtask] of subtasks.entries()) {
        await db.execute(
          `INSERT INTO task_subtasks (task_id, id, title, completed, sort_order)
           VALUES ($1, $2, $3, $4, $5)`,
          [row.id, subtask.id, subtask.title, toInteger(subtask.completed), index],
        )
      }
    }

    await db.execute('COMMIT')
  } catch (error) {
    try {
      await db.execute('ROLLBACK')
    } catch {
      // ignore rollback errors triggered after failed transaction setup
    }

    throw error
  }
}

const backfillTaskExtendedRelationTables = async (db: Database) => {
  const rows = await db.select<LegacyTaskExtendedRelationsRow[]>(
    'SELECT id, attachments_json, collaborators_json, comments_json, activity_json FROM tasks ORDER BY sort_order ASC, updated_at DESC, id ASC',
  )

  await db.execute('BEGIN TRANSACTION')

  try {
    await db.execute('DELETE FROM task_activity')
    await db.execute('DELETE FROM task_comments')
    await db.execute('DELETE FROM task_collaborators')
    await db.execute('DELETE FROM task_attachments')

    for (const row of rows) {
      const attachments = parseJson<string[]>(row.attachments_json, [])
      const collaborators = parseJson<string[]>(row.collaborators_json, [])
      const comments = parseJson<Comment[]>(row.comments_json, [])
      const activityItems = parseJson<ActivityItem[]>(row.activity_json, [])

      for (const [index, attachment] of attachments.entries()) {
        await db.execute(
          `INSERT INTO task_attachments (task_id, sort_order, attachment)
           VALUES ($1, $2, $3)`,
          [row.id, index, attachment],
        )
      }

      for (const [index, collaborator] of collaborators.entries()) {
        await db.execute(
          `INSERT INTO task_collaborators (task_id, sort_order, collaborator)
           VALUES ($1, $2, $3)`,
          [row.id, index, collaborator],
        )
      }

      for (const [index, comment] of comments.entries()) {
        await db.execute(
          `INSERT INTO task_comments (task_id, id, author, content, created_at, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [row.id, comment.id, comment.author, comment.content, comment.createdAt, index],
        )
      }

      for (const [index, activityItem] of activityItems.entries()) {
        await db.execute(
          `INSERT INTO task_activity (task_id, id, content, created_at, sort_order)
           VALUES ($1, $2, $3, $4, $5)`,
          [row.id, activityItem.id, activityItem.content, activityItem.createdAt, index],
        )
      }
    }

    await db.execute('COMMIT')
  } catch (error) {
    try {
      await db.execute('ROLLBACK')
    } catch {
      // ignore rollback errors triggered after failed transaction setup
    }

    throw error
  }
}

const migrations: Migration[] = [
  {
    version: 1,
    name: 'create-app-state-snapshot',
    statements: [
      `CREATE TABLE IF NOT EXISTS app_state_snapshot (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        payload TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        migrated_from TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    ],
  },
  {
    version: 2,
    name: 'create-structured-workspace-tables',
    statements: [
      `CREATE TABLE IF NOT EXISTS workspace_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        theme TEXT NOT NULL,
        active_selection TEXT NOT NULL,
        selected_tag_ids_json TEXT NOT NULL,
        current_view TEXT NOT NULL,
        calendar_mode TEXT NOT NULL,
        calendar_show_completed INTEGER NOT NULL,
        timeline_scale TEXT NOT NULL,
        fired_reminder_keys_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        sort_order INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS lists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        folder_id TEXT,
        kind TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
      )`,
      `CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        sort_order INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS filters (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT NOT NULL,
        list_ids_json TEXT NOT NULL,
        tag_ids_json TEXT NOT NULL,
        priority_json TEXT NOT NULL,
        due TEXT NOT NULL,
        sort_order INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        note TEXT NOT NULL,
        list_id TEXT NOT NULL,
        tag_ids_json TEXT NOT NULL,
        priority TEXT NOT NULL,
        status TEXT NOT NULL,
        start_at TEXT,
        due_at TEXT,
        repeat_rule TEXT NOT NULL,
        reminders_json TEXT NOT NULL,
        subtasks_json TEXT NOT NULL,
        attachments_json TEXT NOT NULL,
        assignee TEXT,
        collaborators_json TEXT NOT NULL,
        comments_json TEXT NOT NULL,
        activity_json TEXT NOT NULL,
        estimated_pomodoros INTEGER NOT NULL,
        completed_pomodoros INTEGER NOT NULL,
        focus_minutes INTEGER NOT NULL,
        completed INTEGER NOT NULL,
        deleted INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
      )`,
      'CREATE INDEX IF NOT EXISTS idx_lists_folder_order ON lists(folder_id, sort_order)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_list_order ON tasks(list_id, sort_order)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_status_deleted ON tasks(status, deleted)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_due_at ON tasks(due_at)',
    ],
  },
  {
    version: 3,
    name: 'normalize-task-core-relations',
    statements: [
      `CREATE TABLE IF NOT EXISTS task_tags (
        task_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        PRIMARY KEY (task_id, tag_id),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS task_reminders (
        task_id TEXT NOT NULL,
        id TEXT NOT NULL,
        label TEXT NOT NULL,
        value TEXT NOT NULL,
        kind TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        PRIMARY KEY (task_id, id),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS task_subtasks (
        task_id TEXT NOT NULL,
        id TEXT NOT NULL,
        title TEXT NOT NULL,
        completed INTEGER NOT NULL,
        sort_order INTEGER NOT NULL,
        PRIMARY KEY (task_id, id),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )`,
      'CREATE INDEX IF NOT EXISTS idx_task_tags_task_order ON task_tags(task_id, sort_order)',
      'CREATE INDEX IF NOT EXISTS idx_task_tags_tag_task ON task_tags(tag_id, task_id)',
      'CREATE INDEX IF NOT EXISTS idx_task_reminders_task_order ON task_reminders(task_id, sort_order)',
      'CREATE INDEX IF NOT EXISTS idx_task_reminders_kind_value ON task_reminders(kind, value)',
      'CREATE INDEX IF NOT EXISTS idx_task_subtasks_task_order ON task_subtasks(task_id, sort_order)',
      'CREATE INDEX IF NOT EXISTS idx_task_subtasks_task_completed ON task_subtasks(task_id, completed)',
    ],
    postApply: backfillTaskCoreRelationTables,
  },
  {
    version: 4,
    name: 'normalize-task-extended-relations',
    statements: [
      `CREATE TABLE IF NOT EXISTS task_attachments (
        task_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        attachment TEXT NOT NULL,
        PRIMARY KEY (task_id, sort_order),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS task_collaborators (
        task_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        collaborator TEXT NOT NULL,
        PRIMARY KEY (task_id, sort_order),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS task_comments (
        task_id TEXT NOT NULL,
        id TEXT NOT NULL,
        author TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        PRIMARY KEY (task_id, id),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS task_activity (
        task_id TEXT NOT NULL,
        id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        PRIMARY KEY (task_id, id),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )`,
      'CREATE INDEX IF NOT EXISTS idx_task_attachments_task_order ON task_attachments(task_id, sort_order)',
      'CREATE INDEX IF NOT EXISTS idx_task_collaborators_task_order ON task_collaborators(task_id, sort_order)',
      'CREATE INDEX IF NOT EXISTS idx_task_comments_task_created_at ON task_comments(task_id, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_task_activity_task_created_at ON task_activity(task_id, created_at DESC)',
    ],
    postApply: backfillTaskExtendedRelationTables,
  },
  {
    version: 5,
    name: 'add-time-window-query-indexes',
    statements: [
      'CREATE INDEX IF NOT EXISTS idx_tasks_start_at ON tasks(start_at)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_deleted_completed_due_at ON tasks(deleted, completed, due_at)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_deleted_completed_start_at ON tasks(deleted, completed, start_at)',
    ],
  },
  {
    version: 6,
    name: 'add-onboarding-to-workspace-state',
    statements: [
      `ALTER TABLE workspace_state ADD COLUMN onboarding_json TEXT NOT NULL DEFAULT '{"version":"v1","status":"dismissed","currentStepId":null,"completedStepIds":[],"lastSeenAt":null,"seedScenarioVersion":"legacy"}'`,
    ],
  },
  {
    version: 7,
    name: 'add-deadline-and-selection-time-modes',
    statements: [
      `ALTER TABLE tasks ADD COLUMN deadline_at TEXT`,
      `ALTER TABLE workspace_state ADD COLUMN selection_time_modes_json TEXT NOT NULL DEFAULT '{"today":"planned","upcoming":"planned"}'`,
      'CREATE INDEX IF NOT EXISTS idx_tasks_deadline_at ON tasks(deadline_at)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_deleted_completed_deadline_at ON tasks(deleted, completed, deadline_at)',
    ],
  },
]

let databasePromise: Promise<Database> | null = null

const ensureDatabaseSchema = async (db: Database) => {
  await db.execute('PRAGMA foreign_keys = ON')
  await db.execute(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )`,
  )

  const appliedRows = await db.select<AppliedMigrationRow[]>('SELECT version FROM schema_migrations ORDER BY version ASC')
  const appliedVersions = new Set(appliedRows.map((row) => row.version))

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue

    for (const statement of migration.statements) {
      await db.execute(statement)
    }

    if (migration.postApply) {
      await migration.postApply(db)
    }

    await db.execute('INSERT INTO schema_migrations (version, name, applied_at) VALUES ($1, $2, $3)', [
      migration.version,
      migration.name,
      getNowIso(),
    ])
  }
}

export const getDesktopDatabase = async () => {
  if (!databasePromise) {
    databasePromise = Database.load(DESKTOP_DATABASE_PATH)
      .then(async (db) => {
        await ensureDatabaseSchema(db)
        return db
      })
      .catch((error) => {
        databasePromise = null
        throw error
      })
  }

  return databasePromise
}

const parseSnapshot = (payload: string) => {
  try {
    return JSON.parse(payload) as Partial<PersistedState>
  } catch {
    return null
  }
}

export const loadDesktopSnapshotState = async (): Promise<Partial<PersistedState> | null> => {
  const db = await getDesktopDatabase()
  const rows = await db.select<SnapshotRow[]>('SELECT payload FROM app_state_snapshot WHERE id = $1 LIMIT 1', [SNAPSHOT_ROW_ID])
  if (rows.length === 0) return null

  return parseSnapshot(rows[0].payload)
}

export const saveDesktopSnapshotState = async (
  state: PersistedState,
  source: DesktopPersistenceSource = 'sqlite-repository',
) => {
  const db = await getDesktopDatabase()
  const payload = JSON.stringify(state)

  await db.execute(
    `INSERT INTO app_state_snapshot (id, payload, schema_version, migrated_from, updated_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT(id) DO UPDATE SET
       payload = excluded.payload,
       schema_version = excluded.schema_version,
       migrated_from = excluded.migrated_from,
       updated_at = excluded.updated_at`,
    [SNAPSHOT_ROW_ID, payload, STORAGE_SCHEMA_VERSION, source, getNowIso()],
  )
}

export const loadDesktopState = loadDesktopSnapshotState
export const saveDesktopState = saveDesktopSnapshotState
