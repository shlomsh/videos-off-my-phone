// Canvas v53: the step 2 page after Stop, and "Put them back in Choose".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { putBackPlan, runQueue } from '../extension/lib/queue.js';
import { unsafeReasons } from '../extension/lib/gate.js';
import { stoppedWords, STOPPED } from '../extension/ui/text.js';
import { stopTally, rowState, placeOf, shownPlace } from '../extension/ui/rows.js';

const half = () => ({ state: 'sending', sessionUri: 'https://up/u1', size: 100, fileName: 'a.MOV', channel: 'ch', privacy: 'unlisted', at: 's' });

test('the stopped page counts only the waiting ones in its heading', () => {
  assert.deepEqual(stoppedWords({ waiting: 4, up: 2, total: 6 }), {
    head: 'You stopped. 4 videos are waiting.', sub: '2 of 6 are on YouTube.', small: '2 of 6 sent',
  });
  assert.equal(stoppedWords({ waiting: 1, up: 0, total: 1 }).head, 'You stopped. 1 video is waiting.');
  assert.equal(stoppedWords({ waiting: 5, up: 1, total: 6 }).sub, '1 of 6 is on YouTube.');
  assert.equal(stoppedWords({ waiting: 5, up: 0, total: 5 }).small, '0 of 5 sent');
  for (const n of [1, 3, 12]) assert.ok(!/Uploading stopped/.test(Object.values(stoppedWords({ waiting: n, up: 0, total: n })).join(' ')));
});

test('the stopped page words, as approved', () => {
  assert.equal(STOPPED.note, 'The half-sent one carries on where it stopped.');
  assert.equal(STOPPED.half, 'It was half sent. It carries on where it stopped.');
  assert.equal(STOPPED.waits, 'It waits until you continue.');
  assert.equal(STOPPED.back, 'Put them back in Choose');
  assert.equal(STOPPED.bar(4), '4 put back in Choose.');
  assert.equal(STOPPED.bar(1), '1 put back in Choose.');
});

test('"2 of 6" counts what was moved together, by the records now', () => {
  const of = new Map([
    ['a', { size: 100, up: true }], ['b', { size: 100, up: true }], ['c', { size: 200, half: true }],
    ['d', { size: 300 }], ['e', { size: 200 }], ['f', { size: 100 }],
  ]);
  const t = stopTally(['a', 'b', 'c', 'd', 'e', 'f'], (k) => of.get(k), { key: 'c', bytes: 100 });
  assert.deepEqual(t, { up: 2, total: 6, pct: 30 }); // (100 + 100 + 100) of 1000
  // Videos moved later on their own are not in the batch, so the line stays the same.
  assert.deepEqual(stopTally(['a', 'b', 'c', 'd', 'e', 'f', 'a'], (k) => of.get(k), { key: 'c', bytes: 100 }), t);
  // The half-sent bytes count only while it is still half sent (not after it was put back).
  of.set('c', { size: 200 });
  assert.equal(stopTally([...of.keys()], (k) => of.get(k), { key: 'c', bytes: 100 }).pct, 20);
  // Never more than 100, never from an unknown size.
  assert.equal(stopTally(['x'], () => ({ size: 10, half: true }), { key: 'x', bytes: 99 }).pct, 100);
  assert.deepEqual(stopTally(['x'], () => undefined), { up: 0, total: 1, pct: 0 });
});

test('put back drops a half-sent upload only when YouTube holds part of it', () => {
  assert.deepEqual(putBackPlan(half(), { state: 'incomplete', offset: 40 }, 'ch', 't'), { do: 'drop' });
  assert.deepEqual(putBackPlan(half(), { state: 'incomplete', offset: 0 }, 'ch', 't'), { do: 'drop' });
});

test('put back keeps an upload that YouTube has whole, as uploaded and held back by the gate', () => {
  const p = putBackPlan(half(), { state: 'finished', id: 'yt1' }, 'ch', 't2');
  assert.equal(p.do, 'keep');
  assert.deepEqual(p.record, { state: 'uploaded', id: 'yt1', sha256: null, size: 100, fileName: 'a.MOV', channel: 'ch', privacy: 'unlisted', at: 't2' });
  assert.ok(unsafeReasons({ record: p.record, details: { size: 100, original: true, sharedAlbums: [] }, video: { id: 'yt1' }, channelId: 'ch' }).length > 0, 'never deleted on this record');
});

test('put back leaves the video as it is when it cannot be told', () => {
  const leave = { do: 'leave' };
  assert.deepEqual(putBackPlan(half(), null, 'ch', 't'), leave, 'YouTube not asked or no answer');
  assert.deepEqual(putBackPlan(half(), { state: 'expired' }, 'ch', 't'), leave);
  assert.deepEqual(putBackPlan(half(), { state: 'incomplete', offset: 100 }, 'ch', 't'), leave, 'every byte there, not finished');
  assert.deepEqual(putBackPlan(half(), { state: 'incomplete' }, 'ch', 't'), leave);
  assert.deepEqual(putBackPlan(half(), { state: 'incomplete', offset: 101 }, 'ch', 't'), leave);
  assert.deepEqual(putBackPlan(half(), { state: 'finished' }, 'ch', 't'), leave, 'finished with no id');
  assert.deepEqual(putBackPlan(half(), { state: 'incomplete', offset: 4 }, 'other', 't'), leave, 'another channel');
  assert.deepEqual(putBackPlan(half(), { state: 'incomplete', offset: 4 }, null, 't'), leave, 'not signed in');
  assert.deepEqual(putBackPlan({ ...half(), sessionUri: undefined }, { state: 'incomplete', offset: 4 }, 'ch', 't'), leave);
  for (const state of ['uploaded', 'uncertain']) assert.deepEqual(putBackPlan({ ...half(), state, id: 'y' }, { state: 'incomplete', offset: 4 }, 'ch', 't'), leave, state);
  assert.deepEqual(putBackPlan(null, { state: 'incomplete', offset: 4 }, 'ch', 't'), leave);
});

test('once dropped, the video is in Choose again with no record, and Send to Delete can take it', () => {
  const c = { channelId: 'ch', asked: new Set(), statuses: new Map() };
  const v = { key: 'a', size: 100, original: true, record: null };
  const st = rowState(v, c);
  assert.equal(st.s, 'lib');
  assert.equal(shownPlace(placeOf(st, []), { queued: false, ticked: false }), 'choose');
  // While it was still half sent and waiting, it was in step 2.
  const st2 = rowState({ ...v, record: half() }, c);
  assert.equal(placeOf(st2, [], { queued: true }), 'moving');
});

// The rest of the queue, for a video put back after Stop and moved again later.
function world({ records = {}, probe = { state: 'incomplete', offset: 4 } } = {}) {
  const w = { store: new Map(Object.entries(records)), sessions: [], sent: [], probes: 0 };
  w.d = {
    channelId: 'ch', now: () => 't',
    getRecord: async (k) => w.store.get(k) ?? null,
    setRecord: async (k, r) => { w.store.set(k, r); },
    getAuth: async () => 'tok',
    getDetails: async (k) => ({ key: k, fileName: `${k}.MOV`, size: 100, original: true }),
    probe: async () => { w.probes++; return probe; },
    privacyOf: () => 'private',
    startSession: async (x) => { w.sessions.push(x.key); return `new-${w.sessions.length}`; },
    stream: async ({ key, sessionUri, from }) => { w.sent.push({ key, sessionUri, from }); return { video: { id: `id-${key}` }, bytes: 100, sha256: 'b'.repeat(64) }; },
  };
  return w;
}

test('a put-back video moved later starts over in a new session, from the first byte', async () => {
  const w = world(); // no record: it was dropped
  assert.deepEqual(await runQueue(['a'], w.d), [{ key: 'a', result: 'uploaded' }]);
  assert.deepEqual(w.sessions, ['a']);
  assert.deepEqual(w.sent, [{ key: 'a', sessionUri: 'new-1', from: 0 }]);
  assert.equal(w.store.get('a').privacy, 'private', 'who can watch is the new choice at Move');
  assert.equal(w.store.get('a').sha256, 'b'.repeat(64));
});

test('after Undo the half-sent record is back, and Continue goes on in its session', async () => {
  const w = world({ records: { a: half() }, probe: { state: 'incomplete', offset: 40 } });
  await runQueue(['a'], w.d);
  assert.equal(w.probes, 1, 'YouTube is asked first');
  assert.deepEqual(w.sessions, []);
  assert.deepEqual(w.sent, [{ key: 'a', sessionUri: 'https://up/u1', from: 40 }]);
});
