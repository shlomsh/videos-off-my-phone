import { StopError } from './transfer.js';
import { confirmation, unsafeReasons } from './gate.js';
import { plainReason } from '../ui/text.js';
import { rowState, factsFor, differs } from '../ui/rows.js';

// The only place that deletes. It moves ONE video to the Google Photos trash, from where
// Google Photos can restore it. Nothing here empties the trash or touches the phone.
//
// Rules, all checked again right before the one call:
//  1. The user ticked it and confirmed it in a dialog that names it.
//  2. It is one of two kinds, and only what the dialog said:
//     bare   no copy: the user marked it, it has no upload record of any kind, and is in no shared album.
//     moved  on YouTube: its record is a finished upload, and YouTube, asked again just before,
//            passes every rule of gate.js with no compared fact that is different.
//  3. Name and size are still what the dialog showed.
//  4. A fresh library list has it, and its content id is the same in three places.
//  5. It is not in the trash already.
//  6. The call is written down first, sent once, and never repeated by itself.
//  7. Only a read-back counts: in the trash list, out of the library, and nothing else with it.
//  8. Nothing is sent while an earlier one is not cleared up.

/** Why a video may not be deleted without a copy. Anything unknown counts against it. */
export function bareReasons({ record, details }) {
  if (record) return ['it has an upload record'];
  const no = [];
  if (!details?.contentId) no.push('no content id from Google Photos');
  if (!Array.isArray(details?.sharedAlbums)) no.push('shared albums unknown');
  else if (details.sharedAlbums.length) no.push(`in a shared album (${details.sharedAlbums.join(', ')})`);
  return no;
}

/** Why the original of a moved video may not be deleted. Pass only what was just read. Anything unknown counts against it. */
export function movedReasons({ record, details, video, channelId, duration }) {
  if (!record?.id || !channelId) return ['no finished upload on record'];
  const no = unsafeReasons({ record, details, video, channelId });
  if (no.length) return no;
  if (confirmation(record, video, channelId).level !== 'good') no.push('YouTube is still processing');
  const v = { key: details.key, size: details.size, duration, timestamp: details.timestamp, record };
  const st = rowState(v, { channelId, asked: new Set([record.id]), statuses: new Map([[record.id, video]]) });
  if (st.s !== 'yt') no.push('not every check passed');
  for (const f of differs(factsFor(v, st, details, video))) no.push(`${f.name} is different`);
  return no;
}

/** Deletes the user has to look at first: key -> entry. */
export const openEnds = (entries) => new Map([...entries].filter(([, e]) => !e.seen && (!['trashed', 'kept', 'gone'].includes(e.state) || e.extra > 0)));

/** Looks where the video is now. Reads only, and changes nothing. */
export async function lookAgain({ key, contentId }, d) {
  const inTrash = (await d.trashList()).some((i) => i.contentId === contentId);
  const item = await d.itemId(key);
  if (inTrash) return item === null ? 'trashed' : 'unclear';
  if (item === contentId) return 'kept';
  if (item !== null) return 'unclear';
  // In neither place. Believed only if the whole item is unknown to Google Photos.
  try { await d.getDetails(key); } catch (e) { if (/returned no data/.test(e?.message)) return 'gone'; throw e; }
  return 'unclear';
}

export async function trashOne({ key, fileName, size, duration, kind }, d, onState = () => {}) {
  const no = (why) => { throw new StopError(`Nothing was deleted. ${why}`); };
  if (openEnds(await d.entries()).size) no('Look in the trash first: an earlier one is not cleared up.');
  if (kind !== 'bare' && kind !== 'moved') no('It is not known what kind it is.');
  if (kind === 'bare' && !await d.marked(key)) no('It was not marked for this.');
  const details = await d.getDetails(key);
  if (typeof fileName !== 'string' || !(size > 0) || details.fileName !== fileName || details.size !== size) no('Its name or size is not what you were shown.');
  if (!details.contentId) no('Google Photos did not give enough information.');
  const record = await d.getRecord(key);
  if (kind === 'bare') {
    const reasons = bareReasons({ record, details });
    if (reasons.length) no(plainReason(reasons[0]));
  } else if (record?.state !== 'uploaded' || !record.id) no('This app has no finished upload for it.');
  if (await d.libraryId(key, details.timestamp) !== details.contentId) no('The library list does not show the same video.');
  if (await d.itemId(key) !== details.contentId) no('Google Photos gave two different answers about it.');
  const before = new Set((await d.trashList()).map((i) => i.contentId));
  if (before.has(details.contentId)) no('It is already in the trash.');
  if (kind === 'moved') { // the last thing that is asked
    let video;
    try { video = await d.getVideo(record.id); } catch { no('YouTube did not answer, so the copy could not be checked.'); }
    const reasons = movedReasons({ record, details, video, channelId: d.channelId(), duration });
    if (reasons.length) no(plainReason(reasons[0]));
  }

  const note = { contentId: details.contentId, fileName, size, at: d.now() };
  await d.setTrash(key, { ...note, state: 'sending' });
  onState('sending');
  let problem = null;
  try { await d.moveToTrash(details.contentId); } catch (e) { problem = e?.message ?? String(e); }

  // Whatever it answered, look.
  for (let i = 0; i < 5; i++) {
    if (i) await d.sleep(1500 * i);
    try {
      const now = await d.trashList();
      if (!now.some((x) => x.contentId === details.contentId)) continue;
      if (await d.libraryId(key, details.timestamp) !== null) continue;
      const extra = now.filter((x) => !before.has(x.contentId) && x.contentId !== details.contentId).length;
      await d.setTrash(key, { ...note, state: 'trashed', trashedAt: d.now(), ...(extra ? { extra } : {}) });
      return { state: 'trashed', extra, problem };
    } catch (e) { problem ??= e?.message ?? String(e); }
  }
  return { state: 'unclear', extra: 0, problem };
}

/**
 * Several confirmed videos, strictly one by one, each through trashOne with all its rules.
 * It stops at the first refusal, the first result that is not a clean 'trashed', or when
 * stopAsked() is true between two videos. A failed one is never skipped.
 * onEach(what, outcome, index) is awaited after each one; outcome is trashOne's result, or
 * { state: 'refused', error } when trashOne threw (then nothing was sent for it).
 * Returns { went, at, why, outcome }: what is in the trash, the index it stopped at (null when
 * all went), and why: 'asked', 'refused', 'unclear' or 'extra'.
 */
export async function trashSeveral(list, d, { stopAsked = () => false, onStart = () => {}, onEach = () => {} } = {}) {
  const went = [];
  for (let i = 0; i < list.length; i++) {
    if (i && stopAsked()) return { went, at: i, why: 'asked', outcome: null };
    const what = list[i];
    await onStart(what, i);
    let outcome;
    try { outcome = await trashOne(what, d); } catch (error) { outcome = { state: 'refused', error }; }
    await onEach(what, outcome, i);
    if (outcome.state === 'trashed') went.push(what);
    if (outcome.state !== 'trashed' || outcome.extra > 0) {
      return { went, at: i, why: outcome.state === 'trashed' ? 'extra' : outcome.state === 'refused' ? 'refused' : 'unclear', outcome };
    }
  }
  return { went, at: null, why: null, outcome: null };
}
