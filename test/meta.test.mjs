import { test } from 'node:test';
import assert from 'node:assert/strict';
import { titleFor, ownTitle, takenDay, bareName, descriptionFor, originalLine, TITLE_MAX } from '../extension/lib/meta.js';

// 2 Nov 2026, midday in this computer's time, so the day is the same in every time zone.
const NOV2 = new Date(2026, 10, 2, 12).getTime();
const v = { fileName: 'IMG_4012.MOV', timestamp: NOV2 };

test('the date taken reads like "2 Nov 2026", in every locale', () => {
  assert.equal(takenDay(NOV2), '2 Nov 2026');
  assert.equal(takenDay(new Date(2026, 0, 31, 12).getTime()), '31 Jan 2026');
  assert.equal(takenDay(undefined), '');
  assert.equal(takenDay(NaN), '');
});

test('title: words and the date taken are joined with a comma', () => {
  assert.equal(titleFor({ words: 'Cabin weekend', date: true }, v), 'Cabin weekend, 2 Nov 2026');
  assert.equal(titleFor({ words: '  Cabin weekend  ', date: true }, v), 'Cabin weekend, 2 Nov 2026');
});

test('title: no words and the box on gives the date only (the default)', () => {
  assert.equal(titleFor({ words: '', date: true }, v), '2 Nov 2026');
  assert.equal(titleFor({}, v), '2 Nov 2026');
  assert.equal(titleFor({ words: '   ', date: true }, v), '2 Nov 2026');
});

test('title: words with the box off are the words alone', () => {
  assert.equal(titleFor({ words: 'Cabin weekend', date: false }, v), 'Cabin weekend');
});

test('title: never empty. No words and the box off falls back to the file name without its ending', () => {
  assert.equal(titleFor({ words: '', date: false }, v), 'IMG_4012');
  // The box is on, but the date is not known: the same fallback.
  assert.equal(titleFor({ words: '', date: true }, { fileName: 'IMG_4012.MOV' }), 'IMG_4012');
  assert.equal(titleFor({ words: '', date: false }, { fileName: 'clip.final.mp4' }), 'clip.final');
  assert.equal(titleFor({ words: '', date: false }, { fileName: '.MOV' }), 'Video');
  assert.equal(titleFor({ words: '', date: false }, { fileName: '' }), 'Video');
  assert.equal(bareName('IMG_4012.MOV'), 'IMG_4012');
});

test('title: "<" and ">" are stripped, as YouTube refuses them', () => {
  assert.equal(titleFor({ words: '<b>Cabin</b> > lake', date: true }, v), 'bCabin/b  lake, 2 Nov 2026');
  assert.equal(titleFor({ words: '<>', date: false }, { fileName: 'a<b>.MOV', timestamp: NOV2 }), 'ab');
  assert.equal(ownTitle('<<>>', 'IMG_1.MOV'), 'IMG_1');
});

test('title: cut to 100 characters, never splitting a character in two', () => {
  const long = 'x'.repeat(150);
  assert.equal(titleFor({ words: long, date: false }, v).length, TITLE_MAX);
  assert.equal(titleFor({ words: long, date: true }, v), 'x'.repeat(100));
  assert.equal(titleFor({ words: 'y'.repeat(95), date: true }, v), `${'y'.repeat(95)}, 2 N`);
  const emoji = '😀'.repeat(120);
  const t = ownTitle(emoji, 'a.MOV');
  assert.equal([...t].length, 100);
  assert.equal(t, '😀'.repeat(100));
  assert.equal(ownTitle(`${'z'.repeat(99)} more`, 'a.MOV'), 'z'.repeat(99));
});

test('a title typed for one video: kept as typed, empty falls back to the file name', () => {
  assert.equal(ownTitle('Lake at dusk', 'IMG_4120.MOV'), 'Lake at dusk');
  assert.equal(ownTitle('   ', 'IMG_4120.MOV'), 'IMG_4120');
});

test('description: the text, a blank line, then the original file line', () => {
  assert.equal(descriptionFor('Filmed by Dana.', 'IMG_4012.MOV'), 'Filmed by Dana.\n\nOriginal file: IMG_4012.MOV');
  assert.equal(descriptionFor('  Filmed by Dana.\n', 'IMG_4012.MOV'), 'Filmed by Dana.\n\nOriginal file: IMG_4012.MOV');
});

test('description: with no text, only the original file line', () => {
  assert.equal(descriptionFor('', 'IMG_4012.MOV'), 'Original file: IMG_4012.MOV');
  assert.equal(descriptionFor(undefined, 'IMG_4012.MOV'), 'Original file: IMG_4012.MOV');
  assert.equal(descriptionFor(' \n ', 'IMG_4012.MOV'), 'Original file: IMG_4012.MOV');
  assert.equal(originalLine('IMG_4012.MOV'), 'Original file: IMG_4012.MOV');
});

test('description: "<" and ">" are stripped, and a long text is cut, never the line', () => {
  assert.equal(descriptionFor('a <b> c', 'x<y>.MOV'), 'a b c\n\nOriginal file: xy.MOV');
  const d = descriptionFor('é'.repeat(4000), 'IMG_4012.MOV');
  assert.ok(new TextEncoder().encode(d).length <= 5000);
  assert.ok(d.endsWith('\n\nOriginal file: IMG_4012.MOV'));
  assert.ok(d.startsWith('éééé'));
});
