# Sheet Music Trainer — project context for Claude

A personal-use static web app for practicing sheet-music reading on the treble (G-clef) and bass (F-clef) staves. Built so the owner (Sang Ho Lee, `bshlee` on GitHub) can drill on both his MacBook and his iPhone with no install.

Live at **https://bshlee.github.io/piano-trainer/** (GitHub Pages, deploys from `main` branch root, ~30s after each push).

## Hard constraints — don't violate without asking

- **No build step.** Three plain files (`index.html`, `render.js`, `app.js`) plus VexFlow via CDN. Opening `index.html` directly must work. Don't introduce Vite/webpack/Node tooling.
- **No npm dependencies.** All third-party code is loaded via `<script src="https://cdn..."`.
- **No secrets, no API keys, no backend.** Everything runs client-side. State persists in `localStorage` only. Don't add API calls or external services.
- **Mobile-first.** Every change must remain usable on iPhone (iOS Chrome + Safari). Touch targets ≥ 44px; layout must reflow on narrow viewports; audio must work after the iOS unlock pattern.
- **Don't replace VexFlow** without asking — it's chosen for SVG rendering quality on retina + mobile.

## Files

| File | Role |
|---|---|
| `index.html` | Markup, inline `<style>`, script tags. Loads VexFlow from `cdn.jsdelivr.net`. |
| `render.js`  | Single function `window.renderNote(container, pitch)` — draws clef + one note (with optional accidental) via VexFlow. |
| `app.js`     | Everything else: note generation, answer parsing, piano UI, audio synthesis, persistence, distribution stats. Wrapped in an IIFE; exposes nothing global. |
| `README.md`  | Human-facing docs (features, usage, dev setup). |
| `SETUP.md`   | Step-by-step new-device onboarding (clone, SSH key, push). |

## Code structure inside `app.js`

Sections are clearly demarcated with `// ----------` headers. In order:

1. **constants** — `STEP_TO_PC`, `KO_TO_LETTER`, `LETTER_TO_KO`, `RANGES` per clef
2. **pitch utilities** — `pitchClass()`, `buildDiatonicList()`, `randomPitch()`
3. **typed-answer parsing** — `parseAnswer()` (returns pitch-class 0–11 or null)
4. **DOM refs** — all `getElementById` lookups at top so adding UI = adding a ref here
5. **piano keyboard** — `WHITE_KEYS`, `BLACK_KEYS` arrays + `buildPiano()`
6. **audio** — Web Audio additive-synthesis piano tone + iOS unlock pattern
7. **game state** — `loadSettings`, `loadStats`, `loadDistribution` + their `save*` counterparts
8. **render / judge / submit** — `newQuestion`, `submitTyped`, `submitPitchClass`, `judge`
9. **event wiring** — listeners for inputs/toggles
10. **boot** — calls `buildPiano()`, syncs UI to settings, fires `newQuestion()`

## Design choices the user has agreed to (don't re-litigate)

- **Pitch class only** — answers are octave-agnostic. C4 and C5 both accept `C` / `도`.
- **Enharmonic equivalents accepted** — `C#` ≡ `Db`. The drill is "which piano key", not "spelling".
- **Korean solfège is the primary label** on piano white keys (bigger, dark). English is secondary (small, muted). The user explicitly chose this; there was once a lang toggle that got removed.
- **Default: piano labels hidden.** Settings toggle re-enables them.
- **Note ranges:** Treble `C4`–`C6`, Bass `C2`–`C4` (one ledger line above/below each staff).
- **Accidentals default to 30% probability**, slider-adjustable.

## localStorage keys

- `piano-trainer:settings:v1` — `{ clefMode, accidentalRate, showLabels }`
- `piano-trainer:stats:v1` — `{ correct, total, streak, best }`
- `piano-trainer:dist:v1` — note-frequency distribution `{ byNote, naturals, sharps, flats, treble, bass, total }`

If you change a schema in a backwards-incompatible way, bump the `:v1` suffix to `:v2` so old data is ignored (don't try to migrate — this is a personal app, fresh state is fine).

## Adding a new mode (planned: intervals, chord ID, key signature drill)

The current code is single-mode (single-note). To add modes cleanly:

1. Generalize `randomPitch()` → `nextQuestion()` returning a generic question object with a `type` field.
2. Generalize `renderNote()` in `render.js` → accept question objects, branch on `type`.
3. Generalize `judge()` to compare answer to expected per question type.
4. Add a mode selector to the topbar next to the clef toggle.

Don't restructure preemptively — wait until at least one new mode is being implemented, then refactor.

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

1. Open `index.html` in Chrome.
2. Take a treble round, a bass round, and a "both" round; type Western + Korean answers; click a white key and a black key.
3. Open Settings: toggle accidental slider and labels checkbox; confirm persistence by refreshing.
4. Open the distribution panel; play ≥10 notes; verify bars + expected-uniform marker render.
5. **For mobile-affecting changes**, also test the deployed Pages URL on iPhone — narrow viewport, no zoom on input focus, audio plays after first tap (silent switch off).

## Future roadmap

Confirmed wanted by the user (don't build without confirmation):
- Interval recognition mode
- Chord identification mode
- Key signature drill
- Audio drill (hear note → identify)

Possible but not requested:
- PWA manifest for proper home-screen install
- Cross-device progress sync (would need a backend — currently out of scope)
