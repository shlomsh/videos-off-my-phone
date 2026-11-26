import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowState, placeOf, gate, compare, canCopy, factsFor, differs } from '../extension/ui/rows.js';
import { VIS, visName } from '../extension/lib/gate.js';
import { plainReason, plainError, isoLength, amountLine, timeLeft, sentLine } from '../extension/ui/text.js';

const good = () => ({ id: 'y', snippet: { channelId: 'UC' }, status: { uploadStatus: 'processed', privacyStatus: 'private' }, processingDetails: { processingStatus: 'succeeded' }, fileDetails: { fileSize: '100', videoStreams: [{ widthPixels: 3840, heightPixels: 2160 }] } });
const rec = (o = {}) => ({ state: 'uploaded', id: 'y', channel: 'UC', size: 100, sha256: 'a'.repeat(64), ...o });
const ctx = (o = {}) => ({ failed: new Map(), held: new Map(), ready: new Set(), channelId: 'UC', asked: new Set(['y']), statuses: new Map([['y', good()]]), ...o });
const v = (record, o = {}) => ({ key: 'K', size: 100, original: true, record, ...o });
const s = (record, o, vo) => rowState(v(record, vo), ctx(o)).s;

test('every state of one video', () => {
  assert.equal(s(null), 'lib');
  assert.equal(s(null, {}, { original: false }), 'no');
  assert.equal(s(null, {}, { size: undefined }), 'no');
  assert.equal(s(null, { failed: new Map([['K', 'x']]) }), 'fail');
  assert.equal(s(null, { run: new Map([['K', { text: 'waiting' }]]) }), 'wait');
  assert.equal(s(null, { run: new Map([['K', { text: 'Uploading', part: 0.5 }]]) }), 'up');
  assert.equal(s(null, { paused: true, run: new Map([['K', { text: 'Preparing' }]]) }), 'pause');
  assert.equal(s({ state: 'sending' }), 'cut');
  assert.equal(s({ state: 'uncertain' }), 'ask');
  assert.equal(s(rec()), 'yt');
  assert.equal(s(rec({ sha256: null })), 'held');
  assert.equal(s(rec(), { held: new Map([['K', ['in a shared album (Trip)']]]) }), 'held');
  assert.equal(s(rec(), { asked: new Set() }), 'sent');
  assert.equal(s(rec({ channel: 'UX' })), 'sent');
  assert.equal(s(rec(), { channelId: null }), 'sent');
  assert.equal(s(rec(), { statuses: new Map() }), 'stop');
  const pub = good(); pub.status.privacyStatus = 'unlisted';
  assert.equal(s(rec(), { statuses: new Map([['y', pub]]) }), 'stop');
  const slow = good(); slow.processingDetails.processingStatus = 'processing';
  assert.equal(s(rec(), { statuses: new Map([['y', slow]]) }), 'proc');
});

test('an album of an earlier version changes nothing', () => {
  for (const o of [{}, { statuses: new Map() }, { asked: new Set() }, { held: new Map([['K', ['in a shared album (Trip)']]]) }]) {
    assert.deepEqual(rowState(v(rec({ album: { key: 'A', contentId: 'c', at: 't' } })), ctx(o)), rowState(v(rec()), ctx(o)));
  }
});

test('a video is in exactly one place, and only what passed every check is "on YouTube"', () => {
  const ok = [{ m: 'same' }, { m: 'fine' }];
  const at = (st, facts = ok, o = { ready: true }) => placeOf({ word: '', ax: '', s: st }, facts, o);
  for (const st of ['lib', 'no']) assert.equal(at(st), 'choose');
  for (const st of ['wait', 'up', 'pause']) assert.equal(at(st), 'moving');
  for (const st of ['cut', 'fail']) assert.equal(at(st), 'lost');
  assert.equal(at('cut', ok, { queued: true }), 'moving'); // stopped by the user
  assert.equal(at('fail', ok, { queued: true }), 'lost');
  for (const st of ['ask', 'stop']) assert.equal(at(st), 'look');
  for (const st of ['sent', 'proc']) assert.equal(at(st), 'working');
  assert.equal(placeOf({ s: 'sent', word: 'On another channel', ax: '' }, ok, { ready: true }), 'stays');
  assert.equal(at('held'), 'stays');
  assert.equal(at('yt'), 'youtube');
  assert.equal(at('yt', [...ok, { m: 'none' }]), 'youtube'); // not checked does not hold it
  assert.equal(at('yt', ok, { ready: false }), 'working');
  assert.equal(at('yt', ok, { ready: true, gone: true }), 'working');
  for (const st of ['yt', 'held']) assert.equal(at(st, [...ok, { m: 'diff' }]), 'look'); // even when the rules passed
  for (const st of ['lib', 'no', 'wait', 'up', 'pause', 'cut', 'fail', 'ask', 'stop', 'sent', 'proc', 'held', 'anything']) assert.notEqual(at(st), 'youtube', st);
});

test('the gate gives no answer while something is unknown', () => {
  const d = { size: 100, width: 2160, height: 3840, original: true, sharedAlbums: [] };
  const g = (o) => gate({ record: rec(), details: d, video: good(), channelId: 'UC', ...o });
  assert.equal(g({}), 'ready');
  assert.equal(g({ record: rec({ album: { key: 'A' } }) }), 'ready');
  assert.equal(g({ details: null }), null);
  const slow = good(); slow.processingDetails.processingStatus = 'processing';
  assert.equal(g({ video: slow }), null);
  assert.deepEqual(g({ record: rec({ sha256: null }) }), ['the upload was interrupted, so its bytes were not fully checked']);
  assert.deepEqual(g({ details: { ...d, sharedAlbums: ['Trip'] } }), ['in a shared album (Trip)']);
  assert.ok(Array.isArray(g({ video: undefined })));
  assert.ok(Array.isArray(g({ channelId: null })));
});

test('only videos that are not on YouTube can be copied', () => {
  for (const st of ['lib', 'cut', 'fail']) assert.ok(canCopy(st));
  for (const st of ['sent', 'proc', 'yt', 'held', 'stop', 'ask', 'no', 'up', 'wait', 'pause']) assert.ok(!canCopy(st));
});

test('the comparison never claims what was not checked', () => {
  const st = { s: 'yt' };
  const m = (d, y) => Object.fromEntries(compare(v(rec()), st, d, y).map((x) => [x.name, x.m]));
  const d = { size: 100, width: 2160, height: 3840, original: true, sharedAlbums: [] };
  assert.deepEqual(m(d, good()), { Size: 'same', Picture: 'same', 'Seen by': 'fine', State: 'fine', 'Every byte': 'same' });
  assert.equal(m(null, good()).Picture, 'none');
  assert.equal(m(d, undefined).Size, 'wait');
  assert.equal(m({ ...d, size: 99 }, good()).Size, 'diff');
  assert.equal(compare(v(rec({ sha256: null })), st, d, good()).at(-1).m, 'none');
});

test('plain words', () => {
  assert.match(plainReason('in a shared album (Trip)'), /shared album “Trip”/);
  assert.equal(plainReason('privacy is unlisted, not private'), 'It is Unlisted on YouTube, but you chose Private. Set it back to Private in YouTube Studio, then check again.');
  assert.equal(plainReason('privacy is public, not unlisted'), 'It is Public on YouTube, but you chose Unlisted. Set it back to Unlisted in YouTube Studio, then check again.');
  for (const chosen of VIS) assert.equal(plainReason(`privacy is unknown, not ${chosen}`), 'YouTube did not say who can watch it.');
  assert.equal(plainReason('something new'), 'something new.');
  assert.match(plainError('YouTube: The user has exceeded the number of videos they may upload.').title, /all YouTube takes/);
  assert.match(plainError('Lost the Google Photos tab. Keep one open at photos.google.com.').title, /No Google Photos tab/);
  assert.match(plainError('Another Video Offload page is busy. Wait for it or close it.').title, /another tab/);
  assert.equal(isoLength('PT1M3S'), 63000);
  assert.equal(isoLength('bad'), null);
  assert.equal(amountLine({ bytes: 60e6, total: 120e6, sent: 60e6, seconds: 20 }), '60 MB of 120 MB, 3.0 MB a second, about 20 seconds left');
});

test('progress words', () => {
  assert.equal(timeLeft({ bytes: 60e6, total: 120e6, sent: 60e6, seconds: 20 }), 'About 20 seconds left.');
  assert.equal(timeLeft({ bytes: 0, total: 120e6, sent: 0, seconds: 0 }), '');
  assert.equal(sentLine({ bytes: 60e6, total: 120e6, sent: 60e6, seconds: 5 }), '60 MB of 120 MB, 12 MB a second');
});

// ---- who may watch it
const yv = (privacyStatus) => { const y = good(); y.status.privacyStatus = privacyStatus; return y; };
const D = { size: 100, width: 2160, height: 3840, original: true, sharedAlbums: [], timestamp: Date.parse('2026-11-25T12:00:00Z'), tzOffset: 0 };

test('a row stops only when YouTube is less private than chosen, or does not say', () => {
  const row = (chosen, actual) => rowState(v(rec({ privacy: chosen })), ctx({ statuses: new Map([['y', yv(actual)]]) }));
  for (const chosen of VIS) {
    for (const actual of VIS) {
      const st = row(chosen, actual);
      if (VIS.indexOf(actual) > VIS.indexOf(chosen)) {
        assert.deepEqual({ s: st.s, word: st.word, meta: st.meta, at: st.at, ax: st.ax }, {
          s: 'stop', word: 'Not as you chose', meta: `It is ${visName(actual)} on YouTube. You chose ${visName(chosen)}.`,
          at: 'Do not delete', ax: `Set it back to ${visName(chosen)} in YouTube Studio, then check again.`,
        }, `${chosen} ${actual}`);
      } else {
        assert.equal(st.s, 'yt', `${chosen} ${actual}`);
        assert.equal(st.meta, `The whole file, under 1 MB. ${visName(actual)}. 4K (3840 × 2160).`);
      }
    }
    for (const odd of [undefined, '', 'Private', 'secret']) {
      const st = row(chosen, odd);
      assert.deepEqual([st.s, st.word, st.ax], ['stop', 'Something is wrong', 'Keep the original.'], String(odd));
      assert.equal(st.meta, 'YouTube did not say who can watch it.');
    }
  }
  // Records from before the choice: Private.
  assert.equal(s(rec(), { statuses: new Map([['y', yv('unlisted')]]) }), 'stop');
  assert.equal(rowState(v(rec()), ctx({ statuses: new Map([['y', yv('unlisted')]]) })).word, 'Not as you chose');
  // Other rows name what YouTube says, not "Private".
  const slow = yv('private'); slow.processingDetails.processingStatus = 'processing';
  assert.equal(rowState(v(rec({ privacy: 'public' })), ctx({ statuses: new Map([['y', slow]]) })).meta, 'The whole file, under 1 MB. Private.');
  const slowU = yv('unlisted'); slowU.processingDetails.processingStatus = 'processing';
  assert.equal(rowState(v(rec({ privacy: 'unlisted' })), ctx({ statuses: new Map([['y', slowU]]) })).meta, 'The whole file, under 1 MB. Unlisted.');
  assert.equal(rowState(v(rec({ privacy: 'public', sha256: null })), ctx({ statuses: new Map([['y', yv('public')]]) })).meta, 'Public. The upload was interrupted.');
});

test('"Seen by" says who can watch it; only less private, or not saying, is different', () => {
  const seen = (chosen, actual, d = D, st = { s: 'yt' }) => compare(v(rec({ privacy: chosen })), st, d, actual === null ? undefined : yv(actual)).find((f) => f.name === 'Seen by');
  const fact = (chosen, actual, d = D, st = { s: 'yt' }) => factsFor(v(rec({ privacy: chosen })), st, d, actual === null ? undefined : yv(actual)).find((f) => f.name === 'Seen by');
  const who = { private: 'Only you (Private)', unlisted: 'Anyone with the link (Unlisted)', public: 'Anyone (Public)' };
  const short = { private: 'Only you', unlisted: 'Anyone with the link', public: 'Anyone' };
  for (const chosen of VIS) {
    for (const actual of VIS) {
      const way = actual === chosen ? 'same' : VIS.indexOf(actual) < VIS.indexOf(chosen) ? 'more' : 'less';
      const m = way === 'less' ? 'diff' : way === 'more' ? 'more' : chosen === 'private' ? 'fine' : 'asyou';
      const f = seen(chosen, actual);
      assert.deepEqual([f.b, f.m], [who[actual], m], `${chosen} ${actual}`);
      const g = fact(chosen, actual);
      assert.deepEqual([g.b, g.m], [short[actual], m], `${chosen} ${actual}`);
      // A shared album still says so, unless YouTube is less private than chosen.
      assert.equal(seen(chosen, actual, { ...D, sharedAlbums: ['Trip'] }).m, way === 'less' ? 'diff' : 'shared');
      assert.equal(seen(chosen, actual, null).m, way === 'less' ? 'diff' : 'none');
      // Placing it: only 'diff' holds it back from step 3.
      const facts = factsFor(v(rec({ privacy: chosen })), { s: 'yt' }, D, yv(actual));
      assert.deepEqual(differs(facts).map((x) => x.name), way === 'less' ? ['Seen by'] : [], `${chosen} ${actual}`);
      assert.equal(placeOf({ s: 'yt', word: '', ax: '' }, facts, { ready: true }), way === 'less' ? 'look' : 'youtube', `${chosen} ${actual}`);
    }
    for (const odd of [undefined, '', 'Private']) {
      const f = seen(chosen, odd);
      assert.equal(f.m, 'diff', String(odd));
      assert.equal(fact(chosen, odd).b, 'Not known');
    }
    assert.equal(seen(chosen, 'secret').b, 'secret');
    assert.equal(seen(chosen, null).m, 'wait');
  }
  // 'more' and 'asyou' are not differences anywhere.
  for (const m of ['more', 'asyou']) {
    assert.deepEqual(differs([{ m }]), []);
    assert.equal(placeOf({ s: 'yt', word: '', ax: '' }, [{ m: 'same' }, { m }], { ready: true }), 'youtube');
  }
  // Before the choice existed: Private.
  assert.deepEqual([seen(undefined, 'private').m, seen(undefined, 'unlisted').m], ['fine', 'diff']);
});

test('the gate in rows lets an Unlisted or Public copy through as chosen', () => {
  for (const chosen of VIS) {
    for (const actual of VIS) {
      const less = VIS.indexOf(actual) > VIS.indexOf(chosen);
      assert.deepEqual(gate({ record: rec({ privacy: chosen }), details: D, video: yv(actual), channelId: 'UC' }), less ? [`privacy is ${actual}, not ${chosen}`] : 'ready');
    }
  }
});
