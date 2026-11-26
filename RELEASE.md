# Before an official release

Last updated: 26 Nov 2026. Installed version: 0.8.2.

## Being built now (approved)
- [ ] **Who can watch on YouTube** (canvas v32 to v35). Move asks each time: Private (chosen first), Unlisted or Public, with a warning for Public. The choice is stored with each upload. Once a video is on YouTube, the app only shows its visibility and never changes it.
- [ ] **Delete check goes by direction.** Private < Unlisted < Public.
  - Same as chosen, or more private: it can be deleted (with the note "YouTube kept it Private…").
  - Less private than chosen: it stops, with "Set it back to Private in YouTube Studio, then check again."
- [ ] **The delete question shows the visibility.** For example "On YouTube, Unlisted. Checked just now.", plus "Anyone can watch the YouTube copy." for Public.
- [ ] **"Cleared" counter** in the header and on the done page, with milestones at 1, 2, 5, 10, 20, 50, 100, 200 and 500 GB.

## Approved, not built yet
- [ ] Step 1 shows videos that are already in Move or Delete, faded with "In Move" / "In Delete". A click opens them there.
- [ ] "Do not move it" beside "Try again" for an upload that did not arrive.
- [ ] After Stop, the waiting videos appear only in step 2.
- [ ] In step 3, Delete on a no-copy video goes straight to the question.

## Decisions still open (yours)
- [ ] Deleting several videos with one yes (board E22).
- [ ] Whether people other than you should be able to sign in.

## Not proven on the real account yet
- [ ] Deleting a **no-copy** video. Only an On YouTube one has been done (IMG_4959.MOV).
- [ ] An **Unlisted** upload: whether YouTube allows it from this unverified project, and whether it plays inside the app. Google's own pages disagree.
- [ ] **Whether the Google Photos trash still counts toward storage.** Google's Help pages don't say. Until it is known, the counter must not say the space is free now. To find out, compare the storage figure before and after a large delete.

## Needed before other people can use it
- [ ] **Sign-in for others.** The Google Cloud project is in testing mode. Each person must be added as a test user (up to 100) and sees Google's "unverified app" warning. Without that, Google must verify the app.
- [ ] **YouTube daily limit.** About 100 uploads a day for the whole project, shared by everyone.
- [ ] **Installing.** Today it is an unpacked folder. A private Chrome Web Store listing would be easier, but the Web Store may reject it.
- [ ] **Fragility.** Google Photos is reached through Google's internal web calls, not a public API. When they change, the app stops safely without deleting.
- [ ] **Privacy policy**, needed for verification and the Web Store.
- [ ] **Android.** The phone steps are iPhone only.

## Housekeeping
- [x] Put the folder in git, with a private GitHub repo.
- [ ] Remove "(proof of concept)" from the name.
- [ ] Remove the old probe file and the `old/` folders (kept out of git).

## Rules that stay
- The app deletes only the Google Photos original, one confirmed video at a time, to the trash. It never empties the trash and never deletes or changes anything on YouTube.
- Nothing is deleted unless every check passes, including a fresh check of the YouTube copy right before the question.
