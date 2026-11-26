# Videos Off My Phone: release plan for family and friends

Research date: 26 Nov 2026. Official sources first. Where I found nothing official, I say so.

## Short answer

- Staying in Testing works for up to 100 people, but each person must be added by hand and must re-sign-in every 7 days.
- The old "uploads are locked to Private" rule was removed on 2 Nov 2026. Unlisted and Public uploads should now work without an audit.
- The Chrome Web Store private listing is the best way to share, but the Google Photos part is the biggest unknown.

## 1. OAuth

**Scope class.** Google's docs say sensitive scopes need review and restricted scopes need more. The pages I read do not label youtube.upload or youtube.readonly either way. They only describe them ("Manage your YouTube videos", "View your YouTube account"). Nothing official says "restricted". Google's own examples of sensitive scopes include deleting a YouTube video, so treat both as sensitive. The consent screen in Cloud Console marks each scope for your project. Check it there.

**Testing status.**
- Up to 100 test users, each added by email in the consent screen.
- Authorisation, and any refresh token, expires 7 days after consent. Everyone must sign in again weekly.
- Testing apps still show the "unverified app" warning.
- Only apps that ask for name, email and profile are free of these limits. Ours is not one of them.

**The 100-user cap.** Another Google page says the cap for unverified apps counts new users over the life of the project and cannot be reset. Test users are listed separately. Sources do not make it fully clear how the two caps interact. Plan for 100 people, total.

**Verification needs** (sensitive scopes):
- A public homepage that describes the app and links to the privacy policy.
- A privacy policy on the same domain. It must say how Google data is used, stored and shared.
- Proof you own that domain, via Search Console.
- A written reason for each scope.
- A demo video, uploaded Unlisted to YouTube. It must show the full sign-in flow in English, with the client ID visible in the address bar.
- Review takes up to 10 days (one Google page says 3-5 business days; another says it can take months). Google's guidance says "plan for" up to 10 days.

**Exemption.** Google says you need no verification for personal use: you, or a few people you know. It also says Testing with a test-user list is exempt. Neither has a precise number. "Tens of people" fits Testing. It does not fit a "few".

## 2. YouTube API

**Quota today.** Default is 10,000 units per day for all methods except two. videos.list costs 1 unit. videos.insert and search.list have their own buckets: 100 calls per day each. The page says one insert call costs 1 unit in the upload bucket. Since 1 Jun 2026 inserts sit in that separate bucket. On 4 Dec 2025 the documented cost fell from about 1,600 units to about 100. Quota resets at midnight Pacific time.

So the cap is about 100 uploads per day for the whole project, shared by every user. That is enough for tens of family members unless someone offloads a big library in one day. The default is "subject to change".

**Extension and audit.** To get more quota, you first pass an API compliance audit, then submit the Audit and Quota Extension Form. Google gives no timeline ("as soon as possible"). Not needed for this plan.

**The Private-lock rule. It was lifted.**
- Old rule (28 Jul 2020): videos uploaded by unverified projects created after that date were forced to Private until the project passed an audit.
- The revision history has a 2 Nov 2026 entry: videos from unverified projects "are no longer restricted to private viewing mode". It says this reverses the 2020 policy.
- The current insert reference, the upload guide and the audit guide all agree. The audit guide says no audit is needed for public or unlisted uploads within default quota.
- Conflict: one search summary still quoted the old rule, probably from a cached or older copy. The direct official pages say otherwise. I trust them.
- Caveats: if privacyStatus is left out, the video defaults to public. The creator's own account settings can still make some uploads private. Do a live test with an Unlisted upload from a second account before promising it.

## 3. Chrome Web Store

**Private or small-group sharing.** Three visibilities exist: Public, Unlisted (anyone with the link can install), and Private (named users only).
- Private: add trusted testers by email in the developer account. Each must have a Google Account. The tester list belongs to the account, not to one extension.
- You can also add a Google Group you own. Members can then install.
- Domain publishing needs Google Workspace with an admin.
- The docs give no tester cap. Review still applies to private items.

**Fee.** One-time registration fee. The current register page does not state the amount. The long-standing figure is $5 (2010 and 2020 Chromium sources). The Developer Agreement says Google sets the amount. Confirm on the dashboard.

**Policy risks.**
- Single purpose: "narrow and easy to understand". Offload to YouTube plus Photos cleanup could be argued as one purpose. Write it that way.
- Deceptive behaviour: the listing must say plainly that it uses your Photos session and deletes items. Hiding that is the real risk.
- Minimum permissions: ask only for photos.google.com and YouTube API hosts.
- Limited Use: data may be used only for the disclosed purpose, no ads, no human reading. A privacy policy and a disclosure on the homepage are required. Do not send any data to your own server.
- "API use" policy: says to use existing Chrome APIs. It does not mention undocumented website endpoints. The policy text I read says nothing about them at all.
- Google Terms of Service bar automated access that breaks a site's robots.txt, and interfering with or bypassing systems. Nothing I found says calling Photos' internal endpoints from the user's own tab is banned. It is also not documented as allowed. Treat it as a grey area. Google can change these endpoints without notice.
- Note: Google narrowed the official Photos Library API in March 2025. That makes the web-endpoint route likelier to look like a workaround to a reviewer.

**Known cases.** I found no reported delisting of a Photos extension for using internal endpoints. A popular "Delete All Google Photos" extension is still listed and says it reads and stores nothing. Its listing notes Google UI changes broke it. Absence of reports is not proof of safety.

## 4. Alternatives to the Web Store

- **Load unpacked.** Each person turns on Developer mode and loads a folder. Free. Chrome nags at each start, and updates are manual. Hard for non-technical family. The Chrome docs page I fetched does not cover this path. It is widely known behaviour.
- **Local .crx files.** Blocked on Windows (since Chrome 33) and macOS (since Chrome 44). Works on Linux only.
- **Preferences file or registry.** Windows and Mac must still point at the Web Store.
- **Enterprise policy.** Needs managed devices, usually Workspace or Chrome Enterprise. It is heavy for family and is not a fit for personal laptops.

## 5. Recommended path (cheapest first)

1. **Prove the Unlisted/Public upload works today.** Use the Testing project with a second test account. Time: 1 hour. Cost: $0. If it works, the Private-lock is no longer a blocker.
2. **Share by unpacked zip with 2-3 close people.** Add each as a test user. Time: an afternoon. Cost: $0. Expect weekly re-sign-in and manual updates. Good for a pilot only.
3. **Stay in Testing for up to 100 people.** Add each by email. Cost: $0. Accept the unverified warning and the 7-day token expiry. Add a clear "sign in again" message in the app.
4. **Move to a Private Web Store listing** when updates get tedious. Pay the one-time fee (about $5). Add testers by email or a Google Group. Time: a day to prepare, plus review wait (no figure from Google). Needs a privacy policy and honest listing text.
5. **Write the privacy policy and a one-page homepage.** Free hosting works. Include the Limited Use sentence and state exactly what is read, uploaded and deleted. Time: 2 hours. Needed for step 4 and for any later verification.
6. **Only if you need to pass 100 people or kill the weekly re-sign-in, apply for OAuth verification.** Needs a domain you own (about $10-15 a year), the demo video, and 1-10+ days. Weigh it. The Photos endpoints are not covered by any of this.
7. **Keep a fallback.** If the Web Store rejects the Photos part, stay on unpacked installs for the few users, or drop in-extension delete and let users trash items by hand.
8. **Do not request more quota** unless daily uploads regularly approach 100.

## Open questions I could not settle

- No official page says "sensitive" next to youtube.upload by name.
- No official statement on whether the 100-user cap and the 100-test-user list are the same pool.
- No official statement on Chrome Web Store review time for private items.
- No official ruling on using undocumented Photos endpoints.

## Sources

- YouTube Data API revision history (2 Nov 2026 entry; Dec 2025 and Jun 2026 quota entries): https://developers.google.com/youtube/v3/revision_history
- videos.insert reference: https://developers.google.com/youtube/v3/docs/videos/insert
- Upload a video guide: https://developers.google.com/youtube/v3/guides/uploading_a_video
- Quota and compliance audits: https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits
- Quota costs: https://developers.google.com/youtube/v3/determine_quota_cost
- YouTube getting started (default allocation): https://developers.google.com/youtube/v3/getting-started
- YouTube OAuth scopes: https://developers.google.com/youtube/v3/guides/authentication
- Google OAuth scopes list: https://developers.google.com/identity/protocols/oauth2/scopes
- Sensitive scope verification: https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification
- Brand verification and scope classes: https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification
- Unverified apps: https://support.google.com/cloud/answer/7454865
- Manage app audience (Testing, 7-day expiry): https://support.google.com/cloud/answer/15549945
- OAuth verification FAQ (lifetime user cap): https://support.google.com/cloud/answer/13463817
- Chrome Web Store distribution: https://developer.chrome.com/docs/webstore/cws-dashboard-distribution
- Register a developer account: https://developer.chrome.com/docs/webstore/register
- Chrome Web Store program policies: https://developer.chrome.com/docs/webstore/program-policies/policies
- User data FAQ (Limited Use): https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- Install extensions outside the Store: https://developer.chrome.com/docs/extensions/how-to/distribute/install-extensions
- Google Terms of Service: https://policies.google.com/terms
- Fee history (2020 Chromium blog): https://blog.chromium.org/2020/03/new-developer-dashboard-and.html
- Google Photos API updates (Mar 2025 change): https://developers.google.com/photos/support/updates
