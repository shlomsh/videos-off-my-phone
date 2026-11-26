# Store and review assets: Videos Off My Phone (26 Nov 2026)

Made by the design session. All pictures use invented sample data. No Google or YouTube logos are used; the mark is our own (a phone with a round play badge leaving it).

| File | Use |
|---|---|
| icon.svg | Master icon, 128 canvas with 16 px transparent padding (Chrome Web Store rule) |
| icon-full.svg | Same mark with no padding, for small sizes and the site |
| icon-128.png | Web Store icon and manifest `icons.128` |
| icon-48.png, icon-32.png, icon-16.png | Manifest `icons` and `action.default_icon` |
| oauth-logo-120.png | OAuth consent screen app logo (120×120) |
| screenshot-1-start.png … screenshot-5-done.png | Web Store screenshots, 1280×800 |
| promo-440x280.png | Web Store small promo tile |
| site/index.html, site/privacy.html, site/style.css, site/icon.svg | Homepage and privacy policy for OAuth verification. Static, no remote fonts or scripts, light and dark |

Before publishing the site, fill in the yellow placeholders: `REPO_URL`, `STORE_URL`, [date], [developer name], [contact email]. Do not use the user's personal email unless they say so.
Check the privacy policy against the code before submitting. It was written from extension/lib/records.js and youtube.js on 26 Nov 2026 and says:
- scopes youtube.upload and youtube.readonly;
- local storage holds upload records, marks and trash notes;
- the token is kept in session storage only;
- no server.
If the stored fields change (for example the stored visibility in 0.9.0), keep the list true.
The app header on the canvas now uses the same mark (canvas version 39).
The screenshots show the "Free and open source" chip: submit them only once the repo is public.
