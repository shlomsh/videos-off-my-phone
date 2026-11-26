// What was sent, kept in this browser only. One entry per Google Photos item.
//   sending   an upload was started; ask YouTube before starting another
//   uncertain YouTube could not say what happened; the user must look
//   uploaded  YouTube returned a video id
const name = (key) => `upload:${key}`;

const normalize = (r) => (r ? { state: 'uploaded', ...r } : null); // 0.1 had no state

export async function getRecord(key) {
  return normalize((await chrome.storage.local.get(name(key)))[name(key)]);
}
export async function setRecord(key, record) {
  await chrome.storage.local.set({ [name(key)]: record });
}
export async function removeRecord(key) {
  await chrome.storage.local.remove(name(key));
}
export async function allRecords() {
  const all = await chrome.storage.local.get(null);
  return new Map(Object.entries(all).filter(([k]) => k.startsWith('upload:')).map(([k, v]) => [k.slice(7), normalize(v)]));
}

// What the user decided: "bare" means delete it without a copy. A mark changes nothing in
// Google Photos. If it is lost, the video only shows up again in step 1.
export async function allMarks() {
  const all = await chrome.storage.local.get(null);
  return new Map(Object.entries(all).filter(([k, v]) => k.startsWith('mark:') && v?.decision === 'bare').map(([k, v]) => [k.slice(5), v]));
}
export async function setMark(key, mark) {
  if (mark) await chrome.storage.local.set({ [`mark:${key}`]: mark });
  else await chrome.storage.local.remove(`mark:${key}`);
}
/** "Keep" is no answer any more. Removes those marks, and only those. */
export async function dropKeeps() {
  const all = await chrome.storage.local.get(null);
  const old = Object.entries(all).filter(([k, v]) => k.startsWith('mark:') && v?.decision === 'keep').map(([k]) => k);
  if (old.length) await chrome.storage.local.remove(old);
  return old.length;
}

// What this app moved to the Google Photos trash:
//   sending  the call was about to be sent; whether it worked is unknown
//   trashed  read back from the trash. `extra`: other items appeared with it
//   kept     looked again: still in the library
//   gone     looked again: in neither place
// `seen` is set when the user has looked and everything was read again.
export async function setTrash(key, entry) {
  await chrome.storage.local.set({ [`trash:${key}`]: entry });
}
export async function allTrash() {
  const all = await chrome.storage.local.get(null);
  return new Map(Object.entries(all).filter(([k]) => k.startsWith('trash:')).map(([k, v]) => [k.slice(6), v]));
}

// ---- after "Remove access"
// What is kept of an upload record when the YouTube side is forgotten: the Google Photos
// side only, so nothing is moved twice. Anything else in a record is dropped.
const PHOTOS_SIDE = ['size', 'sha256', 'fileName', 'at', 'deletedAt'];
/**
 * Upload records without their YouTube details: no video id, channel, upload address or
 * who-can-watch. Each one touched gets `forgotten: true`. A finished upload stays
 * 'uploaded' (with no id, so it can never pass the gate); one that was still being sent
 * becomes 'uncertain', so it is never sent again by itself. Takes and returns key -> record.
 */
export function forgetYouTube(records) {
  const out = new Map();
  for (const [key, r] of records) {
    if (!r) continue;
    const keep = Object.fromEntries(PHOTOS_SIDE.filter((k) => r[k] !== undefined && r[k] !== null).map((k) => [k, r[k]]));
    out.set(key, { state: r.state === 'uploaded' ? 'uploaded' : 'uncertain', ...keep, forgotten: true });
  }
  return out;
}
/** Strips the YouTube details from every stored upload record. Marks and trash notes stay. */
export async function forgetYouTubeStored() {
  const next = forgetYouTube(await allRecords());
  await chrome.storage.local.set(Object.fromEntries([...next].map(([k, r]) => [name(k), r])));
  return next.size;
}
/** Forgets every record of what was moved, marked and deleted. The counter is 0 again. */
export async function forgetAll() {
  const all = await chrome.storage.local.get(null);
  const gone = Object.keys(all).filter((k) => /^(upload|mark|trash):/.test(k));
  if (gone.length) await chrome.storage.local.remove(gone);
  return gone.length;
}

/**
 * What is left to finish before switching to another copy of this app, from the records alone:
 * done (moved and deleted from Google Photos), left (moved, still in Google Photos),
 * sending (still uploading, or not known whether it arrived).
 */
export function finishCounts(records) {
  const c = { done: 0, left: 0, sending: 0 };
  for (const r of records.values()) {
    if (r?.state === 'uploaded') c[r.deletedAt ? 'done' : 'left'] += 1;
    else if (r?.state === 'sending' || r?.state === 'uncertain') c.sending += 1;
  }
  return c;
}

/** Only one page may upload or delete at a time. */
export async function exclusive(task) {
  return navigator.locks.request('video-offload', { ifAvailable: true }, (lock) => {
    if (!lock) throw new Error('Another Videos Off My Phone page is busy. Wait for it or close it.');
    return task();
  });
}
