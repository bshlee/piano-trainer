# New-Device Setup

Step-by-step for getting this project running on a fresh machine (new Mac, new laptop, fresh OS install, etc.). There are **no environment variables, no API keys, and no secrets** in this app — the only thing you need to set up is GitHub SSH access if you want to push changes.

The live site at https://bshlee.github.io/piano-trainer/ works on any device with no setup at all. Setup is only needed if you want to **edit and push** code.

---

## 1. Use the live app (no setup needed)

Just open https://bshlee.github.io/piano-trainer/ on the device. On iOS, tap the share icon → **Add to Home Screen** for a quick-launch icon.

## 2. Edit-and-push setup (Mac / Linux dev machine)

### a) Install Git

On macOS, git ships with the Xcode Command Line Tools:

```sh
xcode-select --install
```

Verify:

```sh
git --version
```

### b) Set up SSH access to GitHub

The repo is configured to push over SSH (not HTTPS). HTTPS will fail without a stored Personal Access Token; SSH is simpler.

**Option A — generate a new key on this device (recommended for security):**

```sh
ssh-keygen -t ed25519 -C "your-email@example.com"
# accept default file location, set a passphrase or leave empty
cat ~/.ssh/id_ed25519.pub
```

Copy the printed public key. Then on GitHub:
- Go to https://github.com/settings/keys
- Click **"New SSH key"**
- Title: e.g. `MacBook Air 2026`
- Key type: **Authentication Key**
- Paste the public key → **Add SSH key**

Verify it works:

```sh
ssh -T git@github.com
# Expected: "Hi <your-username>! You've successfully authenticated, ..."
```

**Option B — copy the existing key from another device of yours:**

Only do this on devices *you* fully control. Copy these two files preserving permissions:

```
~/.ssh/id_ed25519       (private key — keep secret!)
~/.ssh/id_ed25519.pub   (public key)
```

After copying, fix permissions:

```sh
chmod 600 ~/.ssh/id_ed25519
chmod 644 ~/.ssh/id_ed25519.pub
```

### c) Clone the repo

```sh
cd ~/wherever-you-keep-projects
git clone git@github.com:bshlee/piano-trainer.git
cd piano-trainer
```

### d) Set local git identity (this repo only)

This project sets git author identity per-repo, not globally, so you can use a different identity here than on other repos. Run inside the cloned directory:

```sh
git config user.name "Sang Ho Lee"
git config user.email "shlee@Sangs-Mac-mini.local"
```

(Or substitute whatever name/email you want shown on commits. For a public repo, consider using the GitHub no-reply form: `<id>+<username>@users.noreply.github.com`.)

### e) Run it

```sh
open index.html
```

That's it. Edit any file, save, refresh the browser.

### f) Push changes

```sh
git add -A
git commit -m "describe your change"
git push
```

The live Pages site auto-redeploys ~30 seconds after each push.

---

## 3. What's intentionally not here

- **No `.env` file.** The app has no environment variables, no API keys, no backend, no third-party service auth. Everything runs client-side.
- **No `package.json` / `node_modules`.** No npm dependencies. VexFlow loads from a CDN at runtime.
- **No CI workflow / build step.** GitHub Pages serves the files directly from the `main` branch root.

If you ever do add a secret (e.g., adding a Firebase backend for cross-device sync), put it in a `.env` and add `.env` to `.gitignore`. Never commit it.

---

## 4. Common gotchas

- **`git add` times out with "unable to map index file".** The repo lives in a OneDrive-synced folder; OneDrive's file provider briefly locks `.git/index`. Wait a few seconds and retry. If it persists, try `xattr -d com.apple.fileprovider.ignore#P .git` (rare).
- **Audio doesn't play on iPhone.** Check the hardware silent switch (orange = silent, mutes Web Audio at the OS level, no browser workaround). Toggle to ring mode.
- **`git push` says "Permission denied (publickey)".** Your SSH key isn't registered with GitHub yet. Go back to step 2(b).
- **`git push` says "could not read Username for 'https://github.com'".** The remote is pointing at HTTPS, not SSH. Fix with:
  ```sh
  git remote set-url origin git@github.com:bshlee/piano-trainer.git
  ```

---

## 5. Recovering the repo from scratch

If you ever lose all local copies, the source-of-truth is GitHub. Just re-do step 2(c) above on any machine with your SSH key set up.

The localStorage state (your scores, streaks, distribution) is **not** in the repo and is **not** recoverable from GitHub — it lives in your browser's storage on each device. Treat it as ephemeral.
