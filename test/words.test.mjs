import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copiesStay, onlyCopies, PLAYER, READING, phoneWords, initial } from '../extension/ui/text.js';

test('the delete question speaks of YouTube copies by the real count', () => {
  assert.equal(copiesStay(1, 1), 'The YouTube copy stays. ');
  assert.equal(copiesStay(2, 2), 'The YouTube copies stay. ');
  assert.equal(copiesStay(6, 6), 'The YouTube copies stay. ');
  assert.equal(copiesStay(1, 2), '1 has a YouTube copy, which stays. ');
  assert.equal(copiesStay(1, 6), '1 has a YouTube copy, which stays. ');
  assert.equal(copiesStay(2, 3), '2 have YouTube copies, which stay. ');
  assert.equal(copiesStay(5, 6), '5 have YouTube copies, which stay. ');
  // None has a copy: the sentence is left out.
  assert.equal(copiesStay(0, 1), '');
  assert.equal(copiesStay(0, 4), '');
});

test('the done page says it or them by the count, also in the iPhone picture', () => {
  assert.deepEqual(phoneWords(1), {
    it: 'it', ask: 'Allow “Google Photos” to delete this video?', sub: 'It will be in Recently Deleted for 30 days.', head: 'Now remove it from your iPhone',
  });
  assert.deepEqual(phoneWords(2), {
    it: 'them', ask: 'Allow “Google Photos” to delete 2 videos?', sub: 'They will be in Recently Deleted for 30 days.', head: 'Now remove them from your iPhone',
  });
  assert.equal(phoneWords(6).ask, 'Allow “Google Photos” to delete 6 videos?');
});

test('the phone picture shows the channel letter, or nothing when it is not known', () => {
  assert.equal(initial('Harbor Lane Home Videos'), 'H');
  assert.equal(initial('maple street'), 'M');
  assert.equal(initial('  ölund'), 'Ö');
  assert.equal(initial('😀 fun'), '😀');
  assert.equal(initial(''), '');
  assert.equal(initial(undefined), '');
  assert.equal(initial(null), '');
});

test('the delete question says which have no YouTube copy, so their only copy goes (v51)', () => {
  assert.equal(onlyCopies(1), '1 has no YouTube copy, so this is its only copy. ');
  assert.equal(onlyCopies(2), '2 have no YouTube copy, so these are their only copies. ');
  assert.equal(onlyCopies(6), '6 have no YouTube copy, so these are their only copies. ');
  assert.equal(onlyCopies(0), '');
  assert.ok(!/anywhere else/.test(onlyCopies(1) + onlyCopies(3)));
});

test('the step 3 player and the grey button while reading use the v51 words', () => {
  assert.deepEqual(PLAYER.del, {
    title: 'Delete it, or move it to YouTube first?', bare: 'Delete from Google Photos', copy: 'Move to YouTube first',
    facts: 'It has no YouTube copy.', note: 'It has no YouTube copy. Deleting asks you first.',
  });
  assert.deepEqual(PLAYER.choose, { title: 'What should happen to this video?', bare: 'Skip YouTube, send to Delete', copy: 'Move to YouTube' });
  assert.deepEqual(READING, { button: 'Delete from Google Photos', why: 'Still reading your videos.' });
  assert.notEqual(READING.button, 'Delete'); // never a bare "Delete"
});
