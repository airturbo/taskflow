import { createPortal } from 'react-dom';
import type { PointerDragPreviewState } from './drag-system';

const PRIORITY_LABELS: Record<string, string> = {
  urgent: '紧急',
  high: '高',
  normal: '普通',
  low: '低',
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#ef4444',
  high: '#f97316',
  normal: '#6366f1',
  low: '#94a3b8',
};

const STATUS_LABELS: Record<string, string> = {
  todo: '待办',
  doing: '进行中',
  done: '已完成',
};

interface DragPreviewLayerProps {
  preview: PointerDragPreviewState | null;
}

export function DragPreviewLayer({ preview }: DragPreviewLayerProps) {
  if (!preview) return null;

  return createPortal(
    <div
      className="tw-drag-preview"
      style={{
        transform: `translate3d(${preview.x + 12}px, ${preview.y - 20}px, 0)`,
      }}
    >
      <div className="tw-drag-preview__title">{preview.title}</div>
      <div className="tw-drag-preview__meta">
        <span
          className="tw-priority-badge"
          style={{ color: PRIORITY_COLORS[preview.priority], borderColor: PRIORITY_COLORS[preview.priority] }}
        >
          {PRIORITY_LABELS[preview.priority]}
        </span>
        <span className="tw-drag-preview__status">{STATUS_LABELS[preview.status]}</span>
        {preview.meta && <span className="tw-drag-preview__time">{preview.meta}</span>}
        {preview.overdue && <span className="tw-drag-preview__overdue">逾期</span>}
      </div>
    </div>,
    document.body,
  );
}
