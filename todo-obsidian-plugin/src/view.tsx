import { ItemView, WorkspaceLeaf } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import type TodoWorkspacePlugin from './main';
import { TodoWorkspaceApp } from './ui/TodoWorkspaceApp';
import type { Task, SavedFilter } from './core/domain';
import type { MatrixQuadrantKey } from './core/selectors';
import type { CreateTaskPayload } from './types';
import type { TaskStatus } from './core/domain';

export const TODO_WORKSPACE_VIEW_TYPE = 'todo-workspace-view';

export class TodoWorkspaceView extends ItemView {
  private root: Root | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: TodoWorkspacePlugin) {
    super(leaf);
  }

  getViewType() {
    return TODO_WORKSPACE_VIEW_TYPE;
  }

  getDisplayText() {
    return 'Todo Workspace';
  }

  getIcon() {
    return 'check-square';
  }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass('todo-workspace-view');
    this.root = createRoot(this.contentEl);
    this.unsubscribe = this.plugin.subscribe(() => this.renderApp());
    this.renderApp();
  }

  async onClose() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.root?.unmount();
    this.root = null;
  }

  private renderApp() {
    if (!this.root) return;
    const data = this.plugin.getData();

    this.root.render(
      <TodoWorkspaceApp
        tasks={data.tasks}
        lists={data.lists}
        tags={data.tags}
        folders={data.folders}
        filters={data.filters}
        vaultTags={this.plugin.getVaultTags()}
        app={this.app}
        settings={data.settings}
        onCreateTask={(payload: CreateTaskPayload) => this.plugin.createTask(payload)}
        onToggleTask={(taskId: string) => this.plugin.toggleTask(taskId)}
        onUpdateTask={(taskId: string, patch: Partial<Task>) => this.plugin.updateTask(taskId, patch)}
        onSoftDeleteTask={(taskId: string) => this.plugin.softDeleteTask(taskId)}
        onRestoreTask={(taskId: string) => this.plugin.restoreTask(taskId)}
        onDeleteTask={(taskId: string) => this.plugin.deleteTask(taskId)}
        onDuplicateTask={(taskId: string) => this.plugin.duplicateTask(taskId)}
        onAddSubtask={(taskId: string, title: string) => this.plugin.addSubtask(taskId, title)}
        onToggleSubtask={(taskId: string, subtaskId: string) => this.plugin.toggleSubtask(taskId, subtaskId)}
        onAddComment={(taskId: string, content: string) => this.plugin.addComment(taskId, content)}
        onOpenSource={(taskId: string) => this.plugin.openTaskSource(taskId)}
        onAddReminder={(taskId: string, label: string, value: string, kind: 'relative' | 'absolute') => this.plugin.addReminder(taskId, label, value, kind)}
        onRemoveReminder={(taskId: string, reminderId: string) => this.plugin.removeReminder(taskId, reminderId)}
        onUpdateTag={(tagId: string, name: string, color: string) => this.plugin.updateTag(tagId, name, color)}
        onDeleteTag={(tagId: string) => this.plugin.deleteTag(tagId)}
        onAddTag={(name: string, color: string) => this.plugin.addTag(name, color)}
        onMoveToQuadrant={(taskId: string, quadrant: MatrixQuadrantKey) => this.plugin.moveTaskToQuadrant(taskId, quadrant)}
        onMoveTaskToDate={(taskId: string, toDateKey: string) => { void this.plugin.moveTaskToDate(taskId, toDateKey); }}
        onCreateTaskInStatus={(title: string, status: TaskStatus) => { void this.plugin.createTaskInStatus(title, status); }}
        onCreateTaskInQuadrant={(title: string, quadrant: MatrixQuadrantKey) => { void this.plugin.createTaskInQuadrant(title, quadrant); }}
        onBulkComplete={(ids: string[]) => this.plugin.bulkComplete(ids)}
        onBulkDelete={(ids: string[]) => this.plugin.bulkDelete(ids)}
        onBulkMoveToList={(ids: string[], listId: string) => this.plugin.bulkMoveToList(ids, listId)}
        onBulkAddTag={(ids: string[], tagId: string) => this.plugin.bulkAddTag(ids, tagId)}
        onRenameList={(listId: string, name: string) => this.plugin.renameList(listId, name)}
        onDeleteList={(listId: string) => this.plugin.deleteList(listId)}
        onUpdateListColor={(listId: string, color: string) => this.plugin.updateListColor(listId, color)}
        onCreateFolder={(name: string, color: string) => this.plugin.createFolder(name, color)}
        onRenameFolder={(folderId: string, name: string) => this.plugin.renameFolder(folderId, name)}
        onDeleteFolder={(folderId: string) => this.plugin.deleteFolder(folderId)}
        onUpdateFolderColor={(folderId: string, color: string) => this.plugin.updateFolderColor(folderId, color)}
        onAddListToFolder={(listId: string, folderId: string | null) => this.plugin.addListToFolder(listId, folderId)}
        onCreateFilter={(name: string, icon: string, config: Partial<SavedFilter>) => this.plugin.createFilter(name, icon, config)}
        onDeleteFilter={(filterId: string) => this.plugin.deleteFilter(filterId)}
        onSnoozeReminder={(taskId: string, ruleIndex: number, minutes: number) => { this.plugin.snoozeReminder(taskId, ruleIndex, minutes); }}
        onDismissReminder={(taskId: string, ruleIndex: number) => { this.plugin.dismissReminder(taskId, ruleIndex); }}
        onClearAllReminders={() => { this.plugin.clearAllReminders(); }}
      />,
    );
  }
}
