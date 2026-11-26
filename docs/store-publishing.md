# Publishing to the Chrome Web Store

Set up 26 Nov 2026. Workflows: [.github/workflows/release.yml](../.github/workflows/release.yml) and [ci.yml](../.github/workflows/ci.yml).

## How a release goes
1. A new version number in `extension/manifest.json` lands on `main`.
2. **Release / build** (automatic): runs the tests, builds the store zip (`npm run pack`: no `key`, `STORE_BUILD = true`), and creates the tag `vX.Y.Z` plus a GitHub release with the zip attached.
3. **Release / store** waits for your approval. GitHub emails you, and you press **Review deployments → Approve** on the run page. Then the workflow:
   - checks that no other version is waiting for review, and stops with a clear message if one is;
   - uploads the zip and waits until the store has accepted it;
   - submits it for review.
4. Google reviews it (hours to days) and emails you the result.
5. By default (`STAGED_PUBLISH`), an approved version waits for you to press **Publish** in the Developer Dashboard, so you choose the moment. Chrome then updates everyone within hours. To have it publish by itself after approval, set the repository variable `CWS_PUBLISH_TYPE` to `DEFAULT_PUBLISH`, or choose it when starting the workflow by hand.

Re-running: **Actions → Release → Run workflow** builds again only for a version that has no tag yet. A failed store job can be re-run from its run page.

Every push and pull request also runs **Tests** (unit tests, a syntax check, and the store zip build).

## One-time setup (your part)
Nothing secret is stored in GitHub. GitHub proves to Google which repo and which job is asking (Workload Identity Federation), and only the approved store job of this repo can sign in.

1. **Google Cloud:** open [Cloud Shell](https://shell.cloud.google.com), upload `tools/setup-store-publishing.sh` (⋮ → Upload) and run:
   `bash setup-store-publishing.sh YOUR_PROJECT_ID`
   Use the project that already holds the app's sign-in, or a new one. It turns on the Chrome Web Store API and creates a service account with no project roles, plus the GitHub trust.
2. **Developer Dashboard → Account:** add the service account email that the script prints. (One service account per publisher.)
3. **Developer Dashboard → Publisher → Settings:** copy your **Publisher ID**.
4. Send the Publisher ID and the script's two printed values to the build session, which sets them as repository variables. You can also set them yourself under GitHub → Settings → Secrets and variables → Actions → Variables:
   - `CWS_PUBLISHER_ID`: from step 3
   - `CWS_ITEM_ID`: `imkmnploomooalicacgniiicblmfclka` (already set)
   - `GCP_WIF_PROVIDER` and `GCP_SERVICE_ACCOUNT`: from the script
   - optional `CWS_PUBLISH_TYPE`: `STAGED_PUBLISH` (default) or `DEFAULT_PUBLISH`

Until all four are set, the store job skips with a warning. The tag and the GitHub release still happen.

## Limits
- The API can't create the item or edit the listing text and screenshots. Those stay in the Dashboard.
- Only one version can wait for review at a time. The workflow won't cancel a review by itself.
- A version the store already has can't be uploaded again. Bump the number.
- A new permission in `manifest.json` turns the extension off for every user until they accept it. Avoid adding one unless it's needed.
