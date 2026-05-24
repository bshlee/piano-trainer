# Sheet Music Trainer

A tiny single-page web app to drill reading single notes on the **treble (G-clef)** and **bass (F-clef)** staves.

- Accepts both **Western letters** (`C`, `D`, … `B`) and **Korean solfège** (`도`, `레`, … `시`).
- Accidentals: append `#` or `b` (e.g. `c#`, `레b`, `Gb`, `파#`).
- Or tap/click the **on-screen piano** — works on touchscreens and mouse alike.
- Sharps and flats appear at a configurable rate (default 30%).
- Score, streak, and personal best persist in `localStorage`.

## Run locally

Just open `index.html` in any modern browser:

```
open index.html
```

No build, no install, no dependencies (VexFlow is loaded from a CDN).

If you want to test on your phone over Wi-Fi:

```
python3 -m http.server 8000
# then on the phone, open http://<your-mac-ip>:8000
```

## Deploy to GitHub Pages

1. Create a new GitHub repo and push these files (`index.html`, `app.js`, `render.js`, `README.md`).
2. Repo → **Settings** → **Pages** → set source to "Deploy from a branch", branch `main` / `(root)`.
3. Wait ~1 minute, then open `https://<your-user>.github.io/<repo-name>/`.
4. On iOS Chrome / Safari, use **Share → Add to Home Screen** for an app-like icon.

## Design notes

- **Pitch class only.** A `C` on the staff and the same `C` an octave higher both accept answer `C` (or `도`). The on-screen keyboard shows one octave for this reason.
- **Enharmonic equivalents accepted.** If the staff shows `C♯`, answers `C#`, `Db`, `도#`, and `레b` all count as correct, since the physical key on the piano is the same. This makes the drill about "which key is this on the piano" rather than spelling.
- **Note ranges:**
  - Treble: `C4`–`C6` (one ledger line above and below the staff)
  - Bass:   `C2`–`C4`
- Settings, score, streak, and best are stored under `piano-trainer:settings:v1` and `piano-trainer:stats:v1` in `localStorage`. Click **reset** to clear score (best is preserved).

## Files

- `index.html` — markup, styles, script tags
- `render.js` — VexFlow staff/note rendering
- `app.js` — note generation, answer parsing, game loop, persistence

## Roadmap (not yet built)

- Interval recognition
- Chord identification
- Key signature drill
- Audio playback of the displayed note
- PWA manifest for proper home-screen install
