# Google sign-in verification: answers to paste

Prepared 26 Nov 2026 for the Google Cloud project that holds the extension's OAuth client.
Nothing here has been submitted. Each Save, Publish or Submit is your own click, after you say yes.

## Before you start
- The homepage and privacy policy must be live first: `https://videos-off-my-phone.vercel.app/` and `/privacy` (the address is your choice of 26 Nov; check it is free when deploying).
- That address must be verified in **Search Console** by the **same Google account** that owns the Cloud project (URL-prefix property, HTML tag or file method).
- Risk to know: Google asks for "a verified domain you own". `vercel.app` is on the Public Suffix List, so `videos-off-my-phone.vercel.app` counts as its own top private domain, and Search Console can verify it. But nothing official says Google accepts hosting subdomains. If the reviewer refuses it, buy a domain and re-submit (one more review round, about 10 business days).
- The consent screen must be in English, and the app name on it must match the store and homepage: **Videos Off My Phone**.

## Branding page (Google Auth Platform → Branding)
| Field | Value |
|---|---|
| App name | Videos Off My Phone |
| User support email | your choice (it is shown to users on the consent screen) |
| App logo | `docs/assets/oauth-logo-120.png` (rainbow phone, 120×120 PNG). Uploading it starts brand verification once the app is in Production. |
| Application home page | https://videos-off-my-phone.vercel.app/ |
| Privacy policy link | https://videos-off-my-phone.vercel.app/privacy |
| Terms of service link | optional; leave empty, or the homepage |
| Authorized domains | videos-off-my-phone.vercel.app |
| Developer contact email | your choice (Google writes here about the review) |

## Audience page
- User type: **External**.
- Publishing status today: **Testing**. Pressing **Publish app** moves it to Production. Before that click, know:
  - Until verification passes, users still see the "unverified app" warning, and the project may sign in at most **100 new users in total, ever**. That cap cannot be reset.
  - What Production does to the 7-day re-sign-in is not stated in the pages read. Don't promise users it ends until it is seen working.

## Data access page: the two scopes
Check what this page marks each scope as (sensitive or not). Both are expected to be **sensitive**; neither is on Google's restricted list.

### youtube.upload, reason (paste)
> Videos Off My Phone moves the videos a user chooses from their Google Photos library to their own YouTube channel, so they stop using phone and Google storage. youtube.upload is used only for videos.insert (resumable upload) of the videos the user selected, one at a time, with the privacy the user picks (Private, Unlisted or Public) and the file name as the title. It is the narrowest scope that allows uploading; the app cannot delete or edit any YouTube video. Nothing is uploaded without the user choosing it.

### youtube.readonly, reason (paste)
> Before the app offers to delete the Google Photos original, it must prove the YouTube copy is complete and on the right channel. youtube.readonly is used for channels.list (mine=true) to show and lock the signed-in channel, and videos.list on the IDs the app itself uploaded, to read privacy status, processing state, file size, resolution and recording date. Only if every check passes does the app ask the user to confirm the delete. youtube.upload alone cannot read these details. The data stays in the user's browser.

### How the app uses the data (if asked)
> The app is a Chrome extension with no server. Tokens and data stay in the user's own Chrome: the access token in memory only, and the channel ID and per-video check results in the extension's local storage. Nothing is sent to the developer or any third party. The app does not store or use YouTube data for any other purpose, has no ads and no analytics.

## Demo video (Unlisted on YouTube, English)
Google wants: the full sign-in flow, the app name on the consent screen, the **OAuth client ID visible in the browser address bar**, and each scope being used.

Script (about 3 minutes; record the screen with your voice or captions in English):
1. Show `chrome://extensions` with Videos Off My Phone installed (the store version once it exists).
2. Click the toolbar icon. The app opens. Say: "This is Videos Off My Phone. It moves videos from Google Photos to the user's own YouTube channel."
3. Click **Sign in**. When Google's window opens, show its address bar: zoom in on `client_id=1052847843495-…apps.googleusercontent.com`.
   - Dry-run first: if the sign-in window's address bar is too short to show the client ID, before step 3 paste the same sign-in address into a normal tab and show it there.
4. Choose the account. Show the consent screen: the app name "Videos Off My Phone" and the two YouTube permissions. Click **Continue/Allow**.
5. Back in the app, show the channel name. Say: "youtube.readonly confirms the channel."
6. Pick one short test video, choose **Private**, click **Move**. Show the upload finishing. Say: "youtube.upload uploads only the chosen video."
7. Show the check result (size, resolution, Private). Say: "youtube.readonly reads back the uploaded video to check it is complete before any delete."
8. Open YouTube Studio and show the same video there, Private.
9. Optional: show the delete question and say "the Google Photos original is moved to the trash only after this yes." Use a throwaway clip.
10. End on the privacy policy page.

Upload it to your channel as **Unlisted** and paste its link in the verification form.

## Verification form (opens after Publish app, when you click "Prepare for verification")
- Scope reasons: the two above.
- Demo video link: the Unlisted video.
- Extra notes for the reviewer (paste):
> This is a free, open-source Chrome extension (MIT). It has no backend. It uses chrome.identity.launchWebAuthFlow with a Web application OAuth client; the redirect URI is the extension's own https://<extension-id>.chromiumapp.org/ address, which Chrome handles inside the browser. Source: https://github.com/shlomsh/videos-off-my-phone

Review time Google states: about 10 business days for sensitive scopes, 2–3 business days for brand, not guaranteed.

## Open point: the chromiumapp.org redirect
Google says the authorized domains must cover a Web client's redirect URIs. `chromiumapp.org` is Chrome's, and you cannot verify it. Nothing official says Chrome-extension redirects are exempt. Watch the Branding page for a warning about it. If the reviewer objects, the fix is in the code (switch to a "Chrome Extension" OAuth client with `chrome.identity.getAuthToken`), which ties sign-in to the Chrome profile's Google accounts. Not needed unless Google asks.
