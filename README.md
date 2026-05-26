# Sheet Music Trainer

A tiny single-page web app for drilling sheet-music reading on the **treble (G-clef)** and **bass (F-clef)** staves. Two modes: read notes off the staff, or find them on it.

🎹 **Live: https://bshlee.github.io/piano-trainer/**

Works on macOS Chrome, iOS Chrome, iOS Safari, and any modern browser. "Add to Home Screen" on iOS for a one-tap launcher.

## Modes

First launch shows a mode picker; pick once and it sticks. The topbar **Mode chip** (`Mode: Read ▾`) re-opens the picker any time.

### Read Note — given a note on the staff, name it
- Treble / Bass / Both clef modes.
- Accidentals (♯ / ♭) at configurable probability (default 30%).
- Two answer methods:
  - **Type** the note: Western (`C`, `D`, …, `B`) or Korean solfège (`도`, `레`, …, `시`), optionally with `#` / `b`. Press Enter to submit.
  - **Tap/click** an on-screen piano (one octave, anchored at middle C).
- **Pitch-class only** — octave doesn't matter. **Enharmonic equivalents accepted** (`C#` ≡ `Db`).
- **Score, streak, best, and note distribution** persisted in `localStorage`.
- **Note distribution panel** with a histogram per clef and an expected-uniform marker, so you can see if the RNG is biasing toward any notes over a long session.

### Find Note — given a note name, find every occurrence on the staff
- Prompt is a Korean syllable (`도`, `레`, …) by default; toggleable to English (`C`, `D`, …) in Settings.
- **Drag-to-place**: press anywhere on the staff, slide your finger up/down to scrub through diatonic positions (snap to nearest line/space, with ledger lines auto-drawn for off-staff notes), release to commit. A quick tap also works for confident placements.
- The preview marker turns red when hovering an already-placed note → release to remove.
- Counter shows `placed / target` so you know how many to find.
- **Submit (correct)** → green wash, auto-advances after a moment.
- **Submit (wrong)** → pink wash, your placements recolor green/red, **missed targets appear as ghost-green notes** so you can see where the answer should have been. Submit swaps to **Next** — study at your own pace, click when ready.
- **Clear** button wipes all placements mid-round if you want to start over.
- Treble range: A3–E6. Bass range: C2–E4. Naturals only (accidentals deliberately excluded).

### Shared across both modes
- **Piano sounds** via Web Audio additive synthesis (no audio assets). Plays on every key press / note placement.
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

- `index.html`  — markup + inline `<style>` + script tags (loaded in order: VexFlow → render.js → mode-find.js → app.js)
- `render.js`   — VexFlow helpers: `renderNote` (one note for Read Note), `renderClefOnly`, `renderFindStaff` (multi-note staff with feedback colors for Find Note)
- `app.js`      — shared infrastructure + Read Note: pitch utils, piano UI, Web Audio synth, persistence, mode picker, mode dispatch. Exposes `window.PT_Audio` / `PT_Pitch` / `PT_Piano` / `PT_Settings` for other modes.
- `mode-find.js` — Find Note mode logic: drag-to-place on the staff, snap math, submit/judge, Submit↔Next button swap
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

- **Mic input** for Read Note — play the answer on a real piano instead of typing/clicking
- **Multi-note strip** for Read Note — 1–6 notes side-by-side for true sight-reading practice

Other ideas (don't have to be in this order):

- Interval recognition mode
- Chord identification mode
- Key signature drill
- Audio drill (hear note → identify)
- Find Note with accidentals (deliberately excluded from v1)

## License

Personal use. No license declared.
