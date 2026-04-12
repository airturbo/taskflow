interface ShortcutHelpDialogProps {
  onClose: () => void;
}

const FEATURES = [
  { icon: '📋', text: '五种视图 — 列表、看板、四象限、日历、时间线' },
  { icon: '🔍', text: '智能搜索 — 支持标题、标签、状态筛选' },
  { icon: '📅', text: '多维排期 — 计划时间 / DDL 双维度管理' },
  { icon: '🏷️', text: '标签系统 — 颜色标签 + AND 交集筛选' },
  { icon: '📂', text: '文件夹 — 层级组织，清单分组' },
  { icon: '🔔', text: '提醒 — 相对/绝对时间，稍后提醒' },
  { icon: '📊', text: '统计 — 完成趋势、优先级分布' },
  { icon: '🔄', text: '拖拽 — 跨视图拖动任务改状态/日期' },
];

const SHORTCUT_GROUPS = [
  {
    title: '创建与搜索',
    items: [
      { keys: '⌘/Ctrl + N', desc: '新建任务' },
      { keys: '⌘/Ctrl + K', desc: '聚焦搜索框' },
    ],
  },
  {
    title: '视图切换',
    items: [
      { keys: '1', desc: '列表视图' },
      { keys: '2', desc: '看板视图' },
      { keys: '3', desc: '四象限视图' },
      { keys: '4', desc: '日历视图' },
      { keys: '5', desc: '时间线视图' },
    ],
  },
  {
    title: '通用',
    items: [
      { keys: 'Escape', desc: '关闭弹窗 / 取消选中' },
      { keys: '?', desc: '打开本面板' },
    ],
  },
];

export function ShortcutHelpDialog({ onClose }: ShortcutHelpDialogProps) {
  return (
    <div className="tw-shortcut-dialog">
      <div className="tw-shortcut-dialog__overlay" onClick={onClose} />
      <div className="tw-shortcut-dialog__panel">
        <div className="tw-shortcut-dialog__header">
          <h2 className="tw-shortcut-dialog__title">TaskFlow 功能概览 & 快捷键</h2>
          <button className="tw-shortcut-dialog__close" onClick={onClose}>✕</button>
        </div>

        <div className="tw-shortcut-dialog__body">
          <div className="tw-shortcut-dialog__features">
            {FEATURES.map((f, i) => (
              <div key={i} className="tw-shortcut-dialog__feature-item">
                <span className="tw-shortcut-dialog__feature-icon">{f.icon}</span>
                <span className="tw-shortcut-dialog__feature-text">{f.text}</span>
              </div>
            ))}
          </div>

          <div className="tw-shortcut-dialog__groups">
            {SHORTCUT_GROUPS.map((group) => (
              <div key={group.title} className="tw-shortcut-dialog__group">
                <div className="tw-shortcut-dialog__group-title">{group.title}</div>
                {group.items.map((item) => (
                  <div key={item.keys} className="tw-shortcut-dialog__item">
                    <kbd className="tw-shortcut-dialog__kbd">{item.keys}</kbd>
                    <span className="tw-shortcut-dialog__desc">{item.desc}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
