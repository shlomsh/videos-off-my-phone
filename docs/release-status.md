# Release status: Web Store and public Google sign-in

Updated 26 Nov 2026. Answers to paste: [verification.md](verification.md), [store-submission.md](store-submission.md). Page texts: [home.md](home.md), [privacy.md](privacy.md).

## Decisions (you, 26 Nov 2026)
- Homepage and privacy policy on a free **Vercel** address: `videos-off-my-phone.vercel.app` (not a bought domain). Risk: Google may refuse a hosting subdomain; then buy a domain and re-submit.
- The site gets its own small repo now, so it doesn't wait for the app repo to go public.
- One Google account for Cloud, Search Console and the Web Store.

## What the Cloud console showed before the changes (read 26 Nov 2026; since then see steps 5, 6, 8)
- Publishing status **Testing**, user type **External**. "Publish app" is greyed out until the Branding page is complete.
- User cap: **1 of 100**, "counted over the entire lifetime of the app", and the 1 is a test user. So test users count toward the same 100.
- Branding: app name still **"Video Offload"**; no logo, no homepage, no privacy policy; authorized domain **chromiumapp.org** (it had to be added for the sign-in redirect). Verification may ask you to own every authorized domain, and nobody but Google owns chromiumapp.org. See verification.md, "Open point".
- Data Access: **no scopes declared**. Sign-in works in Testing anyway, but youtube.upload and youtube.readonly must be added (and saved) before verification. The page shows whether each is sensitive once added.
- OAuth client: one, "Video Offload extension", type **Web application**, created 25 Nov 2026.
- YouTube Data API v3 quota: **Video uploads 100 per day** (and 100 per minute), queries 10,000 per day, search 100 per day. All adjustable only through Google's audit form.

## Submitted
**Store item submitted for review 26 Nov 2026** (Pending review, 0.11.2, manual publish). Brand verification ran once on 26 Nov 2026 (see Waiting on Google). Store ID `imkmnploomooalicacgniiicblmfclka`.

## Waiting on Google
- **Web Store review** of 0.11.2, submitted 26 Nov 2026. Google says a few days to a few weeks. Status on the developer dashboard home page; Google also emails the result.
- **Brand verification, run 26 Nov 2026 (your yes): one issue only.** Google: the homepage `https://videos-off-my-phone.vercel.app/` "is not registered to you"; verify ownership, "then wait 24 hours before retrying". Search Console verified it the same day, so this is Google's 24-hour delay. **Retry from 27 Nov 2026** (Branding → View issues → "I have fixed the issues" → Proceed). chromiumapp.org and the vercel.app domain were not flagged.
- After the retry passes (automated check minutes; Google says a manual review can take 2–3 business days): record the demo video, then "Prepare for verification" for the two sensitive scopes (about 10 business days).

## Order, longest wait first
| # | Step | Who | Blocked by | Status |
|---|---|---|---|---|
| 1 | Register as a Web Store developer (fee, agreement) | you (Chrome blocks me from Web Store pages) | — | **done 26 Nov 2026**: registered, non-trader, contact email verified, publisher display name set to your name |
| 2 | Deploy homepage + privacy to Vercel | this session, on your yes | — | **live 26 Nov 2026**, designed version (rainbow logo) since 26 Nov 2026: https://videos-off-my-phone.vercel.app/ and /privacy. Deployed copy in `~/work/videos-off-my-phone-site` (not on GitHub yet): made from `docs/assets/site/`, plus the Search Console tag, "Coming soon" in place of STORE_URL, and the developer's name. When the store link exists, swap the button and redeploy. |
| 3 | Verify the site in Search Console | this session, on your yes | 2 | **verified 26 Nov 2026** (URL-prefix property, HTML tag method; the tag in `index.html` must stay) |
| 4 | Upload a draft zip to the Web Store, read the store ID | you click Upload | 1 | **done 26 Nov 2026**: draft item "Videos Off My Phone", store ID `imkmnploomooalicacgniiicblmfclka` (read off the screen; confirm against the public key). Zip: `~/Downloads/videos-off-my-phone-0.11.2-store.zip` (committed 0.11.2, a23427f, `key` removed). Tried 26 Nov 2026 with `key`: the store refused it, "key field is not allowed in manifest" |
| 5 | Put the store key in the manifest; add the store redirect URI to the OAuth client | main session; you in Cloud | 4 | redirect URI `https://imkmnploomooalicacgniiicblmfclka.chromiumapp.org/` **added 26 Nov 2026** (old one kept). Manifest key: waits for the record carry-over choice |
| 6 | Fill Branding and Data access in Cloud | this session, Save on your yes | 2, 3, logo | **done 26 Nov 2026**: Branding saved (name Videos Off My Phone, rainbow logo, homepage, privacy, authorized domains chromiumapp.org + videos-off-my-phone.vercel.app, which Google itself asked for as "missing domain"). Data Access saved: youtube.upload and youtube.readonly, both listed by Google as **sensitive**. "Publish app" is now enabled |
| 7 | Record and upload the Unlisted demo video | you | brand verification passed (until then Google does not show the app name and logo on the consent screen, which the video must show) | not started; script in verification.md |
| 8 | Publish app (Production) and submit verification | you click | 6, 7 | **In production since 26 Nov 2026** (your yes): anyone can sign in after the unverified warning; lifetime cap 100 users, 1 used. Google's Verification Center: branding must be verified first ("Verify branding" on the Branding page), then "Prepare for verification" for the two sensitive scopes, which needs the demo video |
| 9 | Submit the store item for review (manual publish) | you click | 5, 6 + Publish app, repo public | **submitted 26 Nov 2026** (your yes): status **Pending review**, version 0.11.2, Support URL = GitHub issues. Staged, not auto-published: after approval you have **30 days** to publish, or it expires. First try failed once with "Homepage URL is not reachable. Timeout while connecting" (the site was fine; the retry passed) |
| 10 | Publish the store item | you click | 9 approved | waits for approval; then publish within 30 days, swap the homepage "Coming soon" for the store link and redeploy |

Review times Google states: sign-in about 10 business days (brand 2–3), not guaranteed; Web Store a few days to a few weeks.

## For the main session (code changes; this session edits no code)
Status from the main session, 26 Nov 2026: 2, 3 and 7 are built as 0.11.2 on branch `policy` (installed after your real-account test). 9 is installed in 0.11.1. 1 and 4 are with the design session, and you decide, because the records prevent double uploads. 6 gets a README note before the repo goes public. 5 and 8 wait for a YouTube audit. The app links to https://videos-off-my-phone.vercel.app/privacy.

1. **Extension ID will change (confirmed 26 Nov 2026).** The store refuses an upload whose manifest has `key` ("key field is not allowed in manifest"), so it assigns its own ID. Every store upload must be built **without** `key`. For local work, put the store's public key (Package → View public key) in `manifest.json` `key`, so the unpacked ID equals the store ID, and strip it when zipping for the store. `npm run pack` (tools/pack-store.sh, main session, 26 Nov 2026) builds `dist/videos-off-my-phone-<version>-store.zip` without `key` and fails if it is still inside. The main session puts the store key in the local manifest only together with your record carry-over choice, because the local ID, its records and its redirect change with it.
   - The OAuth client stays the same (`config.js` CLIENT_ID unchanged). The user adds `https://<store-id>.chromiumapp.org/` as a second authorized redirect URI on the same Web client and keeps the old one while both are in use.
   - **Local data is per ID.** Upload records (`upload:`), marks (`mark:`), delete entries (`trash:`) and the channel live in `chrome.storage.local` of the old ID. A new ID starts empty, so videos already moved would look unmoved (a risk of uploading twice). Needs an export/import, or finish all open work in the old install first. Decide before the switch.
2. **manifest `description`** is still the old text ("as private…"). Use the store summary (132 chars): "Free and open source. Move big videos to your own YouTube channel, which doesn't use your Google storage, then delete the originals."
3. **YouTube Terms link in the app** (YouTube Developer Policies III.A.1): show a link to https://www.youtube.com/t/terms near Sign in, with "By signing in you agree to the YouTube Terms of Service", and a link to the privacy policy.
4. **Sign out / revoke** (Developer Policies III.D.2.3): a clear way to revoke access that calls Google's revoke endpoint and clears the stored channel. Policy also asks to delete stored YouTube data within 7 days of revocation.
5. **Stored YouTube data older than 30 days** (Developer Policies III.E.4): upload records keep YouTube details. Re-check them, or keep only what the safety checks need (video ID). Low priority; matters for a YouTube audit, not for the store.
6. **Client ID in a public repo** (Developer Policies III.D.1.4 says credentials must not be embedded in open-source projects). The client ID is public by nature and there is no secret, but consider documenting it as "the published build's ID; use your own project for forks". Decide before the repo goes public.
7. **Host permission `https://www.googleapis.com/*`** is broader than needed; the code calls only `/youtube/v3/` and `/upload/youtube/v3/`. Narrowing it helps the store review.
8. **Upload metadata** (YouTube Required Minimum Functionality): users should be able to set title and description. Today the title is the file name and there is no description. Matters for a YouTube audit only.
9. **Store assets: done** (design session, 26 Nov 2026, "Rainbow phone"), in `docs/assets/`: icon-128, five 1280×800 screenshots, promo 440×280, marquee 1400×560, oauth-logo-120.png. The manifest icons must be the rainbow set from `docs/assets/`, not the earlier dark blue ones. Screenshots show "Free and open source": upload them only once the repo is public.

## Repo public: done 26 Nov 2026 (your yes)
**Public since 26 Nov 2026**, MIT, issues on. Checked: the repo, its issues page, the homepage and /privacy all load without sign-in.

The prep (for the record):
The main session did the prep (main `0e8e5bf`), and this session checked it on GitHub:
- Only `main` is left. All 46 author and committer entries are the noreply address.
- `UX_PROMPT.md` is gone from every remote commit. MIT LICENSE and the open-source README are in. No personal email or local path in the files.
- Left as is: `OPEN_SOURCE=false` until 0.12.0, so the uploaded 0.11.2 zip still matches main. The local worktree branch `v42` still has the old history (with `UX_PROMPT.md`); never push it.
- The live privacy page shows the developer's name. The repo copy `docs/assets/site/privacy.html` keeps the `[developer name]` placeholder on purpose; the deploy copy fills it in.
- After the switch: the issues link works, so the store Support URL can go back to it. Then you click **Submit for review** (untick auto-publish).

## Open questions
- Contact for the privacy policy: the GitHub issues link works only once the app repo is public. Until then, a contact email (yours to choose) or the site repo's issues.
- Whether Google accepts `*.vercel.app` as "a domain you own".
- Whether Google objects to the `chromiumapp.org` redirect on a Web client (see verification.md).
