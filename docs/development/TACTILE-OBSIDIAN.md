# Tactile Obsidian — the MonsterBox house skin

The design system every MonsterBox page wears, introduced in v10.0.0 and applied
across all 27 pages. This document exists so a contributor who was not in that
session applies it correctly — and, more importantly, knows which two mistakes
to avoid, because the v10 sweep found both of them already shipped.

Implementation: `public/css/mb-obsidian.css` (the skin) on top of
`public/css/tokens.css` (the palette). Wired platform-wide by a single `<link>`
in `views/layouts/master.ejs` — which is also the rollback story: remove that one
line and the platform reverts.

Taught in-app at **`/setup/style-guide`**, which carries a Tactile Obsidian
section with live examples. When you change the system, change that page too.

## The three commitments

### 1 · Editorial serif is the monster's voice

`--mb-font-serif`, applied with `.mb-serif` or `.mb-dialogue`
(`mb-obsidian.css:65-70`).

Use it for anything the *character* says or is: dialogue, spoken lines, TTS
script text, scene and pose names in display contexts, character names and prose.
`.mb-dialogue` is the quoted-speech treatment; `.mb-serif` is the plain face.

Do **not** use it for UI copy. A button label is not dialogue.

### 2 · Technical mono is machine truth

`--mb-font-mono`, applied with `.mb-mono` (`mb-obsidian.css:71`, which also
covers `code`, `kbd`, `samp` and `.mb-console-output`).

If a machine measured it or assigned it, it is mono: telemetry, uptime, RSS, CPU,
servo latency, GPIO pins, PCA channels, angles and µs values, part and device
ids, IP addresses and hostnames, versions, file sizes and durations, cron
expressions, connection status, console output.

The test is provenance, not appearance: *did a machine produce this value?*

### 3 · Amber means happening-NOW, and nothing else

`--mb-accent-amber` (`tokens.css:75`), applied with `.mb-live`, `.mb-live-glow`,
or `.mb-now-pulse` (`mb-obsidian.css:77-93`).

Reserved for motion in flight: a running scene loop, a live stream, a playing
sound, a servo actually moving, an open agent socket. If it stops, the amber
stops.

The two neighbours it is constantly confused with:

- **Poison green** (`--mb-accent-poison`, the default `--mb-primary`) means
  **armed / enabled**. A superpower toggled on is poison. A superpower *doing
  something right now* is amber.
- **Blood** (`--mb-danger`) means **danger**: stop, delete, over-current, refusal.

## The two anti-patterns this sweep actually found

Both were live in the product before v10. They are the mistakes you will make.

**Blood red used for liveness.** `public/css/jaw-animation.css` lit the jaw page's
`.live-dot.active` in `--mb-danger` with a blood glow to indicate *TTS is
playing*. Playback is not an emergency. Danger red must never be repurposed as an
activity lamp — when everything urgent is red, nothing red is urgent.

**Poison green left standing while something streams.** On `/setup/audio`, the
Listen In and Talk Through badges stayed poison green while browser audio was
genuinely flowing. Poison said "this feature is armed" when the honest signal was
"audio is moving through this path right now." Both are amber now.

The general failure: reaching for whatever colour is already on the element
instead of asking *is this armed, or is this happening?*

## Verify, don't churn

The operator has been burned by big-bang restyles. The skin already re-dresses
shared components globally through `master.ejs`, so per-page work is deliberately
small:

1. **Minimal semantic hooks** where content plainly qualifies for serif, mono, or
   amber. Nothing else.
2. **A control audit**: every button, link-button, input and select needs a
   `title` (or `aria-label`, or a Bootstrap tooltip) so it names itself on hover.
   Adding that attribute is the *only* permitted markup addition.
3. **Evidence**: the view compiles, the page renders 200, and the change is
   eyeballed at 1280×800 and 390×844.

You may **not** restructure markup, rename ids or classes, rewrite JS logic, or
redesign layouts under a sweep. If a page needs more than hooks, record the
recommendation instead of doing it — that is how the v10 sweep surfaced six real
defects without breaking a single page.

Watch particularly for JS-generated controls: earlier tooltip waves only saw
static markup, so the controls a page builds at runtime were the ones missing
their titles.

## Applying it to a new page

- Read the page. Ask of each element: *did a machine produce this value* (mono),
  *is the character speaking* (serif), *is something moving right now* (amber).
- Leave armed states poison and destructive actions blood.
- Give every control a title that describes what it does, in active voice.
- Compile the view, render it, screenshot both viewports.
- If you add a new semantic class, document it here **and** on
  `/setup/style-guide`. A design system nobody can look up is a design system
  that decays.
