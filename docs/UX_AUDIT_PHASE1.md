# Phase 1 — UX Audit & Gap Report

**Date:** 2026-04-14
**Version at audit:** v8.0.1
**Scope:** Complete inventory of MonsterBox UI surface — every route, view, partial, CSS file, client-JS file — plus a catalog of design inconsistencies. No code modified.
**See also:** `docs/UX_REDESIGN_PLAN.md` (master plan, four phases).

---

## 1. Route → View Map

### Dashboard cluster

| Route | Method | View | Purpose |
|-------|--------|------|---------|
| `/` | GET | `conversation/index.ejs` | Main operator dashboard (absorbed `/conversation`) |
| `/live` | GET | `live/index.ejs` | Live-show view (poses, webcam, AI chat) |
| `/first-run` | GET | `first-run/index.ejs` | Character selection onboarding |

### Animation cluster

| Route | Method | View | Purpose |
|-------|--------|------|---------|
| `/scenes` | GET | `scenes/studio.ejs` | Animation Studio (scene + pose + timeline) |
| `/scenes?edit=:id` | GET | `scenes/studio.ejs` | Edit an existing scene |
| `/poses/editor` | GET | `poses/editor.ejs` | New pose |
| `/poses/editor/:id` | GET | `poses/editor.ejs` | Edit pose |

### Setup cluster

| Route | Method | View | Purpose |
|-------|--------|------|---------|
| `/setup` | GET | `setup/index.ejs` | Setup hub (6-card grid) |
| `/setup/audio` | GET | `setup/audio.ejs` | Audio I/O & PipeWire |
| `/setup/calibration` | GET | `setup/calibration.ejs` | Servo/actuator calibration |
| `/setup/characters` | GET | `setup/characters.ejs` | Character CRUD |
| `/setup/characters/images` | GET | `setup/character-images.ejs` | Character avatars |
| `/setup/models` | GET | `setup/models.ejs` | Hardware model registry |
| `/setup/jaw-animation` | GET | `setup/jaw-animation.ejs` | Jaw sync setup |
| `/setup/head-animation` | GET | `setup/head-animation.ejs` | Head tracking setup |
| `/setup/system` | GET | `setup/system.ejs` | System prefs, theme, volume |
| `/setup/unified-calibration` | GET | `setup/unified-calibration.ejs` | Combined calibration UI |

### Library cluster

| Route | Method | View | Purpose |
|-------|--------|------|---------|
| `/audio-library` | GET | `audio-library/index.ejs` | Audio file manager |
| `/video-library` | GET | `video-library/index.ejs` | Video file manager |

### System cluster

| Route | Method | View | Purpose |
|-------|--------|------|---------|
| `/orchestration` | GET | `orchestration/index.ejs` | Multi-animatronic broadcast |
| `/goblin-management` | GET | `goblin-management/index.ejs` | Goblin device manager |
| `/ai-settings` | GET | `ai-settings/index.ejs` | AI service overview |
| `/ai-settings/tts` | GET | `ai-settings/tts.ejs` | TTS config |
| `/ai-settings/stt` | GET | `ai-settings/stt.ejs` | STT config |

### Legacy redirects (preserve for muscle memory)

- `/conversation` → `/`
- `/poses` → `/scenes`
- `/setup/poses` → `/scenes`
- `/setup/super-powers` → `/setup/jaw-animation`
- `/scenes/edit/new` → `/scenes`
- `/scenes/edit/:id` → `/scenes?edit=:id`

---

## 2. Layouts, Partials, Components

| File | Role | Notes |
|------|------|-------|
| `views/layouts/master.ejs` | Master wrapper | Loads Bootstrap, theme, global JS; exposes `styles[]` + `scripts[]` arrays; sets `window.__MB_CHAR_ID` |
| `views/partials/head-extras.ejs` | Per-page CSS injection | |
| `views/partials/body-extras.ejs` | Per-page JS injection | |
| `views/components/unified-navigation.ejs` | Sticky navbar | Git hash, dropdowns, character menu |
| `views/components/footer.ejs` | Footer | Version + hardware status badge |
| `views/components/character-avatar.ejs` | Avatar chip | Reusable |
| `views/components/test-nav.ejs` | Test-mode nav | Conditional |

---

## 3. CSS Inventory (12 files, 6,240 LOC)

| File | LOC | Primary Use | Issue |
|------|-----|-------------|-------|
| `main.css` | 1,695 | Core components | Has its own `:root` token block |
| `style.css` | 1,086 | Legacy nav/forms/buttons | Overlaps with `main.css` |
| `monsterbox4.css` | 768 | Animation Studio, pose cards | Has a third `--mb-*` token block (different values) |
| `input.css` | 524 | Form controls | Duplicates `main.css` `:root` |
| `video-configuration.css` | 447 | Video library | Redefines `.btn` hover |
| `body-map.css` | 439 | Hardware body map | |
| `voiceSelector.css` | 383 | TTS voice dropdown | |
| `servo-config.css` | 283 | Servo calibration | |
| `custom-themes.css` | 258 | Theme FX (glitch, scanline) | |
| `lurk-mode.css` | 196 | Lurk mode bar | |
| `manual-controls.css` | 152 | Manual servo controls | |
| `first-run.css` | 9 | Skull landing | Could fold into main.css |

### Existing design tokens (three conflicting sources)

**main.css + input.css** — neon retro palette:
```css
--primary: #00ff00 --secondary: #ff00ff --accent: #00ffff
--base-100: #000 --base-200: #111 --base-300: #222
--error: #ff0040 --warning: #ff8000
```

**monsterbox4.css** — purple/gray Bootstrap-adjacent:
```css
--mb-primary: #6f42c1 --mb-secondary: #6c757d
--mb-success: #198754 --mb-danger: #dc3545 --mb-warning: #fd7e14
--mb-terminal-bg: #0a0a0a --mb-terminal-text: #0f0
--mb-step-servo: #0d6efd  /* + per-step-type color */
```

**Hard-coded:** 275+ hex/rgba values scattered across `main.css` and `style.css` that are not tied to any variable.

### Fonts

Imported twice (in `main.css` and `input.css`):
```css
@import url('https://fonts.googleapis.com/css2?family=VT323&family=Press+Start+2P&family=Creepster&display=swap');
```
- **VT323** → body text, inputs, terminals
- **Press Start 2P** → retro titles
- **Creepster** → spooky headings

### Icons

Bootstrap Icons only (`/vendor/bootstrap-icons/`). No Font Awesome. No inline SVG icon system.

### Themes

- Bootswatch (16 themes: darkly, cyborg, slate, solar, superhero, …) — loaded per `config.theme` in `master.ejs`.
- Custom MonsterBox themes via `data-bs-theme="monsterbox"` and `data-mb-theme="default-dark"` attributes.
- No central theme manifest — theme rules scattered across `custom-themes.css`, `monsterbox4.css`, and per-page CSS.

---

## 4. Client JS Inventory (19 files, 12,962 LOC)

| File | LOC | Pattern | View |
|------|-----|---------|------|
| `monsterbox4.js` | 342 | ES6 class | Global utility (form validation, notifications) |
| `ai-settings.js` | 902 | ES5 → ES6 | AI Settings |
| `ai-settings-tts.js` | 807 | Mixed | TTS config |
| `ai-settings-stt.js` | 1,655 | Mixed | STT config |
| `audio-library.js` | 962 | ES5 mixed | Audio library |
| `audio-player.js` | 584 | Mixed | Audio playback |
| `goblin-management.js` | 1,600 | Mixed | Goblin manager |
| `manual-controls.js` | 974 | ES5 IIFE | Manual controls panel |
| `head-animation.js` | 1,063 | Mixed | Head setup |
| `jaw-animation.js` | 970 | Mixed | Jaw setup |
| `poses-setup.js` | 641 | ES6 | Pose editor integration |
| `video-library.js` | 1,028 | Mixed | Video library |
| `websocket-chat.js` | 282 | ES5 | AI chat |
| `components/ai-chat-modal.js` | 599 | ES5 IIFE | Chat modal |
| `panel-sortable.js` | 200 | ES5 | Panel drag-reorder |
| `mic-panel.js` | 165 | ES5 | Mic VU meter |
| `character-menu.js` | 116 | ES5 IIFE | Character select |
| `setup-audio.js` | 44 | ES5 | Audio device enum |
| `first-run.js` | 28 | ES5 IIFE | First-run |

### Inline `<script>` hotspots (must extract in Phase 4)

| View | Approx LOC inline | What it does |
|------|-------------------|--------------|
| `views/poses/editor.ejs` | **750+** | Pose editor state machine, API integration |
| `views/scenes/scenes.ejs` | **440+** | Scene/queue CRUD, drag-reorder, stories |
| `views/poses/index.ejs` | 92 | Pose list fetch & execute |
| `views/live/index.ejs` | 100+ | Lurk mode polling, pose trigger |
| `views/conversation/index.ejs` | 100+ | Body map animation, chat integration |

### Inline `<style>` hotspots

| View | LOC inline | Theme-worthy content |
|------|------------|----------------------|
| `views/setup/calibration.ejs` | 80+ | PCA9685 board visual, channel grid, VU meter |
| `views/poses/editor.ejs` | 43 | Part cards, type badges, angle display |
| `views/setup/head-animation.ejs` | 22 | Section borders, status pulse keyframes |
| `views/setup/jaw-animation.ejs` | 20 | Audio/jaw meter gradients, live pulse |
| `views/scenes/scenes.ejs` | 11 | Queue item hover, drag opacity |

---

## 5. Gap Report — Consistency Issues

### Critical

1. **Three conflicting `:root` token definitions** (`main.css`, `input.css`, `monsterbox4.css`) use different color systems. A component rendered on one page may look nothing like the same component on another.
2. **30+ button variants** across `main.css`, `style.css`, `monsterbox4.css`, plus `.nav-button`, `.nav-button-monsterbox`, `.btn-monsterbox`. No clear primary/secondary/ghost/destructive hierarchy.
3. **Inline `<script>` blocks over 400 LOC** in `poses/editor.ejs` and `scenes/scenes.ejs` — untestable, unlintable, and make markup unreviewable.
4. **No spacing scale.** Margins and padding are hard-coded (4/8/12/16/24 px) scattered throughout — no `--mb-space-*` tokens.
5. **Duplicate Google Fonts `@import`** (in both `main.css` and `input.css`) wastes a request and can cause flash-of-unstyled-text.

### Major

6. **No unified empty state.** Audio library, scene list, pose list, queue panel all handle "nothing here" differently.
7. **No unified loading state.** Spinners appear inline, centered, as overlays, or not at all. Skeleton loaders nonexistent.
8. **Modal patterns diverge.** Upload modals in `/audio-library` vs `/video-library` have different structure; pose delete and scene delete use different confirmation styles.
9. **Status badges use ad-hoc colors.** Success/warning/danger/info applied inconsistently; lurk-mode badges defined in their own file with their own palette.
10. **Tooltip auto-init in `master.ejs`** runs on every element with `data-bs-toggle="tooltip"` — good — but most pages don't add tooltips at all, leaving critical controls unexplained.

### Minor

11. `first-run.css` is 9 LOC and could fold into `main.css`.
12. `video-configuration.css` redefines `.btn` hover states — duplication.
13. No responsive-breakpoint tokens — media queries hard-coded to 768px.
14. Per-page animation keyframes (`statusPulse`, `livePulse`) redefined across multiple files.
15. No central `z-index` scale — modals, tooltips, sticky headers collide on small screens.

---

## 6. Redesign Cluster Assignment

Each view is assigned to a Phase 4 roll-out cluster:

### Animation cluster (highest inline-code debt)
- `views/scenes/studio.ejs`, `views/scenes/scenes.ejs`, `views/scenes/scene-editor.ejs`
- `views/poses/editor.ejs`, `views/poses/index.ejs`

### Setup cluster (need unified subsystem-config pattern)
- `views/setup/index.ejs`, `views/setup/calibration.ejs`, `views/setup/unified-calibration.ejs`
- `views/setup/jaw-animation.ejs`, `views/setup/head-animation.ejs`, `views/setup/audio.ejs`
- `views/setup/system.ejs`, `views/setup/characters.ejs`, `views/setup/character-images.ejs`
- `views/setup/models.ejs`, `views/setup/poses.ejs`

### Library cluster (need unified browse-filter-act pattern)
- `views/audio-library/index.ejs`
- `views/video-library/index.ejs`

### System cluster (need unified fleet-status + broadcast pattern)
- `views/orchestration/index.ejs`, `views/goblin-management/index.ejs`
- `views/ai-settings/index.ejs`, `views/ai-settings/tts.ejs`, `views/ai-settings/stt.ejs`

### Dashboard cluster (Phase 3 — rebuilt first, standalone)
- `views/conversation/index.ejs` (mounted at `/`), `views/live/index.ejs`

### Onboarding/error (Phase 4 tail)
- `views/first-run/index.ejs`, `views/error.ejs`

---

## 7. Proposed Halloween Design Tokens (draft — validated in Phase 2)

**Color palette — "Haunted Console"**

| Token | Hex | Use |
|-------|-----|-----|
| `--mb-bg-0` | `#07080a` | Page background (deep ink) |
| `--mb-bg-1` | `#101217` | Panel surface |
| `--mb-bg-2` | `#1a1d24` | Elevated panel |
| `--mb-bg-3` | `#242833` | Modal / popover |
| `--mb-fg-primary` | `#e8f4ea` | Primary text (bone white) |
| `--mb-fg-secondary` | `#a8b4aa` | Secondary text |
| `--mb-fg-muted` | `#667066` | Muted / placeholder |
| `--mb-accent-poison` | `#39ff6a` | Primary action (radioactive green) |
| `--mb-accent-blood` | `#c8232c` | Destructive / emergency |
| `--mb-accent-amber` | `#ffb347` | Warning / caution lamp |
| `--mb-accent-bone` | `#f1e6c7` | Highlight / muted-accent |
| `--mb-accent-violet` | `#7b3ff2` | AI / supernatural |
| `--mb-accent-cyan` | `#42e2f5` | Sensor / telemetry |

**Semantic**
| `--mb-success` | `var(--mb-accent-poison)` |
| `--mb-warning` | `var(--mb-accent-amber)` |
| `--mb-danger`  | `var(--mb-accent-blood)` |
| `--mb-info`    | `var(--mb-accent-cyan)` |

**Typography**
- `--mb-font-display: 'Creepster', cursive` — section titles, splash, branding
- `--mb-font-mono: 'VT323', 'Courier New', monospace` — numeric readouts, logs, terminal
- `--mb-font-ui: system-ui, -apple-system, 'Segoe UI', sans-serif` — body, controls (legibility)
- Scale: xs 12 / sm 14 / base 16 / lg 18 / xl 22 / 2xl 28 / 3xl 40

**Spacing** (4px base): `--mb-space-0` 0, `1` 4, `2` 8, `3` 12, `4` 16, `5` 20, `6` 24, `7` 32, `8` 40, `9` 56, `10` 72

**Radius:** sm 4, md 8, lg 14, pill 999
**Shadow:** glow (neon outer), panel (soft drop), modal (heavy drop)
**Motion:** fast 120ms, base 200ms, slow 400ms
**Z-index:** base 0, sticky 100, overlay 200, modal 1050, tooltip 1080, toast 1100

---

## 8. Migration Candidates (for Phase 4)

**Inline `<script>` to extract to `/public/js/`:**
- `poses/editor.ejs` (750+ LOC) → `poses-editor-view.js`
- `scenes/scenes.ejs` (440+ LOC) → `scenes-list-view.js`
- `poses/index.ejs`, `live/index.ejs`, `conversation/index.ejs` — extract chunks

**Inline `<style>` to extract/replace with tokens:**
- `setup/calibration.ejs` 80 LOC → `servo-config.css` enhancement
- `poses/editor.ejs` 43 LOC → token-based utility classes
- `setup/{head,jaw}-animation.ejs` 42 LOC → shared `meter.css` component

**CSS files to consolidate:**
- `main.css` + `input.css` → merge `:root` into new `tokens.css`; split components into `components.css`
- `first-run.css` → fold into `main.css` or delete after Phase 4
- `video-configuration.css` → remove duplicate `.btn` overrides once `components.css` exists

---

## 9. Open Questions (confirm before Phase 2)

1. **Is the neon-green retro look (`#00ff00`) sacred?** The audit palette shifts to a slightly warmer poison-green (`#39ff6a`) for legibility. If `#00ff00` must stay, we keep it as `--mb-accent-poison`.
2. **Keep Bootswatch theme switching?** Currently 16 themes are installable. Recommend: keep the plumbing, but ship only 2–3 curated themes (e.g. `haunted-console`, `cold-crypt`, `bright-ops` for daylight setup work).
3. **Are the existing character portraits usable at dashboard-hero size?** Phase 3 wants a large character card — if portraits are low-res, we may need higher-res assets.
4. **Kiosk mode viable on the production RPi4?** Phase 3 plans a fullscreen mode — confirm the browser in use on Halloween night (Chromium kiosk, or touchscreen tablet over WiFi).
5. **Are there accessibility requirements?** WCAG contrast on neon-on-black can be borderline. Phase 2 will aim for AA on body text; confirm if AAA is required anywhere.

---

## Phase 1 Status: ✅ Complete

- [x] Routes mapped
- [x] Views catalogued
- [x] CSS inventoried
- [x] JS inventoried
- [x] Design tokens surveyed
- [x] Gap report written
- [x] Cluster assignments done
- [x] Halloween palette drafted
- [x] Migration candidates listed

**Next:** Phase 2 — create `tokens.css`, `components.css`, and the `/setup/style-guide` reference page. Awaiting user confirmation on the open questions above before starting.
