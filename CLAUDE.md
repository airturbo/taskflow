# CLAUDE.md

## Project Overview

**TaskFlow** — Multi-client task management platform (React 19 + TS 5.9 + Zustand + Tauri + Supabase)
Monorepo: `web/` (SPA + Tauri desktop), `packages/taskflow-core/` (shared logic), `todo-obsidian-plugin/`

## Commands

```bash
# Web
npm run dev          # Dev server (:1420)
npm run build        # Type check + build
npm run build:web    # Production build (CloudBase hosting)

# Desktop (Tauri)
npm run desktop:dev
npm run desktop:build

# Obsidian plugin
cd todo-obsidian-plugin && npm run build
```

## Architecture

- **App.tsx** (~3000 lines): Main orchestrator, all mutations + event handlers + view routing
- **@taskflow/core**: Pure domain types, selectors, dates, smart-entry NLP, timeline math, reminder engine
- **State**: React component state (App.tsx) + Zustand (mobile UI) + localStorage/SQLite/Supabase persistence
- **Data flow**: UI event → App.tsx handler → update state → dual-write (local + cloud) → re-render
- **Sync**: Local-first, offline-capable, Supabase realtime optional, last-write-wins conflict resolution
- **Views**: list, calendar (month/week/agenda), kanban, timeline (Gantt), matrix (Eisenhower), stats
- **Mobile**: Conditional rendering in App.tsx; dedicated components in `components/mobile/`
- **Styling**: CSS Modules (`.module.css`), CSS variables for theming, `is-phone`/`is-tablet` body classes

## Key Files

| What | Path |
|------|------|
| Main orchestrator | `web/src/App.tsx` |
| Domain types | `packages/taskflow-core/src/domain.ts` |
| Selectors/filters | `packages/taskflow-core/src/selectors.ts` |
| Smart entry NLP | `packages/taskflow-core/src/smart-entry.ts` |
| Timeline math | `packages/taskflow-core/src/timeline.ts` |
| Storage (web) | `web/src/utils/storage.ts` |
| Storage (desktop) | `web/src/utils/desktop-repository.ts` |
| Mobile UI store | `web/src/stores/mobileUiStore.ts` |
| Views | `web/src/components/views/` |
| Mobile components | `web/src/components/mobile/` |
| E2E tests | `web/e2e/` |
| Vite config | `web/vite.config.ts` |
| CloudBase config | `cloudbaserc.json` |

## Domain Essentials

- **Task**: 3-date scheduling (`startAt`/`dueAt`/`deadlineAt`), `repeatRule` (RFC 5545), `reminders[]`, `subtasks[]`
- **Priority**: `urgent | high | normal | low`
- **Status**: `todo | doing | done`
- **Eisenhower Matrix**: Uses `isUrgent`/`isImportant` boolean fields on Task
- **Smart Entry**: Chinese NLP — "明天下午2点开会 #工作 !高" → parsed title + date + tags + priority

## Conventions

- TypeScript strict mode, no `any`
- Path alias: `@taskflow/core` → `packages/taskflow-core/src`
- All mutations in App.tsx, call `saveState()` after each
- CSS Modules with `:global(.is-*)` for state classes
- No polyfills/backward compat unless explicitly requested

## Testing Rules (Mandatory)

1. **UI interactions must pass real Playwright browser tests** — not just `vite build`
2. Tests in `web/e2e/`, must cover: page load, view switching, drag interactions, routing, forms, responsive
3. FAIL results must include screenshots + error logs
4. Context < 30%: auto compact then continue tasks without asking
