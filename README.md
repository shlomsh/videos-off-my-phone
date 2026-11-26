# Videos Off My Phone

**Free and open source.** A Chrome extension that moves your biggest videos from Google Photos to your own YouTube channel, in full original quality, then deletes the Google Photos originals for you.

Your phone and your Google storage fill up with videos. Your Google storage (15 GB free) is shared by Gmail, Google Drive and Google Photos, but **YouTube storage doesn't count toward it**. A video moved to your own channel stops using your Google storage, and Google Photos then removes it from your phone.

- You choose who can watch each copy: only you (Private, the default), people with the link (Unlisted) or everyone (Public).
- The app checks that the YouTube copy is complete before it offers to delete anything. It deletes one confirmed video at a time, and only after your yes.
- No ads, no account with us and no server of ours. Your videos go straight from Google Photos to YouTube.

Website and privacy policy: <https://videos-off-my-phone.vercel.app/>

## Install
- **Chrome Web Store:** coming soon.
- **From this repo:** open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose the `extension` folder. The manifest `key` gives it the ID `bplbdmkohpldgicplabdeplehdcnfcfa`, which the built-in sign-in expects.

## How it works
1. **Choose.** Your Google Photos videos, largest first. Tick the ones to move, or mark ones to delete without a copy.
2. **Move.** Each video streams from Google Photos to YouTube without being saved to disk. Every byte is counted and hashed, and YouTube must report the same size.
3. **Delete.** Right before each delete, YouTube and Google Photos are asked again. The copy must still be on your channel, finished, the same size, and no less private than you chose; the original must be in no shared album. If anything doesn't match or doesn't answer, nothing is deleted.

Deleted originals go to the Google Photos trash, which Google empties after 30 days. The app never empties the trash and never deletes or changes anything on YouTube.

## Good to know
- Google Photos has no public API for this, so the app uses Google Photos' own web calls, with your signed-in Google Photos tab. When Google changes them, the app stops safely without deleting.
- YouTube does not give back the original file. Keep another copy of anything irreplaceable.
- The app's records (what was moved and checked) live in this Chrome profile only. Removing the extension erases them.
- The phone steps after a delete are written for iPhone.

## Forks and your own build
`CLIENT_ID` in `extension/config.js` is the published build's Google sign-in client. It is public, not a secret, and works only for this extension's ID. For a fork, create your own:
1. In [Google Cloud](https://console.cloud.google.com), create a project and enable **YouTube Data API v3**.
2. Set up the OAuth consent screen as **External** and add yourself as a test user.
3. Create an OAuth client of type **Web application** with the redirect URI `https://<your extension ID>.chromiumapp.org/`.
4. Put its client ID in `extension/config.js`. There is no client secret.

`npm run pack` builds the Chrome Web Store zip in `dist/`, without the manifest `key`.

## Tests
`npm test` (Node 20 or later, no dependencies).

## Credits and license
Google Photos call formats are from [Google Photos Toolkit](https://github.com/xob0t/Google-Photos-Toolkit) (MIT, © 2024 xob0t).

Google Photos and YouTube are trademarks of Google LLC. This app is not made or endorsed by Google.

[MIT](LICENSE)
