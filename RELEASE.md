# Videos Off My Phone: before an official release

## Your priorities (26 Nov 2026)
1. Get the official Chrome Web Store listing and Google sign-in going for public use; improve afterwards. (Its own session, working in your Chrome.)
2. Run end-to-end tests in your own Chrome, to see it works as expected. (Here, now that 0.11.0 is installed.)
3. Bug fixing and polish.

**Submitted for review on 26 Nov 2026: version 0.11.2, Pending review, manual publish.** After approval, publish within 30 days or it expires. Don't upload a new package while it is in review unless you want to restart the review; 0.12.0 goes up afterwards as its own upload.

Store draft created (26 Nov 2026). Item ID `imkmnploomooalicacgniiicblmfclka`; its sign-in redirect is `https://imkmnploomooalicacgniiicblmfclka.chromiumapp.org/`. The store refuses a manifest `key`, so build uploads with `npm run pack`. The local copy keeps its old ID until you choose how records carry over (backup file, or finish first).

Note for 1: the extension ID is pinned by `key` in manifest.json, and the Google sign-in client is tied to that ID. A Web Store item usually gets its own ID, so the sign-in setup may need a change for the store version.

Last updated: 26 Nov 2026. Live folder: 0.12.1 (reload in chrome://extensions to use it). In store review: 0.11.2.

## Built in 0.11.0 (26 Nov 2026)
- [x] **Who can watch on YouTube** (canvas v32 to v35). Move asks each time: Private (chosen first), Unlisted or Public, with a warning for Public. The choice is stored with each upload. Once a video is on YouTube, the app only shows its visibility and never changes it.
- [x] **Delete check goes by direction.** Private < Unlisted < Public.
  - Same as chosen, or more private: it can be deleted (with the note "YouTube kept it Private…").
  - Less private than chosen: it stops, with "Set it back to Private in YouTube Studio, then check again."
- [x] **The delete question shows the visibility.** For example "On YouTube, Unlisted. Checked just now.", plus "Anyone can watch the YouTube copy." for Public.
- [x] **"Moved out" counter** in the header and on the done page (hidden while 0), with milestones at 1, 2, 5, 10, 20, 50, 100, 200 and 500 GB.

## YouTube data rules (policy check, 26 Nov 2026)
Source: YouTube API Developer Policies III.D.2.3 and III.E.4. This is the store session's reading, not legal advice.
- [ ] **After Remove access:** delete YouTube video IDs, the channel ID and statuses within 7 days. Keep only our own facts: Photos key, size, checksum and dates. (Being built in 0.12.0.)
- [ ] **Find again:** after a new sign-in, find each moved video on the channel again (title = file name, exact size) before it can be deleted. Not built yet.
- [ ] **30-day rule:** stored YouTube data must be refreshed or deleted within 30 days, even without revocation. The plan:
  - re-read every record with videos.list when the app opens, and store the time of that check;
  - strip the YouTube details of records not checked for 30 days, and find them again later.
- [ ] **Revoked on Google's own permissions page:** delete the YouTube data within 30 days. The app must notice when its sign-in can't be renewed.

## Approved, not built yet
- [ ] Step 1 shows videos that are already in Move or Delete, faded with "In Move" / "In Delete". A click opens them there.
- [ ] "Do not move it" beside "Try again" for an upload that did not arrive.
- [ ] After Stop, the waiting videos appear only in step 2.
- [ ] In step 3, Delete on a no-copy video goes straight to the question.

## Also built in 0.11.0
- [x] Deleting several videos with one yes (canvas v36, approved 26 Nov 2026: "Yes, build v36"). Up to 6 at a time; they go one by one through the single-video checks, and it stops at the first problem.

## Decisions still open (yours)
- [x] Whether people other than you should be able to sign in: yes, everyone (26 Nov 2026).

## Not proven on the real account yet
- [x] Deleting a **no-copy** video, and **several at once**: proven on 26 Nov 2026 with 0.12.1 (IMG_4776.MOV Unlisted with a copy + IMG_4972.MOV no copy, one yes, one by one; counter 910 → 985 MB).
- Versions are tagged on GitHub from 0.12.0 (`v0.12.0`, `v0.12.1`). The app shows its version in the account menu and on the start page.
- [x] An **Unlisted** upload stays Unlisted and plays inside the app. Proven on the real account on 26 Nov 2026 with 0.11.2/0.12.0 (IMG_3916.MOV, 28 MB): every fact the same, Seen by "As you chose".
- [ ] **Whether the Google Photos trash still counts toward storage.** Google's Help pages don't say. Until it is known, the counter must not say the space is free now. To find out, compare the storage figure before and after a large delete.

## Needed before other people can use it
Researched 26 Nov 2026. Details and sources: [docs/release-plan.md](docs/release-plan.md).

- [ ] **Sign-in for others.** The Google Cloud project is in Testing mode:
  - Up to 100 people in total, each added by email as a test user.
  - Each sees Google's "unverified app" warning.
  - Everyone has to sign in again every 7 days, because Testing-mode sign-ins expire.
  - Google needs no verification for personal use or a test-user list.
  - Lifting these limits needs Google verification: a homepage and privacy policy on a domain you own (about $10–15 a year), a reason for each scope, an Unlisted demo video of the sign-in, and about 10 days of review (sometimes longer).
- [ ] **YouTube daily limit.** 100 uploads a day for the whole project, shared by everyone. Reading costs almost nothing. More needs a compliance audit, with no stated timeline.
- [ ] **Installing.**
  - Today it is an unpacked folder: Developer mode, a warning at every Chrome start, and manual updates. Fine for 2–3 people.
  - Local .crx files are blocked on Mac and Windows.
  - Best for family: a **Private Chrome Web Store listing**, installable only by named testers or a Google Group. It costs a one-time developer fee (long $5; confirm the amount on the dashboard), and review still applies.
- [ ] **Web Store policy risks.**
  - The listing must say plainly that the app uses your Google Photos session and deletes items.
  - Ask only for the permissions needed.
  - Follow Limited Use: no ads, no server of ours, data used only for what is stated.
  - Google has no ruling on extensions that call Google Photos' internal web calls, so it is a grey area.
  - Fallback if rejected: stay on unpacked installs for a few people.
- [ ] **Fragility.** Google Photos is reached through Google's internal web calls, not a public API (Google narrowed its Photos API in March 2025). When they change, the app stops safely without deleting.
- [ ] **Privacy policy and a one-page homepage** (free hosting is fine). They are needed for the Web Store and for any verification.
- [ ] **Android.** The phone steps are iPhone only.

### Recommended path, cheapest first
1. ~~Prove an Unlisted upload on the real account~~ (done 26 Nov 2026).
2. Pilot with 2–3 close people: unpacked folder plus test users (an afternoon, $0).
3. Stay in Testing for up to 100 people. Add a clear "sign in again" message for the weekly re-sign-in ($0).
4. Write the privacy policy and a one-page homepage (about 2 hours).
5. Move to a Private Web Store listing when manual updates get tedious (one-time fee, a day to prepare, plus review).
6. Apply for Google verification only to go past 100 people or end the weekly sign-in (domain cost, demo video, review time).
7. Don't ask for more YouTube quota unless daily uploads come close to 100.

## Name and message
- [x] Name chosen: **Videos Off My Phone**. GitHub repo renamed to `videos-off-my-phone`. Research is in [docs/naming.md](docs/naming.md); the draft listing is in [docs/listing.md](docs/listing.md).
- [x] Renamed inside the app, with the new start page (v38) and icon (v39), in 0.11.0.
- [ ] Say the point on the start page and in the listing: YouTube storage doesn't count toward your Google storage. Free and open source. (Design session.)
- [ ] **Open source** (your answers, 26 Nov 2026):
  - [x] Repo made public on 26 Nov 2026, with your yes.
  - [x] License: **MIT** (`LICENSE`).
  - [x] Every commit's author is your GitHub noreply address. History rewritten 26 Nov 2026; the merged branches v35, v36 and v38 were deleted from GitHub.
  - [x] `UX_PROMPT.md` removed from the repo and from its history. Open-source README written, with the client ID note for forks.
  - [ ] Set `OPEN_SOURCE = true` in `extension/config.js`, in 0.12.0.

## Housekeeping
- [x] Put the folder in git, with a private GitHub repo.
- [x] Removed "(proof of concept)" from the name.
- [ ] Remove the old probe file and the `old/` folders (kept out of git).

## Rules that stay
- The app deletes only the Google Photos original, one confirmed video at a time, to the trash. It never empties the trash and never deletes or changes anything on YouTube.
- Nothing is deleted unless every check passes, including a fresh check of the YouTube copy right before the question.
