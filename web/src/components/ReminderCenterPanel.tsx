import { useState } from 'react'
import type { Task } from '../types/domain'
import type { ReminderFeedItem } from '../hooks/useReminderCenter'
import { formatDateTime } from '../utils/dates'
import styles from './ReminderCenterPanel.module.css'

/** 按 taskId 分组，同一任务的多条提醒合并 */
function groupByTask(feed: ReminderFeedItem[]): { taskId: string | null; items: ReminderFeedItem[] }[] {
  const map = new Map<string, ReminderFeedItem[]>()
  const order: string[] = []
  for (const item of feed) {
    const key = item.taskId ?? `__no_task_${item.id}`
    if (!map.has(key)) { map.set(key, []); order.push(key) }
    map.get(key)!.push(item)
  }
  return order.map(key => ({ taskId: key.startsWith('__no_task_') ? null : key, items: map.get(key)! }))
}

export function ReminderCenterPanel({
  permission,
  reminderFeed,
  selectedTask,
  onRequestPermission,
  onSnooze,
  onDismiss,
  onClear,
}: {
  permission: NotificationPermission | 'unsupported'
  reminderFeed: ReminderFeedItem[]
  selectedTask: Task | null
  onRequestPermission: () => Promise<NotificationPermission | 'unsupported'>
  onSnooze: (feedId: string, taskId: string, minutes: number) => void
  onDismiss: (feedId: string) => void
  onClear: () => void
}) {
  const [expandedId, setExpandedId] = useState<string | null>(
    reminderFeed[0]?.id ?? null
  )

  const groups = groupByTask(reminderFeed)
  const permissionLabel =
    permission === 'granted' ? '系统提醒已开启'
    : permission === 'denied' ? '提醒权限已关闭'
    : permission === 'default' ? '提醒待开启'
    : '当前环境不支持系统提醒'

  return (
    <section className={`panel ${styles.reminderCenter} ${styles.reminderCenterCompact}`}>
      <div className={`panel-header ${styles.header}`}>
        <div>
          <p className="eyebrow">到期与提醒</p>
          <h3>提醒 {reminderFeed.length > 0 && <span className={styles.count}>{reminderFeed.length}</span>}</h3>
        </div>
        <div className={styles.headerActions}>
          {permission !== 'granted' && permission !== 'unsupported' && (
            <button className="ghost-button small" onClick={() => void onRequestPermission()}>开启</button>
          )}
          {reminderFeed.length > 1 && (
            <button className="ghost-button small" onClick={onClear}>清空</button>
          )}
        </div>
      </div>

      <div className={styles.summary}>
        <span className={`${styles.permission} is-${permission}`}>{permissionLabel}</span>
      </div>

      {groups.length === 0 ? (
        <div className={styles.emptyCompact}>
          <strong>暂时没有新提醒</strong>
          <span>DDL 到期或提醒触发后会在这里显示。</span>
        </div>
      ) : (
        <div className={styles.groupList}>
          {groups.map(({ taskId, items }) => {
            const lead = items[0]
            const isExpanded = expandedId === lead.id
            const isLinked = selectedTask && taskId === selectedTask.id
            return (
              <div
                key={lead.id}
                className={`${styles.group} ${isLinked ? 'is-linked' : ''} is-${lead.tone}`}
              >
                {/* 折叠头 — 单行摘要 */}
                <button
                  className={styles.groupHead}
                  onClick={() => setExpandedId(isExpanded ? null : lead.id)}
                >
                  <span className={`${styles.toneDot} tone-${lead.tone}`} />
                  <span className={styles.groupTitle}>{lead.title}</span>
                  {items.length > 1 && (
                    <span className={styles.groupBadge}>{items.length}</span>
                  )}
                  <span className={styles.groupTime}>{formatDateTime(lead.createdAt)}</span>
                  <span className={styles.groupChevron}>{isExpanded ? '▲' : '▼'}</span>
                </button>

                {/* 展开详情 */}
                {isExpanded && (
                  <div className={styles.groupBody}>
                    {items.map((item, idx) => (
                      <div key={item.id} className={styles.groupItem}>
                        {idx > 0 && <p className={styles.groupItemTitle}>{item.title}</p>}
                        <p className={styles.groupItemBody}>{item.body}</p>
                        <div className={styles.groupItemActions}>
                          {item.allowSnooze && item.taskId && (
                            <>
                              <button className="ghost-button small" onClick={() => onSnooze(item.id, item.taskId!, 10)}>10分钟后</button>
                              <button className="ghost-button small" onClick={() => onSnooze(item.id, item.taskId!, 30)}>30分钟后</button>
                              <button className="ghost-button small" onClick={() => onSnooze(item.id, item.taskId!, 120)}>2小时后</button>
                            </>
                          )}
                          <button className="ghost-button small" onClick={() => { onDismiss(item.id); if (items.length === 1) setExpandedId(null) }}>收起</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
