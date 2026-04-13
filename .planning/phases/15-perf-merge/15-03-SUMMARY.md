---
task: "15-03"
title: "PERF-03: IndexedDB offline queue + exponential backoff"
status: "completed"
---

## What was done

Rewrote `web/src/utils/offline-queue.ts` from localStorage to IndexedDB via the `idb` library:

- DB: `taskflow-offline-db` (v1), store: `offline-queue`, keyPath: `userId`
- `QueueEntry` gains `retryCount: number` and `nextRetryAt: string | null`
- Exponential backoff: `Math.min(2000 * 2^retryCount, 300_000)` ms
- One-time migration from legacy `taskflow-offline-queue` localStorage key on module load
- `flushOfflineQueue` checks `nextRetryAt` before attempting, updates retry metadata on failure
- Added `getQueueStats()` for diagnostics

Updated `App.tsx` to `await hasPendingQueue()` (now returns `Promise<boolean>`).

## Files changed

- `web/src/utils/offline-queue.ts` (full rewrite)
- `web/src/App.tsx` (two `await` additions)
- `web/package.json`, `web/package-lock.json` (added `idb` dependency)

## Result

Offline queue survives browser storage pressure, supports items > 5 MB, and automatically backs off on repeated failures (2s → 4s → 8s … → 5min).
