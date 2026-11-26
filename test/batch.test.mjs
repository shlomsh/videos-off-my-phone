import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { unsafeReasons, confirmation, visibility, chosenVis, visName, visWho, VIS } from '../extension/lib/gate.js';
import { runQueue } from '../extension/lib/queue.js';
import { parseLibraryPage, parseBulkInfo, parseDetails, findInLibrary, BULK_FIELDS } from '../extension/lib/photos.js';
import { progressLine } from '../extension/lib/progress.js';
import { FatalError, StopError, probeSession } from '../extension/lib/transfer.js';

const SHA = 'a'.repeat(64);
const CID = 'ContentIdContentIdContent01';
const good = () => ({
  channelId: 'ch',
  record: { state: 'uploaded', id: 'v1', sha256: SHA, size: 100, channel: 'ch' },
  details: { key: 'AF1QipA', size: 100, width: 2160, height: 3840, original: true, sharedAlbums: [], albums: [], contentId: CID },
  video: {
    id: 'v1', snippet: { channelId: 'ch' }, status: { uploadStatus: 'processed', privacyStatus: 'private' },
    processingDetails: { processingStatus: 'succeeded' },
    fileDetails: { fileSize: '100', videoStreams: [{ widthPixels: 3840, heightPixels: 2160 }] },
  },
});

test('gate passes only a fully confirmed video', () => {
  assert.deepEqual(unsafeReasons(good()), []);
  const bad = {
    'no record': (g) => { g.record = null; },
    sending: (g) => { g.record.state = 'sending'; },
    'no hash': (g) => { g.record.sha256 = null; },
    'other channel record': (g) => { g.record.channel = 'x'; },
    'other channel video': (g) => { g.video.snippet.channelId = 'x'; },
    'no channel': (g) => { g.channelId = undefined; },
    'gone from YouTube': (g) => { g.video = undefined; },
    'wrong id': (g) => { g.video.id = 'v2'; },
    'gone from Photos': (g) => { g.details = null; },
    'not original': (g) => { g.details.original = false; },
    'size changed': (g) => { g.details.size = 101; },
    shared: (g) => { g.details.sharedAlbums = ['Trip']; },
    'shared unknown': (g) => { delete g.details.sharedAlbums; },
    processing: (g) => { g.video.processingDetails.processingStatus = 'processing'; },
    'uploaded only': (g) => { g.video.status.uploadStatus = 'uploaded'; },
    rejected: (g) => { g.video.status = { uploadStatus: 'rejected', rejectionReason: 'duplicate', privacyStatus: 'private' }; },
    unlisted: (g) => { g.video.status.privacyStatus = 'unlisted'; },
    'no status': (g) => { delete g.video.status; },
    'no processing': (g) => { delete g.video.processingDetails; },
    'no file details': (g) => { delete g.video.fileDetails; },
    'size differs': (g) => { g.video.fileDetails.fileSize = '99'; },
    'no size': (g) => { delete g.video.fileDetails.fileSize; },
    'no streams': (g) => { g.video.fileDetails.videoStreams = []; },
    'lower resolution': (g) => { g.video.fileDetails.videoStreams[0] = { widthPixels: 1920, heightPixels: 1080 }; },
    'no Photos size': (g) => { delete g.details.width; },
  };
  for (const [name, change] of Object.entries(bad)) {
    const g = good(); change(g);
    assert.ok(unsafeReasons(g).length > 0, name);
  }
});

// ---- queue
function queueWorld({ records = {}, failOn = {}, probe = { state: 'incomplete' }, original = true, choice = 'private' } = {}) {
  const w = { store: new Map(Object.entries(records)), sessions: [], given: [], streams: [], auth: 0, history: [] };
  w.d = {
    channelId: 'ch', now: () => 't',
    getRecord: async (k) => w.store.get(k) ?? null,
    setRecord: async (k, r) => { w.store.set(k, r); w.history.push([k, r.state]); },
    getAuth: async () => { w.auth++; return 'tok'; },
    getDetails: async (k) => ({ key: k, fileName: `${k}.MOV`, size: 10, original }),
    probe: async () => probe,
    privacyOf: () => choice,
    startSession: async (x, privacy) => { w.sessions.push(x.key); w.given.push(privacy); return 'uri'; },
    stream: async ({ key }) => {
      assert.equal(w.store.get(key).state, 'sending', 'recorded before any byte is sent');
      w.streams.push(key);
      if (failOn[key]) throw failOn[key];
      return { video: { id: `id-${key}` }, bytes: 10, sha256: SHA };
    },
  };
  return w;
}

test('queue uploads in order, renews sign-in each time, records each', async () => {
  const w = queueWorld();
  await runQueue(['a', 'b'], w.d);
  assert.deepEqual(w.streams, ['a', 'b']);
  assert.equal(w.auth, 2);
  assert.deepEqual(w.history, [['a', 'sending'], ['a', 'uploaded'], ['b', 'sending'], ['b', 'uploaded']]);
  assert.equal(w.store.get('a').sessionUri, undefined);
});

test('queue never uploads a recorded video again', async () => {
  const w = queueWorld({ records: { a: { state: 'uploaded', id: 'x' }, b: { state: 'uncertain' } } });
  await runQueue(['a', 'b'], w.d);
  assert.deepEqual(w.streams, []);
});

test('queue asks YouTube about an interrupted upload first', async () => {
  const sending = { a: { state: 'sending', sessionUri: 'u', size: 10, channel: 'ch' } };
  let w = queueWorld({ records: sending, probe: { state: 'finished', id: 'yt' } });
  await runQueue(['a'], w.d);
  assert.deepEqual(w.streams, []);
  assert.equal(w.store.get('a').id, 'yt');
  assert.equal(w.store.get('a').sha256, null); // held back by the gate
  w = queueWorld({ records: sending, probe: { state: 'expired' } });
  await runQueue(['a'], w.d);
  assert.deepEqual(w.streams, []);
  assert.equal(w.store.get('a').state, 'uncertain');
  w = queueWorld({ records: sending });
  await runQueue(['a'], w.d);
  assert.deepEqual(w.streams, ['a']);
  w = queueWorld({ records: { a: { ...sending.a, channel: 'other' } } });
  await runQueue(['a'], w.d);
  assert.deepEqual(w.streams, []);
});

test('one bad video is skipped; quota or sign-in problems stop everything', async () => {
  let w = queueWorld({ failOn: { a: new FatalError('bad file') } });
  await runQueue(['a', 'b'], w.d);
  assert.deepEqual(w.streams, ['a', 'b']);
  assert.equal(w.store.get('a').state, 'sending'); // asked about next time
  w = queueWorld({ failOn: { a: new StopError('quota') } });
  await assert.rejects(runQueue(['a', 'b'], w.d), /quota/);
  assert.deepEqual(w.streams, ['a']);
  const f = new FatalError('x');
  w = queueWorld({ failOn: { a: f, b: f, c: f, d: f } });
  await assert.rejects(runQueue(['a', 'b', 'c', 'd'], w.d), /Three videos/);
  assert.deepEqual(w.streams, ['a', 'b', 'c']);
  w = queueWorld({ original: false });
  await runQueue(['a'], w.d);
  assert.deepEqual(w.sessions, []);
});

test('queue stops when asked', async () => {
  const ac = new AbortController();
  const w = queueWorld();
  const stream = w.d.stream;
  w.d.stream = async (x) => { ac.abort(); return stream(x); };
  await assert.rejects(runQueue(['a', 'b'], w.d, { signal: ac.signal }));
  assert.deepEqual(w.streams, ['a']);
});

test('interrupted session answers', async () => {
  const answers = { 308: [308, {}, ''], override: [200, { 'x-http-status-code-override': '308' }, ''], 200: [200, {}, '{"id":"v"}'], 404: [404, {}, ''], empty: [200, {}, '{}'] };
  const want = { 308: 'incomplete', override: 'incomplete', 200: 'finished', 404: 'expired', empty: 'expired' };
  for (const [name, [code, head, body]] of Object.entries(answers)) {
    let range;
    const s = http.createServer((q, r) => { range = q.headers['content-range']; r.writeHead(code, head); r.end(body); });
    await new Promise((r) => s.listen(0, '127.0.0.1', r));
    const p = await probeSession({ sessionUri: `http://127.0.0.1:${s.address().port}/`, size: 50, token: 't' });
    s.closeAllConnections(); s.close();
    assert.equal(p.state, want[name], name);
    assert.equal(range, 'bytes */50');
  }
});

test('lists only own, finished videos', () => {
  const item = (key, { video = true, flags = [[1]], partial } = {}) => [key, ['https://x'], 5, 'd', 0, 5, 0, flags, null, null, null, null, partial ? [20] : null, video ? { 76647426: [1234] } : {}];
  const page = parseLibraryPage([[item('AF1QipA'), item('AF1QipB', { video: false }), item('AF1QipC', { flags: [[27]] }), item('AF1QipD', { partial: true }), item('AF1QipE', { flags: null })], 'next']);
  assert.deepEqual(page.videos.map((v) => v.key), ['AF1QipA']);
  assert.equal(page.scanned, 5);
  assert.equal(page.next, 'next');
  assert.throws(() => parseLibraryPage({ error: 1 }), StopError);
});

test('reads sizes and quality, ignoring unrequested items', () => {
  const row = (key, q) => { const d = []; d[3] = 'a.MOV'; d[9] = 7; d.push([1, 7, q]); return [key, d]; };
  const m = parseBulkInfo([[null, [row('AF1QipA', 2), row('AF1QipB', 1), row('AF1QipZ', 2)]]], ['AF1QipA', 'AF1QipB']);
  assert.deepEqual([...m.keys()], ['AF1QipA', 'AF1QipB']);
  assert.equal(m.get('AF1QipA').original, true);
  assert.equal(m.get('AF1QipB').original, false);
  const short = []; short[3] = 'a.MOV'; short[9] = 7; short.push([2]); // what Google sends without the quality field
  assert.equal(parseBulkInfo([[null, [['AF1QipA', short]]]], ['AF1QipA']).get('AF1QipA').original, undefined);
  assert.throws(() => parseBulkInfo(null, []), StopError);
});

const meta = (title, shared) => ({ 72930366: [null, title, null, 1, shared] });
test('an unreadable album list stops rather than counting as unshared', () => {
  const d = []; d[0] = 'AF1QipA'; d[2] = 'a.MOV'; d[5] = 1; d[30] = [1, 1, 2];
  d[19] = [['AF1QipAlbum', meta('Trip', true)]];
  assert.deepEqual(parseDetails([d], 'AF1QipA').sharedAlbums, ['Trip']);
  d[19] = [['AF1QipAlbum', {}]];
  assert.throws(() => parseDetails([d], 'AF1QipA'), StopError);
});

test('the code can only move one video to the trash, from one place, and cannot change an album', async () => {
  const fs = await import('node:fs');
  const dirs = ['', 'lib/', 'ui/'];
  const read = (end) => dirs.flatMap((d) => {
    const dir = new URL(`../extension/${d}`, import.meta.url);
    return fs.readdirSync(dir).filter((f) => end.test(f)).map((f) => fs.readFileSync(new URL(f, dir), 'utf8'));
  }).join('\n');
  const all = read(/\.js$/);
  // Remove-from-album and locked-folder calls, and HTTP DELETE.
  assert.doesNotMatch(all, /ycV3Nd|StLnCe|LjmOue|method: 'DELETE'/);
  // Making, filling, listing or reading an album, and the two albums of earlier versions.
  assert.doesNotMatch(all, /OXvT9d|E1Cajb|Z5xsfc|snAcKc|createAlbum|addToAlbum|albumItems|listAlbums|albumKey/i);
  assert.doesNotMatch(read(/\.(js|html|css|json)$/), /Safe to delete|Delete without a copy/i);
  assert.equal(all.match(/XwAOJf/g).length, 1);
  assert.match(all, /\['XwAOJf', \[null, 1, \[contentId\], 3\]\]/);
  assert.equal(all.match(/trashCall\(/g).length, 1); // where it is sent
  assert.equal(all.match(/trashOne\(/g).length, 2); // defined, and behind the one button
  assert.equal(all.match(/moveToTrash\(/g).length, 3); // defined, handed over, and the one use
});

test('finds wanted videos and stops reading once well past them', async () => {
  const day = 86400_000; let read = 0;
  const page = async function* () {
    for (const [keys, oldest] of [[['a'], 100 * day], [['b'], 90 * day], [['c'], 10 * day], [['d'], 1 * day]]) { read++; yield { videos: keys.map((key) => ({ key })), scanned: 1, oldest }; }
  };
  const find = async (w) => { read = 0; return [...await findInLibrary(1, w, null, page())]; };
  assert.deepEqual(await find([{ key: 'a', timestamp: 100 * day }]), ['a']);
  assert.equal(read, 1);
  // Trashed: read past its date, then not found.
  assert.deepEqual(await find([{ key: 'zz', timestamp: 95 * day }]), []);
  assert.equal(read, 2);
  assert.deepEqual(await find([{ key: 'a', timestamp: 100 * day }, { key: 'c', timestamp: 12 * day }]), ['a', 'c']);
  // Unknown date: read everything.
  assert.deepEqual(await find([{ key: 'zz' }]), []);
  assert.equal(read, 4);
  assert.deepEqual(await find([]), []);
});

test('asks for size and quality at the positions Google expects', () => {
  // Checked on a real account: with the last [] at 34, quality is missing.
  assert.equal(BULK_FIELDS.length, 36);
  assert.deepEqual(BULK_FIELDS.flatMap((x, i) => (x === null ? [] : [i])), [24, 35]);
});

test('progress line shows overall and per-video percent, speed and time left', () => {
  const base = { index: 2, count: 3, name: 'B.MOV', part: 0.5, bytes: 60e6, total: 120e6, sent: 60e6, seconds: 20 };
  assert.equal(progressLine(base), '50% · video 2 of 3: B.MOV 50% · 60 MB of 120 MB · 3.0 MB/s · about 20 s left');
  assert.equal(progressLine({ ...base, seconds: 1 }), '50% · video 2 of 3: B.MOV 50% · 60 MB of 120 MB');
  assert.match(progressLine({ ...base, bytes: 119.9e6 }), /^99%/);
  assert.match(progressLine({ ...base, total: 60e9, bytes: 6e9 }), /about 5\.0 h left/);
  assert.match(progressLine({ ...base, bytes: 0, total: 0, part: undefined }), /^0%/);
  // Skipped videos count as done but do not inflate the speed.
  assert.match(progressLine({ ...base, sent: 20e6 }), /1\.0 MB\/s/);
});

test('confirmation repeats only what YouTube reports', () => {
  const c = (change = () => {}) => { const x = good(); change(x); return confirmation(x.record, x.video, 'ch'); };
  assert.deepEqual(c(), { mark: '✓', level: 'good', text: 'YouTube received all 100 bytes · Private · 3840×2160 · processing finished.' });
  assert.equal(c((x) => { x.video.processingDetails.processingStatus = 'processing'; }).level, 'wait');
  assert.equal(c((x) => { delete x.video.fileDetails; }).level, 'wait');
  assert.equal(c((x) => { x.video = undefined; }).level, 'bad');
  assert.match(c((x) => { x.video.fileDetails.fileSize = '99'; }).text, /99 of 100/);
  assert.equal(c((x) => { x.video.status.privacyStatus = 'public'; }).text, 'It is Public on YouTube, but you chose Private.');
  assert.equal(c((x) => { delete x.video.status.privacyStatus; }).text, 'YouTube did not say who can watch it.');
  assert.match(c((x) => { x.video.status = { uploadStatus: 'rejected', rejectionReason: 'duplicate', privacyStatus: 'private' }; }).text, /duplicate/);
  assert.equal(c((x) => { x.video.snippet.channelId = 'other'; }).level, 'bad');
});

// ---- who may watch it
test('the visibility YouTube reports is judged against the choice, by direction', () => {
  const r = (privacy) => Object.freeze({ state: 'uploaded', id: 'v1', privacy });
  const y = (privacyStatus) => ({ status: { privacyStatus } });
  const want = {
    private: { private: 'same', unlisted: 'less', public: 'less' },
    unlisted: { private: 'more', unlisted: 'same', public: 'less' },
    public: { private: 'more', unlisted: 'more', public: 'same' },
  };
  for (const chosen of VIS) {
    for (const actual of VIS) {
      const rec = r(chosen);
      assert.deepEqual(visibility(rec, y(actual)), { chosen, actual, way: want[chosen][actual] }, `${chosen} ${actual}`);
      assert.equal(rec.privacy, chosen); // the choice is never overwritten
    }
    for (const odd of [undefined, null, '', 'Private', 'PUBLIC', 'unlisted ', 'constructor', 'toString', 1, {}, ['private']]) {
      assert.deepEqual(visibility(r(chosen), y(odd)), { chosen, actual: null, way: 'unknown' }, String(odd));
    }
    assert.deepEqual(visibility(r(chosen), {}), { chosen, actual: null, way: 'unknown' });
    assert.deepEqual(visibility(r(chosen), undefined), { chosen, actual: null, way: 'unknown' });
  }
  // Uploads from before the choice existed, or an unreadable choice, count as Private.
  for (const rec of [{ state: 'uploaded' }, { privacy: undefined }, { privacy: 'Public' }, { privacy: 'constructor' }, { privacy: 2 }, null, undefined]) {
    assert.equal(chosenVis(rec), 'private');
    assert.deepEqual(visibility(rec, y('unlisted')), { chosen: 'private', actual: 'unlisted', way: 'less' });
    assert.deepEqual(visibility(rec, y('private')), { chosen: 'private', actual: 'private', way: 'same' });
  }
  assert.deepEqual(VIS, ['private', 'unlisted', 'public']);
  assert.deepEqual(VIS.map(visName), ['Private', 'Unlisted', 'Public']);
  assert.deepEqual(VIS.map(visWho), ['Only you', 'Anyone with the link', 'Anyone']);
  assert.equal(visName('x'), null); assert.equal(visWho(undefined), null);
});

test('the gate passes what is as private as chosen, or more, and blocks the rest', () => {
  for (const chosen of VIS) {
    for (const actual of VIS) {
      const g = good(); g.record.privacy = chosen; g.video.status.privacyStatus = actual;
      const less = VIS.indexOf(actual) > VIS.indexOf(chosen);
      assert.deepEqual(unsafeReasons(g), less ? [`privacy is ${actual}, not ${chosen}`] : [], `${chosen} ${actual}`);
      const c = confirmation(g.record, g.video, 'ch');
      assert.deepEqual([c.level, c.text], less
        ? ['bad', `It is ${visName(actual)} on YouTube, but you chose ${visName(chosen)}.`]
        : ['good', `YouTube received all 100 bytes · ${visName(actual)} · 3840×2160 · processing finished.`], `${chosen} ${actual}`);
    }
    for (const odd of [undefined, '', 'Private', 'secret']) {
      const g = good(); g.record.privacy = chosen; g.video.status.privacyStatus = odd;
      assert.deepEqual(unsafeReasons(g), [`privacy is unknown, not ${chosen}`]);
      assert.equal(confirmation(g.record, g.video, 'ch').level, 'bad');
    }
  }
  const legacy = good(); delete legacy.record.privacy; legacy.video.status.privacyStatus = 'unlisted';
  assert.deepEqual(unsafeReasons(legacy), ['privacy is unlisted, not private']);
  legacy.video.status.privacyStatus = 'private';
  assert.deepEqual(unsafeReasons(legacy), []);
});

test('the queue sends and records the choice of this press, or of the try it continues', async () => {
  // Fresh.
  let w = queueWorld({ choice: 'unlisted' });
  await runQueue(['a'], w.d);
  assert.deepEqual(w.given, ['unlisted']);
  assert.deepEqual(w.history, [['a', 'sending'], ['a', 'uploaded']]);
  assert.equal(w.store.get('a').privacy, 'unlisted');
  // The 'sending' record carried it as well, before any byte was sent.
  w = queueWorld({ choice: 'public' });
  const seen = [];
  const stream = w.d.stream; w.d.stream = async (x) => { seen.push(w.store.get(x.key).privacy); return stream(x); };
  await runQueue(['a'], w.d);
  assert.deepEqual(seen, ['public']);
  assert.equal(w.store.get('a').privacy, 'public');
  // Recovered: kept from the 'sending' record, nothing sent again.
  const sending = (o) => ({ a: { state: 'sending', sessionUri: 'u', size: 10, channel: 'ch', ...o } });
  w = queueWorld({ records: sending({ privacy: 'unlisted' }), probe: { state: 'finished', id: 'yt' }, choice: 'public' });
  await runQueue(['a'], w.d);
  assert.deepEqual(w.given, []);
  assert.equal(w.store.get('a').privacy, 'unlisted');
  assert.equal(w.store.get('a').state, 'uploaded');
  // Started again: the earlier try's choice, not this press's.
  w = queueWorld({ records: sending({ privacy: 'unlisted' }), choice: 'public' });
  await runQueue(['a'], w.d);
  assert.deepEqual(w.given, ['unlisted']);
  assert.equal(w.store.get('a').privacy, 'unlisted');
  // A try from before the choice existed was Private, whatever this press says.
  w = queueWorld({ records: sending({}), choice: 'public' });
  await runQueue(['a'], w.d);
  assert.deepEqual(w.given, ['private']);
  assert.equal(w.store.get('a').privacy, 'private');
  // No readable choice: nothing is started.
  for (const choice of [undefined, null, '', 'Public', 'secret']) {
    w = queueWorld();
    w.d.privacyOf = () => choice;
    const done = await runQueue(['a'], w.d);
    assert.deepEqual([w.sessions, w.streams, w.history], [[], [], []], String(choice));
    assert.deepEqual(done, [{ key: 'a', result: 'failed' }]);
  }
});
