# Sheet Music Trainer

A tiny single-page web app to drill reading single notes on the **treble (G-clef)** and **bass (F-clef)** staves.

🎹 **Live: https://bshlee.github.io/piano-trainer/**

Works on macOS Chrome, iOS Chrome, iOS Safari, and any modern browser. "Add to Home Screen" on iOS for a one-tap launcher.

## Features

- Treble / Bass / Both clef modes.
- Accidentals (♯ / ♭) at configurable probability (default 30%).
- Two answer methods:
  - **Type** the note: Western (`C`, `D`, …, `B`) or Korean solfège (`도`, `레`, …, `시`), optionally with `#` / `b`. Press Enter to submit.
  - **Tap/click** an on-screen piano (one octave, anchored at middle C / C4).
- **Piano sounds** on key press, via Web Audio additive synthesis (no audio assets).
- **Pitch-class only** — octave doesn't matter. **Enharmonic equivalents accepted** (`C#` ≡ `Db`).
- **Score, streak, best, and note distribution** persisted in `localStorage`.
- **Note distribution panel** with a histogram per clef and an expected-uniform marker, so you can see if the RNG is biasing toward any notes over a long session.

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

- `index.html` — markup + inline `<style>` + script tags
- `render.js`  — `window.renderNote(container, pitch)`: draws clef + one note via VexFlow
- `app.js`     — game logic (IIFE-wrapped): pitch generation, answer parsing, audio synthesis, persistence, UI wiring
- `CLAUDE.md`  — conventions and design choices (read this if you're modifying the app)
- `SETUP.md`   — getting set up on a new machine

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

Not yet built (don't have to be in this order):

- Interval recognition
- Chord identification
- Key signature drill
- Audio drill (hear note → identify)

## License

Personal use. No license declared.
