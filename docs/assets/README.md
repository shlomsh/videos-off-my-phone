# Store and review assets: Videos Off My Phone (26 Nov 2026)

Made by the design session. All pictures use invented sample data. No Google or YouTube logos are used; the mark is our own: a white tile, a phone outline in a four-colour gradient (blue, green, yellow, coral) and a pink-coral play badge leaving it. Chosen by the user on 26 Nov 2026 ("C, Rainbow phone"), replacing the dark blue mark.

| File | Use |
|---|---|
| icon.svg | Master icon, 128 canvas with 16 px transparent padding (Chrome Web Store rule) |
| icon-full.svg | Same mark with no padding, for 48 px and up and the site |
| icon-small.svg | Bolder version for 16 and 32 px (thicker phone, no dot or dash). Also the app header mark |
| icon-128.png | Web Store icon and manifest `icons.128` |
| icon-48.png, icon-32.png, icon-16.png | Manifest `icons` and `action.default_icon` (16 and 32 come from icon-small.svg) |
| oauth-logo-120.png | OAuth consent screen app logo (120×120) |
| screenshot-1-start.png … screenshot-5-done.png | Web Store screenshots, 1280×800 |
| promo-440x280.png | Web Store small promo tile |
| marquee-1400x560.png | Web Store marquee (optional) |
| site/index.html, site/privacy.html, site/style.css, site/icon.svg | Homepage and privacy policy for OAuth verification. Static, no remote fonts or scripts, light and dark |

Before publishing the site, fill in the yellow placeholders: `REPO_URL`, `STORE_URL`, [date], [developer name], [contact email]. Do not use the user's personal email unless they say so.
Check the privacy policy against the code before submitting. It was written from extension/lib/records.js and youtube.js on 26 Nov 2026 and says:
- scopes youtube.upload and youtube.readonly;
- local storage holds upload records, marks and trash notes;
- the token is kept in session storage only;
- no server.
If the stored fields change (for example the stored visibility in 0.9.0), keep the list true.
The app header on the canvas uses icon-small.svg (canvas version 40). The extension header should use the same SVG; keep the gradient ids `vomS` and `vomB`.
Colours, for the promo and any marketing: blue #3b82ff, green #1fc878, yellow #ffbf1f, coral #ff5b4f, pink #ff2f87, ink #1f2440, soft background #fff7f2 with colour glows. Heading font in promo images: Poppins 700 (only baked into images, never loaded by the extension). The app screens keep their own UI colours.
`src/` holds the HTML that made the promo, marquee and screenshot frames.
The screenshots show the "Free and open source" chip: submit them only once the repo is public.
