import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ytProgress, keepHighest, leftWords, progressWords, agoWords, checkedWords, isSlow, tabTitle, lowestPct, SLOW_NOTE, askEvery } from '../extension/ui/working.js';

const vid = (p) => ({ processingDetails: { processingStatus: 'processing', processingProgress: p } });

test('YouTube progress is read from processingProgress, given as strings', () => {
  assert.deepEqual(ytProgress(vid({ partsTotal: '1000', partsProcessed: '350', timeLeftMs: '540000' })), { pct: 35, leftMs: 540000 });
  assert.deepEqual(ytProgress(vid({ partsTotal: 3, partsProcessed: 1 })), { pct: 33, leftMs: null });
  // Never 100% while YouTube is still at it.
  assert.equal(ytProgress(vid({ partsTotal: '10', partsProcessed: '10', timeLeftMs: '0' })).pct, 99);
  assert.equal(ytProgress(vid({ partsTotal: '10', partsProcessed: '12' })).pct, 99);
  assert.deepEqual(ytProgress(vid({ partsTotal: '10', partsProcessed: '0', timeLeftMs: '0' })), { pct: 0, leftMs: 0 });
});

test('no usable progress gives nothing, so the bar is striped', () => {
  assert.equal(ytProgress(undefined), null);
  assert.equal(ytProgress({}), null);
  assert.equal(ytProgress({ processingDetails: { processingStatus: 'processing' } }), null);
  assert.equal(ytProgress(vid({ partsTotal: '0', partsProcessed: '0' })), null);
  assert.equal(ytProgress(vid({ partsTotal: 'x', partsProcessed: '1' })), null);
  assert.equal(ytProgress(vid({ partsTotal: '10' })), null);
  assert.equal(ytProgress(vid({ partsTotal: '10', partsProcessed: '-1' })), null);
  assert.equal(ytProgress(vid({ partsTotal: '10', partsProcessed: '5', timeLeftMs: 'soon' })).leftMs, null);
});

test('the highest % seen is kept, so the bar never goes back', () => {
  let b = null;
  b = keepHighest(b, { pct: 35, leftMs: 540000 });
  assert.deepEqual(b, { pct: 35, leftMs: 540000 });
  b = keepHighest(b, { pct: 20, leftMs: 600000 });
  assert.equal(b.pct, 35);
  assert.equal(b.leftMs, 600000); // the time left is the newest
  b = keepHighest(b, null); // an answer without progress keeps what was known
  assert.equal(b.pct, 35);
  b = keepHighest(b, { pct: 60, leftMs: 120000 });
  assert.deepEqual(b, { pct: 60, leftMs: 120000 });
  assert.equal(keepHighest(undefined, null), null);
});

test('the % and time left in words', () => {
  assert.equal(progressWords({ pct: 35, leftMs: 9 * 60_000 }), '35%, about 9 min left');
  assert.equal(progressWords({ pct: 35, leftMs: 8.6 * 60_000 }), '35%, about 9 min left'); // rounded
  assert.equal(progressWords({ pct: 90, leftMs: 59_000 }), '90%, less than a minute left');
  assert.equal(progressWords({ pct: 90, leftMs: 0 }), '90%, less than a minute left');
  assert.equal(progressWords({ pct: 5, leftMs: 100 * 60_000 }), '5%, about 1 h 40 min left');
  assert.equal(progressWords({ pct: 5, leftMs: 120 * 60_000 }), '5%, about 2 h left');
  assert.equal(progressWords({ pct: 12, leftMs: null }), '12%');
  assert.equal(leftWords(90_000), 'about 2 min left');
  assert.equal(leftWords(NaN), '');
});

test('"Uploaded 12 min ago" counts up from the upload time', () => {
  const at = '2026-11-26T10:00:00.000Z';
  const t = Date.parse(at);
  assert.equal(agoWords(at, t + 30_000), 'Uploaded just now');
  assert.equal(agoWords(at, t + 12 * 60_000 + 59_000), 'Uploaded 12 min ago');
  assert.equal(agoWords(at, t + 100 * 60_000), 'Uploaded 1 h 40 min ago');
  assert.equal(agoWords(at, t + 120 * 60_000), 'Uploaded 2 h ago');
  assert.equal(agoWords(t, t + 60_000), 'Uploaded 1 min ago');
  assert.equal(agoWords(at, t - 5000), 'Uploaded just now'); // a clock a little off
  assert.equal(agoWords('t', t), '');
  assert.equal(agoWords(undefined, t), '');
});

test('"Checked 20 seconds ago." from the last answer', () => {
  assert.equal(checkedWords(0), 'Checked just now.');
  assert.equal(checkedWords(1000), 'Checked 1 second ago.');
  assert.equal(checkedWords(20_400), 'Checked 20 seconds ago.');
  assert.equal(checkedWords(60_000), 'Checked 1 minute ago.');
  assert.equal(checkedWords(5 * 60_000 + 10_000), 'Checked 5 minutes ago.');
  assert.equal(checkedWords(65 * 60_000), 'Checked 1 h 5 min ago.');
  assert.equal(checkedWords(NaN), 'Not checked yet.');
});

test('the note after 60 minutes with YouTube', () => {
  const at = '2026-11-26T10:00:00.000Z';
  const t = Date.parse(at);
  assert.equal(isSlow(at, t + 59 * 60_000), false);
  assert.equal(isSlow(at, t + 60 * 60_000), false);
  assert.equal(isSlow(at, t + 60 * 60_000 + 1), true);
  assert.equal(isSlow(at, t + 100 * 60_000), true);
  assert.equal(isSlow('t', t + 1e9), false);
  assert.equal(isSlow(undefined), false);
  assert.match(SLOW_NOTE, /^This is taking longer than usual\. A long 4K video can take a few hours on YouTube\. It is still there and nothing is lost\.$/);
});

test('the tab title', () => {
  assert.equal(tabTitle(), 'Videos Off My Phone');
  assert.equal(tabTitle({ youtube: 1, ytPct: 35 }), 'YouTube 35% – Videos Off My Phone');
  assert.equal(tabTitle({ youtube: 2, ytPct: null }), 'YouTube working – Videos Off My Phone');
  assert.equal(tabTitle({ youtube: 1, ytPct: 0 }), 'YouTube 0% – Videos Off My Phone');
  assert.equal(tabTitle({ upload: 58 }), 'Uploading 58% – Videos Off My Phone');
  assert.equal(tabTitle({ upload: 0 }), 'Uploading 0% – Videos Off My Phone');
  assert.equal(tabTitle({ upload: 58, paused: true }), 'Paused – Videos Off My Phone');
  assert.equal(tabTitle({ ready: 1 }), '✓ 1 ready to delete – Videos Off My Phone');
  assert.equal(tabTitle({ ready: 3, youtube: 1, ytPct: 40 }), '✓ 3 ready to delete – Videos Off My Phone');
  assert.equal(tabTitle({ upload: 10, ready: 1, youtube: 1, ytPct: 40 }), 'Uploading 10% – Videos Off My Phone');
  assert.equal(tabTitle({ ready: 0, youtube: 0, ytPct: 50 }), 'Videos Off My Phone');
});

test('YouTube is asked less often the longer a video has been with it', () => {
  const now = Date.parse('2026-11-26T12:00:00Z');
  const ago = (ms) => new Date(now - ms).toISOString();
  const M = 60_000; const H = 60 * M;
  assert.equal(askEvery([ago(0)], now), M);
  assert.equal(askEvery([ago(12 * M)], now), M);
  assert.equal(askEvery([ago(H - 1)], now), M);
  assert.equal(askEvery([ago(H)], now), 5 * M); // the first hour is over
  assert.equal(askEvery([ago(3 * H)], now), 5 * M);
  assert.equal(askEvery([ago(6 * H - 1)], now), 5 * M);
  assert.equal(askEvery([ago(6 * H)], now), 15 * M);
  assert.equal(askEvery([ago(3 * 24 * H)], now), 15 * M);
  // Milliseconds work as well as ISO text.
  assert.equal(askEvery([now - 2 * H], now), 5 * M);
});

test('one question covers them all, so the youngest sets the pace', () => {
  const now = Date.parse('2026-11-26T12:00:00Z');
  const ago = (ms) => new Date(now - ms).toISOString();
  assert.equal(askEvery([ago(30 * 3600_000), ago(5 * 60_000)], now), 60_000);
  assert.equal(askEvery([ago(30 * 3600_000), ago(2 * 3600_000)], now), 5 * 60_000);
});

test('an unknown or odd upload time never makes it ask every minute for ever', () => {
  const now = Date.parse('2026-11-26T12:00:00Z');
  assert.equal(askEvery([undefined], now), 15 * 60_000);
  assert.equal(askEvery(['not a date'], now), 15 * 60_000);
  assert.equal(askEvery([null], now), 15 * 60_000);
  // A time in the future (a clock that was off) counts as just uploaded.
  assert.equal(askEvery([new Date(now + 3600_000).toISOString()], now), 60_000);
  // Nothing with YouTube: the plain minute, as before.
  assert.equal(askEvery([], now), 60_000);
  assert.equal(askEvery(undefined, now), 60_000);
});

test('the tab title shows a % only when every video with YouTube has one', () => {
  assert.equal(lowestPct([{ pct: 35, leftMs: 1 }, { pct: 18, leftMs: null }]), 18);
  assert.equal(lowestPct([{ pct: 0, leftMs: 0 }]), 0);
  // One without a known %: no %, the same title as with none.
  assert.equal(lowestPct([{ pct: 10, leftMs: 1 }, null]), null);
  assert.equal(lowestPct([null]), null);
  assert.equal(lowestPct([]), null);
  assert.equal(lowestPct(undefined), null);
  assert.equal(tabTitle({ youtube: 2, ytPct: lowestPct([{ pct: 10 }, null]) }), tabTitle({ youtube: 2 }));
  assert.equal(tabTitle({ youtube: 2, ytPct: lowestPct([{ pct: 10 }, null]) }), 'YouTube working – Videos Off My Phone');
  assert.equal(tabTitle({ youtube: 2, ytPct: lowestPct([{ pct: 10 }, { pct: 40 }]) }), 'YouTube 10% – Videos Off My Phone');
});
