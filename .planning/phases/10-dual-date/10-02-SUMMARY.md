---
phase: 10
plan: 02
status: done
---

# Summary — DATE-02: Focus Tab 5-group subtitles

## Changes

### `web/src/mobile/MobileFocusView.tsx`
- Added `subtitle` field to `VirtualFocusItem` section-header type
- Each section now carries a descriptive subtitle:
  - 逾期 → "计划完成或截止已过"
  - 今天计划 → "计划今天完成"
  - 今天截止 → "硬性截止日期为今天" (also renamed from "今天到期")
  - 待处理 → "收件箱未排期任务"
  - 明后天 → "未来 7 天内计划"
- Rendered via new `mobileFocusSectionTitleGroup` + `mobileFocusSectionTitle` + `mobileFocusSectionSubtitle` elements

### `web/src/mobile/MobileFocusView.module.css`
- Added `.mobileFocusSectionTitleGroup`: flex-column layout
- Added `.mobileFocusSectionTitle`: 13px 600 weight
- Added `.mobileFocusSectionSubtitle`: 10px muted tertiary text
- Added `flex-shrink: 0` to `.mobileFocusSectionIcon`
