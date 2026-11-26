import { mediaKeyFromUrl } from './lib/photos.js';

// Opens the app. From a single video's page, that video comes first.
chrome.action.onClicked.addListener(async (tab) => {
  const key = mediaKeyFromUrl(tab.url ?? '');
  const q = new URLSearchParams();
  if (key) q.set('key', key);
  if (tab.url?.startsWith('https://photos.google.com/')) q.set('tab', String(tab.id));
  await chrome.tabs.create({ url: chrome.runtime.getURL(`app.html?${q}`) });
});
