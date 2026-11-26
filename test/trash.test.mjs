import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trashOne, bareReasons, movedReasons, lookAgain, openEnds } from '../extension/lib/trash.js';
import { trashCall, parseTrashPage, libraryId } from '../extension/lib/photos.js';
import { StopError } from '../extension/lib/transfer.js';
import { plainError } from '../extension/ui/text.js';

const cid = (k) => `content-id-of-${k}-`.padEnd(27, 'x');
const A = { key: 'AF1QipA', fileName: 'A.MOV', size: 100, kind: 'bare' };
function world(over = {}) {
  const w = { lib: new Map([[A.key, cid('A')], ['AF1QipB', cid('B')]]), trash: [{ key: 'AF1QipT', contentId: cid('T') }], calls: [], notes: [] };
  w.d = {
    marked: async () => true,
    getRecord: async () => null,
    entries: async () => new Map(),
    getDetails: async (key) => ({ key, fileName: 'A.MOV', size: 100, timestamp: 1, contentId: cid('A'), sharedAlbums: [] }),
    libraryId: async (k) => w.lib.get(k) ?? null,
    itemId: async (k) => w.lib.get(k) ?? null,
    trashList: async () => [...w.trash],
    moveToTrash: async (id) => {
      w.calls.push(id);
      assert.equal(w.notes.at(-1)?.state, 'sending', 'written down before it is sent');
      for (const [k, c] of w.lib) if (c === id) { w.lib.delete(k); w.trash.push({ key: k, contentId: c }); }
    },
    setTrash: async (k, n) => { w.notes.push({ k, ...n }); },
    now: () => 't', sleep: async () => {},
    ...over,
  };
  return w;
}

test('moves exactly the confirmed video, once, and reads it back', async () => {
  const w = world();
  assert.deepEqual(await trashOne(A, w.d), { state: 'trashed', extra: 0, problem: null });
  assert.deepEqual(w.calls, [cid('A')]);
  assert.deepEqual(w.notes.map((n) => n.state), ['sending', 'trashed']);
  assert.deepEqual([...w.lib.keys()], ['AF1QipB']);
});

test('sends nothing if any check before it fails', async () => {
  const details = (o) => async (key) => ({ key, fileName: 'A.MOV', size: 100, timestamp: 1, contentId: cid('A'), sharedAlbums: [], ...o });
  for (const [name, over] of Object.entries({
    'not marked': { marked: async () => false },
    'in a shared album': { getDetails: details({ sharedAlbums: ['Trip'] }) },
    'shared albums unknown': { getDetails: details({ sharedAlbums: undefined }) },
    'an upload record': { getRecord: async () => ({ state: 'uploaded', id: 'y' }) },
    'a half upload': { getRecord: async () => ({ state: 'sending' }) },
    'nobody knows if it was uploaded': { getRecord: async () => ({ state: 'uncertain' }) },
    'a record of a deleted one': { getRecord: async () => ({ state: 'uploaded', deletedAt: 't' }) },
    'records not readable': { getRecord: async () => { throw new Error('x'); } },
    'an earlier one not cleared up': { entries: async () => new Map([['AF1QipX', { state: 'sending' }]]) },
    'an earlier one took others with it': { entries: async () => new Map([['AF1QipX', { state: 'trashed', extra: 1 }]]) },
    'earlier ones not readable': { entries: async () => { throw new Error('x'); } },
    'other name': { getDetails: details({ fileName: 'B.MOV' }) },
    'other size': { getDetails: details({ size: 101 }) },
    'no id anywhere': { getDetails: details({ contentId: null }), libraryId: async () => null, itemId: async () => null },
    'no content id': { getDetails: details({ contentId: null }) },
    'not in the library': { libraryId: async () => null },
    'another id in the library': { libraryId: async () => cid('B') },
    'another id from the item': { itemId: async () => cid('B') },
    'no id from the item': { itemId: async () => null },
    'already in the trash': { trashList: async () => [{ key: A.key, contentId: cid('A') }] },
    'trash not readable': { trashList: async () => { throw new Error('x'); } },
    'cannot be written down': { setTrash: async () => { throw new Error('full'); } },
  })) {
    const w = world(over);
    await assert.rejects(trashOne(A, w.d), undefined, name);
    assert.deepEqual(w.calls, [], name);
  }
  for (const bad of [{ ...A, fileName: undefined }, { ...A, size: undefined }]) {
    const w = world({ getDetails: async (key) => ({ key, ...bad, timestamp: 1, contentId: cid('A'), sharedAlbums: [] }) });
    await assert.rejects(trashOne(bad, w.d), StopError);
    assert.deepEqual(w.calls, []);
  }
});

test('the answer proves nothing: only the read-back counts, and it is never sent twice', async () => {
  let w = world(); // it says ok, nothing happens
  w.d.moveToTrash = async (id) => { w.calls.push(id); };
  assert.equal((await trashOne(A, w.d)).state, 'unclear');
  assert.equal(w.calls.length, 1);
  assert.deepEqual(w.notes.map((n) => n.state), ['sending']);

  w = world(); // it breaks after it worked
  const real = w.d.moveToTrash;
  w.d.moveToTrash = async (id) => { await real(id); throw new Error('lost'); };
  assert.deepEqual(await trashOne(A, w.d), { state: 'trashed', extra: 0, problem: 'lost' });
  assert.equal(w.calls.length, 1);

  w = world(); // in the trash but still listed
  w.d.moveToTrash = async (id) => { w.calls.push(id); w.trash.push({ key: A.key, contentId: id }); };
  assert.equal((await trashOne(A, w.d)).state, 'unclear');

  w = world(); // out of the library but not in the trash
  w.d.moveToTrash = async (id) => { w.calls.push(id); w.lib.delete(A.key); };
  assert.equal((await trashOne(A, w.d)).state, 'unclear');

  w = world(); // the trash cannot be read afterwards
  let n = 0;
  w.d.trashList = async () => { if (n++) throw new Error('HTTP 500'); return []; };
  assert.equal((await trashOne(A, w.d)).state, 'unclear');

  w = world(); // it shows up late
  const go = w.d.moveToTrash; let late = 0;
  w.d.moveToTrash = async (id) => { await go(id); };
  const list = w.d.trashList;
  w.d.trashList = async () => (w.calls.length && late++ < 2 ? [] : list());
  assert.equal((await trashOne(A, w.d)).state, 'trashed');
});

test('says so if anything else went to the trash with it', async () => {
  const w = world();
  const real = w.d.moveToTrash;
  w.d.moveToTrash = async (id) => { await real(id); w.trash.push({ key: 'AF1QipB', contentId: cid('B') }); };
  assert.equal((await trashOne(A, w.d)).extra, 1);
  assert.equal(w.notes.at(-1).extra, 1);
  assert.equal(openEnds(new Map([['K', w.notes.at(-1)]])).size, 1);
});

test('the call takes one real content id and can only mean trash', () => {
  assert.deepEqual(trashCall(cid('A')), ['XwAOJf', [null, 1, [cid('A')], 3]]);
  for (const bad of [null, undefined, '', 'AF1Qip', [cid('A')], [cid('A'), cid('B')], 'x'.repeat(60)]) assert.throws(() => trashCall(bad), StopError);
});

test('reads the trash and stops if the format changes', () => {
  const item = ['AF1QipT', ['u'], 1, cid('T')];
  assert.deepEqual(parseTrashPage([[item], 'next']), { items: [{ key: 'AF1QipT', contentId: cid('T') }], next: 'next' });
  assert.deepEqual(parseTrashPage([]), { items: [], next: null });
  for (const bad of [null, {}, ['x'], [[['AF1QipT', ['u'], 1, null]]], [[['bad', [], 1, cid('T')]]]]) assert.throws(() => parseTrashPage(bad), StopError);
});

test('finds the library id on a later page, and stops well past the day', async () => {
  const pages = (list) => (async function* () { for (const p of list) { seen++; yield p; } }());
  let seen = 0;
  const day = 86400_000;
  assert.equal(await libraryId(1, 'K', 100 * day, null, pages([{ videos: [], oldest: 101 * day }, { videos: [{ key: 'K', contentId: 'c' }], oldest: 99 * day }])), 'c');
  seen = 0;
  assert.equal(await libraryId(1, 'K', 100 * day, null, pages([{ videos: [], oldest: 90 * day }, { videos: [{ key: 'K', contentId: 'c' }], oldest: 1 }])), null);
  assert.equal(seen, 1);
  assert.equal(await libraryId(1, 'K', 100 * day, null, pages([{ videos: [{ key: 'K', contentId: null }], oldest: 1 }])), 'unknown');
});

test('says plainly that nothing was deleted', () => {
  assert.deepEqual(plainError('Nothing was deleted. It is already in the trash.'), { kind: 'stop', title: 'Nothing was deleted.', text: 'It is already in the trash.', action: 'photos' });
});

test('why a video may not be deleted without a copy', () => {
  const d = { contentId: cid('A'), sharedAlbums: [], albums: [{ key: 'AF1QipZ', title: 'Anything', shared: false }] };
  assert.deepEqual(bareReasons({ record: null, details: d }), []); // a private album does not matter
  assert.deepEqual(bareReasons({ record: { state: 'sending' }, details: d }), ['it has an upload record']);
  assert.deepEqual(bareReasons({ record: null, details: { ...d, sharedAlbums: ['Trip'] } }), ['in a shared album (Trip)']);
  assert.deepEqual(bareReasons({ record: null, details: { ...d, sharedAlbums: undefined } }), ['shared albums unknown']);
  assert.deepEqual(bareReasons({ record: null, details: { ...d, contentId: null } }), ['no content id from Google Photos']);
  assert.equal(bareReasons({ record: null, details: undefined }).length, 2);
});

test('stays locked until the user looked and it was read again', () => {
  const size = (e) => openEnds(new Map([['K', e]])).size;
  assert.equal(size({ state: 'sending' }), 1);
  assert.equal(size({ state: 'something new' }), 1);
  assert.equal(size({}), 1);
  assert.equal(size({ state: 'trashed' }), 0);
  assert.equal(size({ state: 'trashed', extra: 2 }), 1);
  assert.equal(size({ state: 'trashed', extra: 2, seen: true }), 0);
  assert.equal(size({ state: 'kept', seen: true }), 0);
});

test('looks again without changing anything, and says only what it read', async () => {
  const look = (trash, item, over = {}) => lookAgain({ key: A.key, contentId: cid('A') }, {
    trashList: async () => trash.map((c) => ({ key: 'x', contentId: c })), itemId: async () => item,
    getDetails: async () => { throw new Error('Google Photos returned no data.'); }, ...over,
  });
  assert.equal(await look([cid('T'), cid('A')], null), 'trashed');
  assert.equal(await look([cid('A')], cid('A')), 'unclear'); // in both
  assert.equal(await look([cid('T')], cid('A')), 'kept');
  assert.equal(await look([], cid('B')), 'unclear');
  assert.equal(await look([], null), 'gone');
  assert.equal(await look([], null, { getDetails: async () => ({}) }), 'unclear'); // Google Photos still knows it
  await assert.rejects(look([], null, { getDetails: async () => { throw new Error('Google Photos answered HTTP 500.'); } }));
  await assert.rejects(look([], null, { trashList: async () => { throw new Error('x'); } }));
  await assert.rejects(look([], null, { itemId: async () => { throw new Error('x'); } }));
});

// ---- a video that is on YouTube
const T = Date.parse('2026-11-25T12:00:00Z');
const REC = { state: 'uploaded', id: 'yt1', channel: 'C', size: 100, sha256: 'a'.repeat(64), fileName: 'A.MOV' };
const DET = { key: A.key, fileName: 'A.MOV', size: 100, width: 3840, height: 2160, original: true, timestamp: T, tzOffset: 0, contentId: cid('A'), sharedAlbums: [] };
const VID = {
  id: 'yt1', snippet: { channelId: 'C' }, status: { uploadStatus: 'processed', privacyStatus: 'private' }, processingDetails: { processingStatus: 'succeeded' },
  fileDetails: { fileSize: '100', videoStreams: [{ widthPixels: 3840, heightPixels: 2160, frameRateFps: 60 }] },
  contentDetails: { duration: 'PT6S' }, recordingDetails: { recordingDate: '2026-11-25T00:00:00Z' },
};
const M = { ...A, duration: 5600, kind: 'moved' };
function movedWorld(over = {}) {
  return world({ marked: async () => { throw new Error('not asked'); }, getRecord: async () => REC, getDetails: async () => DET, getVideo: async (id) => { assert.equal(id, 'yt1'); return VID; }, channelId: () => 'C', ...over });
}

test('a moved video: one call, after YouTube was asked last', async () => {
  const w = movedWorld();
  let after = 0;
  const { getVideo } = w.d;
  w.d.getVideo = async (id) => { after = 0; return getVideo(id); };
  for (const f of ['getDetails', 'getRecord', 'libraryId', 'itemId', 'trashList']) { const real = w.d[f]; w.d[f] = async (...x) => { if (!w.notes.length) after += 1; return real(...x); }; }
  assert.deepEqual(await trashOne(M, w.d), { state: 'trashed', extra: 0, problem: null });
  assert.deepEqual(w.calls, [cid('A')]);
  assert.equal(after, 0, 'nothing else was read between YouTube and the call');
});

test('a moved video: nothing is sent if either side does not say exactly the right thing', async () => {
  const v = (o) => ({ getVideo: async () => ({ ...VID, ...o }) });
  const d = (o) => ({ getDetails: async () => ({ ...DET, ...o }) });
  const r = (o) => ({ getRecord: async () => ({ ...REC, ...o }) });
  for (const [name, over] of Object.entries({
    'no record': { getRecord: async () => null },
    'half sent': r({ state: 'sending' }),
    'uncertain': r({ state: 'uncertain' }),
    'no id': r({ id: undefined }),
    'not fully read': r({ sha256: undefined }),
    'another channel on record': r({ channel: 'X' }),
    'not signed in': { channelId: () => null },
    'signed in elsewhere': { channelId: () => 'X' },
    'the record cannot be read': { getRecord: async () => { throw new Error('x'); } },
    'YouTube does not answer': { getVideo: async () => { throw new Error('x'); } },
    'not listed': { getVideo: async () => undefined },
    'another video': v({ id: 'yt2' }),
    'on another channel': v({ snippet: { channelId: 'X' } }),
    'Unlisted': v({ status: { uploadStatus: 'processed', privacyStatus: 'unlisted' } }),
    'Public': v({ status: { uploadStatus: 'processed', privacyStatus: 'public' } }),
    'privacy unknown': v({ status: { uploadStatus: 'processed' } }),
    'failed': v({ status: { uploadStatus: 'failed', privacyStatus: 'private' } }),
    'processing': v({ status: { uploadStatus: 'uploaded', privacyStatus: 'private' } }),
    'not finished': v({ processingDetails: { processingStatus: 'processing' } }),
    'size smaller': v({ fileDetails: { ...VID.fileDetails, fileSize: '99' } }),
    'size unknown': v({ fileDetails: { videoStreams: VID.fileDetails.videoStreams } }),
    'picture smaller': v({ fileDetails: { fileSize: '100', videoStreams: [{ widthPixels: 1920, heightPixels: 1080 }] } }),
    'no picture size': v({ fileDetails: { fileSize: '100' } }),
    'other length': v({ contentDetails: { duration: 'PT9S' } }),
    'other day': v({ recordingDetails: { recordingDate: '2026-11-20T00:00:00Z' } }),
    'shared now': d({ sharedAlbums: ['Trip'] }),
    'shared unknown': d({ sharedAlbums: undefined }),
    'not Original': d({ original: false }),
    'file changed': r({ size: 101 }),
    'other name': d({ fileName: 'B.MOV' }),
    'other size': d({ size: 101 }),
    'no content id': d({ contentId: null }),
    'no id anywhere': { ...d({ contentId: null }), libraryId: async () => null, itemId: async () => null },
    'not in the library': { libraryId: async () => null },
    'another id from the item': { itemId: async () => cid('B') },
    'already in the trash': { trashList: async () => [{ key: A.key, contentId: cid('A') }] },
    'an earlier one not cleared up': { entries: async () => new Map([['X', { state: 'sending' }]]) },
  })) {
    const w = movedWorld(over);
    await assert.rejects(trashOne(M, w.d), undefined, name);
    assert.deepEqual(w.calls, [], name);
    assert.deepEqual(w.notes, [], name);
  }
});

test('says which side did not answer, and why', async () => {
  const w = movedWorld({ getVideo: async () => { throw new Error('x'); } });
  await assert.rejects(trashOne(M, w.d), /^StopError: Nothing was deleted\. YouTube did not answer|Nothing was deleted\. YouTube did not answer, so the copy could not be checked\./);
  const u = movedWorld({ getVideo: async () => ({ ...VID, status: { uploadStatus: 'processed', privacyStatus: 'unlisted' } }) });
  await assert.rejects(trashOne(M, u.d), /Nothing was deleted\. It is Unlisted on YouTube, but you chose Private\. Set it back to Private in YouTube Studio, then check again\./);
  const l = movedWorld({ getVideo: async () => ({ ...VID, contentDetails: { duration: 'PT9S' } }) });
  await assert.rejects(trashOne(M, l.d), /Length is not the same on both sides/);
});

test('the kind is never mixed up', async () => {
  for (const kind of [undefined, null, '', 'both', 'Moved']) {
    for (const w of [world(), movedWorld({ marked: async () => true })]) {
      await assert.rejects(trashOne({ ...M, kind }, w.d), /what kind/);
      assert.deepEqual(w.calls, []);
    }
  }
  const w = movedWorld({ marked: async () => true }); // marked, but it has a record: not "no copy"
  await assert.rejects(trashOne({ ...M, kind: 'bare' }, w.d), StopError);
  assert.deepEqual(w.calls, []);
});

test('why a moved video may not be deleted', () => {
  const all = { record: REC, details: DET, video: VID, channelId: 'C', duration: 5600 };
  assert.deepEqual(movedReasons(all), []);
  assert.deepEqual(movedReasons({ ...all, duration: undefined }), []); // Google Photos gives none for some: shown as not checked
  assert.deepEqual(movedReasons({ ...all, video: { ...VID, contentDetails: { duration: 'PT9S' } } }), ['Length is different']);
  assert.deepEqual(movedReasons({ ...all, video: { ...VID, recordingDetails: { recordingDate: '2026-11-20' } } }), ['Recorded is different']);
  for (const k of ['record', 'details', 'video', 'channelId']) assert.ok(movedReasons({ ...all, [k]: undefined }).length, k);
  assert.ok(movedReasons({ ...all, record: { ...REC, id: undefined } }).length);
});

// ---- who may watch it
const VISES = ['private', 'unlisted', 'public'];
const seenAs = (privacyStatus) => ({ ...VID, status: { uploadStatus: 'processed', privacyStatus } });

test('why a moved video may not be deleted: as private as chosen or more passes, less or unknown blocks', () => {
  for (const chosen of VISES) {
    for (const actual of VISES) {
      const less = VISES.indexOf(actual) > VISES.indexOf(chosen);
      const record = Object.freeze({ ...REC, privacy: chosen });
      assert.deepEqual(movedReasons({ record, details: DET, video: seenAs(actual), channelId: 'C', duration: 5600 }),
        less ? [`privacy is ${actual}, not ${chosen}`] : [], `${chosen} ${actual}`);
    }
    for (const odd of [undefined, '', 'Private', 'secret']) {
      assert.deepEqual(movedReasons({ record: { ...REC, privacy: chosen }, details: DET, video: seenAs(odd), channelId: 'C', duration: 5600 }), [`privacy is unknown, not ${chosen}`], String(odd));
    }
    assert.deepEqual(movedReasons({ record: { ...REC, privacy: chosen }, details: DET, video: { ...VID, status: undefined }, channelId: 'C', duration: 5600 }).at(-1), `privacy is unknown, not ${chosen}`);
  }
  // A record from before the choice: Private only.
  assert.deepEqual(movedReasons({ record: REC, details: DET, video: seenAs('unlisted'), channelId: 'C', duration: 5600 }), ['privacy is unlisted, not private']);
  assert.deepEqual(movedReasons({ record: { ...REC, privacy: 'Unlisted' }, details: DET, video: seenAs('unlisted'), channelId: 'C', duration: 5600 }), ['privacy is unlisted, not private']);
});

test('a moved video with another visibility: deleted as chosen, kept when it is less private', async () => {
  const go = (privacy, actual) => movedWorld({ getRecord: async () => ({ ...REC, privacy }), getVideo: async () => seenAs(actual) });
  for (const [chosen, actual] of [['unlisted', 'unlisted'], ['public', 'public'], ['public', 'private'], ['public', 'unlisted'], ['unlisted', 'private']]) {
    const w = go(chosen, actual);
    assert.equal((await trashOne(M, w.d)).state, 'trashed', `${chosen} ${actual}`);
    assert.deepEqual(w.calls, [cid('A')]);
  }
  for (const [chosen, actual, text] of [
    ['unlisted', 'public', 'It is Public on YouTube, but you chose Unlisted. Set it back to Unlisted in YouTube Studio, then check again.'],
    ['private', 'public', 'It is Public on YouTube, but you chose Private. Set it back to Private in YouTube Studio, then check again.'],
    ['public', undefined, 'YouTube did not say who can watch it.'],
    ['public', 'Public', 'YouTube did not say who can watch it.'],
  ]) {
    const w = go(chosen, actual);
    await assert.rejects(trashOne(M, w.d), { message: `Nothing was deleted. ${text}` }, `${chosen} ${actual}`);
    assert.deepEqual([w.calls, w.notes], [[], []]);
  }
});
