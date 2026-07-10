# Sheet Music Trainer — project context for Claude

A personal-use static web app for practicing sheet-music reading on the treble (G-clef) and bass (F-clef) staves. Built so the owner (Sang Ho Lee, `bshlee` on GitHub) can drill on both his MacBook and his iPhone with no install.

Live at **https://bshlee.github.io/piano-trainer/** (GitHub Pages, deploys from `main` branch root, ~30s after each push).

## Hard constraints — don't violate without asking

- **No build step.** Plain files (`index.html`, `render.js`, `app.js`, and one `mode-*.js` per mode) plus libraries via CDN. Opening `index.html` directly must work *for Read/Find/Harmony* — though the **real sampled piano needs an http(s) origin + network** (it fetches samples from a CDN); on bare `file://` or offline, audio falls back to the built-in synth (see "Audio" below). Don't introduce Vite/webpack/Node tooling. No ES modules — they break `file://` loading. New cross-file APIs are hung off the `window.PT_*` namespaces from `app.js`. (Exception: `tools/split-czerny.mjs` is an offline, dev-only data-prep script — its *output* is static files; it is never loaded by the app, so the no-build property holds.)
- **No npm dependencies.** All third-party code is loaded via `<script src="https://cdn..."`. Three CDN libs today: **VexFlow** (always), **OpenSheetMusicDisplay (OSMD)** (lazy-injected by `mode-czerny.js` only when Czerny mode is first opened), and **soundfont-player** (lazy-injected by `app.js`'s `loadSampledPiano()` on the first audio gesture, for the real recorded grand piano — MusyngKite `acoustic_grand_piano`). OSMD bundles its own VexFlow internally; it does not replace the app's VexFlow usage.
- **Czerny mode needs an http(s) origin**, not `file://` — it `fetch()`es score files from `data/czerny/`, which `file://` blocks. The deployed Pages site works; locally run `python3 -m http.server`. The other three modes still work from `file://`.
- **No secrets, no API keys, no backend.** Everything runs client-side. State persists in `localStorage` only. Don't add API calls or external services.
- **Mobile-first.** Every change must remain usable on iPhone (iOS Chrome + Safari). Touch targets ≥ 44px; layout must reflow on narrow viewports; audio must work after the iOS unlock pattern.
- **Don't replace VexFlow** without asking — it's chosen for SVG rendering quality on retina + mobile.

## Files

| File | Role |
|---|---|
| `index.html` | Markup, inline `<style>`, script tags. Loads VexFlow from `cdn.jsdelivr.net`. Hosts the mode-picker overlay and the five mode sections (`#read-note`, `#find-note`, `#harmony`, `#czerny`, `#intervals`). |
| `render.js`  | `window.renderNote(container, pitch)` draws clef + one note (Read Note, single-note mode) — implemented as a delegation to `renderStrip` with a one-pitch array (identical output). `window.renderInterval(container, notes)` draws a harmonic dyad (two stacked whole notes, treble clef, alters −2…2 incl. `##`/`bb`) for Intervals mode; built as **two joined voices** rather than one two-key StaveNote because VexFlow 4.2.3 only auto-displaces noteheads for seconds (line diff exactly 0.5) — a unison in a single chord note would draw both heads in the same spot, while joined voices go through the collision formatter (lower note must be voice 1; the second voice's head gets x-shifted). `window.renderClefOnly(container, clef)` draws an empty staff with just the clef. `window.renderStrip(container, pitches, currentIndex)` draws N (1–4) whole notes side-by-side on a single-clef staff for Read Note's multi-note strip; when N > 1 a small blue triangular caret is drawn under the note at `currentIndex` to mark the active one. `window.renderFindStaff(container, clef, pitches, marks)` draws a 200-px-tall staff with N notes for Find Note (whole notes, displayed width capped at 480 px, centered via `.find-staff svg { margin: 0 auto }`). `marks` drive feedback colors: `'correct'` (green), `'wrong'` (red), `'miss'` (ghost-green; added to the voice even if not in `pitches`). `renderFindStaff` internally calls `ctx.scale(SCALE, SCALE)` with `SCALE = 1.3` so glyphs and line spacing render 30% bigger — see the "Rendering & coordinate system" section below — and returns `{bottomLineY, stepPx, svgWidth, svgHeight, noteXs}` in **SVG-canvas (post-scale) units**. `renderStrip` / `renderNote` use native VexFlow units (no `ctx.scale`). |
| `app.js`     | Shared infrastructure + Read Note mode: pitch utils, piano UI (`buildPiano(range)`), Web Audio synth, persistence, distribution stats, mode picker, mode dispatch. Exposes `window.PT_Audio`, `PT_Pitch`, `PT_Piano`, `PT_Settings`. |
| `mode-find.js` | Find Note mode: prompts a natural note, computes target MIDIs in the clef's range, listens for pointer events on the staff SVG (pointerdown → preview marker → pointerup → toggle), submits/judges, manages the Submit↔Next button swap. Exposes `window.PT_FindNote`. |
| `mode-harmony.js` | Harmony mode: generates diatonic chord progressions in a key (circle-of-fifths order), builds RH triad + LH root, judges the held MIDI set (octave-exact) and advances through the progression. All music theory (major-scale spelling, triads, Roman numerals) lives here. Exposes `window.PT_Harmony` (`start`, `onMidi`, `handleResize`). Renders via `window.renderHarmony`. |
| `mode-czerny.js` | Czerny mode: lazy-loads OSMD, renders a study's MusicXML, builds an ordered event list from the OSMD cursor (`{notes:[{midi,staff}]}` per onset), and matches MIDI note-ons against the current event to advance the cursor (tempo-free). Study 1–100 picker, Hands setting, per-study completion. Exposes `window.PT_Czerny` (`start`, `onNoteOn`, `onNoteOff`, `handleResize`). |
| `mode-intervals.js` | Intervals mode: shows a two-note dyad on a treble staff; the user names the interval by clicking a Quality button + a Number button (1st–8th), then Submit. All interval theory (number/quality classification, chromatic generation) lives here. Exposes `window.PT_Intervals` (`start`, `submit`, `handleResize`). Renders via `window.renderInterval`. |
| `data/czerny/` | `NNN.musicxml` (per study) + `index.json` (`[{n,title,measures}]`), fetched at runtime. Generated by `tools/split-czerny.mjs`. `001.musicxml` is currently the user's provided sample (see "Czerny mode" below). |
| `tools/split-czerny.mjs` | Offline, dev-only Node splitter: combined Op. 139 MusicXML → per-study files + `index.json`. Not loaded by the app. |
| `README.md`  | Human-facing docs (features, usage, dev setup). |
| `SETUP.md`   | Step-by-step new-device onboarding (clone, SSH key, push). |

## Code structure inside `app.js`

Sections are clearly demarcated with `// ----------` headers. In order:

1. **constants** — pitch maps + `PIANO_RANGES` (only `read: { low: 60, high: 72 }`; Find Note hides the piano so it doesn't need a range here)
2. **pitch utilities** — `pitchClass()`, `buildDiatonicList()`, `randomPitch()`, `midiFromStepOctave()`
3. **typed-answer parsing** — `parseAnswer()` (returns pitch-class 0–11 or null)
4. **DOM refs** — all `getElementById` lookups at top, including mode picker / chip / Find Note refs
5. **piano keyboard** — `buildPiano(range)` generates white/black keys for the MIDI range; clicks route through `handleKey()` which no-ops in Find Note (piano is hidden)
6. **audio** — `playMidi()` dispatcher: prefers a **real sampled grand** (`loadSampledPiano()` lazy-loads soundfont-player + MusyngKite `acoustic_grand_piano` from a CDN on the first gesture; cached after), and falls back to `playSynth()` (Web Audio additive tone: detuned unison strings, two-stage decay, time-varying lowpass, inharmonic partials) until/unless the samples are ready or when offline/`file://`. + iOS unlock pattern (which also kicks off the sample preload).
7. **game state** — `loadSettings/Stats/Distribution` + saves; `settings` has `mode` (`'read'`/`'find'`/null) and `findNoteLang` (`'ko'`/`'en'`)
8. **render / judge / submit** (Read Note) — `newQuestion`, `submitTyped`, `submitPitchClass`, `submitMidi`, `judge` (pitch-class), `resolveJudge(ok)` (shared advance/retry/stats body used by both answer paths)
9. **mode dispatch** — `MODE_LABELS` (valid modes + chip labels), `MODE_IMPL` (registry of lazy `() => window.PT_*` lookups for the modes living in their own files; Read is the inline fallback), `applyMode()`, `showPicker()`, `hidePicker()`, picker + mode-chip handlers
9b. **MIDI input** — `// ---------- MIDI input` section: Web MIDI lifecycle (`updateMidiState`, `enableMidi`/`disableMidi`, `bindMidiInputs`, `handleMidiMessage`). `handleMidiMessage` maintains a live `heldNotes` Set (parses note-off too) and **routes by mode**: Read → `submitMidi(note)`; Harmony → `PT_Harmony.onMidi(note, heldNotes, isOn)` (fired on note-on *and* note-off so releases re-check the chord); Czerny → `PT_Czerny.onNoteOn/onNoteOff`. No mode plays audio — an external MIDI source does.
10. **event wiring** — listeners for inputs/toggles; clef toggle dispatches by current mode
11. **shared API** — `window.PT_Audio`, `PT_Pitch`, `PT_Piano`, `PT_Settings` for mode-find.js
12. **boot** — sync UI to settings; if no saved mode → show picker, else `applyMode(settings.mode)`

## Design choices the user has agreed to (don't re-litigate)

### Read Note mode (the original drill)
- **Pitch class only** (typed/clicked answers) — octave-agnostic. C4 and C5 both accept `C` / `도`.
- **Enharmonic equivalents accepted** — `C#` ≡ `Db`. The drill is "which piano key", not "spelling".
- **USB-MIDI keyboard input** (Settings → "MIDI input", default **on**) — play the answer on a connected MIDI piano (e.g. Roland FP-10) instead of typing/clicking. Feeds into the same judge/strip/retry flow via `submitMidi(midi)`. Unlike typed/clicked input this is **octave-exact** — the played key's absolute MIDI must equal the target's (`midiFromStepOctave(step, octave, alter)`); C4 ≠ C5. Enharmonics still match (same key = same MIDI number). The app plays **no audio** on this path — an external MIDI sound source (PianoTeq etc.) owns the sound, so calling `PT_Audio.play` here would double the tone. Web MIDI is **Chrome/Edge desktop only** — on Safari/iOS the toggle is disabled with a hint and typing/clicking still work. On a wrong MIDI answer the feedback names the exact key played, with octave (`describeMidi(midi)`, black keys spelled as sharps) — e.g. `✗ played C4 — was C5` (single-note) or `✗ played C4 — try again` (strip mode, which still doesn't reveal the target). Typed/clicked answers carry no key info so their feedback is unchanged. Lives in the `// ---------- MIDI input` section of `app.js`; handles device hotplug via `MIDIAccess.onstatechange`; exposed as `window.PT_Midi = { isSupported, updateState }`.
- **Korean solfège is the primary label** on piano white keys (bigger, dark). English is secondary (small, muted). The user explicitly chose this; there was once a lang toggle that got removed.
- **Default: piano labels hidden.** Settings toggle re-enables them.
- **Note ranges:** Treble `C4`–`C6`, Bass `C2`–`C4` (one ledger line above/below each staff).
- **Accidentals default to 30% probability**, slider-adjustable.
- **Piano keyboard:** one octave C4–C5, flex-fills the container.
- **Multi-note strip (1–4 notes)** — "Notes per round" slider in Settings. State lives in `currentStrip` (array) + `currentIndex`. One clef is picked for the whole strip (mixed clefs would require a grand staff). Per-question flow:
  - `N === 1`: original flashcard behavior — answer reveals correct pitch on wrong, auto-advances after the delay.
  - `N > 1`: caret marks the active note. Correct answer flashes green and advances the caret to the next note; finishing the last note rolls a fresh strip. **Wrong answer = retry**: the staff flashes pink with `✗ try again` (the correct pitch is *not* revealed — the whole point of strip mode is to actually learn each note), streak resets, but the caret stays on the same note until the user gets it right. Stats are per-note (each attempt counts toward `total`; each correct attempt counts toward `correct` and `streak`).
  - Slider change regenerates the current strip immediately so the new size takes effect without waiting for next question.

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


### Harmony mode
- **Grand staff** (treble + bass joined by a brace, via `renderHarmony` in `render.js`). Read the chord shown and **play it on the MIDI keyboard** — LH plays the root (bass clef), RH plays the triad (treble clef). Header shows the chord **name + Roman numeral + key**.
- **Theory generation** (all in `mode-harmony.js`): keys cycle the **circle of fifths** (`['C','G','D','A','E','B','Gb','Db','Ab','Eb','Bb','F']`, which double as VexFlow key-sig specs). `majorScale(key)` spells each degree (letter + alter ∈ {-1,0,1}); diatonic triads I ii iii IV V vi vii° with proper qualities. **Seventh chords** (Chords = Seventh/Mixed) add the degree-7 tone for a 4-note RH voicing — `SEVENTH_QUALITY`/`SEVENTH_ROMAN`/`SEVENTH_NAME` give `Imaj7 ii7 iii7 IVmaj7 V7 vi7 viiø7`; `buildChord(degree, seventh)` builds either, `showChord` picks per chord (always for Seventh, 50/50 for Mixed). Chord tones are **diatonic**, so notes render by **letter+octave only** — the key signature implies the accidentals (no per-note `Accidental` modifiers).
- **Key selection** (Settings → Keys): `'circle'` advances around the circle on each completed progression; `'random'` jumps anywhere; `'fixed'` drills only the keys checked in the "Keys to drill" checkbox grid (`harmonyKeys`). The checkbox row only shows in `'fixed'` mode; at least one key must stay checked.
- **Progressions**: canonical sets (`I–IV–V–I`, `ii–V–I`, `I–V–vi–IV`, `I–vi–IV–V`, or "Mixed"). A round walks one progression; finishing advances the key around the circle (or randomizes, per the Keys setting).
- **Multi-chord rounds** (Settings → "Chords per round", `harmonyPerRound` 1–4): renders up to N consecutive chords of the progression side-by-side on the grand staff with a blue caret under the **active** chord (mirroring Read Note's strip). You play the highlighted chord → it flashes green and the caret advances; completed chords stay green, upcoming stay black. When the visible window is finished it slides to the next chunk of the progression; when the progression is exhausted a fresh one rolls (advancing the key in circle mode). `windowStart`/`windowChords`/`activeInWindow` hold the window state; `renderHarmony` takes `{keySpec, chords:[{treble,bass}], activeIndex, marks}` (legacy single-chord `{treble,bass}` shape still accepted). `N === 1` is the original one-chord-at-a-time flow.
- **Judging**: octave-exact **set match** — the held MIDI set must equal the target (RH triad ∪ LH root) of the **active** chord. Re-checked on note-on *and* note-off, so releasing a wrong extra note lets a correct chord register. Wrong note → red flash + which key it was; correct → green + advance. "Show notes" reveals the note names; "Skip chord" / "New progression" controls.

### Czerny mode (Op. 139 play-along)
- Renders a study's **MusicXML via OSMD** (lazy-loaded from CDN on first entry) and walks it **note-by-note with the OSMD cursor**. You must play each note/chord to advance — **tempo is ignored, note accuracy only**.
- **Event model** (`mode-czerny.js` `buildEvents`): walk `osmd.cursor.Iterator` (`CurrentVoiceEntries` → `Notes`); each cursor position = one event `{notes:[{midi, staff}]}`. MIDI = `note.halfTone + 12`; rests via `note.isRest()`; **staff index = `ParentStaff.idInMusicSheet`** (0 = top/right hand, 1 = bottom/left — works for both 2-staff scores and 2-part exports where each part's `Staff.Id` is 1).
- **Matching**: per-event onset accumulator. A note-on that's in the current event's expected set accumulates; when all expected are played → advance (`osmd.cursor.next()`). A note-on **not** expected → error feedback and **block** (must play the right note to proceed). Rest/empty-for-hand events auto-skip. **Hands** setting (Both/Right/Left) filters expected notes by staff.
- **Data**: `data/czerny/NNN.musicxml` + `index.json`, fetched at runtime (needs http origin — see constraints). `001.musicxml` is **the user's provided sample** — a ~160-measure, 2-part, music21-processed MusicXML that does **not** cleanly map to all 100 studies (no per-study delimiters, no tempo marks). The picker shows whatever `index.json` lists. To get the real 100 split, feed a properly-delimited Op. 139 MusicXML through `tools/split-czerny.mjs`.
- Per-study completion persists in `piano-trainer:czerny:v1`. "Studies ▾" toggles the 1–N picker; "Restart" replays from the top.

### Intervals mode
- **Two stacked whole notes** (harmonic dyad) on a **treble-only** staff, rendered by `renderInterval`. The lower note always sits in the middle octave (C4–B4); the interval number is 1–8, so the top note maxes out at B5.
- **Answer UI**: two button groups — **Quality** (Doubly dim / Diminished / Minor / Perfect / Major / Augmented / Doubly aug) and **Number** (1st–8th) — pick one of each, then **Submit** judges the combination. English labels only, one interval per question. Buttons use the `.on` accent highlight (clef-toggle look); groups are `.ivl-group` CSS grids (number = 4 columns, quality = `auto-fit minmax(96px, 1fr)` so it wraps on phones; all ≥44 px tall).
- **Level setting** (Settings → Level, `intervalsLevel`):
  - `'basic'` (default): both notes natural. Occurring qualities: P/M/m plus the two naturals-only oddballs A4 (F–B) and d5 (B–F). The Doubly dim/aug buttons are hidden (`#intervals[data-level="basic"] .chromatic-only { display:none }`, driven by `sectionEl.dataset.level`).
  - `'chromatic'`: accidentals up to double sharps/flats on either note; asked qualities span dd→AA for 1,4,5,8 (perfect class) and dd/d/m/M/A/AA for 2,3,6,7 (major class). Generation picks number + quality first, then solves `alterUp − alterLow = requiredSemitones − naturalSemitones` with both alters clamped to [−2, 2] (the window is never empty — no re-roll loop). **Diminished/doubly-diminished unisons are excluded** (an interval can't be smaller than a perfect unison).
- **Theory** (all in `mode-intervals.js`): quality = lookup of `semitones − BASE[number]` (`BASE = {1:0,2:2,3:4,4:5,5:7,6:9,7:11,8:12}`); perfect-class diff table `−2..+2 = dd,d,P,A,AA`, major-class `−3..+2 = dd,d,m,M,A,AA`.
- **Flow**: correct → `✓ Perfect 4th`, green wash, auto-advance ~900 ms. Wrong → `✗ was Minor 6th`, pink wash, the correct quality/number buttons get `.reveal-correct` (green outline) and the user's differing picks `.reveal-wrong` (red outline), Submit swaps to **Next**, no auto-advance (mirrors Find Note's `awaitingNext` pattern). Group clicks are ignored while locked/awaiting Next.
- **Audio**: the dyad is played (both notes together via `PT_Audio.play` ×2) when a question appears and again on submit. On a cold refresh straight into Intervals the first dyad may be silent (AudioContext still locked until the first gesture — standard app-wide contract); it self-heals from the first tap.
- **No MIDI, no piano, no stats** — answers are buttons only; `.mode-play` rows are hidden like in Find Note.

### Mode picker
- Full-screen overlay shown on **first launch only** (when `settings.mode` is null). After that, the app boots into the saved mode.
- Topbar **Mode chip** (`Mode: Read ▾`) reopens the picker on demand. Five options: Read, Find, Harmony, Czerny, Intervals.
- Clef toggle is shared by Read + Find only (hidden in Harmony/Czerny/Intervals — they fix their own clefs).
- **Mode dispatch** in `app.js`: `MODE_LABELS` gates valid modes; `applyMode()` looks up `MODE_IMPL[mode]` (registry of `() => window.PT_*` getters) and calls its `start()`, falling back to the inline Read branch; the resize listener uses the same registry for `handleResize()`. CSS `body[data-mode]` rules show one `<section>` and hide irrelevant chrome (`#piano`, `.score`, `#distribution-panel`, clef toggle). Settings groups are scoped by `.mode-{read|find|harmony|czerny|intervals}-only`; MIDI rows use `.mode-play` (shown in Read/Harmony/Czerny, hidden in Find/Intervals).

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

- `piano-trainer:settings:v1` — `{ clefMode, accidentalRate, showLabels, mode, findNoteLang, notesPerStrip, midiInput, harmonyProgression, harmonyKeyMode, harmonyKeyIndex, harmonyKeys, harmonyChords, harmonyPerRound, czernyHands, czernyStudy, intervalsLevel }`
  - `mode`: `'read' | 'find' | 'harmony' | 'czerny' | 'intervals' | null` (null on first launch → triggers mode picker)
  - `findNoteLang`: `'ko' | 'en'` (default `'ko'`)
  - `notesPerStrip`: integer 1–4, default `1` (Read Note multi-note strip size)
  - `midiInput`: boolean, default `true` (USB-MIDI keyboard input; ignored where Web MIDI is unsupported)
  - `harmonyProgression`: `'mixed' | 'I-IV-V-I' | 'ii-V-I' | 'I-V-vi-IV' | 'I-vi-IV-V'` (default `'mixed'`)
  - `harmonyKeyMode`: `'circle' | 'random' | 'fixed'` (default `'circle'`); `harmonyKeyIndex`: 0–11 into the circle-of-fifths array (the *current* key)
  - `harmonyKeys`: array of 0–11 circle indices (default `[0]` = C) — the keys drilled in `'fixed'` mode (multi-select checkboxes; one → stays put, many → random pick per progression avoiding immediate repeat)
  - `harmonyChords`: `'triads' | 'sevenths' | 'mixed'` (default `'triads'`) — triad (3 notes) vs diatonic seventh (4 notes); `'mixed'` randomly throws sevenths in per chord
  - `harmonyPerRound`: integer 1–4 (default `1`) — how many consecutive progression chords show on the grand staff at once (multi-chord "round", caret-marked like Read Note's strip)
  - `czernyHands`: `'both' | 'right' | 'left'` (default `'both'`); `czernyStudy`: last study number (default `1`)
  - `intervalsLevel`: `'basic' | 'chromatic'` (default `'basic'`) — Intervals mode difficulty (naturals only vs accidentals + dd/AA qualities)
  - When adding new fields, prefer additive defaults over bumping `v1` so existing stats survive.
- `piano-trainer:stats:v1` — `{ correct, total, streak, best }` (Read Note only)
- `piano-trainer:dist:v1` — note-frequency distribution `{ byNote, naturals, sharps, flats, treble, bass, total }` (Read Note only)
- `piano-trainer:czerny:v1` — `{ completed: { <n>: true } }` (per-study completion in Czerny mode)

If you change a schema in a backwards-incompatible way, bump the `:v1` suffix to `:v2` so old data is ignored (don't try to migrate — this is a personal app, fresh state is fine).

## How modes work (and how to add a new one)

The app dispatches by `settings.mode`. Five modes today: `'read'`, `'find'`, `'harmony'`, `'czerny'`, `'intervals'`. Each mode owns:
- A `<section>` in `index.html` (toggled visible via `body[data-mode]` CSS rules).
- A "start" entry point. Read lives inline in `app.js`; the others live in `mode-*.js`, expose `window.PT_FindNote` / `PT_Harmony` / `PT_Czerny` / `PT_Intervals`, and are registered in `app.js`'s `MODE_IMPL` (used by both `applyMode()` and the resize listener).
- Its own input/judge path. MIDI is routed by mode in `handleMidiMessage` (see Code structure §9b); pointer input (Find), typed/click input (Read), and button-group input (Intervals) are wired in their own files.

Shared infrastructure exposed by `app.js` for other modes to use:
- `window.PT_Audio.play(midi)` — piano-tone synthesis (Read only; MIDI modes stay silent)
- `window.PT_Pitch.LETTER_TO_KO`, `PC_TO_LETTER_NATURAL`, `STEP_TO_PC`, `midiFromStepOctave(step,oct,alter)`, `describeMidi(midi)`
- `window.PT_Piano.build(range)`, `.ranges` (only `read` defined today)
- `window.PT_Settings.get()` / `.save()` — current settings object (mutate then `save()`)

To add a sixth mode (e.g. keysig):
1. Add a `<section id="keysig">` in `index.html`; show it via `body[data-mode="keysig"] #keysig { display:block }` and hide irrelevant chrome. Add a picker button `data-pick-mode="keysig"`.
2. Add `'keysig'` to the `loadSettings()` mode allow-list and to `MODE_LABELS` in `app.js` (the picker handler + chip label both key off it).
3. Create `mode-keysig.js`, expose `window.PT_KeySig` with `start()` and `handleResize()` (+ `onMidi`/`onNoteOn` if MIDI-driven). Add a `<script>` before `app.js`.
4. Register it in `MODE_IMPL` in `app.js` (`keysig: () => window.PT_KeySig`) — that covers both `applyMode()` and the resize listener. Route MIDI in `handleMidiMessage` only if the mode takes MIDI input.

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
2. Read Note (single-note): take a treble round, a bass round, and a "both" round; type Western + Korean answers; click a white key and a black key. Score / streak / distribution should all update. Wrong answer reveals the correct pitch and auto-advances.
3. Read Note (multi-note): bump "Notes per round" to 3 in Settings. The staff shows three notes side-by-side with a blue caret under the first. Answer correctly → caret slides to the next note (no new strip yet); finish all three → a new strip rolls in. Answer wrong → pink wash + `✗ try again` (no answer reveal), caret stays on the same note. Streak resets to 0 on wrong but doesn't on caret-advance. Slider change while answering should regenerate the strip in place.
3b. Read Note (MIDI input, Chrome desktop + a connected MIDI keyboard): Settings → enable **MIDI input**; approve the browser prompt; `#midi-status` shows the device name. Play the **exact** note shown → green advance; play the **right letter, wrong octave** → judged wrong (octave-exact). Confirm the app itself stays silent (external sound source only). Unplug/replug mid-session → status updates and input keeps working. In Safari/iOS the toggle is disabled with a "use Chrome desktop" hint while typing/clicking still answer. Switching to Find Note makes played keys do nothing.
3c. **Harmony** (Chrome desktop + MIDI keyboard): pick Harmony. Grand staff shows a chord with key signature; header shows name + Roman numeral + key. Play the exact chord (LH root + RH triad) → green ✓ and advance; wrong/missing note → red flash naming the bad key, stays put. Finishing the progression rolls a new one and the key advances around the circle of fifths. "Show notes" reveals names. App stays silent (PianoTeq only).
3d. **Czerny** (served over http, e.g. `python3 -m http.server`; MIDI keyboard): pick Czerny → a study renders via OSMD with the cursor on the first note, progress `0 / N`. Play the notes in order → cursor advances regardless of tempo; chords need all notes; a wrong note shows `✗ … expected …` and blocks until corrected. "Studies ▾" opens the 1–N picker; "Restart" goes to the top; finishing marks the study done (green in the picker). Try Hands = Right/Left. (On `file://` it shows the "serve over http" hint instead.)
3e. **Intervals**: pick Intervals. Treble staff shows two stacked whole notes (both sound if audio is unlocked); piano/score/clef-toggle/MIDI rows hidden. Basic level shows 5 quality buttons. Pick quality + number → Submit: correct → green `✓ Perfect 4th` + auto-advance; wrong → pink `✗ was …`, correct buttons outlined green, your wrong picks red, button swaps to **Next** (no auto-advance), other buttons ignore clicks until Next. Settings → Level → Chromatic: Doubly dim/aug buttons appear, question regenerates, notes can carry ♯/♭/𝄪/♭♭. Unisons render as two side-by-side heads and are never diminished.
4. Click the topbar Mode chip → switch to **Find Note**. Confirm:
   - Piano is hidden; `.score` and `#distribution-panel` are hidden too.
   - Tall staff renders with the chosen clef.
   - 도 prompt + counter `0 / N`.
   - Press-and-hold on the staff shows a colored preview marker; sliding up/down moves it step-by-step.
   - Releasing on an empty position places a note (with ledger line if off-staff). Releasing on an existing note removes it (the preview turns red while hovering one).
   - **Drag-to-move**: press a placed note and drag up/down — the original note stays on the staff; a blue preview oval (aligned horizontally with the original) follows the snap position. Release on empty = move; release on origin or another placed note = no-op (move canceled).
   - **Submit (correct)** → green wash, auto-advances after ~900 ms.
   - **Submit (wrong)** → pink wash, placed notes recolored green/red, missed targets shown as ghost-green notes, button swaps to **Next**, no auto-advance.
   - **Undo** rewinds the last add/remove/move. **Clear** wipes all placements mid-round and resets undo history.
5. Settings: in Read Note the "Notes per round" slider + accidental slider are visible and the language radio is hidden; in Find Note it's the opposite. Toggle Find Note language between 한글 and English — prompt swaps.
6. Switch clef while in Find Note — staff redraws with the new clef (treble A3–E6 vs bass C2–E4), current question regenerates.
7. Refresh — boots straight into the last-used mode, no picker. `notesPerStrip` persists across refresh.
8. **For mobile-affecting changes**, also test the deployed Pages URL on iPhone — narrow viewport, no zoom on input focus, audio plays after first tap (silent switch off), drag-place works with a finger (the `touch-action: none` on `.find-staff` is what keeps iOS from intercepting the drag as a scroll).

## Future roadmap

**Planned add-ons for Read Note** (designed, not yet implemented — see `/Users/shlee/.claude/plans/now-i-want-to-modular-neumann.md`):
- **Mic Input** — accept piano-played answers via `getUserMedia` + autocorrelation/YIN pitch detection, for pianos without a USB-MIDI out. Toggle in Settings; gated by user gesture for iOS. (USB-MIDI input has shipped — see below — and is the preferred path when the piano has MIDI; mic input would extend the same idea to acoustic/non-MIDI pianos.)

**Recently shipped** (was on this list):
- **Intervals mode** — treble-staff dyad → name the interval via Quality + Number buttons; Basic (naturals) and Chromatic (dd→AA, double accidentals) levels. See the Intervals design section.
- **Harmony mode** — grand-staff chord-reading with circle-of-fifths progressions + Roman numerals (covers much of the old "chord identification" idea). See the Harmony design section.
- **Czerny Op. 139 play-along** — OSMD-rendered scores with a tempo-free note-accuracy follow engine. See the Czerny design section. *Open follow-up:* real per-study data — the provided sample isn't the full delimited 100 (see Czerny section + `tools/split-czerny.mjs`).
- **USB-MIDI Input** — play answers on a connected MIDI keyboard (octave-exact, Chrome/Edge desktop). External MIDI sound source makes the audio.
- **Multi-Note Strip** — 1–4 notes per strip with retry-on-wrong + caret-marked current note.

**Other confirmed (don't build without confirmation):**
- Key signature drill
- Audio drill (hear note → identify)
- Harmony extensions: seventh chords, minor keys, LH triads (v1 is major-key triads, LH root)

**Possible but not requested:**
- PWA manifest for proper home-screen install
- Cross-device progress sync (would need a backend — currently out of scope)
- Accidentals for Find Note mode (deliberately excluded from v1)
