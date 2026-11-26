import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = {};
globalThis.chrome = { storage: { local: {
  get: async (k) => (k === null ? { ...store } : { [k]: store[k] }),
  set: async (o) => { Object.assign(store, o); },
  remove: async (k) => { for (const x of [k].flat()) delete store[x]; },
} } };
const { allMarks, allTrash, allRecords, dropKeeps, setMark, setTrash } = await import('../extension/lib/records.js');

test('drops the old "keep" answers and nothing else', async () => {
  Object.assign(store, {
    'mark:A': { decision: 'keep', at: 't' }, 'mark:B': { decision: 'bare', at: 't' }, 'mark:C': { decision: 'other' },
    'upload:A': { state: 'uploaded', id: 'y', decision: 'keep' }, 'trash:T': { state: 'sending' }, channel: { id: 'c' }, oldSetting: 'x',
  });
  const before = { ...store };
  assert.equal(await dropKeeps(), 1);
  delete before['mark:A'];
  assert.deepEqual(store, before);
  assert.equal(await dropKeeps(), 0);
  assert.deepEqual([...(await allMarks()).keys()], ['B']);
  assert.deepEqual([...(await allRecords()).keys()], ['A']);
  assert.deepEqual([...(await allTrash()).entries()], [['T', { state: 'sending' }]]);
  await setMark('B', null);
  await setTrash('T', { state: 'kept', seen: true });
  assert.equal((await allMarks()).size, 0);
  assert.equal((await allTrash()).get('T').state, 'kept');
});
