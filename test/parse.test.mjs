import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mediaKeyFromUrl, parseDetails, checkDownloadUrl, checkStreamUrl, parseItem } from '../extension/lib/photos.js';
import { buildVideo, recordingDate } from '../extension/lib/youtube.js';
import { takenDay } from '../extension/lib/meta.js';

test('finds the video key in Google Photos addresses', () => {
  const g = 'https://photos.google.com';
  assert.equal(mediaKeyFromUrl(`${g}/photo/AF1QipAbc-_1`), 'AF1QipAbc-_1');
  assert.equal(mediaKeyFromUrl(`${g}/u/1/trash/AF1QipAbc`), 'AF1QipAbc');
  assert.equal(mediaKeyFromUrl(`${g}/album/AF1QipAlbum/photo/AF1QipItem`), 'AF1QipItem');
  assert.equal(mediaKeyFromUrl(`${g}/quotamanagement/large/photo/AF1QipItem`), 'AF1QipItem');
  assert.equal(mediaKeyFromUrl(`${g}/album/AF1QipAlbum`), null);
  assert.equal(mediaKeyFromUrl('https://photos.google.com.evil.example/photo/AF1QipAbc'), null);
  assert.equal(mediaKeyFromUrl('chrome://newtab'), null);
});

const item = (over = {}) => {
  const d = []; d[0] = 'AF1QipK'; d[2] = 'IMG_1.MOV'; d[3] = 1794819973000; d[5] = 100; d[6] = 3840; d[7] = 2160; d[30] = [1, 100, 2];
  return [Object.assign(d, over)];
};
test('reads details and stops if the format changes', () => {
  assert.equal(parseDetails(item(), 'AF1QipK').original, true);
  assert.equal(parseDetails(item({ 30: [1, 100, 1] }), 'AF1QipK').original, false);
  assert.deepEqual(parseDetails(item({ 19: [['AF1QipA', { 72930366: [null, 'Trip', null, 3, true] }], ['AF1QipB', { 72930366: [null, 'Mine', null, 3, false] }]] }), 'AF1QipK').sharedAlbums, ['Trip']);
  assert.throws(() => parseDetails(item(), 'AF1QipOther'), /different item/);
  assert.throws(() => parseDetails(item({ 5: '100' }), 'AF1QipK'), /format/);
  assert.throws(() => parseDetails(null, 'AF1QipK'));
});

test('only accepts the known download host', () => {
  assert.ok(checkDownloadUrl('https://video-downloads.googleusercontent.com/x'));
  for (const u of ['https://evil.example/x', 'http://video-downloads.googleusercontent.com/x', '']) assert.throws(() => checkDownloadUrl(u));
});

test('builds private metadata with the recording date', () => {
  const v = buildVideo({ fileName: 'a<b>.MOV', timestamp: 1794819973000, privacy: 'private', madeForKids: false });
  // No choice made: the title is the date taken, and the description is the original file line.
  assert.equal(v.snippet.title, takenDay(1794819973000));
  assert.equal(v.snippet.description, 'Original file: ab.MOV');
  assert.deepEqual(v.status, { privacyStatus: 'private', selfDeclaredMadeForKids: false });
  assert.equal(v.recordingDetails.recordingDate, '2026-11-16T09:06:13.000Z');
});

test('keeps the local day of a video filmed just after midnight', () => {
  const t = Date.parse('2026-11-15T22:30:00Z'); // 00:30 on the 16th at UTC+2
  assert.equal(recordingDate(t, 7200_000).slice(0, 10), '2026-11-16');
  assert.equal(recordingDate(Date.parse('2026-11-16T03:00:00Z'), -5 * 3600_000).slice(0, 10), '2026-11-15');
  for (const bad of [undefined, null, 7200, '7200000', 99 * 3600_000]) assert.equal(recordingDate(t, bad).slice(0, 10), '2026-11-15');
  const v = buildVideo({ fileName: 'a', timestamp: t, tzOffset: 7200_000, privacy: 'private', madeForKids: false });
  assert.equal(v.recordingDetails.recordingDate.slice(0, 10), '2026-11-16');
});

test('sends the title and description chosen at Move, cleaned, with the original file line', () => {
  const v = buildVideo({ fileName: 'IMG_4012.MOV', timestamp: 1794819973000, privacy: 'unlisted', madeForKids: false, meta: { title: 'Cabin <weekend>, 2 Nov 2026', text: 'Filmed by Dana.' } });
  assert.equal(v.snippet.title, 'Cabin weekend, 2 Nov 2026');
  assert.equal(v.snippet.description, 'Filmed by Dana.\n\nOriginal file: IMG_4012.MOV');
  assert.equal(v.status.privacyStatus, 'unlisted'); // the who-can-watch choice is untouched
  assert.equal(buildVideo({ fileName: 'IMG_4012.MOV', privacy: 'private', madeForKids: false, meta: { title: '', text: '' } }).snippet.title, 'IMG_4012');
  assert.equal(buildVideo({ fileName: 'IMG_4012.MOV', privacy: 'private', madeForKids: false, meta: { title: 'x'.repeat(140) } }).snippet.title.length, 100);
});

test('plays a preview only from Google\'s video servers', () => {
  assert.ok(checkStreamUrl('https://rr3---sn-a.googlevideo.com/videoplayback?x=1'));
  for (const bad of ['http://rr3.googlevideo.com/x', 'https://googlevideo.com.evil.com/x', 'https://evilgooglevideo.com/x', 'https://a@rr3.googlevideo.com/x', 'https://rr3.googlevideo.com:8443/x', null, '']) assert.equal(checkStreamUrl(bad), null, String(bad));
});

test('reads the picture and length of one video, and only of the one asked for', () => {
  const thumb = 'https://photos.fife.usercontent.google.com/pw/abc';
  const item = (k, t = thumb) => [[k, [t, 1, 2], 1, 'c', 2, { 76647426: [19498] }]];
  assert.deepEqual(parseItem(item('AF1QipA'), 'AF1QipA'), { thumb, duration: 19498 });
  assert.equal(parseItem(item('AF1QipB'), 'AF1QipA'), null);
  assert.equal(parseItem(null, 'AF1QipA'), null);
  assert.equal(parseItem(item('AF1QipA', 'https://evil.example/x'), 'AF1QipA').thumb, null);
  assert.equal(parseItem([['AF1QipA', [thumb], {}]], 'AF1QipA').duration, undefined);
});
