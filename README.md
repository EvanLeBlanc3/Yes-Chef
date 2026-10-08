# Yes, Chef! 🔥
Offline iPhone cooking app (PWA). 316 recipes · 530+ pantry ingredients · 82 kitchen tools.

## Install (GitHub Pages)
1. Create a new GitHub repo (e.g. `yes-chef`).
2. Upload everything in this folder (index.html, app.js, data.js, styles.css, sw.js, manifest.json, icons/) to the repo root.
3. Settings → Pages → Source: "Deploy from a branch" → Branch: `main` / `(root)` → Save.
4. On your iPhone, open `https://YOUR-USERNAME.github.io/yes-chef/` in Safari → Share → Add to Home Screen.
5. Open it once while online and it caches everything for offline use.

When you update files later, bump `CACHE` in sw.js (e.g. `yes-chef-v2`) so phones pick up the new version.
