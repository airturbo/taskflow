# TaskFlow 移动端 UX 优化落地方案 v2
> 基于第一轮优化后的代码审查，生成时间：2026-04-10  
> 当前代码：`App.tsx` 7168 行 · 92 个 useState · React 19 + Tauri 2

---

## 第一章：第一轮优化成果盘点

### ✅ 已落地（做得好的部分）

| 功能点 | 实现质量 | 位置 |
|--------|---------|------|
| TaskBottomSheet 下滑关闭手势 | ⭐⭐⭐ 优秀：双区检测（handle 区/body 区），velocity+distance 双触发阈值 | L6285 |
| MobileFocusView 5段式分组 | ⭐⭐ 良好：overdue/todayPlanned/todayDeadline/inbox/upcoming | L6467 |
| 完成动画 200ms delay | ⭐⭐ 良好：completingIds Set + setTimeout | L6529 |
| 完成操作 Undo Toast | ⭐⭐ 良好：3秒 mobileCompletionToast | - |
| Tab 切换淡出动画 | ⭐ 基础：is-fading class CSS | - |
| MobileQuickCreateSheet 扩展 | ⭐⭐ 良好：3个时间字段 + P1-P4 + 标签 | L6939 |
| MobileMeView 统计面板 | ⭐⭐ 良好：活跃/已完成/逾期三项统计 | L6821 |
| MobileProjectsView 文件夹管理 | ⭐⭐ 良好：分组/颜色/移动/CRUD | L6674 |
| 移动端情感化空状态 | ⭐⭐ 良好："今天的任务都完成了！" 🎉 | L6545 |
| MobileConfirmSheet/PromptSheet | ⭐⭐⭐ 优秀：替换了破坏性的 native alert/prompt | L7092, L7124 |
| Timeline 手机端纵向布局 | ⭐⭐ 良好：CSS 覆盖实现垂直时间线 | index.css L4959 |
| 日历创建条/列头+号手机隐藏 | ⭐⭐ 良好：`.is-phone` 选择器 | index.css L4915 |
| 4-Tab 导航（移除 Projects Tab） | ⭐⭐ 良好：focus/calendar/matrix/me | - |
| MigrationWizard 数据迁移 | ⭐⭐ 良好：localStorage → 云端流程 | components/ |
| focusScope 筛选（all/today/week/list）| ⭐⭐ 良好：状态上提到 topbar | L6492 |

### ❌ 尚未落地（与 v1 方案对比）

| v1 方案条目 | 当前状态 | 影响 |
|------------|---------|------|
| App.tsx 拆分模块化 | **未动**，从 6854 → 7168 行（+314 行） | 首屏解析成本高，开发维护困难 |
| Zustand 状态管理 | **未安装**，仍 92 useState | 状态分散，re-render 无法细粒度控制 |
| @tanstack/react-virtual 虚拟列表 | **未安装**，全量渲染 | 大量任务时帧率下降 |
| 自定义时间选择器 | **未实现**，仍用 `datetime-local` | iOS/Android 原生 picker 体验差、样式不统一 |
| 任务行滑动手势（左滑/右滑）| **未实现** | 缺少行内快速操作 |
| 长按多选模式 | **未实现** | 批量操作缺失 |
| NLP 实时 chips 反馈 | **未实现** | 输入时无视觉解析反馈 |
| CSS 断点统一 | **部分未统一**，index.css 仍混有 720px | 响应式行为不一致 |

---

## 第二章：新发现的问题（本轮 review 首次记录）

### 🔴 P0 — 阻塞性问题

#### 问题 1：MobileQuickCreateSheet 三时间字段 UX 反人类
**位置**：L7017-7046  
**表现**：开始时间、计划完成、DDL 三个 `datetime-local` 输入框纵向排列，用户首次见到直接懵。
- `datetime-local` 在 iOS Safari 弹出系统时间滚轮，跳出 WebView 视觉风格
- 三个字段默认全空，用户不知道该填哪个、必须填哪个
- `label` 文案「开始 / 计划完成 / DDL」对非专业用户不友好
- `font-size: 16px !important` 虽然加了，但系统 picker 键盘弹出后布局无 `env(safe-area-inset-bottom)` 补偿，sheet 被键盘遮挡

**方案**：见第三章 §3.1

#### 问题 2：TaskBottomSheet 内渲染完整 TaskDetailPanel（25字段）
**位置**：L6406  
**表现**：TaskBottomSheet 直接渲染 `<TaskDetailPanel>` —— 这是一个桌面端 25 字段的详情面板，未做移动端裁剪。
- 提醒设置、附件、评论等复杂子区域全量加载
- 没有字段优先级区分，核心字段（标题/时间/优先级）和附属字段（附件/评论）平铺
- 在小屏上首屏显示的是提醒配置 UI（绝对提醒 datetime-local、相对提醒 spinner）

**方案**：见第三章 §3.2

#### 问题 3：92 个 useState 导致 WorkspaceApp 任何操作都会全量 re-render
**位置**：L~400 WorkspaceApp 函数体  
**表现**：切换一个 tab、打开一个 menu，都会触发整个 7168 行组件重渲染。
- 以 `mobileTabFading` 为例：它只影响导航栏，却导致所有 useMemo 重新求值（如果 dep 变化）
- 多个 state 放在同一个 setState 块的历史遗留

**方案**：见第三章 §3.3

#### 问题 4：空状态文案逻辑 Bug
**位置**：L6546-6551  
```tsx
// 当前代码
{focusScope === 'today' ? '今天的任务都完成了！' : '今天还没有安排'}
```
**表现**：focusScope='today' 时，如果本来就没有今天的任务（而不是全完成），也显示"今天的任务都完成了！" —— 逻辑错误，语义不对。

**方案**：区分「没有任务」和「全部完成」两种场景

---

### 🟡 P1 — 显著影响体验

#### 问题 5：MobileFocusCard 使用 `[计划]` `[DDL]` 方括号标记法
**位置**：L6660-6662  
```tsx
{dueTime && <span className="mobile-focus-card__plan">[计划] {dueTime}</span>}
{dlTime && <span className={`mobile-focus-card__ddl ...`}>[DDL] {dlTime}</span>}
```
业界做法（Things 3 / Todoist）用图标 + 颜色区分时间类型，不用文字括号。`[DDL]` 是开发术语，用户不一定理解。

#### 问题 6：任务卡片缺少列表归属信息
**位置**：MobileFocusCard  
`lists: _lists` 已接收但完全未使用（`_lists` 忽略），导致用户在聚焦视图下看不到任务属于哪个清单，无法快速区分工作/个人任务。

#### 问题 7：`focusScope === 'today'` 过滤语义有 bug
**位置**：L6502-6508  
```tsx
if (focusScope === 'today') return {
  overdue: filterByList(segments.overdue), // ❌ 没有按 today 过滤
  todayPlanned: filterByList(segments.todayPlanned), // ✅ segments 已按今天过滤
  ...
}
```
`filterByList` 仅按 listId 过滤，当 focusScope='today' 时对 overdue 段没有额外日期限制（overdue 包含所有历史逾期，不只是今天逾期的）。

#### 问题 8：MobileMeView 统计数据无时间维度
**位置**：L6856-6863  
统计仅显示总计数（活跃/已完成/逾期），无法了解：
- 今天完成了多少
- 本周完成趋势
- 与昨天对比

#### 问题 9：完成 Toast 无 Snooze 选项
**位置**：mobileCompletionToast 相关  
当前 Toast 只有 Undo 选项。业界（Any.do、滴答清单）在完成 Toast 中提供「推迟到明天」快捷操作，这对重复性任务场景很有价值。

#### 问题 10：CSS 断点仍存在 720px/680px 混用
**验证**：index.css 中 `@media (max-width: 720px)` 和 `@media (max-width: 680px)` 并存，可能导致 681-720px 区间样式错位。

#### 问题 11：MobileProjectsView 中 `folderId` 依赖 `unknown` 强转
**位置**：L6709  
```tsx
const folderId = (list as unknown as { folderId?: string | null }).folderId ?? null
```
`folderId` 字段没有在 `TodoList` 类型中定义，依赖运行时 duck-typing。数据结构应在 @taskflow/core 中正式声明。

#### 问题 12：taskBottomSheet 渲染时机 — 无 key，切换任务时面板状态残留
当在聚焦视图连续点击不同任务时，TaskBottomSheet 内的 TaskDetailPanel 不会 unmount/remount（除非加 `key={task.id}`），导致提醒/评论编辑草稿可能错位到新任务。

---

### 🟢 P2 — 体验增益

#### 问题 13：没有任务行内快速操作
当前用户只能点击任务进详情页才能操作，缺少：
- 长按快速菜单（推迟/优先级/删除）
- 右滑快速完成（Things 3 标志性 UX）

#### 问题 14：快速创建后键盘不自动收起
MobileQuickCreateSheet 提交后（handleSubmit），键盘可能仍停留，等下次打开 sheet 时 focus 才生效。

#### 问题 15：日历视图手机端缺少手势月/周切换
当前切换日历月/周需点击 topbar 菜单按钮。业界：滴答清单支持上下滑动在月视图/周视图间切换。

#### 问题 16：矩阵视图手机端四象限展示不友好
四象限需要 2×2 布局，在 390px 宽度上每个象限只有约 180px，任务卡片过小。缺少「单象限聚焦」模式。

#### 问题 17：TaskDetailPanel 的提醒配置模块在手机上无障碍性问题
datetime-local 输入框在提醒面板中仍然使用，且 spinner 控件（相对提醒的数量选择）是桌面 select 组件，触控区域不足 44px。

---

## 第三章：优化方案（优先级排序）

### 3.1 快速创建 Sheet 时间字段重设计 🔴P0

**目标**：降低认知负担，增加填写率，适配手机键盘弹出行为

#### 方案A：渐进式展开（推荐）
默认只显示「计划完成时间」，通过「+ 开始时间」「+ 最终期限」展开其他字段：

```tsx
// MobileQuickCreateSheet 重设计
function MobileQuickCreateSheet(...) {
  const [showAdvancedTime, setShowAdvancedTime] = useState(false)

  return (
    <div className="mobile-quick-create-sheet"
         style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}> {/* ← 补键盘安全区 */}
      
      {/* 主输入：只有标题 + 快速时间 */}
      <input ref={inputRef} className="mobile-quick-create-input" ... />
      
      {/* 时间快捷选项 — 今天/明天/下周/无 */}
      <div className="mobile-quick-create-quick-dates">
        {QUICK_DATE_OPTIONS.map(opt => (
          <button key={opt.label}
                  className={`quick-date-chip ${selectedDueAt === opt.value ? 'is-active' : ''}`}
                  onClick={() => setSelectedDueAt(opt.value)}>
            {opt.label}
          </button>
        ))}
        <button className="quick-date-chip"
                onClick={() => setShowTimePicker(true)}>⏰ 自定义</button>
      </div>

      {/* 高级选项折叠区 */}
      {showAdvancedTime && (
        <div className="mobile-quick-create-advanced">
          <MobileTimeField label="开始时间" value={selectedStartAt} onChange={setSelectedStartAt} />
          <MobileTimeField label="最终期限" value={selectedDeadlineAt} onChange={setSelectedDeadlineAt} />
        </div>
      )}
      <button className="mobile-quick-create-expand-time"
              onClick={() => setShowAdvancedTime(v => !v)}>
        {showAdvancedTime ? '收起时间选项' : '+ 开始时间 / 最终期限'}
      </button>
      
      {/* 底部操作行 */}
      <div className="mobile-quick-create-actions">
        <PriorityPicker value={selectedPriority} onChange={setSelectedPriority} />
        <ListPicker value={selectedListId} lists={lists} onChange={setSelectedListId} />
        <button className="submit-btn" onClick={handleSubmit} disabled={!value.trim()}>添加</button>
      </div>
    </div>
  )
}

// 快速日期选项
const QUICK_DATE_OPTIONS = [
  { label: '今天', value: () => `${getDateKey()}T09:00` },
  { label: '明天', value: () => `${addDays(getDateKey(), 1)}T09:00` },
  { label: '下周', value: () => `${addDays(getDateKey(), 7)}T09:00` },
  { label: '无', value: () => null },
]
```

**键盘安全区修复**：
```css
.mobile-quick-create-sheet {
  padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
}

/* 当键盘弹出时，sheet 需要跟随上移 */
@supports (height: 100dvh) {
  .mobile-quick-create-sheet {
    max-height: calc(100dvh - env(keyboard-inset-height, 0px));
  }
}
```

---

### 3.2 TaskBottomSheet 内容分层 🔴P0

**目标**：手机端详情页聚焦核心字段，高级字段按需展开

#### 方案：移动端专属 MobileTaskDetailSheet

不再复用桌面 TaskDetailPanel，新建专属移动端详情组件：

```tsx
function MobileTaskDetailSheet({
  task,
  onClose,
  onUpdateTask,
  onToggleComplete,
  ...
}: MobileTaskDetailSheetProps) {
  const [expandedSection, setExpandedSection] = useState<'reminders' | 'subtasks' | 'comments' | null>(null)

  return (
    <TaskBottomSheet onClose={onClose} key={task.id}> {/* key=task.id 保证切换任务时重置 */}
      {/* 层 1：核心信息（始终可见）*/}
      <div className="mobile-task-detail-core">
        {/* 可编辑标题 */}
        <MobileEditableTitle task={task} onUpdate={...} />
        
        {/* 时间三列（紧凑展示）*/}
        <MobileTimeRow task={task} onUpdate={...} />
        
        {/* 优先级 + 清单（一行）*/}
        <div className="mobile-task-detail-meta-row">
          <MobilePriorityBadge priority={task.priority} onTap={...} />
          <MobileListBadge listId={task.listId} lists={lists} onTap={...} />
        </div>
        
        {/* 备注（多行文本，内联编辑）*/}
        <MobileNoteField task={task} onUpdate={...} />
      </div>

      {/* 层 2：可展开的高级功能 */}
      <div className="mobile-task-detail-advanced">
        <MobileExpandSection
          label={`提醒 ${task.reminders.length > 0 ? `(${task.reminders.length})` : ''}`}
          icon="🔔"
          expanded={expandedSection === 'reminders'}
          onToggle={() => setExpandedSection(v => v === 'reminders' ? null : 'reminders')}
        >
          <MobileRemindersPanel task={task} ... />
        </MobileExpandSection>

        <MobileExpandSection
          label={`子任务 ${task.subtasks.filter(s=>s.completed).length}/${task.subtasks.length}`}
          icon="☑️"
          expanded={expandedSection === 'subtasks'}
          onToggle={...}
        >
          <MobileSubtasksPanel task={task} ... />
        </MobileExpandSection>

        <MobileExpandSection label="评论 & 附件" icon="💬" ...>
          <MobileCommentsPanel task={task} ... />
        </MobileExpandSection>
      </div>

      {/* 层 3：固定底部操作栏 */}
      <div className="mobile-task-detail-footer">
        <button className="footer-action complete" onClick={() => onToggleComplete(task.id)}>
          {task.completed ? '取消完成' : '✓ 完成'}
        </button>
        <button className="footer-action snooze" onClick={() => openSnoozeMenu()}>
          ⏰ 推迟
        </button>
        <button className="footer-action delete" onClick={() => onDelete(task.id)}>
          🗑️
        </button>
      </div>
    </TaskBottomSheet>
  )
}
```

**CSS**：
```css
.mobile-task-detail-footer {
  position: sticky;
  bottom: 0;
  display: flex;
  gap: 8px;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
  background: var(--bg-subtle);
  border-top: 1px solid var(--border);
}

.mobile-task-detail-footer .footer-action {
  flex: 1;
  height: 44px;
  border-radius: 12px;
  border: none;
  font-size: 15px;
  font-weight: 500;
}

.footer-action.complete { background: var(--primary); color: #fff; }
.footer-action.snooze   { background: var(--surface); color: var(--text); }
.footer-action.delete   { background: transparent; color: #ef4444; flex: 0 0 44px; }
```

---

### 3.3 状态管理局部拆分（渐进式 Zustand 引入）🔴P0

**目标**：不需要一次性全量重构，先将「移动端状态」从 WorkspaceApp 抽离

#### Step 1：安装
```bash
pnpm add zustand
```

#### Step 2：创建 mobile UI 状态 store

```typescript
// web/src/stores/mobileUiStore.ts
import { create } from 'zustand'

type MobileTab = 'focus' | 'calendar' | 'matrix' | 'me'

interface MobileUiState {
  activeTab: MobileTab
  tabFading: boolean
  selectedTaskId: string | null
  quickCreateOpen: boolean
  focusScope: 'all' | 'today' | 'week' | 'list'
  focusScopeListId: string | null
  focusScopeMenuOpen: boolean
  upcomingCollapsed: boolean
  completionToast: { taskId: string; title: string; timer: ReturnType<typeof setTimeout> } | null
  
  // Actions
  setActiveTab: (tab: MobileTab) => void
  setTabFading: (v: boolean) => void
  selectTask: (id: string | null) => void
  openQuickCreate: () => void
  closeQuickCreate: () => void
  setFocusScope: (scope: 'all' | 'today' | 'week' | 'list', listId?: string | null) => void
  toggleUpcoming: () => void
  showCompletionToast: (taskId: string, title: string, undoFn: () => void) => void
  dismissCompletionToast: () => void
}

export const useMobileUiStore = create<MobileUiState>((set, get) => ({
  activeTab: 'focus',
  tabFading: false,
  selectedTaskId: null,
  quickCreateOpen: false,
  focusScope: 'all',
  focusScopeListId: null,
  focusScopeMenuOpen: false,
  upcomingCollapsed: false,
  completionToast: null,

  setActiveTab: (tab) => {
    set({ tabFading: true })
    setTimeout(() => set({ activeTab: tab, tabFading: false }), 180)
  },
  setTabFading: (v) => set({ tabFading: v }),
  selectTask: (id) => set({ selectedTaskId: id }),
  openQuickCreate: () => set({ quickCreateOpen: true }),
  closeQuickCreate: () => set({ quickCreateOpen: false }),
  setFocusScope: (scope, listId = null) => set({ focusScope: scope, focusScopeListId: listId }),
  toggleUpcoming: () => set(s => ({ upcomingCollapsed: !s.upcomingCollapsed })),
  showCompletionToast: (taskId, title, undoFn) => {
    const prev = get().completionToast
    if (prev) clearTimeout(prev.timer)
    const timer = setTimeout(() => set({ completionToast: null }), 3000)
    set({ completionToast: { taskId, title, timer } })
  },
  dismissCompletionToast: () => {
    const toast = get().completionToast
    if (toast) clearTimeout(toast.timer)
    set({ completionToast: null })
  },
}))
```

这样可以将 WorkspaceApp 中约 15 个移动端相关 state 迁移出去，减少主组件 re-render 次数。

---

### 3.4 MobileFocusCard 信息密度与清晰度优化 🟡P1

**目标**：用图标替代文字标签，展示清单归属

```tsx
function MobileFocusCard({ task, lists, onSelect, onToggle, isCompleting }) {
  const list = lists.find(l => l.id === task.listId) // 现在真正使用 lists

  return (
    <div className={`mobile-focus-card priority-border-${task.priority} ${isCompleting ? 'is-completing' : ''}`}
         onClick={onSelect}>
      
      {/* 左侧优先级色条 */}
      <div className="mobile-focus-card__priority-bar" />
      
      <button className="check-button ..." onClick={e => { e.stopPropagation(); onToggle() }}>
        {task.completed ? '✓' : ''}
      </button>
      
      <div className="mobile-focus-card__content">
        <span className="mobile-focus-card__title">{task.title}</span>
        <div className="mobile-focus-card__meta">
          {/* 图标 + 时间，不用 [DDL] 文字 */}
          {task.dueAt && (
            <span className="mobile-focus-card__time">
              <svg .../>  {/* 日历图标 */}
              {formatSmartDate(task.dueAt)}
            </span>
          )}
          {task.deadlineAt && (
            <span className={`mobile-focus-card__deadline ${isDeadlineUrgent ? 'is-urgent' : ''}`}>
              <svg .../>  {/* 闹钟图标 */}
              {formatSmartDate(task.deadlineAt)}
            </span>
          )}
          {/* 清单归属 */}
          {list && list.id !== 'inbox' && (
            <span className="mobile-focus-card__list"
                  style={{ color: list.color }}>
              ● {list.name}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
```

**优先级左边框色条**（替代右侧 P1/P2 文字角标）：
```css
.mobile-focus-card {
  border-left: 3px solid transparent;
}
.mobile-focus-card.priority-border-urgent  { border-left-color: #ef4444; }
.mobile-focus-card.priority-border-high    { border-left-color: #f97316; }
.mobile-focus-card.priority-border-normal  { border-left-color: transparent; }
.mobile-focus-card.priority-border-low     { border-left-color: var(--border); }
```

---

### 3.5 空状态语义修复 🔴P0（小改动）

**位置**：L6546-6551

```tsx
// 修复前
{totalCount === 0 && (
  <div className="mobile-focus-empty-emotional">
    <div className="emoji">{focusScope === 'today' ? '🎉' : '☀️'}</div>
    <h3>{focusScope === 'today' ? '今天的任务都完成了！' : '今天还没有安排'}</h3>
  </div>
)}

// 修复后 — 区分「本来没有」vs「全部完成了」
// 需要额外 prop：hadTasksToday（由父组件根据 segments 总数是否大于0 传入）
{totalCount === 0 && (
  <div className="mobile-focus-empty-emotional">
    {hadTasksToday ? (
      // 之前有任务，现在全完成了
      <>
        <div className="emoji">🎉</div>
        <h3>今天的任务全完成了！</h3>
        <p>好好休息一下</p>
      </>
    ) : (
      // 本来就没有任务
      <>
        <div className="emoji">☀️</div>
        <h3>今天暂时没有安排</h3>
        <p>点击右下角 + 添加任务</p>
      </>
    )}
  </div>
)}
```

---

### 3.6 任务行右滑快速完成手势 🟡P1

在 MobileFocusCard 内实现右滑完成（左滑显示推迟/删除选项）：

```tsx
function MobileFocusCard({ task, lists, onSelect, onToggle, onSnooze, onDelete, isCompleting }) {
  const dragX = useRef(0)
  const startX = useRef(0)
  const cardRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX
    dragX.current = 0
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const delta = e.touches[0].clientX - startX.current
    dragX.current = delta
    if (Math.abs(delta) > 8) {
      e.preventDefault()
      if (cardRef.current) {
        cardRef.current.style.transform = `translateX(${Math.max(-120, Math.min(80, delta))}px)`
        cardRef.current.style.transition = 'none'
      }
    }
  }

  const handleTouchEnd = () => {
    const delta = dragX.current
    if (cardRef.current) {
      cardRef.current.style.transition = 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)'
      cardRef.current.style.transform = 'translateX(0)'
    }
    if (delta > 60) {
      // 右滑 > 60px → 完成
      onToggle()
    } else if (delta < -80) {
      // 左滑 > 80px → 显示操作菜单（推迟/删除）
      setShowSwipeActions(true)
    }
  }

  return (
    <div className="mobile-focus-card-wrapper">
      {/* 背景操作层（滑动时显示）*/}
      <div className="swipe-action-bg swipe-right-bg">✓ 完成</div>
      <div className="swipe-action-bg swipe-left-bg">
        <button onClick={() => onSnooze(task.id)}>推迟</button>
        <button className="danger" onClick={() => onDelete(task.id)}>删除</button>
      </div>
      <div ref={cardRef} className="mobile-focus-card ..."
           onTouchStart={handleTouchStart}
           onTouchMove={handleTouchMove}
           onTouchEnd={handleTouchEnd}
           onClick={onSelect}>
        ...
      </div>
    </div>
  )
}
```

---

### 3.7 CSS 断点统一 🟡P1

**操作**：全局搜索 `max-width: 720px` 并统一为 `680px`

```bash
# 验证当前混用情况
grep -n "max-width: 720px" web/src/index.css
grep -n "max-width: 680px" web/src/index.css
```

将所有 720px 移动端断点替换为 680px，与 JS 代码中 `isPhoneViewport = viewportWidth <= 680` 保持一致。

---

### 3.8 MobileProjectsView folderId 类型修复 🟡P1

**位置**：L6709  
在 `@taskflow/core` 的 `TodoList` 类型定义中添加 `folderId` 字段：

```typescript
// packages/core/src/types.ts（或等效位置）
export interface TodoList {
  id: string
  name: string
  color: string
  folderId?: string | null  // ← 新增
  // ... 其他字段
}
```

去除强转：
```tsx
// 修复前
const folderId = (list as unknown as { folderId?: string | null }).folderId ?? null

// 修复后
const folderId = list.folderId ?? null
```

---

### 3.9 TaskBottomSheet key 修复（状态残留）🟡P1

在渲染 TaskBottomSheet 的地方加 `key={selectedTaskId}`：

```tsx
{isPhoneViewport && mobileSelectedTaskId && (
  <TaskBottomSheet key={mobileSelectedTaskId} onClose={() => setMobileSelectedTaskId(null)}>
    <MobileTaskDetailSheet task={...} ... />
  </TaskBottomSheet>
)}
```

---

### 3.10 完成 Toast 增加推迟快捷操作 🟡P1

```tsx
// 完成 Toast
{mobileCompletionToast && (
  <div className="mobile-completion-toast">
    <span>"{mobileCompletionToast.title.slice(0, 20)}" 已完成</span>
    <div className="toast-actions">
      <button onClick={() => snoozeTomorrow(mobileCompletionToast.taskId)}>
        推迟到明天
      </button>
      <button className="undo" onClick={() => handleUndoComplete(mobileCompletionToast.taskId)}>
        撤销
      </button>
    </div>
  </div>
)}
```

---

### 3.11 MobileMeView 今日完成统计 🟢P2

```tsx
// 在 MobileMeView 统计区增加今日维度
const todayKey = getDateKey()
const todayCompleted = tasks.filter(t => 
  t.completed && t.updatedAt?.slice(0, 10) === todayKey
)

// 统计卡片增加「今日完成」
<div className="mobile-me-stat highlight">
  <strong>{todayCompleted.length}</strong>
  <span>今日完成</span>
</div>
```

---

### 3.12 矩阵视图手机端单象限聚焦模式 🟢P2

在矩阵视图手机端增加象限选择 Tab，每次只展示一个象限的全部任务：

```tsx
// 手机端矩阵视图上方增加象限选择器
{isPhoneViewport && (
  <div className="mobile-matrix-quadrant-tabs">
    {['urgent-important', 'not-urgent-important', 'urgent-not-important', 'not-urgent-not-important'].map(q => (
      <button key={q}
              className={`matrix-quad-tab ${activeQuadrant === q ? 'is-active' : ''}`}
              onClick={() => setActiveQuadrant(q)}>
        {QUADRANT_LABELS[q]}
      </button>
    ))}
  </div>
)}
```

---

## 第四章：实施路线图（第二轮）

### Phase 2A（建议 1-2 周，首批高价值）

优先处理有 bug 的问题 + 不需要大改架构的 P0：

| # | 任务 | 工时估算 | 影响 |
|---|------|---------|------|
| 1 | 空状态语义修复（§3.5）| 0.5h | 修复逻辑错误 |
| 2 | TaskBottomSheet key 修复（§3.9）| 0.5h | 防止状态残留 |
| 3 | MobileFocusCard 显示清单归属 + 图标替换（§3.4）| 2h | 信息更丰富 |
| 4 | CSS 断点统一（§3.7）| 1h | 响应式一致性 |
| 5 | MobileProjectsView folderId 类型修复（§3.8）| 1h | 类型安全 |
| 6 | 完成 Toast 增加推迟选项（§3.10）| 1.5h | 体验增益 |
| 7 | MobileQuickCreateSheet 快捷日期选项（§3.1）| 3h | 填写率提升 |

### Phase 2B（3-4 周，架构改进）

| # | 任务 | 工时估算 | 影响 |
|---|------|---------|------|
| 8 | 安装 Zustand + 迁移移动端 UI 状态（§3.3）| 4h | 性能提升，代码清晰 |
| 9 | MobileTaskDetailSheet 重建（§3.2）| 8h | 移动端详情体验跨越式提升 |
| 10 | 任务行滑动手势（§3.6）| 6h | 核心交互 |

### Phase 2C（持续迭代）

| # | 任务 | 工时估算 | 影响 |
|---|------|---------|------|
| 11 | 矩阵单象限模式（§3.12）| 3h | 小屏可用性 |
| 12 | MobileMeView 今日统计（§3.11）| 1h | 成就感 |
| 13 | 日历视图手势切换 | 4h | 体验增益 |
| 14 | @tanstack/react-virtual 引入 | 4h | 性能保障 |
| 15 | App.tsx 模块拆分（长期） | 16h+ | 开发体验 |

---

## 第五章：技术债务清单（备忘录）

| 编号 | 描述 | 类型 | 优先级 |
|------|------|------|--------|
| TD-01 | App.tsx 7168 行单文件，92 useState | 架构债 | P1 |
| TD-02 | `_sortMode`, `_onToggleSortMode` 在 MobileFocusView 是死参数 | 清理 | P2 |
| TD-03 | `lists: _lists` 在 MobileFocusCard 未使用（已解决，见§3.4）| 清理 | P1 |
| TD-04 | `(list as unknown as {...})` 强转 TodoList（见§3.8）| 类型安全 | P1 |
| TD-05 | TaskDetailPanel 中多处 `datetime-local` 触控区域不足 44px | 无障碍 | P2 |
| TD-06 | getDateKey() 在 MobileFocusCard render 中直接调用（无缓存）| 性能 | P3 |
| TD-07 | eslint-disable-next-line 注释过多（表明接口设计不合理）| 代码质量 | P2 |
| TD-08 | 无任何单元测试 | 测试 | P2 |

---

## 附：本次 review 的关键文件路径

| 文件 | 关键位置 |
|------|---------|
| `web/src/App.tsx` | L1105 断点定义；L6285 TaskBottomSheet；L6467 MobileFocusView；L6628 MobileFocusCard；L6674 MobileProjectsView；L6821 MobileMeView；L6939 MobileQuickCreateSheet |
| `web/src/index.css` | L4800-5029 移动端专属样式；L4912-4918 日历手机端隐藏；L4959 时间线手机端纵向 |
| `web/src/components/MigrationWizard.tsx` | 数据迁移流程 |
| `web/package.json` | 依赖列表（确认无 Zustand/virtual/framer-motion）|
