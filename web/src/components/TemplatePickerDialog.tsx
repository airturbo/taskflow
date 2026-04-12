import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { Task } from '../types/domain'
import { getTemplates, deleteTemplate, applyTemplate, type TaskTemplate } from '../utils/templates'

export function TemplatePickerDialog({
  onApply,
  onClose,
}: {
  onApply: (partial: Partial<Task>) => void
  onClose: () => void
}) {
  // Re-render trigger after deletion
  const [, setTick] = useState(0)
  const templates = getTemplates()

  const handleDelete = (id: string) => {
    deleteTemplate(id)
    setTick((n) => n + 1)
  }

  return createPortal(
    <div
      className="shortcut-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="从模板创建任务"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="template-picker">
        <div className="template-picker__header">
          <div>
            <p className="template-picker__eyebrow">任务模板</p>
            <h3 className="template-picker__title">从模板创建</h3>
          </div>
          <button
            type="button"
            className="template-picker__close-btn"
            aria-label="关闭"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {templates.length === 0 ? (
          <div className="template-picker__empty">
            <span>📋</span>
            <p>还没有保存任何模板。</p>
            <small>在任务详情面板底部点击「另存为模板」即可创建。</small>
          </div>
        ) : (
          <ul className="template-picker__list">
            {templates.map((template: TaskTemplate) => (
              <li key={template.id} className="template-picker__item">
                <div className="template-picker__item-body">
                  <strong className="template-picker__item-name">{template.name}</strong>
                  <p className="template-picker__item-title">{template.title}</p>
                  <div className="template-picker__item-meta">
                    <span>优先级：{template.priority}</span>
                    {template.subtasks.length > 0 && (
                      <span>{template.subtasks.length} 条子任务</span>
                    )}
                    {template.tagIds.length > 0 && (
                      <span>{template.tagIds.length} 个标签</span>
                    )}
                  </div>
                </div>
                <div className="template-picker__item-actions">
                  <button
                    type="button"
                    className="primary-button small"
                    onClick={() => {
                      onApply(applyTemplate(template))
                      onClose()
                    }}
                  >
                    应用
                  </button>
                  <button
                    type="button"
                    className="ghost-button small danger"
                    onClick={() => handleDelete(template.id)}
                  >
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  )
}
