# Videos Off My Phone

A Chrome extension to clean up the videos that fill a phone: each one is either deleted,
or moved to YouTube as Private and checked. It streams files without saving them to disk.
It makes, fills and reads no albums. It deletes only one video at a time, after you confirm it by name, by moving it to the Google Photos trash.

## 1. Load it
1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose the `extension` folder here.
3. Check that the ID is `bplbdmkohpldgicplabdeplehdcnfcfa`.

## 2. Check an original (no Google Cloud needed)
1. Open a video on photos.google.com.
2. Click the extension's icon.
3. Optionally paste an expected SHA-256, then click **Check original**.

## 3. YouTube sign-in (once)
In [Google Cloud](https://console.cloud.google.com), with your own account:
1. Create a project and enable **YouTube Data API v3**.
2. Set up the OAuth consent screen as **External** and add yourself as a test user.
   In Testing, sign-in lasts 7 days. Publishing to production is reported to avoid that.
3. Create an OAuth client of type **Web application** with the redirect URI
   `https://bplbdmkohpldgicplabdeplehdcnfcfa.chromiumapp.org/`.
4. Put the client ID in `extension/config.js`. People using the extension never see it. There is no client secret to enter.
   Later visits sign in silently to the same channel. Access (about an hour) is kept only in Chrome's memory, never on disk, and is gone when Chrome closes. In Testing mode Google asks again after about 7 days.

## 4. Using it
Click the extension's icon. On a single video in Google Photos, that video comes first. Sign in, then three steps:
1. **Choose.** Videos appear as they are read, largest first. The ring ticks a video to move. Click a picture to watch it (arrows, Space, Esc) and answer **Delete** or **Move to YouTube**, with Undo. An answer only marks or ticks. Copies are always Private and "not made for kids".
2. **Move.** Progress, and one state under each picture: what needs you first. Click a picture to see both copies and the facts of each. What passes every check goes to Delete by itself; nothing is written to Google Photos by that.
3. **Delete.** One list: **On YouTube** and **No copy**. Both can be deleted, one at a time, each with its own yes. For a video on YouTube, YouTube and Google Photos are asked again before the question and again right before the call: it must still be there, Private, finished, whole, on your channel, in no shared album, and no compared fact may be different. If YouTube does not answer, nothing is deleted. Its record is kept, so it is not offered again.

### Deleting
Rules, all in `lib/trash.js` and checked again right before the one call: marked, ticked and confirmed by name; no upload record of any
kind; in no shared album; name and size as shown; the same content id in three answers; not in the trash already; written down first
(`trash:` entries), never sent twice; success only when read back from the trash and gone from the library. If that is not certain, or
other items appeared with it, nothing else can be deleted until you opened the trash and everything was read again; this survives a reload.
Nothing empties the trash or deletes on YouTube. Marks stay in this Chrome (`mark:` entries). The iPhone copy is not touched by this:
the user's test suggests the Google Photos app removes it after a sync there.
The call (`XwAOJf`) comes from Google Photos Toolkit. No run on a real account is recorded yet: first try one throwaway clip.

Moved means: the upload finished and was hashed, YouTube lists it on the same channel as processed, Private, with the same size and
resolution, Google Photos still has the same Original quality file, it is in no shared album, and no compared fact differs.

The interface is `app.html`. `manager.html` still works by address. `old/concept-d` and `old/v0.6.1` hold earlier versions, the second
with the album code and its tests. Albums made by earlier versions are never touched.

Google Photos videos play here from Google's own preview (up to 720p), never the original, and opening one makes no sound.
That needs access to `googlevideo.com` (new in 0.4.1). Tested with stand-in servers only; if one does not play, the
still picture stays with "Open in Google Photos".

Nothing is played from YouTube until it has finished processing. A moved video that is no longer in the library (for example in
the trash) leaves Move once its copy is confirmed; until then its pair says not to empty the trash.

The YouTube copy plays in place too. The first play asks for access to www.youtube.com, used only to load the player and
to tell YouTube which app shows it. Public videos play this way; Private ones are unproven. If YouTube refuses, the video
opens in a small YouTube window instead.

## What is checked
- Google Photos must list the file as Original quality, and the download must be exactly the listed size.
- Every byte sent is counted and hashed. YouTube must accept the full length and return a video ID.
- Afterwards it reports the privacy, size, resolution and frame rate YouTube shows.
- It cannot read HDR on either side, so it says nothing about it.
- YouTube does not play Private videos inside another page, even for the owner (tested in a real Chrome 2026-11-26: error 150 on an ordinary page, error 5 in the app). The app shows the picture and "Open on YouTube" instead.
- After a delete, the app shows the five iPhone steps (Google Photos: your picture, Review out-of-sync changes, Review, Delete all only if it holds just what was deleted here, then the iPhone's own Delete). The iPhone keeps it in Recently Deleted for 30 days.

## Limits
- Google Photos access uses undocumented web calls and can break at any time.
- Keep both the Videos Off My Phone tab and the Google Photos tab open.
- Two real uploads so far (2026-11-25). 196 MB in 24 s: bytes sent matched a saved original; after processing YouTube reported the same size, Private, 3840×2160, 59.97 fps, H.265 and the right day. 485 MB in 150 s: same size and Private; processing had not finished when last checked.
- YouTube keeps only the recording day, not the time, and may take a while to show it. Local-day handling near midnight is unit-tested only.
- Sign-in lasts about an hour. Renewal between videos works; renewal in the middle of one is unproven. Files over 485 MB and dropped connections are untested on the real services.
- Google Photos ignored partial downloads, so a dropped connection re-reads the file from the start.
- It cannot change privacy after uploading. Use YouTube Studio for that.
- The list, the trash list and the shared-album flag were checked read-only on a real account. A real two-video queue ran on 2026-11-25 (36 and 38 MB) and renewed the sign-in by itself before each video.
- 0.7 and 0.8 (Choose, Move, one Delete list; 0.8 also deletes videos on YouTube) ran only against stand-in servers.
- Shared-album detection does not see other kinds of sharing (links, conversations, partner sharing).
- An interrupted upload is never repeated on its own until YouTube says nothing arrived. If YouTube cannot say, you check YouTube Studio.
- Upload records live in this Chrome profile only. Removing the extension or its data loses them.
- YouTube does not give back the original file. Keep another copy of anything irreplaceable.
- Not built: automatic runs, several at once.

## Tests
`npm test` (Node 20 or later, no dependencies).

Google Photos call formats are from [Google Photos Toolkit](https://github.com/xob0t/Google-Photos-Toolkit) (MIT, © 2024 xob0t).
