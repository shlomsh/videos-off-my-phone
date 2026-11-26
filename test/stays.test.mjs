// v55 (canvas v56, boards E50 to E52): moved videos that stay because of a shared album.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stayWords, nextWords, sharedWords, STAYS } from '../extension/ui/text.js';

test('E50: all of this move stay, in a shared album', () => {
  assert.deepEqual(stayWords({ went: 0, shared: 2 }), {
    head: 'Both are on YouTube. Google Photos keeps them.',
    sub: 'They are in a shared album. Deleting them would take them out of that album for everyone, so they do not go to Delete.',
    note: 'Nothing more to do for these 2.',
  });
  assert.equal(stayWords({ shared: 1 }).head, 'It is on YouTube. Google Photos keeps it.');
  assert.equal(stayWords({ shared: 1 }).sub, 'It is in a shared album. Deleting it would take it out of that album for everyone, so it does not go to Delete.');
  assert.equal(stayWords({ shared: 1 }).note, 'Nothing more to do for this one.');
  assert.equal(stayWords({ shared: 5 }).head, 'All 5 are on YouTube. Google Photos keeps them.');
  assert.equal(stayWords({ shared: 5 }).note, 'Nothing more to do for these 5.');
});

test('E51: some of this move went on to Delete, some stay', () => {
  assert.deepEqual(stayWords({ went: 1, shared: 1 }), {
    head: '1 went on to Delete. 1 stays in Google Photos.',
    sub: 'The one that stays is in a shared album. Deleting it would take it out of that album for everyone.',
    note: '',
  });
  const w = stayWords({ went: 3, shared: 2 });
  assert.equal(w.head, '3 went on to Delete. 2 stay in Google Photos.');
  assert.equal(w.sub, 'The 2 that stay are in a shared album. Deleting them would take them out of that album for everyone.');
});

test('the other reason to stay: the upload broke off', () => {
  assert.equal(stayWords({ broke: 1 }).sub, 'The upload broke off, so it was never checked from start to end.');
  assert.equal(stayWords({ broke: 2 }).sub, 'The uploads broke off, so they were never checked from start to end.');
  assert.equal(stayWords({ went: 1, broke: 1 }).sub, 'The upload broke off, so it was never checked from start to end.');
  // Both reasons in one move: each sentence counts its own.
  assert.equal(stayWords({ shared: 1, broke: 1 }).sub, '1 is in a shared album. Deleting it would take it out of that album for everyone. For 1, the upload broke off, so it was never checked from start to end.');
  assert.equal(stayWords({ shared: 1, broke: 1 }).head, 'Both are on YouTube. Google Photos keeps them.');
});

test('nothing of this move stays: no stay words', () => {
  assert.equal(stayWords({ went: 2 }), null);
  assert.equal(stayWords({}), null);
});

test('the main button never counts videos from earlier moves', () => {
  // E50: nothing of this move is in Delete; 4 from before.
  assert.deepEqual(nextWords({ mine: 0, total: 4, stays: true }), { main: 'choose', text: 'Choose videos', quiet: 'Go to Delete: 4 from before', note: '' });
  // The user's real test: 2 moved, both stay, 2 OTHER videos in Delete. Never "Next: delete 2".
  assert.equal(nextWords({ mine: 0, total: 2, stays: true }).text, 'Choose videos');
  assert.equal(nextWords({ mine: 0, total: 2, stays: true }).quiet, 'Go to Delete: 2 from before');
  // Nothing anywhere: no quiet button.
  assert.deepEqual(nextWords({ mine: 0, total: 0 }), { main: 'choose', text: 'Choose videos', quiet: null, note: '' });
  // E51: no number on the button, the note says what Delete has.
  assert.deepEqual(nextWords({ mine: 1, total: 5, stays: true }), { main: 'delete', text: 'Go to Delete', quiet: null, note: 'Delete now has the 1 from this move and 4 from before.' });
  assert.equal(nextWords({ mine: 1, total: 1, stays: true }).note, 'Delete now has the 1 from this move.');
  assert.equal(nextWords({ mine: 1, total: 1, stays: true }).text, 'Go to Delete');
  // No stays: only this move in Delete keeps its count; with earlier ones too, no number.
  assert.deepEqual(nextWords({ mine: 2, total: 2 }), { main: 'delete', text: 'Next: delete 2', quiet: null, note: '' });
  assert.deepEqual(nextWords({ mine: 2, total: 6 }), { main: 'delete', text: 'Go to Delete', quiet: null, note: 'Delete now has the 2 from this move and 4 from before.' });
  // No move in this visit (or after a reload): everything is from before.
  assert.equal(nextWords({ total: 3 }).quiet, 'Go to Delete: 3 from before');
  assert.ok(!/\d/.test(nextWords({ mine: 3, total: 7 }).text));
});

test('E52: the Move dialog line about shared albums', () => {
  assert.deepEqual(sharedWords(2, 6), { line: '2 of these 6 are in a shared album. They will be on YouTube too, but Google Photos keeps them, so they free no space.', leave: 'Leave those 2 out' });
  assert.deepEqual(sharedWords(1, 6), { line: '1 of these 6 is in a shared album. It will be on YouTube too, but Google Photos keeps it, so it frees no space.', leave: 'Leave that 1 out' });
  // All ticked: they can still be left out; the box then has nothing.
  assert.deepEqual(sharedWords(2, 2), { line: 'Both are in a shared album. They will be on YouTube too, but Google Photos keeps them, so they free no space.', leave: 'Leave those 2 out' });
  assert.deepEqual(sharedWords(6, 6), { line: 'All 6 are in a shared album. They will be on YouTube too, but Google Photos keeps them, so they free no space.', leave: 'Leave those 6 out' });
  assert.equal(sharedWords(1, 1).leave, 'Leave that 1 out');
  assert.equal(sharedWords(1, 1).line, 'It is in a shared album. It will be on YouTube too, but Google Photos keeps it, so it frees no space.');
  assert.equal(sharedWords(0, 6), null);
  assert.equal(sharedWords(0, 0), null);
});

test('step 2 tiles say what the Choose grid says, and why', () => {
  assert.deepEqual(STAYS, { text: 'Stays in Google Photos', shared: 'Shared album. Also on YouTube.', broke: 'Not fully checked. Also on YouTube.' });
});
