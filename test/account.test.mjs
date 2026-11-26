import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const store = {};
globalThis.chrome = { storage: { local: {
  get: async (k) => (k === null ? { ...store } : { [k]: store[k] }),
  set: async (o) => { Object.assign(store, o); },
  remove: async (k) => { for (const x of [k].flat()) delete store[x]; },
} } };
const { forgetYouTube, forgetYouTubeStored, forgetAll, finishCounts, allRecords, allMarks, allTrash } = await import('../extension/lib/records.js');
const { unsafeReasons } = await import('../extension/lib/gate.js');
const { movedReasons } = await import('../extension/lib/trash.js');
const { runQueue } = await import('../extension/lib/queue.js');
const { rowState, placeOf, canCopy, gate } = await import('../extension/ui/rows.js');
const { finishLines, forgetWarning } = await import('../extension/ui/account.js');

const SHA = 'a'.repeat(64);
const moved = (o = {}) => ({ state: 'uploaded', id: 'yt1', sha256: SHA, size: 100, fileName: 'IMG_1.MOV', channel: 'UC', privacy: 'unlisted', at: '2026-11-01T10:00:00Z', ...o });
const video = () => ({ id: 'yt1', snippet: { channelId: 'UC' }, status: { uploadStatus: 'processed', privacyStatus: 'unlisted' }, processingDetails: { processingStatus: 'succeeded' }, fileDetails: { fileSize: '100', videoStreams: [{ widthPixels: 3840, heightPixels: 2160 }] } });
const details = () => ({ key: 'K', size: 100, width: 3840, height: 2160, original: true, sharedAlbums: [], contentId: 'c', fileName: 'IMG_1.MOV', timestamp: 1 });
const clear = () => { for (const k of Object.keys(store)) delete store[k]; };

test('forgetting YouTube keeps the Google Photos side and drops the rest', () => {
  const before = new Map([
    ['K', moved()],
    ['D', moved({ id: 'yt2', deletedAt: '2026-11-02T10:00:00Z' })],
    ['S', { state: 'sending', sessionUri: 'https://www.googleapis.com/upload/x', size: 50, fileName: 'IMG_2.MOV', channel: 'UC', privacy: 'private', at: 't' }],
    ['U', { state: 'uncertain', sessionUri: 'https://www.googleapis.com/upload/y', size: 60, fileName: 'IMG_3.MOV', channel: 'UC', privacy: 'public', at: 't' }],
  ]);
  const copy = structuredClone([...before]);
  const after = forgetYouTube(before);
  assert.deepEqual([...before], copy, 'what it is given is not changed');
  assert.deepEqual([...after.keys()], ['K', 'D', 'S', 'U'], 'every Google Photos key stays');
  assert.deepEqual(after.get('K'), { state: 'uploaded', size: 100, sha256: SHA, fileName: 'IMG_1.MOV', at: '2026-11-01T10:00:00Z', forgotten: true });
  assert.deepEqual(after.get('D'), { state: 'uploaded', size: 100, sha256: SHA, fileName: 'IMG_1.MOV', at: '2026-11-01T10:00:00Z', deletedAt: '2026-11-02T10:00:00Z', forgotten: true });
  // Still being sent, or not known: never sent again by itself.
  assert.deepEqual(after.get('S'), { state: 'uncertain', size: 50, fileName: 'IMG_2.MOV', at: 't', forgotten: true });
  assert.equal(after.get('U').state, 'uncertain');
  for (const r of after.values()) for (const k of ['id', 'channel', 'privacy', 'sessionUri']) assert.ok(!(k in r), `${k} is dropped`);
  assert.deepEqual([...forgetYouTube(after)], [...after], 'doing it twice changes nothing');
});

test('a forgotten video can never be deleted, moved again, or offered in step 1', async () => {
  const r = forgetYouTube(new Map([['K', moved()]])).get('K');
  // The gate refuses it, even with a video that would pass.
  assert.equal(unsafeReasons({ record: moved(), details: details(), video: video(), channelId: 'UC' }).length, 0, 'the same video passes with its id');
  assert.deepEqual(unsafeReasons({ record: r, details: details(), video: video(), channelId: 'UC' }), ['no finished upload on record']);
  assert.deepEqual(unsafeReasons({ record: { ...r, channel: 'UC' }, details: details(), video: video(), channelId: 'UC' }), ['no finished upload on record']);
  assert.ok(movedReasons({ record: r, details: details(), video: video(), channelId: 'UC', duration: 5 }).length);
  assert.notEqual(gate({ record: r, details: details(), video: video(), channelId: 'UC' }), 'ready');
  // Step 2, as moved before; never step 1 or step 3.
  for (const c of [{ channelId: 'UC', asked: new Set(), statuses: new Map() }, { channelId: null }, { channelId: 'UC', asked: new Set([undefined]), statuses: new Map([[undefined, video()]]) }]) {
    const st = rowState({ key: 'K', size: 100, original: true, record: r }, { failed: new Map(), held: new Map(), ready: new Set(['K']), ...c });
    assert.equal(st.s, 'again');
    assert.equal(st.ax, 'Moved before. Not found on YouTube yet.');
    assert.equal(canCopy(st.s), false);
    assert.equal(placeOf(st, [], { ready: true }), 'stays');
  }
  // Its pair view does not claim the upload broke off: the bytes were checked when it was sent.
  const { factsFor } = await import('../extension/ui/rows.js');
  const st = rowState({ key: 'K', size: 100, original: true, record: r }, { channelId: 'UC', failed: new Map(), asked: new Set(), statuses: new Map() });
  const every = factsFor({ key: 'K', size: 100, record: r }, st, details(), undefined).find((f) => f.name === 'Every byte');
  assert.deepEqual([every.a, every.b, every.m], ['Read to the end', 'All arrived', 'same']);
  // Move skips it and starts no upload.
  const sessions = [];
  const setRecord = async () => assert.fail('nothing is written');
  const d = { channelId: 'UC', now: () => 't', getRecord: async () => r, setRecord, getAuth: async () => 'tok', getDetails: async () => details(), probe: async () => ({ state: 'finished', id: 'x' }), privacyOf: () => 'private', startSession: async () => { sessions.push(1); return 'uri'; }, stream: async () => assert.fail('nothing is sent') };
  const states = [];
  assert.deepEqual(await runQueue(['K'], d, { onState: (k, t) => states.push(t) }), [{ key: 'K', result: 'skipped' }]);
  const u = forgetYouTube(new Map([['S', { state: 'sending', sessionUri: 'u', size: 50, channel: 'UC' }]])).get('S');
  assert.deepEqual(await runQueue(['S'], { ...d, getRecord: async () => u }), [{ key: 'S', result: 'uncertain' }]);
  assert.equal(sessions.length, 0);
  assert.deepEqual(states, ['Already uploaded']);
});

test('Remove access with the box off: stored records lose only their YouTube side', async () => {
  clear();
  Object.assign(store, {
    'upload:K': moved(), 'upload:S': { state: 'sending', sessionUri: 'u', size: 5, channel: 'UC', at: 't' },
    'mark:B': { decision: 'bare', at: 't' }, 'trash:K': { state: 'trashed', contentId: 'c', fileName: 'IMG_1.MOV', size: 100, at: 't' }, other: 1,
  });
  assert.equal(await forgetYouTubeStored(), 2);
  assert.deepEqual(store['upload:K'], { state: 'uploaded', size: 100, sha256: SHA, fileName: 'IMG_1.MOV', at: '2026-11-01T10:00:00Z', forgotten: true });
  assert.deepEqual(store['upload:S'], { state: 'uncertain', size: 5, at: 't', forgotten: true });
  assert.deepEqual(store['mark:B'], { decision: 'bare', at: 't' });
  assert.equal(store['trash:K'].state, 'trashed', 'the counter is kept');
  assert.equal(store.other, 1);
});

test('Remove and forget: every upload, mark and trash record goes, and the counter is 0', async () => {
  clear();
  Object.assign(store, { 'upload:K': moved(), 'upload:L': moved({ forgotten: true }), 'mark:B': { decision: 'bare' }, 'trash:K': { state: 'trashed', size: 100 }, 'trash:B': { state: 'gone', size: 7 }, channel: { id: 'UC' }, other: 1 });
  assert.equal(await forgetAll(), 5);
  assert.equal((await allRecords()).size, 0);
  assert.equal((await allMarks()).size, 0);
  const counter = [...(await allTrash()).values()].filter((e) => ['trashed', 'gone'].includes(e.state)).reduce((t, e) => t + e.size, 0);
  assert.equal(counter, 0);
  assert.deepEqual(store, { channel: { id: 'UC' }, other: 1 }, 'the rest is left to Sign out');
  assert.equal(await forgetAll(), 0);
});

test('finish first: the counts come from the records', () => {
  const m = (o) => new Map(o.map((r, i) => [`k${i}`, r]));
  assert.deepEqual(finishCounts(new Map()), { done: 0, left: 0, sending: 0 });
  assert.deepEqual(finishCounts(m([moved({ deletedAt: 't' }), moved({ deletedAt: 't' }), moved(), moved({ forgotten: true, id: undefined }), { state: 'sending' }, { state: 'uncertain' }, { state: 'uploaded', deletedAt: 't', forgotten: true }])), { done: 3, left: 2, sending: 2 });
  // The lines: a count of 0 is not shown, and one video reads as one.
  assert.deepEqual(finishLines({ done: 24, left: 5, sending: 2 }).map((l) => (l.strong ?? '') + l.text), [
    '24 moved videos are deleted from Google Photos. Nothing to do.',
    '5 moved videos are still in Google Photos. Delete them here first, or the new version may move them again.',
    '2 are still uploading. Wait until YouTube has them.',
  ]);
  assert.deepEqual(finishLines({ done: 0, left: 1, sending: 0 }).map((l) => l.strong + l.text), ['1 moved video is still in Google Photos. Delete it here first, or the new version may move it again.']);
  assert.deepEqual(finishLines({ done: 1, left: 0, sending: 1 }).map((l) => (l.strong ?? '') + l.text), ['1 moved video is deleted from Google Photos. Nothing to do.', '1 is still uploading. Wait until YouTube has it.']);
  assert.deepEqual(finishLines({ done: 0, left: 0, sending: 0 }), []);
});

test('the forget warning says what would be lost', () => {
  assert.equal(forgetWarning(36, '14.60 GB'), '36 videos you moved would look new again, and could be moved to YouTube twice. This cannot be undone. The 14.60 GB counter starts again at 0.');
  assert.equal(forgetWarning(1, ''), '1 video you moved would look new again, and could be moved to YouTube twice. This cannot be undone.');
  assert.equal(forgetWarning(0, ''), 'This cannot be undone.');
});

test('the Web Store zip has STORE_BUILD = true and no key; the unpacked copy is unchanged', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const out = mkdtempSync(path.join(tmpdir(), 'pack-'));
  try {
    const zip = execFileSync('sh', [path.join(root, 'tools/pack-store.sh')], { env: { ...process.env, PACK_OUT: out } }).toString().trim();
    assert.deepEqual(readdirSync(out), [path.basename(zip)]);
    const config = execFileSync('unzip', ['-p', zip, 'config.js']).toString();
    const manifest = JSON.parse(execFileSync('unzip', ['-p', zip, 'manifest.json']).toString());
    assert.match(config, /^export const STORE_BUILD = true;$/m);
    assert.doesNotMatch(config, /STORE_BUILD = false/);
    assert.ok(!('key' in manifest));
    const mine = JSON.parse(readFileSync(path.join(root, 'extension/manifest.json'), 'utf8'));
    assert.equal(manifest.version, mine.version);
    assert.deepEqual({ ...manifest, key: mine.key }, mine, 'only the key differs');
    assert.match(readFileSync(path.join(root, 'extension/config.js'), 'utf8'), /^export const STORE_BUILD = false;$/m);
  } finally { rmSync(out, { recursive: true, force: true }); }
});
