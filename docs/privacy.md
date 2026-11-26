# Privacy policy: Videos Off My Phone

Last updated: 26 November 2026

Videos Off My Phone is a free, open-source Chrome extension. It moves videos you choose from Google Photos to your own YouTube channel, checks the copy, and then, only after you say yes, moves the Google Photos original to the Google Photos trash.

**The short version:** the extension runs only in your own Chrome. It has no server, no account with us, no ads, no analytics and no tracking. Your videos and data go straight between your browser, Google Photos and YouTube. We never receive, see or store any of it.

## Who we are
Videos Off My Phone is made by an independent developer. It is not made or endorsed by Google. Google Photos and YouTube are trademarks of Google LLC.

Contact: open an issue at https://github.com/shlomsh/videos-off-my-phone/issues

## YouTube API Services
The extension uses **YouTube API Services** to upload videos to your channel and to read back their details. By using it you agree to be bound by the [YouTube Terms of Service](https://www.youtube.com/t/terms). Google's handling of your data is described in the [Google Privacy Policy](https://policies.google.com/privacy).

## Google Photos
Google Photos has no public interface for this. The extension uses **the same internal web calls the Google Photos website itself uses**, from your own open, signed-in Google Photos tab. It uses your existing Google Photos session in that tab. It never sees, asks for or stores your Google password or cookies, and it never sends them anywhere.

Google can change these calls at any time. If they change, the extension stops and deletes nothing.

## What the extension reads, and why

| Data | From | Why |
|---|---|---|
| Your list of videos: name, size, date, length, quality, preview picture | Google Photos, in your tab | To show your biggest videos so you can choose. |
| Whether a video is in a shared album | Google Photos | Videos in shared albums are never deleted. |
| The original video file | Google Photos | Streamed straight to YouTube. It is never saved to disk. |
| The Google Photos trash list | Google Photos | To confirm that a delete really happened. |
| Your YouTube channel name and ID | YouTube API (youtube.readonly) | To show which channel you are signed in to, and to make sure every upload goes to that same channel. |
| Details of the videos the extension uploaded: privacy, size, resolution, processing state, recording day | YouTube API (youtube.readonly) | To check the copy is complete before it offers to delete the original. |

## What the extension writes

- **On YouTube** (youtube.upload): it uploads the videos you choose, with the file name as the title, the recording day, and the privacy you choose (Private, Unlisted or Public). It marks them "not made for kids" (your own phone videos); you can change that in YouTube Studio. It cannot delete or change anything on YouTube.
- **In Google Photos:** only when you confirm a video by name, it moves that one video to the Google Photos trash. It never empties the trash. It makes, fills and changes no albums.

## What is stored, and where

Everything is stored **only in your own Chrome profile**, on your computer. Nothing is sent to us or to anyone else.

- **YouTube sign-in:** the access token from Google lasts about an hour. It is kept in Chrome's memory only (never on disk) and is gone when Chrome closes.
- **Your channel name and ID**, so that later sign-ins go to the same channel.
- **For each video you moved:** its Google Photos item ID, file name and size, a SHA-256 checksum of the file, the YouTube video ID and channel ID, the visibility you chose, when it happened, and the result of each check.
- **For each video you deleted:** its Google Photos ID, file name and size, and whether the delete was confirmed from the trash.
- These records stop a video being uploaded twice or deleted twice.
- **Your choices** (which videos you marked to delete) until you act on them.

The extension uses no cookies of its own and no third-party code, ads or analytics.

## Sharing
We share nothing, because we receive nothing. Your videos go from Google Photos to YouTube through your own browser. Google receives them as part of Google Photos and YouTube, under Google's own terms.

## Limited Use
Videos Off My Phone's use of information received from Google APIs will adhere to the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/limited-use), including the Limited Use requirements, and to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

- Data is used only to move, check and delete the videos you choose.
- It is never sold, never used for ads, and never read by a person.
- It is never sent to a server of ours. There is none.

## Deleting your data and revoking access
- **Revoke YouTube access** at any time on your Google Account's [third-party access page](https://myaccount.google.com/connections) (also at https://security.google.com/settings/security/permissions). After that the extension can no longer upload or read anything on YouTube.
- **Delete what the extension stored:** remove the extension from Chrome (`chrome://extensions`, then Remove). This deletes all its records from your computer at once.
- Removing the extension does not touch your videos on YouTube or in Google Photos. Manage those in YouTube Studio and Google Photos.

## Children
The extension is not directed at children under 13.

## Changes
If this policy changes, the new version is posted here with a new date. If the extension ever needs to use your data in a new way, it will ask you first.
