import { StopError } from './transfer.js';

// Access to the signed-in Google Photos web session. Everything is read-only
// except moveToTrash, which takes one item and is only called by trash.js.
// Nothing here empties the trash, or makes, fills or reads an album.
// Uses undocumented calls, so every field is checked before it is trusted.
// Call ids and field positions come from Google Photos Toolkit
// (MIT, (c) 2024 xob0t), re-checked against a live response on 2026-11-25.

const KEY = /AF1Qip[\w-]+/g;
const DOWNLOAD_HOST = 'video-downloads.googleusercontent.com';

export function mediaKeyFromUrl(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.origin !== 'https://photos.google.com') return null;
  // Album and share URLs hold an album key first; the item key is last.
  // A bare /album/<key> or /share/<key> is not a video.
  if (/\/(album|share)\/[^/]+\/?$/.test(u.pathname)) return null;
  return u.pathname.match(KEY)?.at(-1) ?? null;
}

// Runs inside the Google Photos page, so it must be self-contained.
async function pageRpc(id, data) {
  const w = window.WIZ_global_data;
  if (!w?.SNlM0e) return { error: 'Not signed in to Google Photos in that tab.' };
  const q = new URLSearchParams({
    rpcids: id, 'source-path': location.pathname, 'f.sid': w.FdrFJe, bl: w.cfb2h, pageId: 'none', rt: 'c',
  });
  const freq = JSON.stringify([[[id, JSON.stringify(data), null, 'generic']]]);
  try {
    const r = await fetch(`${location.origin}${w.eptZe}data/batchexecute?${q}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: `f.req=${encodeURIComponent(freq)}&at=${encodeURIComponent(w.SNlM0e)}&`,
    });
    if (!r.ok) return { error: `Google Photos answered HTTP ${r.status}.` };
    const line = (await r.text()).split('\n').find((l) => l.includes('wrb.fr'));
    const payload = line && JSON.parse(line)[0][2];
    return payload ? { data: JSON.parse(payload) } : { error: 'Google Photos returned no data.' };
  } catch (e) {
    return { error: String(e) };
  }
}

async function rpc(tabId, id, data, tries = 3) {
  let result;
  for (let attempt = 1; ; attempt++) {
    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId }, world: 'MAIN', func: pageRpc, args: [id, data],
      });
      result = res?.result;
      if (result) break;
    } catch { /* the tab may be reloading */ }
    if (attempt >= tries) throw new StopError('Lost the Google Photos tab. Keep one open at photos.google.com.');
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (result.error) {
    if (/Not signed in|HTTP (401|403|429)/.test(result.error)) throw new StopError(result.error);
    throw new Error(result.error);
  }
  return result.data;
}

const FORMAT = 'Google Photos changed its response format; stopping.';
const isKey = (k) => typeof k === 'string' && /^AF1Qip[\w-]+$/.test(k);
const ALBUM = 72930366;
const VIDEO = 76647426;

function parseAlbum(a) {
  const m = a?.at?.(-1)?.[ALBUM];
  if (!isKey(a?.[0]) || !Array.isArray(m)) throw new StopError(FORMAT);
  return { key: a[0], title: m[1], count: m[3], shared: !!m[4] };
}

export function parseDetails(data, key) {
  const d = data?.[0];
  const details = {
    key: d?.[0], fileName: d?.[2], timestamp: d?.[3], tzOffset: d?.[4], size: d?.[5], width: d?.[6], height: d?.[7],
    original: d?.[30]?.[2] === 2,
    contentId: isContentId(d?.[11]) ? d[11] : null,
    albums: (d?.[19] ?? []).map(parseAlbum),
  };
  details.sharedAlbums = details.albums.filter((a) => a.shared).map((a) => a.title);
  if (details.key !== key) throw new Error('Google Photos returned a different item than requested.');
  if (typeof details.fileName !== 'string' || !Number.isSafeInteger(details.size) || details.size <= 0) {
    throw new Error(FORMAT);
  }
  return details;
}

export function checkDownloadUrl(link) {
  const u = new URL(link);
  if (u.protocol !== 'https:' || u.host !== DOWNLOAD_HOST) throw new Error(`Unexpected download host: ${u.host}`);
  return u.href;
}

export async function getDetails(tabId, key) {
  return parseDetails(await rpc(tabId, 'fDcn4b', [key, 1, null, null, 1]), key);
}

export async function getDownloadUrl(tabId, key) {
  return checkDownloadUrl((await rpc(tabId, 'pLFTfd', [[key], null, null]))?.[0] ?? '');
}

/** Picture and length of one video, wherever it is in the library. */
export function parseItem(data, key) {
  const i = data?.[0];
  if (i?.[0] !== key) return null;
  const thumb = i[1]?.[0];
  const duration = i.at(-1)?.[VIDEO]?.[0];
  return { thumb: isThumb(thumb) ? thumb : null, duration: Number.isFinite(duration) ? duration : undefined };
}
/** Null if Google Photos has nothing to show for it, as for one in the trash. That alone is no proof. */
export async function getItem(tabId, key) {
  try { return parseItem(await rpc(tabId, 'VrseUb', [key, null, null, null, null]), key); } catch (e) {
    if (/returned no data/.test(e.message)) return null;
    throw e;
  }
}

// One page of the library (500 items, newest first), reduced to your own finished videos.
export function parseLibraryPage(data) {
  if (!Array.isArray(data?.[0])) throw new StopError(FORMAT);
  const videos = [];
  for (const i of data[0]) {
    const duration = i?.at?.(-1)?.[VIDEO]?.[0];
    if (duration === undefined) continue;
    const owned = Array.isArray(i[7]) && !i[7].some((x) => Array.isArray(x) && x.includes(27));
    if (!isKey(i[0]) || !owned || i[12]?.[0] === 20) continue;
    videos.push({ key: i[0], timestamp: i[2], duration, thumb: i[1]?.[0], contentId: isContentId(i[3]) ? i[3] : null });
  }
  return { videos, scanned: data[0].length, oldest: data[0].at(-1)?.[2], next: data[1] || null };
}

export function parseBulkInfo(data, keys) {
  const rows = data?.[0]?.[1];
  if (!Array.isArray(rows)) throw new StopError(FORMAT);
  const out = new Map();
  for (const [key, d] of rows) {
    if (!keys.includes(key) || !Array.isArray(d)) continue;
    const quality = d.at(-1);
    // undefined means Google did not say; the check before uploading decides.
    const q = Array.isArray(quality) ? quality[2] : undefined;
    out.set(key, { fileName: d[3], size: d[9], original: q === undefined ? undefined : q === 2 });
  }
  return out;
}

// Positions 24 and 35 ask for the space and quality fields. With 34 instead of
// 35 Google answers without the quality, so the shape is covered by a test.
export const BULK_FIELDS = Array(36).fill(null);
BULK_FIELDS[24] = []; BULK_FIELDS[35] = [];

async function bulkInfo(tabId, keys) {
  return parseBulkInfo(await rpc(tabId, 'EWgK9e', [[[keys.map((k) => [k])], [BULK_FIELDS]]]), keys);
}

/** Yields pages of videos from the whole library (archive included, trash not). */
export async function* listVideos(tabId, signal, { sizes = true, from = null } = {}) {
  const seen = new Set();
  let page = from;
  do {
    signal?.throwIfAborted();
    const r = parseLibraryPage(await rpc(tabId, 'lcxiM', [page, null, 500, null, 1, 3]));
    for (let i = 0; sizes && i < r.videos.length; i += 50) {
      const part = r.videos.slice(i, i + 50);
      const info = await bulkInfo(tabId, part.map((v) => v.key));
      part.forEach((v) => Object.assign(v, info.get(v.key)));
    }
    yield { videos: r.videos, scanned: r.scanned, oldest: r.oldest, next: r.next };
    page = r.next;
    if (page && seen.has(page)) throw new StopError('Google Photos repeated a page; the list is incomplete.');
    seen.add(page);
  } while (page);
}

/**
 * Which of these videos are in the library now (so not in the trash). Reads
 * newest first and stops once it is well past the oldest one asked for.
 */
export async function findInLibrary(tabId, wanted, signal, pages = listVideos(tabId, signal, { sizes: false })) {
  const missing = new Map(wanted.map((v) => [v.key, v.timestamp]));
  const found = new Set();
  if (!missing.size) return found;
  for await (const page of pages) {
    for (const v of page.videos) if (missing.delete(v.key)) found.add(v.key);
    const oldestWanted = Math.min(...[...missing.values()].map((t) => (Number.isFinite(t) ? t : -Infinity)));
    if (!missing.size || page.oldest < oldestWanted - 3 * 86400_000) break;
  }
  return found;
}

/** The content id the library lists for this video now, or null if it is not listed. */
export async function libraryId(tabId, key, timestamp, signal, pages = listVideos(tabId, signal, { sizes: false })) {
  for await (const page of pages) {
    const v = page.videos.find((x) => x.key === key);
    if (v) return v.contentId ?? 'unknown';
    if (Number.isFinite(timestamp) && page.oldest < timestamp - 3 * 86400_000) break;
  }
  return null;
}
/** The content id from a third place, or null. Null for one in the trash. */
export async function itemId(tabId, key) {
  let i;
  try { i = (await rpc(tabId, 'VrseUb', [key, null, null, null, null]))?.[0]; } catch (e) {
    if (/returned no data/.test(e.message)) return null;
    throw e;
  }
  return i?.[0] === key && isContentId(i[3]) ? i[3] : null;
}

export function parseTrashPage(data) {
  // An empty trash has no list. Anything else must be a list of items with ids.
  const list = data?.[0] ?? [];
  if (!Array.isArray(data) || !Array.isArray(list) || !list.every((i) => isKey(i?.[0]) && isContentId(i[3]))) throw new StopError(FORMAT);
  return { items: list.map((i) => ({ key: i[0], contentId: i[3] })), next: data[1] || null };
}
export async function trashList(tabId) {
  const all = [];
  const seen = new Set();
  let page = null;
  do {
    const r = parseTrashPage(await rpc(tabId, 'zy0IHe', [page]));
    all.push(...r.items);
    page = r.next;
    if (page && (typeof page !== 'string' || seen.has(page))) throw new StopError(FORMAT);
    seen.add(page);
  } while (page);
  return all;
}
/** Moves one item to the trash. Sent once, never repeated. The answer proves nothing: read the trash back. */
export const trashCall = (contentId) => {
  if (!isContentId(contentId)) throw new StopError('Nothing was deleted. The video has no content id.');
  return ['XwAOJf', [null, 1, [contentId], 3]];
};
export async function moveToTrash(tabId, contentId) {
  await rpc(tabId, ...trashCall(contentId), 1);
}

// Its content id is the same wherever Google Photos shows it.
const isContentId = (c) => typeof c === 'string' && /^[\w+/=-]{20,40}$/.test(c);

// Runs inside the Google Photos page: thumbnails need that page's sign-in.
async function pageThumbs(urls) {
  return Promise.all(urls.map(async (u) => {
    try {
      const r = await fetch(u, { credentials: 'include' });
      const type = r.headers.get('content-type') ?? '';
      if (!r.ok || !/^image\/(jpeg|png|webp)/.test(type)) return null;
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (bytes.length > 200_000) return null;
      let s = '';
      for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return `data:${type.split(';')[0]};base64,${btoa(s)}`;
    } catch { return null; }
  }));
}
const isThumb = (u) => typeof u === 'string' && /^https:\/\/(photos\.fife\.usercontent\.google\.com|lh\d+\.googleusercontent\.com)\/[^?#]+$/.test(u);

/** Small pictures as data URLs; null where one is unavailable. */
export async function getThumbnails(tabId, bases, size = 'w160-h90-c') {
  const ok = bases.map((b) => (isThumb(b) ? `${b}=${size}` : null));
  const urls = ok.filter(Boolean);
  if (!urls.length) return bases.map(() => null);
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: pageThumbs, args: [urls] });
  const got = [...(res?.result ?? [])];
  return ok.map((u) => {
    const d = u ? got.shift() : null;
    return typeof d === 'string' && /^data:image\/(jpeg|png|webp);base64,[\w+/=]+$/.test(d) ? d : null;
  });
}

// Runs inside the Google Photos page. Finds the address Google plays the video from:
// 720p if there is one, else 360p. Only the first bytes are asked for.
async function pageStream(base) {
  for (const size of ['m22', 'm18']) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(`${base}=${size}`, { credentials: 'include', headers: { range: 'bytes=0-1' }, signal: ctl.signal });
      if (r.ok && /^video\//.test(r.headers.get('content-type') ?? '')) return r.url;
    } catch { /* try the smaller one */ } finally { clearTimeout(timer); ctl.abort(); }
  }
  return null;
}
export function checkStreamUrl(u) {
  let url;
  try { url = new URL(u); } catch { return null; }
  return url.protocol === 'https:' && !url.port && !url.username && /^[\w-]+(\.[\w-]+)*\.googlevideo\.com$/.test(url.hostname) ? url.href : null;
}
/** Where the video can be watched for the next hours, or null. A preview, not the original. */
export async function getStream(tabId, base) {
  if (!isThumb(base)) return null;
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: pageStream, args: [base] });
  return checkStreamUrl(res?.result);
}
