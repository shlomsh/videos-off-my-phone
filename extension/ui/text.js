import { VIS, visName } from '../lib/gate.js';

export const gb = (n) => (n >= 999.5e6 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 || !n ? `${Math.round(n / 1e6)} MB` : 'under 1 MB');
export const length = (ms) => `${Math.floor(Math.round(ms / 1000) / 60)}:${String(Math.round(ms / 1000) % 60).padStart(2, '0')}`;
export const clock = (d = new Date()) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export const day = (ms) => new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
export const month = (ms) => new Date(ms).toLocaleDateString([], { month: 'long', year: 'numeric' });
export const count = (n, one = 'video', many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
/** The start page: what the app does, and its three steps. The user deletes; the app helps. */
export const START_INTRO = 'It moves your biggest videos from Google Photos to your own YouTube channel, in full original quality, then helps you delete the originals. Your phone and your Google storage get the space back.';
export const START_STEPS = ['Choose your biggest videos', 'Move them to YouTube. Every copy is checked', 'Delete them from Google Photos, after your yes'];

/**
 * The delete question's sentence about YouTube copies, by the real count: c have a YouTube copy, of n.
 * Empty when none has one. Ends with a space when not empty, so it can lead the next sentence.
 */
export function copiesStay(c, n) {
  if (!(c > 0)) return '';
  if (c >= n) return c === 1 ? 'The YouTube copy stays. ' : 'The YouTube copies stay. ';
  return c === 1 ? '1 has a YouTube copy, which stays. ' : `${c} have YouTube copies, which stay. `;
}
/** The delete question's sentence about videos with no YouTube copy (n of them). Ends with a space when not empty. */
export function onlyCopies(n) {
  if (!(n > 0)) return '';
  return n === 1 ? '1 has no YouTube copy, so this is its only copy. ' : `${n} have no YouTube copy, so these are their only copies. `;
}
/** The player's words: in Choose (step 1), and in Delete (step 3) for a video with no YouTube copy (canvas v51, E47). */
export const PLAYER = {
  choose: { title: 'What should happen to this video?', bare: 'Skip YouTube, send to Delete', copy: 'Move to YouTube' },
  del: { title: 'Delete it, or move it to YouTube first?', bare: 'Delete from Google Photos', copy: 'Move to YouTube first', facts: 'It has no YouTube copy.', note: 'It has no YouTube copy. Deleting asks you first.' },
};
/**
 * Step 2 after Stop (canvas v53, board XE-stopped): `waiting` still wait to continue; `up` of `total`
 * (the videos moved together when it stopped) are on YouTube. The heading counts only the waiting ones,
 * and stays the same after other videos were moved since.
 */
export function stoppedWords({ waiting, up, total }) {
  return {
    head: `You stopped. ${count(waiting)} ${waiting === 1 ? 'is' : 'are'} waiting.`,
    sub: `${up} of ${total} ${up === 1 ? 'is' : 'are'} on YouTube.`,
    small: `${up} of ${total} sent`,
  };
}
/** The stopped page's words about the half-sent one, the waiting ones, and "Put them back in Choose" (v53). */
export const STOPPED = {
  note: 'The half-sent one carries on where it stopped.',
  half: 'It was half sent. It carries on where it stopped.',
  waits: 'It waits until you continue.',
  back: 'Put them back in Choose',
  bar: (n) => `${n} put back in Choose.`,
};
/** Step 3 while the videos chosen earlier are still being read: the grey button and its reason. */
export const READING = { button: 'Delete from Google Photos', why: 'Still reading your videos.' };
/** The words on the done page that follow how many videos it is about: it or them, and the iPhone's question. */
export function phoneWords(n) {
  const many = n > 1;
  return {
    it: many ? 'them' : 'it',
    ask: many ? `Allow “Google Photos” to delete ${n} videos?` : 'Allow “Google Photos” to delete this video?',
    sub: many ? 'They will be in Recently Deleted for 30 days.' : 'It will be in Recently Deleted for 30 days.',
    head: many ? 'Now remove them from your iPhone' : 'Now remove it from your iPhone',
  };
}
/**
 * The done page's words, all by one count: the videos deleted in this visit (v52), as the iPhone steps
 * remove them all at once. list: [{ fileName, size }], oldest first. size is what the "+" shows.
 */
export function doneWords(list) {
  const n = Math.max(1, list.length);
  const last = list[list.length - 1] ?? {};
  const total = list.reduce((t, x) => t + (x.size > 0 ? x.size : 0), 0);
  return {
    ...phoneWords(n),
    title: n > 1 ? `${n} are in the Google Photos trash.` : 'It is in the Google Photos trash.',
    facts: n > 1 ? `${count(n)}, ${gb(total)}.` : `${last.fileName}, ${gb(last.size)}.`, // beside the heading; `sub` is the iPhone's line
    size: n > 1 ? total : last.size,
  };
}
/** The first letter of the channel's name, as in the app's own circle; empty when not known. */
export const initial = (title) => (typeof title === 'string' ? [...title.trim()][0]?.toUpperCase() ?? '' : '');

const left = (s) => (s < 5 ? 'a few seconds' : s < 90 ? `about ${Math.round(s)} seconds` : s < 5400 ? `about ${Math.round(s / 60)} minutes` : `about ${(s / 3600).toFixed(1)} hours`);
/** "About 4 minutes left.", or nothing while the speed is not known. */
export function timeLeft({ bytes, total, sent, seconds }) {
  const speed = seconds > 2 ? sent / seconds : 0;
  return speed > 0 && bytes < total ? `${left((total - bytes) / speed).replace(/^a/, 'A')} left.` : '';
}
export function sentLine({ bytes, total, sent, seconds }) {
  const speed = seconds > 2 ? sent / seconds : 0;
  return `${gb(bytes)} of ${gb(total)}${speed > 0 ? `, ${(speed / 1e6).toFixed(speed < 1e7 ? 1 : 0)} MB a second` : ''}`;
}
export function amountLine({ bytes, total, sent, seconds }) {
  const speed = seconds > 2 ? sent / seconds : 0;
  return [
    `${gb(bytes)} of ${gb(total)}`,
    speed > 0 && `${(speed / 1e6).toFixed(1)} MB a second`,
    speed > 0 && bytes < total && `${left((total - bytes) / speed)} left`,
  ].filter(Boolean).join(', ');
}

export function picture4k(w, height) {
  if (!(w > 0 && height > 0)) return null;
  const long = Math.max(w, height);
  const name = long >= 3800 ? '4K ' : long === 1920 ? 'Full HD ' : '';
  return name ? `${name}(${w} × ${height})` : `${w} × ${height}`;
}

/** "PT1H2M3S" as milliseconds. */
export function isoLength(s) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(s ?? '');
  if (!m || !m.slice(1).some(Boolean)) return null;
  const [d, hr, min, sec] = m.slice(1).map((x) => Number(x ?? 0));
  return ((d * 24 + hr) * 60 + min) * 60_000 + sec * 1000;
}

// The rules answer in exact words; people get plain ones.
export function plainReason(r) {
  const album = /^in a shared album \((.*)\)$/.exec(r);
  if (album) return `It is in the shared album “${album[1]}”. Deleting it removes it there too.`;
  const other = /^(.+) is different$/.exec(r);
  if (other) return `${other[1]} is not the same on both sides. Keep the original.`;
  const privacy = /^privacy is (\w+), not (\w+)$/.exec(r);
  if (privacy) {
    const name = (x) => (VIS.includes(x) ? visName(x) : x);
    const [now, chose] = [name(privacy[1]), name(privacy[2])];
    return privacy[1] === 'unknown' ? 'YouTube did not say who can watch it.' : `It is ${now} on YouTube, but you chose ${chose}. Set it back to ${chose} in YouTube Studio, then check again.`;
  }
  return {
    'no finished upload on record': 'This app has no finished upload for it.',
    'not found on YouTube': 'YouTube does not list this video. Keep the original.',
    'not found in Google Photos': 'Google Photos did not find it.',
    'the upload was interrupted, so its bytes were not fully checked': 'It was never checked from start to end.',
    'not on the signed-in channel': 'It is not on the channel you are signed in to.',
    'not Original quality in Google Photos': 'Google Photos does not hold it in Original quality.',
    'the Google Photos file changed since the upload': 'The file in Google Photos changed since it was moved.',
    'shared albums unknown': 'Google Photos did not say which albums it is in.',
    'YouTube is still processing': 'YouTube is still processing it.',
    'size at YouTube not confirmed': 'YouTube has not confirmed the full size.',
    'resolution at YouTube not confirmed': 'YouTube has not confirmed the picture size.',
    'no content id from Google Photos': 'Google Photos did not give enough information to check it.',
    'not every check passed': 'Not every check passed.',
    'it has an upload record': 'This app moved it, or tried to, so it is not one without a copy.',
  }[r] ?? (/[.!?]$/.test(r) ? r : `${r}.`);
}

/** Turns an error into a notice: what happened, what it means, what to do. */
export function plainError(message) {
  const m = String(message ?? 'Something went wrong');
  const say = (kind, title, text, action) => ({ kind, title, text, action });
  if (/did not approve access|canceled|cancelled/i.test(m)) return say('info', 'You are not signed in yet.', 'The sign-in window was closed, so nothing changed.', 'signin');
  if (/different YouTube channel/i.test(m)) return say('pause', 'That is a different channel.', 'Please use the same channel as before.', 'signin');
  if (/tick both YouTube permissions/i.test(m)) return say('info', 'Both permissions are needed.', 'Sign in again and tick both YouTube permissions.', 'signin');
  if (/Another Videos Off My Phone page is busy/i.test(m)) return say('no', 'Videos Off My Phone is busy in another tab.', 'Use that tab, or close it and try again here.');
  if (/^Nothing was deleted\. /.test(m)) return say('stop', 'Nothing was deleted.', m.slice(21), 'photos');
  if (/Not signed in to Google Photos/i.test(m)) return say('fail', 'Google Photos is not signed in.', 'Sign in on the Google Photos tab, then try again.', 'photos');
  if (/Google Photos tab|Open photos\.google\.com/i.test(m)) return say('fail', 'No Google Photos tab is open.', 'Open Google Photos in another tab and keep it open, then try again.', 'photos');
  if (/quota|upload limit|uploadLimit|exceeded the number/i.test(m)) return say('clock', 'That is all YouTube takes for now.', 'YouTube allows about 100 uploads a day. What is left stays ticked. Try again tomorrow.');
  if (/Three videos in a row/i.test(m)) return say('fail', 'Uploading stopped after 3 failures in a row.', 'Check your connection, then continue.');
  if (/changed its response format/i.test(m)) return say('fail', 'Google Photos has changed.', 'This app does not understand its answer any more, so it stopped.');
  if (/^Google Photos (answered HTTP|returned no data)/.test(m)) return say('info', 'Google Photos did not answer properly.', 'Try again in a moment. The exact answer is in the details, behind the circle at the top.');
  return say('info', 'This did not work.', m);
}
