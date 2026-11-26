// Finding a moved video on the channel again (canvas v43, matching as in v50), after a new sign-in
// and every 30 days. Pure: the app gives it the records and the channel's uploads.
// It only ever links a record to a video it matched exactly. It never deletes anything.
import { clean } from './meta.js';

export const REFRESH_MS = 30 * 86400_000;

/** The name in the last "Original file: <name>" line of a description, or ''. */
export function originalOf(description) {
  const all = [...String(description ?? '').matchAll(/^Original file: (.+?)\s*$/gm)];
  return all.length ? all[all.length - 1][1].trim() : '';
}

/**
 * Whether the video has the record's file name. Asked in this order, each only when the one
 * before does not give it: YouTube's fileDetails.fileName (it may be empty for uploads made
 * through the API), the "Original file:" line, then the title (uploads from before v50 have the
 * file name as their title). A name that is there but different falls through to the next.
 */
export function sameName(record, video) {
  const want = clean(record?.fileName).trim();
  if (!want) return false;
  const oldTitle = clean(record.fileName).slice(0, 100) || 'Video'; // how titles were made before v50
  const fromFile = String(video?.fileDetails?.fileName ?? '').trim();
  if (fromFile && clean(fromFile) === want) return true;
  const fromLine = originalOf(video?.snippet?.description);
  if (fromLine && fromLine === want) return true;
  const title = String(video?.snippet?.title ?? '').trim();
  return !!title && (title === want || title === oldTitle.trim());
}
/** Exactly the same number of bytes as was sent. */
export const sameSize = (record, video) => record?.size > 0 && Number(video?.fileDetails?.fileSize) === record.size;

/**
 * Which video each record is. wanted: [[key, record]]; uploads: the channel's videos, every one;
 * taken: ids already linked to other records. Gives key -> id, or null when it is not found.
 * Never a guess: two matching videos, or two records matching one video, is not found.
 */
export function matchUploads(wanted, uploads, { channelId, taken = new Set() } = {}) {
  const out = new Map();
  const claims = new Map();
  for (const [key, record] of wanted) {
    const hits = uploads.filter((v) => v?.id && !taken.has(v.id) && (!channelId || v.snippet?.channelId === channelId) && sameSize(record, v) && sameName(record, v));
    const id = hits.length === 1 ? hits[0].id : null;
    out.set(key, id);
    if (id) claims.set(id, (claims.get(id) ?? 0) + 1);
  }
  for (const [key, id] of out) if (id && claims.get(id) > 1) out.set(key, null);
  return out;
}

/**
 * What to look for: moved videos still in Google Photos (not deleted here) whose YouTube link was
 * forgotten ("again"), or whose link on this channel was last found over 30 days ago ("refresh").
 */
export function toFind(records, channelId, now = Date.now()) {
  const again = []; const refresh = [];
  for (const [key, r] of records) {
    if (r?.state !== 'uploaded' || r.deletedAt) continue;
    if (r.forgotten || !r.id) again.push(key);
    else if (r.channel === channelId && now - Date.parse(r.foundAt ?? r.at) > REFRESH_MS) refresh.push(key);
  }
  return { again, refresh };
}

/** The record linked to the video it was matched to, on this channel, found now. */
export function relink(record, id, channelId, now) {
  const { forgotten, ...rest } = record;
  return { ...rest, state: 'uploaded', id, channel: channelId, foundAt: now };
}
