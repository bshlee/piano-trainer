# Sheet Music Trainer

A tiny single-page web app for drilling sheet-music reading on the **treble (G-clef)** and **bass (F-clef)** staves. Four modes: read notes off the staff, find them on it, read & play chords (harmony), and play through Czerny Op. 139 with note-by-note checking.

🎹 **Live: https://bshlee.github.io/piano-trainer/**

Works on macOS Chrome, iOS Chrome, iOS Safari, and any modern browser. "Add to Home Screen" on iOS for a one-tap launcher.

## Modes

First launch shows a mode picker; pick once and it sticks. The topbar **Mode chip** (`Mode: Read ▾`) re-opens the picker any time.

### Read Note — given a note on the staff, name it
- Treble / Bass / Both clef modes.
- Accidentals (♯ / ♭) at configurable probability (default 30%).
- **Multi-note strip** — Settings has a "Notes per round" slider (1–4). At 1 it's the classic flashcard. At 2–4 the staff shows that many notes side-by-side with a blue caret under the active one; answer correctly to advance the caret, wrong answers stay on the same note (with `✗ try again` — the correct pitch is *not* revealed, so you actually have to identify it).
- Three answer methods:
  - **Type** the note: Western (`C`, `D`, …, `B`) or Korean solfège (`도`, `레`, …, `시`), optionally with `#` / `b`. Press Enter to submit.
  - **Tap/click** an on-screen piano (one octave, anchored at middle C).
  - **Play it on a USB MIDI keyboard** (e.g. Roland FP-10) — enable "MIDI input" in Settings. The note you play is the answer; pairs with the multi-note strip for true sight-reading. **Octave-exact**: C5 on the staff means you must play the C5 key, not just any C. Desktop **Chrome/Edge only** (Web MIDI isn't in Safari/iOS); the toggle is disabled with a hint there. The app makes no sound on this path — your MIDI sound source (e.g. PianoTeq) does.
- **Typing / clicking are pitch-class only** — octave doesn't matter; **enharmonic equivalents accepted** (`C#` ≡ `Db`). MIDI input is octave-exact (see above).
- **Score, streak, best, and note distribution** persisted in `localStorage`.
- **Note distribution panel** with a histogram per clef and an expected-uniform marker, so you can see if the RNG is biasing toward any notes over a long session.

### Find Note — given a note name, find every occurrence on the staff
- Prompt is a Korean syllable (`도`, `레`, …) by default; toggleable to English (`C`, `D`, …) in Settings.
- **Drag-to-place**: press anywhere on the staff, slide your finger up/down to scrub through diatonic positions (snap to nearest line/space, with ledger lines auto-drawn for off-staff notes), release to commit. A quick tap also works for confident placements.
- **Drag-to-move**: press a placed note and drag — the original note stays visible, a blue preview oval (aligned with that note's column) follows the snap position. Release on empty = move; release on origin or on another placed note = no-op (move canceled).
- The preview marker turns red when hovering an already-placed note → release to remove.
- Counter shows `placed / target` so you know how many to find.
- **Submit (correct)** → green wash, auto-advances after a moment.
- **Submit (wrong)** → pink wash, your placements recolor green/red, **missed targets appear as ghost-green notes** so you can see where the answer should have been. Submit swaps to **Next** — study at your own pace, click when ready.
- **Undo** rewinds the last add / remove / move. **Clear** wipes all placements mid-round.
- Treble range: A3–E6. Bass range: C2–E4. Naturals only (accidentals deliberately excluded).

### Harmony — read & play chords on a grand staff *(MIDI keyboard, desktop Chrome/Edge)*
- A chord appears on a **grand staff** (both hands) with its **name + Roman numeral + key**. Play it on your MIDI keyboard: **left hand = root (bass), right hand = triad (treble)**.
- Walks common **progressions** (`I–IV–V–I`, `ii–V–I`, `I–V–vi–IV`, `I–vi–IV–V`, or Mixed) and cycles keys around the **circle of fifths**, so you learn how chords function in a key — pick the progression and key behaviour (circle / random) in Settings.
- **Octave-exact** chord matching: play exactly the notes shown → green ✓ and the progression advances; a wrong/extra note flashes red and names the key you hit. "Show notes" reveals the note names. No app sound (your MIDI source plays).

### Czerny Op. 139 — play the 100 Progressive Studies, checked note-by-note *(MIDI keyboard, desktop)*
- Renders each study from MusicXML (via [OpenSheetMusicDisplay](https://opensheetmusicdisplay.org/)) and walks a **cursor** through it. You must play each note/chord to advance — **tempo is ignored, note accuracy only**. A wrong note is flagged and blocks until you play the right one.
- **Hands** setting: practise Both, Right, or Left. "Studies ▾" opens the picker; finished studies are marked; "Restart" replays from the top. Progress persists.
- Needs a **desktop browser with Web MIDI** and to be **served over http** (the deployed site, or `python3 -m http.server`) — it loads score files from `data/czerny/`. See [`data/czerny/README.md`](./data/czerny/README.md) for the data pipeline. *(The current build ships one sample study; the full delimited 100-study split is pending real per-study data.)*

### Shared across modes
- **Piano sounds** (Read/Find): a **real recorded grand piano** loaded from a CDN on first use (needs a network + http(s) origin — works on the live site, served locally, or any http server). If the samples can't load (offline, or opening the file directly via `file://`), it falls back to a built-in Web Audio synth so there's still sound. MIDI modes (Harmony/Czerny) make no sound — your external MIDI instrument/VST does.
- **iOS audio unlock** on first tap anywhere — no second-tap dead zone.
- All state persists in `localStorage`; nothing leaves the device.

## Run locally

No build, no install, no dependencies (VexFlow is loaded from a CDN). Just:

```sh
open index.html
```

If you want to test on your phone over the same Wi-Fi:

```sh
python3 -m http.server 8000
# then on phone: http://<your-mac-ip>:8000
```

## Code structure

- `index.html`  — markup + inline `<style>` + script tags (loaded in order: VexFlow → render.js → mode-find.js → mode-harmony.js → mode-czerny.js → app.js)
- `render.js`   — VexFlow helpers: `renderNote`, `renderClefOnly`, `renderStrip`, `renderFindStaff`, `renderHarmony` (grand staff + chords for Harmony)
- `app.js`      — shared infrastructure + Read Note: pitch utils, piano UI, Web Audio synth, persistence, MIDI input (routed by mode), mode picker, mode dispatch. Exposes `window.PT_Audio` / `PT_Pitch` / `PT_Piano` / `PT_Settings` for other modes.
- `mode-find.js`   — Find Note mode: drag-to-place on the staff, snap math, submit/judge
- `mode-harmony.js` — Harmony mode: chord/progression theory, grand-staff judging
- `mode-czerny.js`  — Czerny mode: OSMD play-along, cursor follow engine
- `data/czerny/`    — per-study MusicXML + `index.json` (see its README); `tools/split-czerny.mjs` generates them offline
- `CLAUDE.md`   — conventions and design choices (read this if you're modifying the app)
- `SETUP.md`    — getting set up on a new machine

## Deploy

The repo (`bshlee/piano-trainer`) has GitHub Pages enabled on `main` / `/ (root)`. Every push to `main` redeploys in ~30 seconds. No CI workflow, no Jekyll.

```sh
git add -A
git commit -m "your change"
git push
```

## Setup on a new device

See [`SETUP.md`](./SETUP.md). Short version:

1. Install git (comes with Xcode CLT on macOS).
2. Generate an SSH key on the new machine and add the public key to GitHub.
3. `git clone git@github.com:bshlee/piano-trainer.git`
4. Open `index.html`.

There are **no environment variables, no API keys, no secrets** in this project. Nothing to configure beyond GitHub SSH access for pushing.

## Cross-device progress sync

Not implemented. Score, streak, distribution etc. live in **browser `localStorage`**, which is per-device and per-browser. Opening the live URL on a different device gives you fresh state. If you want sync, options would be:

- Firebase / Supabase backend (probably overkill)
- Manual export / import button: dump localStorage JSON, paste on the other device
- Sync via a query-string-encoded state (size-limited)

Not a planned feature; mention if you decide you want it.

## Design choices (locked in, see [CLAUDE.md](./CLAUDE.md) for rationale)

- Pitch class only (octave-agnostic)
- Enharmonic equivalents accepted
- Korean solfège is the primary label on piano keys
- Piano labels hidden by default

## Roadmap

Designed but not yet built (see [CLAUDE.md → Future roadmap](./CLAUDE.md#future-roadmap)):

- **Mic input** for Read Note — play the answer acoustically (pitch detection) for pianos with no USB-MIDI out. (USB-MIDI input has shipped — see Read Note above.)

Other ideas (don't have to be in this order):

- Interval recognition mode
- Chord identification mode
- Key signature drill
- Audio drill (hear note → identify)
- Find Note with accidentals (deliberately excluded from v1)

## License

Personal use. No license declared.
