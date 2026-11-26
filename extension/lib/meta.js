// The title and description a video gets on YouTube (canvas v50).
// Pure: the Move dialog, the upload and the tests all use these same rules.

export const TITLE_MAX = 100; // YouTube's limit, in characters
export const WORDS_MAX = 80; // the words field in the Move dialog
const DESC_MAX_BYTES = 5000; // YouTube's limit for a description, in UTF-8 bytes
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** YouTube refuses "<" and ">" in titles and descriptions. */
export const clean = (s) => String(s ?? '').replace(/[<>]/g, '');
/** The first n characters, never splitting one in two. */
const cut = (s, n) => [...s].slice(0, n).join('');

/** The date taken, as "2 Nov 2026", in this computer's time. Empty when it is not known. */
export function takenDay(timestamp) {
  if (!Number.isFinite(timestamp)) return '';
  const d = new Date(timestamp);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** The file name without its ending: "IMG_4012.MOV" gives "IMG_4012". */
export const bareName = (fileName) => clean(fileName).trim().replace(/\.[^.]*$/, '').trim();

/**
 * One video's title from the words and the "Add the date taken" box.
 * Words and date are joined with ", ". With no words and the box on, the date only. With neither
 * (or no date known), the file name without its ending: never an empty title.
 */
export function titleFor({ words = '', date = true } = {}, { fileName = '', timestamp } = {}) {
  const w = clean(words).trim();
  const t = [w, date ? takenDay(timestamp) : ''].filter(Boolean).join(', ');
  return ownTitle(t, fileName);
}
/** A title typed for one video: cleaned and cut; empty falls back to the file name without its ending. */
export function ownTitle(text, fileName = '') {
  const t = cut(clean(text).trim(), TITLE_MAX).trim();
  return t || cut(bareName(fileName), TITLE_MAX) || 'Video';
}

/** The line that lets this app find the video on YouTube again. */
export const originalLine = (fileName) => `Original file: ${clean(fileName).trim()}`;

/**
 * The uploaded description: the user's text, a blank line, then "Original file: <name>".
 * With no text, only that line. Text that would make it too long for YouTube is cut; the line never is.
 */
export function descriptionFor(text, fileName) {
  const line = originalLine(fileName);
  let t = clean(text).trim();
  const bytes = (s) => new TextEncoder().encode(s).length;
  const room = DESC_MAX_BYTES - bytes(`\n\n${line}`);
  while (t && bytes(t) > room) t = cut(t, [...t].length - Math.max(1, Math.ceil((bytes(t) - room) / 4))).trimEnd();
  return t ? `${t}\n\n${line}` : line;
}
