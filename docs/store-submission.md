# Chrome Web Store: answers to paste

Prepared 26 Nov 2026 from `extension/manifest.json` 0.11.0 and [listing.md](listing.md). Nothing submitted. Each Upload, Save, Submit or Publish is your own click, after you say yes.

## 1. Register (your clicks)
- At https://chrome.google.com/webstore/devconsole, with the same Google account as the Cloud project.
- Accept the developer agreement and policies, then pay the one-time fee (the amount shows on the page; long $5).
- The account email can't be changed later.
- Then confirm the contact email on the Account page. Choose "non-trader" if asked (free, not a business), if that is true for you.

## 2. Upload a draft first, to learn the store ID
- **Add new item**, upload a zip of the `extension/` folder. This creates a draft; it publishes nothing.
- Then **Package → View public key**. That key gives the store ID (shown as Item ID).
- The main session puts that key in `manifest.json` in place of the old one, so the unpacked copy gets the store ID too. See [release-status.md](release-status.md) for what that changes.

## 3. Store listing tab
| Field | Value |
|---|---|
| Title (from manifest) | Videos Off My Phone |
| Summary (from manifest, max 132) | Free and open source. Move big videos to your own YouTube channel, which doesn't use your Google storage, then delete the originals. (132 characters, the limit) |
| Category | Tools (Productivity) |
| Language | English |
| Store icon | `docs/assets/icon-128.png` |
| Screenshots | `docs/assets/screenshot-1-start.png` … `screenshot-5-done.png` (1280×800); only after the repo is public, as they say "Free and open source" |
| Small promo tile | `docs/assets/promo-440x280.png` |
| Marquee | `docs/assets/marquee-1400x560.png` (optional) |
| Homepage URL | https://videos-off-my-phone.vercel.app/ |
| Support URL | https://github.com/shlomsh/videos-off-my-phone/issues (once public) |

### Description (paste)
> Your phone and your Google storage fill up with videos. YouTube storage doesn't count toward your Google storage.
>
> Videos Off My Phone moves your biggest videos from Google Photos to your own YouTube channel, in full original quality. You choose who can watch (only you, people with the link, or everyone), and the title and description.
>
> Every copy is checked against the original. Then it helps you delete the Google Photos originals, only after your yes. Google Photos then removes them from your phone.
>
> Free and open source. No ads, no account with us, no server of ours. Your videos go straight from Google Photos to YouTube.
>
> HOW IT WORKS
> 1. Choose: your videos, biggest first. Tick the ones to move to YouTube, or send a video straight to Delete with no YouTube copy.
> 2. Move to YouTube: each video streams from Google Photos to your channel. Nothing is saved to disk. Size, resolution, length and day are then compared with the original.
> 3. Delete from Google Photos, only after your yes: the original goes to the Google Photos trash, where it stays for 30 days. The extension never empties the trash.
>
> WHAT YOU SHOULD KNOW
> • Google Photos has no public interface for this. The extension uses the same internal web calls the Google Photos website uses, in your own open Google Photos tab, with your existing session. It never sees your password. If Google changes these calls, the extension stops and deletes nothing.
> • It can upload to YouTube and read what it uploaded. It cannot delete or change anything on YouTube.
> • Videos in shared albums are never deleted: they can go to YouTube, but Google Photos keeps them.
> • YouTube does not give the original file back. Keep another copy of anything you can't replace.
> • YouTube has daily upload limits.
> • The steps for removing the videos from your phone are written for iPhone.
>
> By using it you agree to the YouTube Terms of Service (https://www.youtube.com/t/terms).
>
> Google Photos and YouTube are trademarks of Google LLC. This extension is not made or endorsed by Google.

## 4. Privacy practices tab
### Single purpose (paste)
> Free up storage by moving the user's own videos from Google Photos to their own YouTube channel: upload a video they choose, check the YouTube copy is complete, and then, only after they confirm, move the Google Photos original to the trash.

### Permission justifications (paste one per field)
- **identity**: Signs the user in to Google with chrome.identity.launchWebAuthFlow, to get YouTube upload and read-only access for their own channel.
- **scripting**: Runs the Google Photos web calls inside the user's own open photos.google.com tab, where their session is: list videos and their details, read the original file, check shared albums and the trash, and move a video the user confirmed to the trash.
- **storage**: Keeps, in this Chrome only, one record per moved or deleted video (so nothing is uploaded or deleted twice), the user's choices, and the signed-in channel. The sign-in token is kept in session storage (memory) only.
- **declarativeNetRequestWithHostAccess**: Sets the Referer header for two kinds of request made by the extension's own pages only (initiator = this extension): the YouTube embedded player, which refuses to play without one, and Google Photos' own 720p preview of a video, so the user can watch it before choosing. No other site's requests are changed.
- **Host permissions**:
  - photos.google.com: the user's Google Photos library, in their own tab (see scripting).
  - video-downloads.googleusercontent.com: download the original video file that Google Photos offers, to stream it to YouTube.
  - *.googlevideo.com: play Google Photos' preview of a video inside the extension.
  - www.googleapis.com/youtube/v3/ and www.googleapis.com/upload/youtube/v3/: the YouTube Data API only (upload, and read the uploaded video's status).
  - www.youtube.com (optional, asked on first play): YouTube's embedded player for the uploaded copy.

### Remote code
> No, I am not using remote code. All code is in the package.

### Data usage: what to tick
The extension handles, in the browser only:
- **Authentication information**: the Google sign-in token (memory only).
- **Personally identifiable information**: the YouTube channel name and ID.
- **Website content**: the user's video files, names, sizes, dates and preview pictures from Google Photos.

Tick all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

Privacy policy URL: https://videos-off-my-phone.vercel.app/privacy

## 5. Distribution
- Visibility: **Public** (your priority). Unlisted or Private are the fallbacks if review is slow or refuses the Google Photos part.
- Regions: all.

## 6. Submit
- Untick **Publish automatically after review**, so it waits for you (30 days to publish after approval).
- Google says most reviews take a few days, up to a few weeks. A new developer and a new item take longer.
