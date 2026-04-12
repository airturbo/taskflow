# Usable MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a single-user, local-first usable MVP of the todo management tool that can run in the browser and cover the core task management flow.

**Architecture:** Use a Vite + React + TypeScript frontend under `web/`. Keep the first release local-first with in-browser persistence, a compact domain model, and feature slices for tasks, lists, filters, and focus timer. Defer collaboration, full calendar, and cloud sync while preserving extension points.

**Tech Stack:** Vite, React, TypeScript, CSS, browser localStorage

---

### Task 1: Bootstrap the web app

**Files:**
- Create: `web/*`
- Modify: `web/package.json`, `web/src/*`
- Test: `cd web && npm run build`

**Step 1:** Initialize a React + TypeScript app in `web/`.
**Step 2:** Replace scaffold files with app shell, design tokens, and feature folders.
**Step 3:** Add domain types, seed data, and persistence utilities.
**Step 4:** Run build to verify the scaffold works.

### Task 2: Implement task management MVP

**Files:**
- Modify: `web/src/App.tsx`
- Create: `web/src/components/*`, `web/src/store/*`, `web/src/utils/*`
- Test: manual create/edit/complete/delete flow + `npm run build`

**Step 1:** Implement sidebar + topbar + task list layout.
**Step 2:** Implement create/edit/delete/complete flows.
**Step 3:** Implement list filter, today view, search, and priority display.
**Step 4:** Persist data to browser storage.

### Task 3: Implement alternate productivity views

**Files:**
- Modify: `web/src/App.tsx`
- Create: `web/src/components/KanbanView.tsx`, `web/src/components/PomodoroPanel.tsx`
- Test: manual switching and timer run + `npm run build`

**Step 1:** Add simplified kanban view grouped by status.
**Step 2:** Add pomodoro timer with start/pause/reset.
**Step 3:** Add summary stats for today and completed work.

### Task 4: QA and release packaging

**Files:**
- Create: `.agent-team/artifacts/by-type/TEST_REPORT/TEST_REPORT--ART-TEST-0001--v1.0.0.md`
- Create: `.agent-team/artifacts/by-type/DELIVERY_NOTE/DELIVERY_NOTE--ART-DELIVERY-0001--v1.0.0.md`
- Test: `cd web && npm run build`

**Step 1:** Run build as smoke test.
**Step 2:** Verify core flows manually.
**Step 3:** Record scope, pass/fail, and known gaps.
**Step 4:** Present local preview URL.
