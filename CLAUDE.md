# Sheet Music Trainer — project context for Claude

A personal-use static web app for practicing sheet-music reading on the treble (G-clef) and bass (F-clef) staves. Built so the owner (Sang Ho Lee, `bshlee` on GitHub) can drill on both his MacBook and his iPhone with no install.

Live at **https://bshlee.github.io/piano-trainer/** (GitHub Pages, deploys from `main` branch root, ~30s after each push).

## Hard constraints — don't violate without asking

- **No build step.** Four plain files (`index.html`, `render.js`, `mode-find.js`, `app.js`) plus VexFlow via CDN. Opening `index.html` directly must work. Don't introduce Vite/webpack/Node tooling. No ES modules — they break `file://` loading. New cross-file APIs are hung off the `window.PT_*` namespaces from `app.js`.
- **No npm dependencies.** All third-party code is loaded via `<script src="https://cdn..."`.
- **No secrets, no API keys, no backend.** Everything runs client-side. State persists in `localStorage` only. Don't add API calls or external services.
- **Mobile-first.** Every change must remain usable on iPhone (iOS Chrome + Safari). Touch targets ≥ 44px; layout must reflow on narrow viewports; audio must work after the iOS unlock pattern.
- **Don't replace VexFlow** without asking — it's chosen for SVG rendering quality on retina + mobile.

## Files

| File | Role |
|---|---|
| `index.html` | Markup, inline `<style>`, script tags. Loads VexFlow from `cdn.jsdelivr.net`. Hosts the mode-picker overlay and both mode sections (`#read-note`, `#find-note`). |
| `render.js`  | `window.renderNote(container, pitch)` draws clef + one note. `window.renderClefOnly(container, clef)` draws an empty staff with just the clef. `window.renderFindStaff(container, clef, pitches, marks)` draws a 200-px-tall staff with N notes (whole notes, displayed width capped at 480 px, centered via `.find-staff svg { margin: 0 auto }`). Marks drive feedback colors: `'correct'` (green), `'wrong'` (red), `'miss'` (ghost-green; added to the voice even if not in `pitches`). Internally calls `ctx.scale(SCALE, SCALE)` with `SCALE = 1.3` so glyphs and line spacing render 30% bigger — see the "Rendering & coordinate system" section below. Returns `{bottomLineY, stepPx, svgWidth, svgHeight, noteXs}` in **SVG-canvas (post-scale) units** so the caller can use them directly against click coords. |
| `app.js`     | Shared infrastructure + Read Note mode: pitch utils, piano UI (`buildPiano(range)`), Web Audio synth, persistence, distribution stats, mode picker, mode dispatch. Exposes `window.PT_Audio`, `PT_Pitch`, `PT_Piano`, `PT_Settings`. |
| `mode-find.js` | Find Note mode: prompts a natural note, computes target MIDIs in the clef's range, listens for pointer events on the staff SVG (pointerdown → preview marker → pointerup → toggle), submits/judges, manages the Submit↔Next button swap. Exposes `window.PT_FindNote`. |
| `README.md`  | Human-facing docs (features, usage, dev setup). |
| `SETUP.md`   | Step-by-step new-device onboarding (clone, SSH key, push). |

## Code structure inside `app.js`

Sections are clearly demarcated with `// ----------` headers. In order:

1. **constants** — pitch maps + `PIANO_RANGES` (only `read: { low: 60, high: 72 }`; Find Note hides the piano so it doesn't need a range here)
2. **pitch utilities** — `pitchClass()`, `buildDiatonicList()`, `randomPitch()`, `midiFromStepOctave()`
3. **typed-answer parsing** — `parseAnswer()` (returns pitch-class 0–11 or null)
4. **DOM refs** — all `getElementById` lookups at top, including mode picker / chip / Find Note refs
5. **piano keyboard** — `buildPiano(range)` generates white/black keys for the MIDI range; clicks route through `handleKey()` which no-ops in Find Note (piano is hidden)
6. **audio** — Web Audio additive-synthesis piano tone + iOS unlock pattern
7. **game state** — `loadSettings/Stats/Distribution` + saves; `settings` has `mode` (`'read'`/`'find'`/null) and `findNoteLang` (`'ko'`/`'en'`)
8. **render / judge / submit** (Read Note) — `newQuestion`, `submitTyped`, `submitPitchClass`, `judge`
9. **mode dispatch** — `applyMode()`, `showPicker()`, `hidePicker()`, picker + mode-chip handlers
10. **event wiring** — listeners for inputs/toggles; clef toggle dispatches by current mode
11. **shared API** — `window.PT_Audio`, `PT_Pitch`, `PT_Piano`, `PT_Settings` for mode-find.js
12. **boot** — sync UI to settings; if no saved mode → show picker, else `applyMode(settings.mode)`

## Design choices the user has agreed to (don't re-litigate)

### Read Note mode (the original drill)
- **Pitch class only** — answers are octave-agnostic. C4 and C5 both accept `C` / `도`.
- **Enharmonic equivalents accepted** — `C#` ≡ `Db`. The drill is "which piano key", not "spelling".
- **Korean solfège is the primary label** on piano white keys (bigger, dark). English is secondary (small, muted). The user explicitly chose this; there was once a lang toggle that got removed.
- **Default: piano labels hidden.** Settings toggle re-enables them.
- **Note ranges:** Treble `C4`–`C6`, Bass `C2`–`C4` (one ledger line above/below each staff).
- **Accidentals default to 30% probability**, slider-adjustable.
- **Piano keyboard:** one octave C4–C5, flex-fills the container.

### Find Note mode
- Prompt is a natural note name (default 도, toggle to `C` in Settings). Naturals only — accidentals deliberately excluded.
- Task: **tap the staff** at every position matching that pitch class within the clef's range. Click Y snaps to the nearest line/space — internally 5 px per diatonic step (VexFlow default), so 6.5 displayed px at `SCALE = 1.3`. Counter shows `placed / target`.
- **Piano keyboard is hidden** in this mode (`body[data-mode="find"] #piano { display: none }`). The drill is reading staff positions, not finding piano keys.
- **`.score` and `#distribution-panel` are also hidden** in Find Note — they only track Read Note rounds and would mislead.
- **Clef ranges** (extend a few ledger lines beyond the staff so users practice ledger-line reading):
  - Treble: A3–E6 (MIDI 57–88)
  - Bass: C2–E4 (MIDI 36–64)
  - "Both" clef → picks one randomly per question.

**Placement UX — drag-to-place with snap preview** (not pure tap):
- `pointerdown` on the staff → a colored preview marker (small oval) appears at the snapped Y.
- `pointermove` → the marker jumps **discretely** from one diatonic position to the next (no CSS transition on `top` — the smooth glide was removed deliberately because it felt freeflowing). Marker turns red when hovering an already-placed note (= "release to remove") *only when no note is being carried*.
- The original placed note stays visible throughout the drag — it's never removed mid-gesture. The preview oval anchors its X to the original note (via `staffRef.noteXs[originMidi]` returned from `renderFindStaff`), so the user sees "this preview is the modification of that note." Only Y changes as the finger moves up/down.
- `pointerup` → commit. The behavior depends on whether the snap ever changed during the gesture:
  - **Stationary tap** (snap never moved): toggle the tapped pitch — add if empty, remove if already placed. Preserves the original tap-to-toggle.
  - **Drag starting on an existing note** → empty target: atomic move (remove origin, add end). → origin or another existing note: no-op (move canceled — can't drop on occupied).
  - **Drag starting on empty space**: release on empty → add; release on an occupied snap → remove that occupied note (preserves the prior "drag to scrub off" behavior).
- A drag lets you scrub up/down for precision (matters for ledger-line notes like bass C2, which are 5 px apart and hard to hit with a fingertip).
- `touch-action: none` on `.find-staff` so iOS doesn't intercept the drag as a scroll.

**Undo / Clear buttons** (both ghost-style, left of Submit):
- **Undo** rewinds the last action in `opHistory` — `add` becomes delete, `remove` becomes re-add, `move` reverts `to`→`from`. Stationary "drag to restore origin" gestures don't push an op (nothing to undo), since they're no-ops. History is cleared on Clear, on new question (`start()`), and is not persisted across questions.
- **Clear** wipes `selectedMidis` and `opHistory`. No-ops when locked (during feedback review).

**Submit / feedback UX:**
- **Correct submit** → staff turns green, feedback says `✓ All N Cs found`, **auto-advances** after ~900 ms.
- **Wrong submit** → staff turns pink. Placed notes are recolored: green for correct, red for wrong. **Missed targets are also rendered**, as ghost-green notes (`rgba(30,122,50,0.42)`) in the same voice so the user sees where the answer should have been. Feedback text: `✗ expected N · missed M · X wrong`.
- **No auto-advance on wrong.** The Submit button swaps to **"Next"** so the user can study the corrected staff at their own pace; clicking Next clears state and starts a fresh question.
- Note heads cluster tightly (~70 px per note via formatter width clamp), so a 3-note answer doesn't sprawl across a 700-px staff.


### Mode picker
- Full-screen overlay shown on **first launch only** (when `settings.mode` is null). After that, the app boots into the saved mode.
- Topbar **Mode chip** (`Mode: Read ▾`) reopens the picker on demand.
- Clef toggle is shared by both modes.

## Rendering & coordinate system (Find Note staff)

`renderFindStaff` applies `ctx.scale(SCALE, SCALE)` to the VexFlow SVG context, with `SCALE = 1.3`. This makes every glyph (clef, note heads, ledger lines, staff lines) render 30% larger than VexFlow's native units. Three coordinate spaces are at play — keep them straight when modifying rendering or click math:

- **Internal coords (pre-scale)** — what VexFlow APIs accept and return: `stave.getYForLine(n)`, `note.getAbsoluteX()`, `Formatter.format(voice, width)`, the `x/y/width` arguments to `new VF.Stave(...)`. Everything passed to or returned from VexFlow is in this space.
- **SVG-canvas coords (post-scale)** — the SVG's viewport coordinate system. Equals internal × `SCALE`. This is what the SVG attribute `width="W"` and `height="H"` (set by `renderer.resize(W, H)`) refer to.
- **CSS pixels** — what `e.clientY`, `getBoundingClientRect()`, and `style.top/left` deal with in the DOM. Equals SVG-canvas if the SVG isn't CSS-scaled (i.e. container is wide enough that `max-width: 100%` doesn't shrink it). In the normal layout this is always the case because we cap intrinsic width at the parent's available width.

**Conversion rules used in the code**:
- Inside `renderFindStaff`: divide displayed targets by `SCALE` before handing to VexFlow (e.g. `staveTopY = 60 / SCALE` to place the stave at displayed Y=60). Multiply VexFlow's outputs by `SCALE` before returning (`bottomLineY: stave.getYForLine(4) * SCALE`, `stepPx: 5 * SCALE`, `noteXs[midi] = (note.getAbsoluteX() + 7) * SCALE`). The `+7` is half a whole-note head in *internal* units.
- In `mode-find.js`: `staffRef.bottomLineY`/`stepPx`/`noteXs` are in SVG-canvas coords. Click handlers convert CSS px → canvas coords via `clickY / (svgRect.height / staffRef.svgHeight)` — a defensive scale factor that is 1 in the normal layout but stays correct if the SVG ever gets CSS-shrunk. `showPreviewAtMidi` does the same on both axes.

**If you change `SCALE`**: nothing in `mode-find.js` should need changing — it operates entirely in canvas coords. Inside `renderFindStaff` you may want to revisit `staveTopY = 60 / SCALE` (room above stave for high ledger notes), the `height = 200` value (room below for low ledger notes), and the `formatWidth = items.length * 70 + 40` clustering (in internal units → display ≈ value × `SCALE`).

**Other layout knobs**:
- The displayed staff width is capped at 480 px by `Math.min(Math.max(parentW - 16, 280), 480)`. On wide screens the SVG is left at 480 wide and centered via `margin: 0 auto`. On phones it fills the parent width.
- One diatonic step is 5 internal units = 6.5 displayed px. The preview marker (`.find-preview`, 22×16) snaps discretely — there is **no CSS transition** on `top`, by design, so the user sees a clean step-by-step jump rather than a smooth glide.

## localStorage keys

- `piano-trainer:settings:v1` — `{ clefMode, accidentalRate, showLabels, mode, findNoteLang }`
  - `mode`: `'read' | 'find' | null` (null on first launch → triggers mode picker)
  - `findNoteLang`: `'ko' | 'en'` (default `'ko'`)
  - When adding new fields, prefer additive defaults over bumping `v1` so existing stats survive.
- `piano-trainer:stats:v1` — `{ correct, total, streak, best }` (Read Note only)
- `piano-trainer:dist:v1` — note-frequency distribution `{ byNote, naturals, sharps, flats, treble, bass, total }` (Read Note only)

If you change a schema in a backwards-incompatible way, bump the `:v1` suffix to `:v2` so old data is ignored (don't try to migrate — this is a personal app, fresh state is fine).

## How modes work (and how to add a new one)

The app dispatches by `settings.mode`. Two modes today: `'read'` and `'find'`. Each mode owns:
- A `<section>` in `index.html` (toggled visible via `body[data-mode]` CSS rules).
- A "start" entry point that builds the piano (via `window.PT_Piano.build(range, {extended})`) and renders its prompt.
- Its own submit/judge path. Read Note lives inline in `app.js`; Find Note lives in `mode-find.js` and is exposed as `window.PT_FindNote`.

Shared infrastructure exposed by `app.js` for other modes to use:
- `window.PT_Audio.play(midi)` — piano-tone synthesis
- `window.PT_Pitch.LETTER_TO_KO`, `PC_TO_LETTER_NATURAL`, `midiFromStepOctave(step,oct,alter)`
- `window.PT_Piano.build(range)`, `.ranges` (only `read` defined today)
- `window.PT_Settings.get()` — current settings object (mutate via `applyMode` / event handlers, then `saveSettings`)

To add a third mode (e.g. intervals):
1. Add a `<section id="mode-intervals">` in `index.html`; gate it with `body[data-mode="intervals"]` CSS. Also add CSS to hide whatever shared chrome (`.score`, `#distribution-panel`, `#piano`) is irrelevant for the new mode.
2. Add `'intervals'` as a valid value in `loadSettings()` and the mode-picker option button.
3. Create `mode-intervals.js`, expose `window.PT_ModeIntervals.start()`. If the mode reuses the piano, the existing `handleKey()` dispatch already routes via `settings.mode`; if not (like Find Note), guard with `if (settings.mode === '<name>') return;`.
4. Branch `applyMode()` to call the new mode's `start()`.

## Dev workflow

```sh
# Local edit + test
open index.html                            # opens in default browser, works from file://
python3 -m http.server 8000                # alt: serve over HTTP if you want LAN access

# Commit + deploy (auto via Pages, ~30s)
git add -A
git commit -m "..."
git push
```

GitHub Pages config: source = "Deploy from a branch", branch = `main`, folder = `/ (root)`. No workflow file, no Jekyll, no build.

## Known gotchas

- **OneDrive locks `.git/index` occasionally.** Repo lives inside an OneDrive-synced folder. If `git add` fails with "unable to map index file: Operation timed out", retry after a few seconds; OneDrive's file provider is just briefly holding a lock.
- **iOS silent switch mutes Web Audio.** Even with the unlock pattern, the hardware silent switch on iPhone mutes Web Audio. There is no browser workaround. Document in user-facing help if a user reports "no sound on iPhone".
- **`gh` CLI is not installed** on the dev machine. Use plain `git` over SSH (`git@github.com:bshlee/piano-trainer.git`). HTTPS push will fail — no credential is stored in Keychain.

## Verification before claiming a change works

1. Open `index.html` in Chrome. First-ever load shows the mode picker; pick **Read Note**.
2. Read Note: take a treble round, a bass round, and a "both" round; type Western + Korean answers; click a white key and a black key. Score / streak / distribution should all update.
3. Click the topbar Mode chip → switch to **Find Note**. Confirm:
   - Piano is hidden; `.score` and `#distribution-panel` are hidden too.
   - Tall staff renders with the chosen clef.
   - 도 prompt + counter `0 / N`.
   - Press-and-hold on the staff shows a colored preview marker; sliding up/down moves it step-by-step.
   - Releasing on an empty position places a note (with ledger line if off-staff). Releasing on an existing note removes it (the preview turns red while hovering one).
   - **Drag-to-move**: press a placed note and drag up/down — the original note stays on the staff; a blue preview oval (aligned horizontally with the original) follows the snap position. Release on empty = move; release on origin or another placed note = no-op (move canceled).
   - **Submit (correct)** → green wash, auto-advances after ~900 ms.
   - **Submit (wrong)** → pink wash, placed notes recolored green/red, missed targets shown as ghost-green notes, button swaps to **Next**, no auto-advance.
   - **Undo** rewinds the last add/remove/move. **Clear** wipes all placements mid-round and resets undo history.
4. Settings: in Read Note the accidental slider is visible and language radio is hidden; in Find Note it's the opposite. Toggle Find Note language between 한글 and English — prompt swaps.
5. Switch clef while in Find Note — staff redraws with the new clef (treble A3–E6 vs bass C2–E4), current question regenerates.
6. Refresh — boots straight into the last-used mode, no picker.
7. **For mobile-affecting changes**, also test the deployed Pages URL on iPhone — narrow viewport, no zoom on input focus, audio plays after first tap (silent switch off), drag-place works with a finger (the `touch-action: none` on `.find-staff` is what keeps iOS from intercepting the drag as a scroll).

## Future roadmap

**Planned add-ons for Read Note** (designed, not yet implemented — see `/Users/shlee/.claude/plans/now-i-want-to-modular-neumann.md`):
- **Mic Input** — accept piano-played answers via `getUserMedia` + autocorrelation/YIN pitch detection. Toggle in Settings; gated by user gesture for iOS.
- **Multi-Note Strip** — sight-reading practice with 1–6 notes side-by-side; highlight the current note; advance on correct answer. Synergizes with Mic Input.

**Other confirmed (don't build without confirmation):**
- Interval recognition mode
- Chord identification mode
- Key signature drill
- Audio drill (hear note → identify)

**Possible but not requested:**
- PWA manifest for proper home-screen install
- Cross-device progress sync (would need a backend — currently out of scope)
- Accidentals for Find Note mode (deliberately excluded from v1)
