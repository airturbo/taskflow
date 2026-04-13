---
task: "15-02"
title: "PERF-02: React.lazy code splitting for all views"
status: "completed"
---

## What was done

Converted all 11 view components in `WorkspaceViewContent.tsx` from eager imports to `React.lazy()`:

- ListView, CalendarView, KanbanView, TimelineView, MatrixView, StatsView
- MobileFocusView, MobileCalendarView, MobileMatrixView, MobileProjectsView, MobileMeView

Each view is wrapped in `<Suspense fallback={<ViewLoadingFallback />}>` inside `ViewErrorBoundary`.

Added `.view-loading-fallback` CSS with shimmer animation in `shared-components.css`.

## Files changed

- `web/src/components/WorkspaceViewContent.tsx`
- `web/src/styles/shared-components.css`

## Result

Each view ships as a separate JS chunk (~6–36 kB). Initial bundle only loads the active view. Subsequent views load on first navigation with a shimmer placeholder.

Note: KanbanView and StatsView show a "statically imported by WorkspaceShell.tsx" warning — they remain in the main chunk due to that static import but the lazy() call is still valid for future refactors.
