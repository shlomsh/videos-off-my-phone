# Videos Off My Phone

**Free up your phone and your Google storage. Move your biggest videos to your own YouTube channel, in full original quality.**

Free and open source. No ads, no account with us, no server of ours.

[Add to Chrome](CHROME_WEB_STORE_URL) · [Privacy policy](privacy.html) · [Source code](https://github.com/shlomsh/videos-off-my-phone)

## Why
Your Google storage (15 GB free) is shared by Gmail, Google Drive and Google Photos. **YouTube storage doesn't count toward your Google storage.** Videos are usually the biggest things in Google Photos, so moving them to your own YouTube channel frees the most space.

## What it does
1. **Choose.** It lists the videos in your Google Photos, biggest first. You pick which to move and which to simply delete.
2. **Move.** Each video goes straight from Google Photos to your own YouTube channel, in its original quality. You choose who can watch it: only you (Private), people with the link (Unlisted), or everyone (Public).
3. **Check.** It compares the YouTube copy with the original: size, resolution, length and day.
4. **Delete, only after your yes.** For each video, it asks you by name. Then it moves the Google Photos original to the Google Photos trash. Google Photos then removes it from your phone. The trash keeps it for 30 days.

## What it can and cannot do
- It **uploads** to your YouTube channel and **reads** the details of what it uploaded. It **cannot delete or change** anything on YouTube.
- In Google Photos it only **moves a video you confirmed to the trash**. It never empties the trash and never touches albums. Videos in shared albums are never deleted.
- It works in **your own Chrome**, with your own open Google Photos tab. Google Photos has no public interface for this, so the extension uses the same internal web calls the Google Photos website uses, with your existing session in that tab. If Google changes them, the extension stops and deletes nothing.
- Nothing is sent to us. Your videos never pass through any server of ours. See the [privacy policy](privacy.html).

## Google sign-in
The extension asks Google for two YouTube permissions:
- **Manage your YouTube videos** (youtube.upload): to upload the videos you choose.
- **View your YouTube account** (youtube.readonly): to confirm your channel and check each uploaded copy before anything is deleted.

The extension uses YouTube API Services. By using it you agree to the [YouTube Terms of Service](https://www.youtube.com/t/terms). See also the [Google Privacy Policy](https://policies.google.com/privacy). You can revoke access at any time on your Google Account's [third-party access page](https://myaccount.google.com/connections).

Videos Off My Phone's use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy and the Google API Services User Data Policy, including the Limited Use requirements.

## Good to know
- YouTube does not give the original file back. Keep another copy of anything you can't replace.
- YouTube has daily upload limits.
- Google can change its storage rules.
- The phone steps are written for iPhone.

---
Google Photos and YouTube are trademarks of Google LLC. This app is not made or endorsed by Google. MIT licence.
