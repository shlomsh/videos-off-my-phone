import { test } from 'node:test';
import assert from 'node:assert/strict';
import { originalOf, sameName, sameSize, matchUploads, toFind, relink, REFRESH_MS } from '../extension/lib/refind.js';
import { descriptionFor } from '../extension/lib/meta.js';
import { forgetYouTube } from '../extension/lib/records.js';
import { unsafeReasons } from '../extension/lib/gate.js';

const SHA = 'a'.repeat(64);
const rec = { state: 'uploaded', size: 2_020_000_000, fileName: 'IMG_3968.MOV', sha256: SHA, at: '2026-11-01T10:00:00Z', forgotten: true };
const yt = (id, o = {}) => ({
  id, snippet: { channelId: 'UC', title: o.title ?? '2 Nov 2026', description: o.description ?? '' },
  fileDetails: { fileSize: String(o.size ?? rec.size), ...(o.fileName !== undefined && { fileName: o.fileName }) },
});

test('the name comes from fileDetails.fileName first, when YouTube gives it', () => {
  assert.equal(sameName(rec, yt('a', { fileName: 'IMG_3968.MOV' })), true);
  // Title and description say nothing: the file name alone is enough.
  assert.equal(sameName(rec, yt('a', { fileName: 'IMG_3968.MOV', title: 'Cabin weekend', description: 'Filmed by Dana.' })), true);
});

test('without fileDetails.fileName, the "Original file:" line is used', () => {
  assert.equal(sameName(rec, yt('a', { description: descriptionFor('Filmed by Dana.', 'IMG_3968.MOV') })), true);
  assert.equal(sameName(rec, yt('a', { fileName: '', description: 'Original file: IMG_3968.MOV' })), true);
  // The last such line counts; spaces at its end do not.
  assert.equal(originalOf('Original file: OTHER.MOV\nmore\n\nOriginal file: IMG_3968.MOV  '), 'IMG_3968.MOV');
  assert.equal(originalOf('Filmed by Dana.'), '');
  assert.equal(originalOf(undefined), '');
  // Words around the line, or a line someone changed, are not the line.
  assert.equal(sameName(rec, yt('a', { description: 'See Original file: IMG_3968.MOV' })), false);
  assert.equal(sameName(rec, yt('a', { description: 'Original file: IMG_3968.mov' })), false);
});

test('without either, the title: uploads from before v50 have the file name as their title', () => {
  assert.equal(sameName(rec, yt('a', { title: 'IMG_3968.MOV' })), true);
  assert.equal(sameName({ ...rec, fileName: 'a<b>.MOV' }, yt('a', { title: 'ab.MOV' })), true);
  const long = `${'x'.repeat(120)}.MOV`;
  assert.equal(sameName({ ...rec, fileName: long }, yt('a', { title: 'x'.repeat(100) })), true);
  assert.equal(sameName(rec, yt('a', { title: 'IMG_3968' })), false);
  assert.equal(sameName(rec, yt('a', { title: 'Cabin weekend' })), false);
});

test('a fileDetails.fileName that is there but different falls through to the next source', () => {
  // YouTube may fill it with something of its own for API uploads; that must not hide the line.
  assert.equal(sameName(rec, yt('a', { fileName: 'videoplayback', description: 'Original file: IMG_3968.MOV' })), true);
  assert.equal(sameName(rec, yt('a', { fileName: 'videoplayback', title: 'IMG_3968.MOV' })), true);
  assert.equal(sameName(rec, yt('a', { fileName: 'videoplayback' })), false);
});

test('the size must be exactly the same', () => {
  assert.equal(sameSize(rec, yt('a')), true);
  assert.equal(sameSize(rec, yt('a', { size: rec.size + 1 })), false);
  assert.equal(sameSize(rec, { id: 'a', fileDetails: {} }), false);
  assert.equal(sameSize({ ...rec, size: undefined }, yt('a')), false);
});

test('matching: exact size plus name, and never a guess', () => {
  const line = 'Original file: IMG_3968.MOV';
  const up = [yt('right', { description: line }), yt('bigger', { description: line, size: rec.size + 1 }), yt('other', { description: 'Original file: IMG_0001.MOV' })];
  assert.deepEqual([...matchUploads([['k', rec]], up, { channelId: 'UC' })], [['k', 'right']]);
  // Two videos match: not found.
  assert.deepEqual([...matchUploads([['k', rec]], [...up, yt('twin', { title: 'IMG_3968.MOV' })], { channelId: 'UC' })], [['k', null]]);
  // Nothing matches: not found.
  assert.deepEqual([...matchUploads([['k', rec]], [up[1], up[2]], { channelId: 'UC' })], [['k', null]]);
  // Another channel's video is never one of ours.
  assert.deepEqual([...matchUploads([['k', rec]], [{ ...up[0], snippet: { ...up[0].snippet, channelId: 'UCx' } }], { channelId: 'UC' })], [['k', null]]);
  // A video already linked to another record is not a candidate.
  assert.deepEqual([...matchUploads([['k', rec]], up, { channelId: 'UC', taken: new Set(['right']) })], [['k', null]]);
  // Two records that match one video: neither is linked.
  assert.deepEqual([...matchUploads([['k', rec], ['k2', { ...rec }]], up, { channelId: 'UC' })], [['k', null], ['k2', null]]);
});

test('what is looked for: forgotten links, and links last found over 30 days ago, never deleted ones', () => {
  const now = Date.parse('2026-12-20T00:00:00Z');
  const old = new Date(now - REFRESH_MS - 1000).toISOString();
  const young = new Date(now - 1000).toISOString();
  const records = new Map([
    ['forgot', { ...rec }],
    ['noid', { state: 'uploaded', size: 1, fileName: 'a' }],
    ['deleted', { ...rec, deletedAt: young }],
    ['old', { state: 'uploaded', id: 'x', channel: 'UC', at: old }],
    ['oldfound', { state: 'uploaded', id: 'y', channel: 'UC', at: old, foundAt: young }],
    ['young', { state: 'uploaded', id: 'z', channel: 'UC', at: young }],
    ['otherch', { state: 'uploaded', id: 'w', channel: 'UCx', at: old }],
    ['sending', { state: 'sending', at: old }],
  ]);
  assert.deepEqual(toFind(records, 'UC', now), { again: ['forgot', 'noid'], refresh: ['old'] });
});

test('a re-linked record passes the gate only as any record would; a forgotten one never does', () => {
  const [[, forgotten]] = [...forgetYouTube(new Map([['k', { ...rec, forgotten: undefined, id: 'old', channel: 'UC', privacy: 'private' }]]))];
  assert.equal(forgotten.id, undefined);
  const details = { size: rec.size, original: true, sharedAlbums: [], width: 1920, height: 1080 };
  const video = { ...yt('right', { description: 'Original file: IMG_3968.MOV' }), status: { uploadStatus: 'processed', privacyStatus: 'private' }, processingDetails: { processingStatus: 'succeeded' }, fileDetails: { fileSize: String(rec.size), videoStreams: [{ widthPixels: 1920, heightPixels: 1080 }] } };
  assert.deepEqual(unsafeReasons({ record: forgotten, details, video, channelId: 'UC' }), ['no finished upload on record']);
  const back = relink(forgotten, 'right', 'UC', '2026-12-20T00:00:00Z');
  assert.deepEqual(back, { state: 'uploaded', size: rec.size, fileName: 'IMG_3968.MOV', sha256: SHA, at: rec.at, id: 'right', channel: 'UC', foundAt: '2026-12-20T00:00:00Z' });
  // The gate still does all of its checks; here they pass.
  assert.deepEqual(unsafeReasons({ record: back, details, video, channelId: 'UC' }), []);
});
