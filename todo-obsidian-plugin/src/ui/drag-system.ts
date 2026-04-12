import type { TaskStatus, Priority } from '../core/domain';

// ─── Types ───────────────────────────────────────────────────────────

export type DragPreviewPayload = {
  title: string;
  status: TaskStatus;
  priority: Priority;
  meta: string;
  overdue?: boolean;
};

export type PointerDragPreviewState = DragPreviewPayload & {
  taskId: string;
  x: number;
  y: number;
  deltaX: number;
  deltaY: number;
};

export type PointerDragSession = {
  pointerId: number;
  taskId: string;
  startX: number;
  startY: number;
  dragged: boolean;
  sourceElement: HTMLElement;
  sourceRect: DOMRect;
  preview: DragPreviewPayload;
};

// ─── Constants ───────────────────────────────────────────────────────

export const POINTER_DRAG_THRESHOLD = 6;
export const POINTER_DRAG_BLOCK_SELECTOR = 'select, input, textarea, button, a, label';

// ─── Helpers ─────────────────────────────────────────────────────────

export const shouldIgnorePointerDragStart = (
  target: EventTarget | null,
  currentTarget: HTMLElement,
): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const blocker = target.closest<HTMLElement>(POINTER_DRAG_BLOCK_SELECTOR);
  return Boolean(blocker && blocker !== currentTarget);
};

export const resolveDropZoneValueFromPoint = (
  clientX: number,
  clientY: number,
  selector: string,
  attribute: string,
): string | null => {
  if (typeof document === 'undefined') return null;
  const element = document.elementFromPoint(clientX, clientY);
  if (!(element instanceof HTMLElement)) return null;
  return element.closest<HTMLElement>(selector)?.getAttribute(attribute) ?? null;
};

export const markClickSuppressed = (ref: { current: boolean }): void => {
  ref.current = true;
  window.setTimeout(() => {
    ref.current = false;
  }, 0);
};

export const buildPointerDragPreviewState = (
  current: PointerDragSession,
  clientX: number,
  clientY: number,
): PointerDragPreviewState => ({
  taskId: current.taskId,
  ...current.preview,
  x: clientX,
  y: clientY,
  deltaX: clientX - current.startX,
  deltaY: clientY - current.startY,
});

export const getPointerDragStyle = (
  taskId: string,
  dragTaskId: string | null,
  dragPreview: PointerDragPreviewState | null,
): React.CSSProperties | undefined => {
  if (dragTaskId !== taskId || !dragPreview || dragPreview.taskId !== taskId) return undefined;
  return {
    opacity: 0.18,
    pointerEvents: 'none',
    boxShadow: 'none',
  };
};
