# Before an official release

Last updated: 26 Nov 2026. Installed version: 0.8.2.

## Being built now (approved)
- [ ] **Who can watch on YouTube** (canvas v32 to v35). Move asks each time: Private (chosen first), Unlisted or Public, with a warning for Public. The choice is stored with each upload. Once a video is on YouTube, the app only shows its visibility and never changes it.
- [ ] **Delete check goes by direction.** Private < Unlisted < Public.
  - Same as chosen, or more private: it can be deleted (with the note "YouTube kept it Private…").
  - Less private than chosen: it stops, with "Set it back to Private in YouTube Studio, then check again."
- [ ] **The delete question shows the visibility.** For example "On YouTube, Unlisted. Checked just now.", plus "Anyone can watch the YouTube copy." for Public.
- [ ] **"Moved out" counter** in the header and on the done page (hidden while 0), with milestones at 1, 2, 5, 10, 20, 50, 100, 200 and 500 GB.

## Approved, not built yet
- [ ] Step 1 shows videos that are already in Move or Delete, faded with "In Move" / "In Delete". A click opens them there.
- [ ] "Do not move it" beside "Try again" for an upload that did not arrive.
- [ ] After Stop, the waiting videos appear only in step 2.
- [ ] In step 3, Delete on a no-copy video goes straight to the question.

## Approved, next after 0.9.0
- [ ] Deleting several videos with one yes (canvas v36, approved 26 Nov 2026: "Yes, build v36"). Up to 6 at a time; they go one by one through the single-video checks, and it stops at the first problem.

## Decisions still open (yours)
- [ ] Whether people other than you should be able to sign in.

## Not proven on the real account yet
- [ ] Deleting a **no-copy** video. Only an On YouTube one has been done (IMG_4959.MOV).
- [ ] An **Unlisted** upload: does it stay Unlisted, and does it play inside the app? YouTube's API history says uploads from unverified projects stopped being forced to Private on 2 Nov 2026. Still to be tried on the real account.
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
1. Prove an Unlisted upload on the real account (about 1 hour, $0).
2. Pilot with 2–3 close people: unpacked folder plus test users (an afternoon, $0).
3. Stay in Testing for up to 100 people. Add a clear "sign in again" message for the weekly re-sign-in ($0).
4. Write the privacy policy and a one-page homepage (about 2 hours).
5. Move to a Private Web Store listing when manual updates get tedious (one-time fee, a day to prepare, plus review).
6. Apply for Google verification only to go past 100 people or end the weekly sign-in (domain cost, demo video, review time).
7. Don't ask for more YouTube quota unless daily uploads come close to 100.

## Name and message
- [x] Name chosen: **Videos Off My Phone**. GitHub repo renamed to `videos-off-my-phone`. Research is in [docs/naming.md](docs/naming.md); the draft listing is in [docs/listing.md](docs/listing.md).
- [ ] Rename it inside the app (manifest, page titles, texts), after the current build.
- [ ] Say the point on the start page and in the listing: YouTube storage doesn't count toward your Google storage. Free and open source. (Design session.)
- [ ] **Open source:** make the repo public, add a license, and keep the personal email out of the public history. Remove `UX_PROMPT.md` (an old internal brief with a local path) first.

## Housekeeping
- [x] Put the folder in git, with a private GitHub repo.
- [ ] Remove "(proof of concept)" from the name (part of the rename).
- [ ] Remove the old probe file and the `old/` folders (kept out of git).

## Rules that stay
- The app deletes only the Google Photos original, one confirmed video at a time, to the trash. It never empties the trash and never deletes or changes anything on YouTube.
- Nothing is deleted unless every check passes, including a fresh check of the YouTube copy right before the question.
