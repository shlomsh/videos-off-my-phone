// "YouTube is working": how far along it is, in plain words. Pure, so it can be tested.

export const APP = 'Videos Off My Phone';
const MIN = 60_000;
const HOUR = 60 * MIN;
/** After this long with YouTube, a note says it is taking longer than usual. */
export const SLOW_AFTER = HOUR;

/**
 * What YouTube says about its own progress, from videos.list processingDetails.processingProgress.
 * The API sends the numbers as strings. Returns { pct, leftMs } or null when it says nothing usable.
 * Never 100% while YouTube is still at it.
 */
export function ytProgress(video) {
  const p = video?.processingDetails?.processingProgress;
  const total = Number(p?.partsTotal);
  const done = Number(p?.partsProcessed);
  if (!(total > 0) || !Number.isFinite(done) || done < 0) return null;
  const pct = Math.min(99, Math.floor((Math.min(done, total) / total) * 100));
  const left = p.timeLeftMs === undefined || p.timeLeftMs === null || p.timeLeftMs === '' ? NaN : Number(p.timeLeftMs);
  return { pct, leftMs: Number.isFinite(left) && left >= 0 ? left : null };
}

/** The highest % seen so far wins, so the bar never goes back. The time left is the newest. */
export function keepHighest(before, now) {
  if (!now) return before ?? null;
  if (!before) return now;
  return { pct: Math.max(before.pct, now.pct), leftMs: now.leftMs };
}

/** "1 h 40 min", "12 min", "2 h". */
const span = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
};

/** "about 9 min left", "less than a minute left", "about 1 h 40 min left". */
export function leftWords(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  if (ms < MIN) return 'less than a minute left';
  return `about ${span(Math.round(ms / MIN))} left`;
}

/** "35%, about 9 min left", or "35%" when no time is given. */
export const progressWords = ({ pct, leftMs }) => [`${pct}%`, leftWords(leftMs)].filter(Boolean).join(', ');

/** "Uploaded 12 min ago", counting up from the record's upload time. Empty when the time is not known. */
export function agoWords(at, now = Date.now()) {
  const t = typeof at === 'number' ? at : Date.parse(at ?? '');
  if (!Number.isFinite(t)) return '';
  const d = now - t;
  if (d < MIN) return 'Uploaded just now';
  return `Uploaded ${span(Math.floor(d / MIN))} ago`;
}

/** "Checked 20 seconds ago.", from the last real answer. */
export function checkedWords(ms) {
  if (!Number.isFinite(ms)) return 'Not checked yet.';
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 1) return 'Checked just now.';
  if (s < 60) return `Checked ${s} ${s === 1 ? 'second' : 'seconds'} ago.`;
  const m = Math.floor(s / 60);
  if (m < 60) return `Checked ${m} ${m === 1 ? 'minute' : 'minutes'} ago.`;
  return `Checked ${span(m)} ago.`;
}

/** With YouTube for over an hour, counted from the upload time. */
export function isSlow(at, now = Date.now()) {
  const t = typeof at === 'number' ? at : Date.parse(at ?? '');
  return Number.isFinite(t) && now - t > SLOW_AFTER;
}

export const SLOW_NOTE = 'This is taking longer than usual. A long 4K video can take a few hours on YouTube. It is still there and nothing is lost.';

/**
 * The tab title. First what is running here (uploading), then news (ready to delete), then YouTube.
 *   upload: the % uploaded while uploading, else null; paused: uploading waits for a sign-in
 *   ready: how many reached Delete in this visit and were not looked at yet
 *   youtube: how many are with YouTube; ytPct: the lowest % YouTube gave for them, or null
 */
export function tabTitle({ upload = null, paused = false, ready = 0, youtube = 0, ytPct = null } = {}) {
  const t = (what) => `${what} – ${APP}`;
  if (upload !== null && upload !== undefined) return t(paused ? 'Paused' : `Uploading ${upload}%`);
  if (ready > 0) return t(`✓ ${ready} ready to delete`);
  if (youtube > 0) return t(ytPct === null || ytPct === undefined ? 'YouTube working' : `YouTube ${ytPct}%`);
  return APP;
}
