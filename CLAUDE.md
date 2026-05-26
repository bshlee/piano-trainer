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
| `render.js`  | `window.renderNote(container, pitch)` draws clef + one note. `window.renderClefOnly(container, clef)` draws an empty staff with just the clef. `window.renderFindStaff(container, clef, pitches, marks)` draws a tall staff with N placed pitches (whole notes spread horizontally) — returns `{bottomLineY, stepPx}` so the caller can map click Y → diatonic step. |
| `app.js`     | Shared infrastructure + Read Note mode: pitch utils, piano UI (`buildPiano(range)`), Web Audio synth, persistence, distribution stats, mode picker, mode dispatch. Exposes `window.PT_Audio`, `PT_Pitch`, `PT_Piano`, `PT_Settings`. |
| `mode-find.js` | Find Note mode: prompts a natural note, computes target MIDIs in the clef's range, listens for clicks on the staff SVG, snaps click Y to the nearest diatonic step, toggles placement, submits/judges. Exposes `window.PT_FindNote`. |
| `README.md`  | Human-facing docs (features, usage, dev setup). |
| `SETUP.md`   | Step-by-step new-device onboarding (clone, SSH key, push). |

## Code structure inside `app.js`

Sections are clearly demarcated with `// ----------` headers. In order:

1. **constants** — pitch maps + `PIANO_RANGES` (per mode/clef: `read`, `findTreble`, `findBass`)
2. **pitch utilities** — `pitchClass()`, `buildDiatonicList()`, `randomPitch()`, `midiFromStepOctave()`
3. **typed-answer parsing** — `parseAnswer()` (returns pitch-class 0–11 or null)
4. **DOM refs** — all `getElementById` lookups at top, including mode picker / chip / Find Note refs
5. **piano keyboard** — `buildPiano(range, {extended})` generates white/black keys for any MIDI range; routes clicks through `handleKey()` which dispatches by mode
6. **audio** — Web Audio additive-synthesis piano tone + iOS unlock pattern
7. **game state** — `loadSettings/Stats/Distribution` + saves; `settings` now also has `mode` (`'read'`/`'find'`/null) and `findNoteLang` (`'ko'`/`'en'`)
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
- Task: **tap the staff** at every position matching that pitch class within the clef's range. Click Y snaps to the nearest line/space (5 px per diatonic step, VexFlow default). Counter shows `placed / target`.
- **Piano keyboard is hidden** in this mode (`body[data-mode="find"] #piano { display: none }`). The drill is reading staff positions, not finding piano keys.
- **Clef ranges** (extend a few ledger lines beyond the staff so users practice ledger-line reading):
  - Treble: A3–E6 (MIDI 57–88)
  - Bass: C2–E4 (MIDI 36–64)
  - "Both" clef → picks one randomly per question.
- **Placement UX:** tap empty area on staff → note head appears at snapped position (with ledger line if outside the staff) + audio plays. Tap the same Y again → removes the placement. Submit button judges set equality. On wrong submit, placed notes color red (wrong picks) or green (correct picks); feedback text reports `expected N · missed N · X wrong`. Auto-advance to next question after feedback.
- **Distribution panel does NOT track Find Note rounds** — only Read Note generates pitched questions.

### Mode picker
- Full-screen overlay shown on **first launch only** (when `settings.mode` is null). After that, the app boots into the saved mode.
- Topbar **Mode chip** (`Mode: Read ▾`) reopens the picker on demand.
- Clef toggle is shared by both modes.

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
- `window.PT_Piano.build(range, {extended})`, `.keyByMidi(midi)`, `.scrollToMidi(midi)`, `.ranges`
- `window.PT_Settings.get()` — current settings object (mutate via `applyMode` / event handlers, then `saveSettings`)

To add a third mode (e.g. intervals):
1. Add a `<section id="mode-intervals">` in `index.html`; gate it with `body[data-mode="intervals"]` CSS.
2. Add `'intervals'` as a valid value in `loadSettings()` and the mode-picker option button.
3. Create `mode-intervals.js`, expose `window.PT_ModeIntervals.start()`, and route the piano-click handler in `app.js`'s `handleKey()`.
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
2. Read Note: take a treble round, a bass round, and a "both" round; type Western + Korean answers; click a white key and a black key.
3. Click the topbar Mode chip → switch to **Find Note**. Confirm: piano is hidden, tall staff renders with the chosen clef, 도 prompt + counter `0 / N`, tap on the staff places a note head (with ledger line if off-staff), tap the same Y to remove, Submit judges set equality.
4. Settings: in Read Note the accidental slider is visible and language radio is hidden; in Find Note it's the opposite. Toggle Find Note language between 한글 and English — prompt swaps.
5. Switch clef while in Find Note — staff redraws with the new clef, current question regenerates.
6. Open the distribution panel; play ≥10 Read Note notes; verify bars + expected-uniform marker render. Find Note rounds do NOT affect this panel.
7. Refresh — boots straight into the last-used mode, no picker.
8. **For mobile-affecting changes**, also test the deployed Pages URL on iPhone — narrow viewport, no zoom on input focus, audio plays after first tap (silent switch off), extended piano scrolls horizontally.

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
