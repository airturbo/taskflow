export interface FiredReminder {
  key: string;
  taskId: string;
  ruleIndex: number;
  title: string;
  body: string;
  ts: number;
  dismissed?: boolean;
}

interface ReminderPanelProps {
  reminders: FiredReminder[];
  onSnooze: (taskId: string, ruleIndex: number, minutes: number) => void;
  onDismiss: (taskId: string, ruleIndex: number) => void;
  onClearAll: () => void;
}

const SNOOZE_OPTIONS = [
  { label: '15分钟后', minutes: 15 },
  { label: '1小时后', minutes: 60 },
  { label: '明天', minutes: 24 * 60 },
];

export function ReminderPanel({
  reminders,
  onSnooze,
  onDismiss,
  onClearAll,
}: ReminderPanelProps) {
  const activeReminders = reminders.filter(r => !r.dismissed);

  return (
    <div className="tw-reminder-panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong style={{ fontSize: 13 }}>🔔 提醒中心</strong>
        {activeReminders.length > 0 && (
          <button className="tw-btn-xs" onClick={onClearAll}>全部清除</button>
        )}
      </div>

      {activeReminders.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-faint)', textAlign: 'center', padding: '12px 0' }}>
          暂无待处理提醒
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {activeReminders.map(r => (
            <div key={r.key} className="tw-reminder-item">
              <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 2 }}>{r.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                {new Date(r.ts).toLocaleTimeString()} — {r.body}
              </div>
              <div className="tw-reminder-item__actions">
                <div className="tw-snooze-options">
                  {SNOOZE_OPTIONS.map(opt => (
                    <button
                      key={opt.minutes}
                      className="tw-btn-xs"
                      onClick={() => onSnooze(r.taskId, r.ruleIndex, opt.minutes)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <button
                  className="tw-btn-xs"
                  onClick={() => onDismiss(r.taskId, r.ruleIndex)}
                >
                  忽略
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
