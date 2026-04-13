# Phase 7: CSS 架构 - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

6921 行单文件 index.css → CSS Modules 模块化。将 index.css 按组件/视图拆分为独立 .module.css 文件，同时实现主内容区滚动条 thin auto-hide 样式（MINOR-04）。

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

Key codebase observations:
- index.css (6921 lines) is the monolith — contains design system variables, layout, sidebar, all views, responsive breakpoints, mobile-specific styles
- App.css (321 lines) — app-level layout styles
- CommandPalette.css (169 lines) — already extracted as standalone CSS file (not module)
- Components: ~24 components in src/components/ + 6 views in src/components/views/
- index.css uses BEM-like section comments (e.g., `/* ---- Sidebar ---- */`, `/* ---- Kanban ---- */`)
- Design system variables defined in `:root` block (~40 CSS custom properties)
- Responsive breakpoints at 1280px, 1200px, 960px, 680px
- Global scrollbar hiding (`scrollbar-width: none`) with `.scrollbar-visible` opt-in class

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- CSS custom properties in `:root` — design tokens (colors, spacing, shadows, transitions)
- `.scrollbar-visible` utility class pattern
- Existing section boundaries in index.css map directly to component files

### Established Patterns
- React 19 + Vite 8 (native CSS Modules support)
- Components structured as flat files in src/components/ with views/ subfolder
- Phase 6 already split App.tsx into hooks — CSS split follows same modular philosophy

### Integration Points
- Each component `.tsx` file will import its `.module.css`
- Design system tokens (:root vars) stay in index.css or a shared variables file
- Responsive breakpoints may need shared or per-component approach

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
