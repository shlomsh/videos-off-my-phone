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

/** Only one page may upload or delete at a time. */
export async function exclusive(task) {
  return navigator.locks.request('video-offload', { ifAvailable: true }, (lock) => {
    if (!lock) throw new Error('Another Video Offload page is busy. Wait for it or close it.');
    return task();
  });
}
