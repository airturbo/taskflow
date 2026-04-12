# TickTick Parity Demo Implementation Plan

**Goal:** Rebuild the current web app from a rough usable MVP into a high-fidelity TickTick-style productivity demo with richer task modeling, multi-view workspace, habits, focus, and stats.

**Scope line:** Ship a local-first Web demo that demonstrates parity direction clearly. Do not fake true cloud sync, real-time collaboration, or native platform-only capabilities.

---

### Task 1: Rebuild domain model and seed data
- Modify: `web/src/types/domain.ts`, `web/src/data/seed.ts`, `web/src/utils/*`
- Outcome: richer task / tag / filter / habit / focus entities and smart quick-add support

### Task 2: Rebuild the app shell
- Modify: `web/src/App.tsx`, `web/src/index.css`
- Outcome: TickTick-style three-column workspace with sidebar, topbar, main area, and right rail

### Task 3: Rebuild workspace views
- Modify: `web/src/App.tsx`, `web/src/index.css`
- Outcome: list, calendar, kanban, timeline, and matrix views sharing one source of truth

### Task 4: Add focus, habits, and statistics
- Modify: `web/src/App.tsx`, `web/src/index.css`
- Outcome: interactive pomodoro, habit tracking, and stats panels

### Task 5: QA and release
- Test: `cd web && npm run build`
- Outcome: previewable local demo + updated governance artifacts + alignment review
