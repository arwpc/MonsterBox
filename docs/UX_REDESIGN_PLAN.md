# MonsterBox UX Redesign — Master Plan

**Status:** Active
**Owner:** Aaron Warner
**Started:** 2026-04-14 (v8.0.1)
**Goal:** Transform MonsterBox into a sleek, Halloween-flavored, out-of-the-box Monster control system. Consistent pages, familiar controls, no-tech-knowledge operator flow, live-performance-ready dashboard. Preserve all complexity — relocate it, don't remove it.

---

## Guiding Principles

1. **Operator first, technician second.** The Dashboard is the show floor — anything a live operator needs during a performance must be one click away. Configuration lives in Setup.
2. **Progressive disclosure.** Simple controls by default; "Advanced" reveals power-user knobs. Never amputate functionality — move it behind a disclosure.
3. **One design system, applied everywhere.** Buttons, inputs, panels, badges, modals, tooltips all come from the same token set. No more inline `<style>` blocks redefining button hover.
4. **Halloween without gimmicks.** Neon greens, deep blacks, subtle scanlines, Creepster/VT323 accents — but never at the cost of legibility. A spooky skin that still reads like a control surface at 2am on Oct 31.
5. **No architectural changes.** Still Node + Express + EJS + Bootstrap 5. No new transports, no framework swap, no dep additions without approval (per CLAUDE.md).
6. **Browser tests are the safety net.** Every phase ends green on the browser suite. No merging a phase that regresses existing specs.

---

## Current-State Snapshot (v8.0.1, April 2026)

- **36 EJS views** across 12 top-level areas (Dashboard, Scenes, Poses, Setup/{calibration, jaw, head, audio, system, characters, models}, Audio Library, Video Library, AI Settings/{TTS, STT}, Orchestration, Goblin Management, First-Run, Live).
- **12 CSS files, 6,240 LOC** — with three separate `:root` token blocks, 275+ hard-coded hex values, 30+ overlapping button variants, and duplicated animation keyframes per page.
- **19 client-JS files, ~13k LOC** — mixed ES5 IIFE and ES6; several pages carry 400–750 lines of inline `<script>` that should live in `/public/js/`.
- **Bootstrap 5.3.2** + 16 Bootswatch themes + 2 custom MonsterBox themes (`monsterbox`, `monsterbox-halloween`). Theme selection is data-attribute driven via `master.ejs`.
- **Fonts:** VT323 (terminal), Press Start 2P (retro), Creepster (spooky). Google Fonts @import in two files.
- **Icons:** Bootstrap Icons only. No Font Awesome.

Full inventory lives in `docs/UX_AUDIT_PHASE1.md`.

---

## Phase 1 — Audit & Gap Report

**Deliverable:** `docs/UX_AUDIT_PHASE1.md`
**Duration:** Single session (this one).
**Output:** Catalog of every page, every component, every CSS/JS file, every inconsistency. No code changes.

### Scope

- [x] Enumerate every route that renders HTML → page purpose, layout, navigation group.
- [x] Enumerate every EJS partial/component → where it's used, inline styles/scripts.
- [x] Enumerate every CSS file → LOC, what it covers, overlap with other files.
- [x] Enumerate every client JS file → ES5 vs ES6, view association, size.
- [x] Enumerate existing design tokens (CSS variables, fonts, colors).
- [x] Flag consistency hotspots (button variants, modal patterns, loading states, status badges, empty states).
- [x] List "migration candidates" — inline CSS/JS blocks that must move out.
- [x] Draft initial Halloween design-token palette to validate in Phase 2.

### Acceptance criteria

- A single markdown file a human can read in 15 minutes that answers "what is the current UI surface and where does it break consistency?"
- Every view file assigned to a redesign cluster (Dashboard / Animation / Setup / Library / System).
- No code modified yet.

---

## Phase 2 — Design System Foundation

**Deliverable:** `public/css/tokens.css` + `public/css/components.css` + living-style-guide page at `/setup/style-guide` (dev-only).
**Duration:** 1–2 sessions.

### Scope

1. **Lock the token set** (single source of truth, replaces the three `:root` blocks):
   - Colors — `--mb-bg-{0,1,2,3}`, `--mb-fg-{primary,secondary,muted}`, `--mb-accent-{neon,blood,amber,bone,poison}`, semantic `--mb-{success,warning,danger,info}`.
   - Typography — `--mb-font-display` (Creepster), `--mb-font-mono` (VT323), `--mb-font-ui` (system sans), type scale `--mb-text-{xs…3xl}`.
   - Spacing — 4px-based scale `--mb-space-{0…10}`.
   - Radii, shadows, motion — `--mb-radius-{sm,md,lg,pill}`, `--mb-shadow-{glow,panel,modal}`, `--mb-ease-*`, `--mb-dur-{fast,base,slow}`.
   - Z-index scale.
2. **Component library** (`components.css`) — buttons, inputs, selects, toggles, sliders, cards, panels, tabs, accordions, tables, badges, chips, modals, tooltips, toasts, empty-states, loading skeletons. Every component references tokens — zero hard-coded colors.
3. **Style guide** — a dev-only page at `/setup/style-guide` that renders every component variant side-by-side. Becomes the reference for "does this look right?" throughout Phases 3–4.
4. **Retire duplicates** — delete redundant `:root` blocks from `input.css`, consolidate scrollbar/focus/animation definitions out of per-page CSS.
5. **Halloween flavor pass** — scanline overlay utility, neon-glow button variant, flicker animation, rune-accent divider. Kept as opt-in utility classes so calibration/settings pages stay readable.

### Acceptance criteria

- `tokens.css` + `components.css` loaded globally via `master.ejs`.
- `/setup/style-guide` renders all components without errors.
- Existing pages still render (may still look mismatched — Phase 3/4 fixes that).
- `npm run test:browser` passes.

---

## Phase 3 — Dashboard Rebuild (Live-Operator First)

**Deliverable:** Redesigned `/` (Dashboard) fit for live Halloween-night operation.
**Duration:** 1–2 sessions.

### Scope

1. **Information hierarchy** — one glance tells the operator: which character is selected, is it live, is the show running, what scene is playing, is the AI listening, what's the next queued action.
2. **Primary controls** (always visible, big targets):
   - Character selector (large, with avatar).
   - Lurk Mode master switch (with status halo: AI / Jaw / Head / Idle / Motion).
   - Scene queue: play / pause / next / loop / stop-all.
   - Say-This / Ask-AI unified input.
   - Webcam feed with head-tracking crosshair.
3. **Secondary controls** (panels, reorderable, collapsible):
   - Quick poses grid.
   - Audio library quick-play.
   - System vitals (volume, temp, memory, service status).
   - Per-subsystem mute/enable toggles.
4. **Panic button** — single red "STOP EVERYTHING" always in the header. Keyboard shortcut `Esc Esc`.
5. **Kiosk mode** — hides the navbar for fullscreen performance use. Toggle from header menu, persisted in localStorage.
6. **Responsive** — works at tablet width (iPad in the haunted house).

### Acceptance criteria

- Non-technical user can: pick a character → enable Lurk Mode → play a scene queue → say a custom line → stop everything, without leaving the dashboard.
- Passes `test:browser:dashboard` and `test:browser:conversation`.
- No route or API change — dashboard uses existing endpoints.

---

## Phase 4 — Roll Out Across Remaining Pages

**Deliverable:** Every page rebuilt against the design system.
**Duration:** 3–5 sessions, clustered by area.

### Roll-out order (each cluster = one commit at minimum)

1. **Animation cluster** — `/scenes` (studio), `/poses/editor`. Biggest inline-CSS/JS offenders; highest operator impact after Dashboard.
2. **Setup cluster** — `/setup` hub, `/setup/calibration`, `/setup/jaw-animation`, `/setup/head-animation`, `/setup/audio`, `/setup/system`, `/setup/characters`, `/setup/models`. Unify the "configure a subsystem" pattern: left rail (subsystem list) + main pane (controls) + right rail (live preview). Push advanced knobs into a "Show Advanced" collapse.
3. **Library cluster** — `/audio-library`, `/video-library`. Unify the "browse → filter → act on rows" table pattern.
4. **System cluster** — `/orchestration`, `/goblin-management`, `/ai-settings` + subpages. Unify the "fleet status + broadcast action" pattern.
5. **Onboarding & error** — `/first-run`, `/error`. Lightest work, final polish.

### Per-page checklist

- [ ] Uses only `tokens.css` + `components.css` + (rarely) page-specific CSS under 100 LOC.
- [ ] No inline `<style>` blocks over 20 LOC.
- [ ] Client JS extracted to `/public/js/<page>.js` if over 50 LOC.
- [ ] Buttons, inputs, modals, tooltips all from the component library.
- [ ] "Advanced" knobs collapsed by default.
- [ ] Empty states and loading states designed, not bare.
- [ ] Passes the relevant `test:browser:<area>` spec.

### Acceptance criteria

- Every page opens and demonstrates the shared visual language.
- Full `npm test` passes.
- Running `grep -r "<style>" views/` returns only the style-guide page and any sub-20-LOC intentional overrides.

---

## Risk Register

| Risk | Mitigation |
|------|-----------|
| Browser tests rely on specific DOM structures / class names | Phase 2 keeps legacy class names as aliases; Phase 4 migrates tests alongside each page. |
| Theme change breaks Bootswatch integration | Keep Bootswatch load path; design tokens sit on top of Bootstrap vars, not replacing them. |
| Operator muscle memory disrupted by reorg | Phase 3 preserves existing interaction verbs (same button names, same places where possible); only visual layer changes. |
| Large diff hard to review | One cluster per commit per phase. Each commit green on its area's browser tests. |
| Inline JS extraction introduces regressions | Extract before restyling — one refactor at a time. |

---

## Progress Log

| Date | Phase | Commit | Notes |
|------|-------|--------|-------|
| 2026-04-14 | Plan + Phase 1 | f8f677db | Initial audit and master plan |
| 2026-04-14 | Phase 2 decisions | — | Answers to open questions (below) |
| 2026-04-14 | Phase 2 | b7f07965 | tokens.css, components.css, style guide |
| 2026-04-14 | Phase 3 | _pending_ | Operator Command Bar, restyled hero/superpowers, panic + Esc-Esc |

Update this log after every phase completion.

---

## Phase 2 Decisions (user, 2026-04-14)

1. **Palette:** Shift neon `#00ff00` → warmer poison-green `#39ff6a`. Approved.
2. **Themes:** Curate to 3 — default `haunted-console` (green-on-black Halloween), `cold-crypt` (cyan/violet), `bright-ops` (light mode for daylight setup work). Retire Bootswatch options from the UI picker (keep vendor files for rollback).
3. **Character portraits:** No high-res assets exist; Phase 3 will generate placeholder hero imagery.
4. **Kiosk mode:** Not needed. Halloween-night users will run from desktop browser or mobile phone — **responsive design (phone width) is a hard requirement** from Phase 3 onward.
5. **Accessibility:** No WCAG target. Optimize for legibility and operator speed, not compliance.

These decisions override the corresponding points in §7 of `UX_AUDIT_PHASE1.md` where applicable.
