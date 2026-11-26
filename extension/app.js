import * as photos from './lib/photos.js';
import * as yt from './lib/youtube.js';
import { streamToSession, probeSession, StopError } from './lib/transfer.js';
import { getRecord, setRecord, removeRecord, allRecords, allMarks, setMark, dropKeeps, setTrash, allTrash, exclusive } from './lib/records.js';
import { runQueue } from './lib/queue.js';
import { trashOne, movedReasons, lookAgain, openEnds } from './lib/trash.js';
import { CLIENT_ID } from './config.js';
import { h, icon as mark, button, link, picture, broken, draw, ask, askDelete } from './ui/dom.js';
import { gb, length, clock, day, count, sentLine, timeLeft, plainReason, plainError, isoLength } from './ui/text.js';
import { allowPlayer, makePlayer, playInWindow, whyNotPlaying, makeClip, endClip } from './ui/player.js';
import { rowState, placeOf, gate, canCopy, factsFor, differs } from './ui/rows.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const log = (m) => { $('log').textContent += `${clock()}  ${m}\n`; };
const say = (text) => { $('live').textContent = text; };
const ASK_EVERY = 5 * 60_000;

// ---- state
let step = 1; // 1 choose, 2 move, 3 delete
let channel = null;
let restoring = true;
let signNote = null; // why the last sign-in did not work
let photosOpen = null;
let busy = null; // { kind, signal, abort, over }
let want = null; // set while work waits for a new sign-in
let notice = null; // { kind, title, text, action }
const videos = new Map(); // listed in this visit: key -> facts from Google Photos
let records = new Map();
const sel = new Set(); // ticked to move
const queued = new Set(); // Move was pressed in this visit, and it is not there yet
let single = null; // the video this page was opened from
let pairing = null; // the two copies shown large, in step 2 or 3
let watching = null; // the one video shown large, in step 1 or 3
let said = null; // what the last answer did: { text, key }, with Undo
let cameFrom = null; // where the grid was: { page, y }
let page = 0;
let sort = 'big';
// list
let nextToken = null;
let started = false;
let items = 0;
let oldestRead = Infinity;
const thumbs = new Map();
const big = new Map();
// moving
let runKeys = []; // everything in the queue that runs, or ran last
let run = null; // key -> { text, part } while a queue runs
let progress = null;
let lastRun = null;
const failed = new Map();
// what YouTube said, in this visit only
const statuses = new Map();
const asked = new Set();
let askedAt = 0;
let asking = false;
let askFailed = false;
// deleting
let marks = new Map(); // key -> { decision: 'bare', at, taken }: to be deleted without a copy
let notes = new Map(); // what was sent to the trash, and whether it was cleared up
let pick = null; // the one video ticked to delete
let trashed = null; // the last one that is in the trash: { fileName, size }
const trashedHere = []; // keys put in the trash in this visit, for the iPhone steps
const putInTrash = (t) => { trashed = t; if (!trashedHere.includes(t.key)) trashedHere.push(t.key); };
let opened = false; // the user went to look in the trash
let listNote = '';
let delPage = 0;
let delSeen = 0; // the last page looked at
const held = new Map();
const ready = new Set();
const details = new Map();
const place = new Map(); // videos not listed in this visit: their picture and length, or 'gone', or 'unknown'
let goneNote = '';

// ---- helpers
async function photosTab() {
  const given = Number(params.get('tab'));
  const tabs = await chrome.tabs.query({ url: 'https://photos.google.com/*' });
  const tab = tabs.find((t) => t.id === given) ?? tabs[0];
  if (!tab) throw new StopError('Open photos.google.com in another tab first, then try again.');
  return tab.id;
}
async function watchPhotos() {
  const open = (await chrome.tabs.query({ url: 'https://photos.google.com/*' })).length > 0;
  if (open === photosOpen) return;
  photosOpen = open;
  render();
  settle();
}
const openPhotos = () => { notice = null; render(); return chrome.tabs.create({ url: 'https://photos.google.com/', active: false }).then(() => setTimeout(watchPhotos, 1500)); };

async function work(kind, name, task) {
  // Reading the library gives way to anything the user starts.
  if (busy?.kind === 'list' && kind !== 'list') { busy.abort(); await busy.over; }
  if (busy) return;
  const ctl = new AbortController();
  let ended;
  busy = { kind, signal: ctl.signal, abort: () => ctl.abort(), over: new Promise((r) => { ended = r; }) };
  notice = null;
  log(`— ${name} —`);
  render();
  let wake = null;
  try {
    wake = await navigator.wakeLock?.request('screen').catch(() => null);
    await task(ctl.signal);
  } catch (e) {
    if (ctl.signal.aborted) log('Stopped.');
    else {
      log(`Stopped: ${e?.message ?? e}`);
      notice = plainError(e?.message ?? e);
      say(`${notice.title} ${notice.text}`);
    }
  } finally {
    wake?.release().catch(() => {});
    busy = null;
    want = null;
    ended();
    render();
    settle();
  }
}

function forgetAnswers() {
  statuses.clear(); asked.clear(); askedAt = 0; askFailed = false;
  held.clear(); ready.clear(); details.clear(); place.clear(); goneNote = '';
}

// ---- where the user is
function go(n) {
  if (n === 1 && lastRun && !run && !(lastRun.stopped || lastRun.halted)) lastRun = null;
  if (n !== step) { closePlayer(); if (!busy) notice = null; listNote = ''; }
  if (n === 3 && step !== 3) trashed = null;
  if (n !== 1) { askFailed = false; for (const [k, d] of details) if (!d) details.delete(k); } // what had no answer is asked again
  if (n !== 1 && !asking && Date.now() - askedAt > 60_000 && moved().some((x) => x.v.record.channel === channel?.id)) setTimeout(() => { if (!busy) askYouTube(); });
  watching = pairing = null;
  step = n;
  scrollTo(0, 0);
  render();
  settle();
  toMain();
}
const toMain = () => queueMicrotask(() => document.querySelector('main')?.focus({ preventScroll: true }));
/** Starts whatever is needed, when nothing else is going on. */
function settle() {
  if (!channel || notice || (busy && busy.kind !== 'copy')) return;
  loadFacts();
  if (busy) return;
  if (step === 1 && !started && photosOpen) return goTo(0);
  const own = moved().filter((x) => x.v.record.channel === channel.id);
  const waits = own.some((x) => ['sent', 'proc'].includes(x.st.s));
  const fresh = own.some((x) => x.st.s === 'sent' && !asked.has(x.v.record.id)); // listed since YouTube was asked
  if (!asking && !askFailed && (fresh || waits && Date.now() - askedAt > ASK_EVERY)) askYouTube();
  if (step === 3 && photosOpen && unread().length && !lock()) readMarked();
}

// ---- sign-in
const signInFresh = () => work('signin', 'Signing in', async () => {
  signNote = null;
  $('menu').hidePopover();
  try {
    const before = channel?.id;
    channel = await yt.signIn(CLIENT_ID);
    if (before !== channel.id) { forgetAnswers(); }
    log(`Signed in to "${channel.title}".`);
    say(`Signed in to ${channel.title}.`);
  } catch (e) {
    signNote = plainError(e.message);
    log(`Sign-in failed: ${e.message}`);
    say(signNote.title);
    return;
  }
  entered();
});
async function resumeSignIn() {
  try {
    await yt.signIn(CLIENT_ID, { keepChannel: true });
    want?.resolve();
  } catch (e) {
    log(`Sign-in failed: ${e.message}`);
    if (want) { want.problem = plainError(e.message); say(`Still paused. ${want.problem.title}`); render(); }
  }
}
// Renews silently. If Google will not, waits for the button instead of failing the video.
const authFor = (signal) => async (force) => {
  try { return await yt.getToken(CLIENT_ID, force); } catch (e) { log(`Sign-in was not renewed automatically (${e.message}).`); }
  signal.throwIfAborted();
  await new Promise((resolve, reject) => {
    want = { resolve, problem: null };
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    say('Paused. Please sign in again.');
    render();
  });
  want = null;
  render();
  return yt.getToken(CLIENT_ID, false);
};
function entered() {
  render();
  if ([...records.values()].some((r) => r.state === 'uploaded' && r.channel === channel.id)) askYouTube();
  const key = params.get('key');
  if (key && !single) setTimeout(() => openSingle(key));
}

// ---- one video, opened from its page
const openSingle = (key) => work('one', 'Reading one video', async () => {
  const d = await photos.getDetails(await photosTab(), key);
  details.set(key, d);
  const twin = [...records].some(([k, r]) => k !== key && r.state === 'uploaded' && r.size === d.size && r.fileName === d.fileName);
  single = { key, twin };
  if (!videos.has(key)) videos.set(key, { key, fileName: d.fileName, timestamp: d.timestamp, size: d.size, original: d.original, single: true });
  if (!records.has(key) && d.original && !twin && !marks.has(key)) sel.add(key);
  const x = everything().find((y) => y.v.key === key);
  step = !x || x.p === 'choose' ? (x && decisionOf(x) ? 3 : 1) : x.p === 'youtube' ? 3 : 2;
  if (step > 1 && x.p !== 'choose') pairing = key;
});

// ---- list
async function readMore(signal, enough) {
  const tabId = await photosTab();
  const more = () => !started || nextToken !== null;
  if (!more() || enough()) return;
  for await (const p of photos.listVideos(tabId, signal, { from: nextToken })) {
    started = true;
    nextToken = p.next;
    items += p.scanned;
    oldestRead = p.oldest ?? oldestRead;
    for (const v of p.videos) {
      if (place.get(v.key) === 'gone') place.delete(v.key); // restored
      if (!videos.has(v.key) || videos.get(v.key).single) videos.set(v.key, v);
    }
    records = await allRecords();
    render();
    if (enough()) break;
  }
}
const goTo = (n, extra = 0) => {
  const from = items;
  return work('list', 'Reading videos', (signal) => readMore(signal, () => items - from >= extra && pile().filter((x) => x.v.listed).length >= (n + 1) * perPage()).finally(() => { page = n; }));
};
/** Marked in an earlier visit, and not read from the library yet in this one. */
const unread = () => [...marks].filter(([k]) => !videos.has(k) && !records.has(k)).map(([k]) => k);
const readMarked = () => work('list', 'Reading the marked videos', async (signal) => {
  const past = () => oldestRead < Math.min(...unread().map((k) => marks.get(k).taken ?? -Infinity)) - 3 * 86400_000;
  await readMore(signal, () => !unread().length || past());
  signal.throwIfAborted();
  // Not in the library any more: deleted, or in the trash.
  for (const k of unread()) await remember(k, null);
});
async function loadThumbs(list) {
  const need = list.map((x) => x.v).filter((v) => v.thumb && !thumbs.has(v.key));
  if (!need.length || !photosOpen) return;
  for (const v of need) thumbs.set(v.key, null);
  const got = await photos.getThumbnails(await photosTab(), need.map((v) => v.thumb), 'w384-h216-c');
  need.forEach((v, i) => thumbs.set(v.key, got[i]));
  render();
}

// ---- what there is to show
function everything() {
  const c = { run, paused: !!want, failed, channelId: channel?.id ?? null, asked, askFailed, statuses, held, ready };
  const out = [];
  const put = (v, listed) => {
    const full = { ...v, record: records.get(v.key) ?? null, listed };
    const st = rowState(full, c);
    const facts = ['yt', 'held'].includes(st.s) ? factsOf({ v: full, st }) : [];
    out.push({ v: full, st, p: placeOf(st, facts, { queued: queued.has(v.key), ready: ready.has(v.key), gone: place.get(v.key) === 'gone' }) });
  };
  for (const v of videos.values()) put(v, true);
  // A record marked as deleted only counts again if Google Photos lists the video.
  for (const [key, r] of records) if (!videos.has(key) && !r.deletedAt) put({ key, fileName: r.fileName, size: r.size, timestamp: details.get(key)?.timestamp, ...(typeof place.get(key) === 'object' ? place.get(key) : {}) }, false);
  return out;
}
const bySize = (a, b) => (b.v.size ?? 0) - (a.v.size ?? 0);
/** Chosen for deleting without a copy. A video with any upload record never is. */
const decisionOf = (x) => (x.p === 'choose' && !x.v.record && marks.has(x.v.key) ? 'bare' : null);
const bareRows = (all = everything()) => all.filter((x) => decisionOf(x)).sort(bySize);
const onYouTube = (all = everything()) => all.filter((x) => x.p === 'youtube').sort(bySize);
/** Step 3: what is on YouTube first, then what has no copy. */
const delRows = (all = everything()) => [...onYouTube(all), ...bareRows(all)];
const moved = (all = everything()) => all.filter((x) => x.v.record?.state === 'uploaded');
const toCopy = (all = everything()) => all.filter((x) => x.p === 'choose' && !decisionOf(x));
function pile(all = everything()) { // step 1
  const by = sort !== 'new' ? (x) => x.v.size ?? 0 : (x) => x.v.timestamp ?? 0;
  const first = (x) => Number(x.v.key === single?.key);
  return toCopy(all).sort((a, b) => first(b) - first(a) || by(b) - by(a));
}
const ORDER = ['look', 'lost', 'moving', 'working', 'stays'];
/** Step 2: what needs you first. A video that is still ticked after a stop is also in step 1. */
function moveRows(all = everything()) {
  const at = (x) => (x.st.s === 'up' || x.st.s === 'pause' && run?.get(x.v.key)?.text !== 'waiting' ? -1 : runKeys.indexOf(x.v.key));
  return all.map((x) => (x.p === 'choose' && !run && queued.has(x.v.key) && sel.has(x.v.key) && !decisionOf(x) ? { ...x, p: 'moving' } : x)).filter((x) => ORDER.includes(x.p))
    .sort((a, b) => ORDER.indexOf(a.p) - ORDER.indexOf(b.p) || (a.p === 'moving' ? at(a) - at(b) : 0) || bySize(a, b));
}
const chosen = (all = everything()) => all.filter((x) => sel.has(x.v.key) && canCopy(x.st.s) && x.p !== 'lost' && !decisionOf(x));
// Kept elements keep their first click handler, so handlers look things up when clicked.
const sum = (list) => list.reduce((t, x) => t + (x.v.size ?? 0), 0);
const perPage = () => (innerWidth > 1180 ? 18 : 12);
/** YouTube has finished with it. Before that its picture is a grey stand-in and its player refuses. */
const ytReady = (video) => video?.status?.uploadStatus === 'processed' && video.processingDetails?.processingStatus === 'succeeded';
const ytThumb = (video) => {
  if (!ytReady(video)) return null;
  const t = video?.snippet?.thumbnails;
  const u = (t?.medium ?? t?.default)?.url;
  return /^https:\/\/i\d?\.ytimg\.com\//.test(u ?? '') && !broken.has(u) ? u : null;
};
const videoName = (key) => videos.get(key)?.fileName ?? records.get(key)?.fileName ?? notes.get(key)?.fileName ?? '';
const thumbOf = (key) => picture(thumbs.get(key) ?? ytThumb(statuses.get(records.get(key)?.id)));

// ---- 2. move to YouTube
const startMove = (only = null) => work('copy', 'Uploading to YouTube', (signal) => exclusive(async () => {
  const tabId = await photosTab();
  const getAuth = authFor(signal);
  const list = (only ? everything().filter((x) => only.includes(x.v.key) && canCopy(x.st.s)) : chosen()).sort(sort === 'new' ? (a, b) => (b.v.timestamp ?? 0) - (a.v.timestamp ?? 0) : bySize).map((x) => x.v);
  if (!list.length) return;
  const byKey = new Map(list.map((v) => [v.key, v]));
  const total = list.reduce((n, v) => n + v.size, 0);
  const startedAt = Date.now();
  const lastText = new Map();
  let before = 0; let sent = 0; let index = 0; let sending = 0; let current = null;
  watching = pairing = null; closePlayer(); step = 2; scrollTo(0, 0); toMain();
  for (const v of list) { queued.add(v.key); sel.add(v.key); }
  runKeys = list.map((v) => v.key);
  run = new Map(list.map((v) => [v.key, { text: 'waiting' }]));
  for (const v of list) failed.delete(v.key);
  lastRun = null;
  progress = { key: list[0].key, index: 0, count: list.length, bytes: 0, total, sent: 0, seconds: 0 };
  render();
  const show = (key, part) => {
    const now = (part ?? 0) * byKey.get(key).size;
    progress = { key, index, count: list.length, bytes: before + now, total, sent: sent + sending, seconds: (Date.now() - startedAt) / 1000 };
    document.title = `${pct()}% · Video Offload`;
    render();
  };
  let stop = null;
  try {
    await runQueue(runKeys, {
      channelId: channel.id,
      now: () => new Date().toISOString(),
      getRecord,
      setRecord: async (k, r) => { await setRecord(k, r); records.set(k, r); },
      getAuth,
      getDetails: (key) => photos.getDetails(tabId, key),
      probe: async (r) => probeSession({ sessionUri: r.sessionUri, size: r.size, token: await getAuth(false), signal }),
      startSession: (d) => yt.startSession(CLIENT_ID, yt.buildVideo({ ...d, privacy: 'private', madeForKids: false }), {
        size: d.size, type: /\.mov$/i.test(d.fileName) ? 'video/quicktime' : 'video/*',
      }),
      stream: ({ details: d, key, sessionUri, onProgress }) => streamToSession({
        size: d.size, signal, sessionUri, getAuth, onProgress, getUrl: () => photos.getDownloadUrl(tabId, key),
      }),
    }, {
      signal,
      onState: (key, text, part) => {
        const v = byKey.get(key);
        if (current !== key) { current = key; index += 1; sending = 0; }
        const ended = !['Preparing', 'Uploading'].includes(text);
        if (part !== undefined) sending = part * v.size;
        if (ended) {
          before += v.size; sent += sending; sending = 0;
          if (text.startsWith('Failed: ')) failed.set(key, text.slice(8));
          run.delete(key);
        } else run.set(key, { text, part });
        if (part === undefined && lastText.get(key) !== text) { log(`${v.fileName}: ${text}`); lastText.set(key, text); }
        show(key, ended ? undefined : part);
      },
    });
  } catch (e) {
    stop = e;
    throw e;
  } finally {
    document.title = 'Video Offload';
    run = null;
    records = await allRecords();
    const up = list.filter((v) => records.get(v.key)?.state === 'uploaded');
    // What is left stays ticked. What did not arrive is tried again only when the user says so.
    for (const v of list) if (up.includes(v) || failed.has(v.key) || records.get(v.key)?.state === 'uncertain') { sel.delete(v.key); queued.delete(v.key); }
    lastRun = {
      total: list.length, up: up.length, fails: list.filter((v) => failed.has(v.key)).length,
      stopped: signal.aborted, halted: !!stop && !signal.aborted, pct: pct(),
    };
    progress = null;
    log(`${up.length} of ${list.length} uploaded.`);
  }
  say(`${lastRun.up} of ${lastRun.total} uploaded.`);
  setTimeout(() => askYouTube());
}).finally(() => { run = null; }));
const pct = () => (progress?.total ? Math.floor(Math.min(1, progress.bytes / progress.total) * 100) : 0);

// ---- ask YouTube what it has. The last answers stay until the new ones are here.
async function askYouTube(getAuth = () => yt.getToken(CLIENT_ID, false)) {
  if (asking || !channel) return;
  asking = true;
  askFailed = false;
  render();
  const ch = channel.id;
  try {
    records = await allRecords();
    const ids = [...records].filter(([k, r]) => !r.deletedAt || videos.has(k)).map(([, r]) => r).filter((r) => r.state === 'uploaded' && r.id && r.channel === ch).map((r) => r.id);
    await getAuth(false);
    const found = ids.length ? await yt.getStatuses(CLIENT_ID, ids) : new Map();
    if (ch !== channel?.id) return;
    for (const id of ids) { asked.add(id); statuses.delete(id); }
    for (const [id, v] of found) statuses.set(id, v);
    askedAt = Date.now();
    held.clear(); ready.clear();
    for (const [key, d] of details) if (d) judge(key); else details.delete(key);
    const states = everything().map((x) => x.st.s);
    log(`YouTube answered about ${ids.length}: ${states.filter((s) => ['yt', 'held'].includes(s)).length} confirmed, ${states.filter((s) => s === 'proc').length} still processing, ${states.filter((s) => s === 'stop').length} need attention.`);
  } catch (e) {
    if (ch !== channel?.id) return;
    askFailed = true;
    statuses.clear(); asked.clear(); held.clear(); ready.clear(); askedAt = 0;
    log(`YouTube could not be asked: ${e.message ?? e}`);
  } finally {
    asking = false;
    render();
    settle();
  }
}

// Asked for by the user, so it may stop for a sign-in.
const askAgain = () => work('ask', 'Asking YouTube', (signal) => askYouTube(authFor(signal)));

// ---- the facts about each copy
function judge(key) {
  const r = records.get(key);
  ready.delete(key); held.delete(key);
  if (!r || !asked.has(r.id)) return;
  const g = gate({ record: r, details: details.get(key), video: statuses.get(r.id), channelId: channel?.id });
  if (g === 'ready') ready.add(key); else if (g) held.set(key, g);
}
/** Where a moved video is that the list has not shown: further back, or gone. */
async function findPlace({ v }) {
  place.set(v.key, 'unknown');
  try {
    const tabId = await photosTab();
    const item = await photos.getItem(tabId, v.key);
    if (item) { place.set(v.key, item); return; }
    const d = details.get(v.key) ?? await photos.getDetails(tabId, v.key);
    details.set(v.key, d);
    const here = await photos.findInLibrary(tabId, [{ key: v.key, timestamp: d.timestamp }], undefined);
    if (!here.has(v.key)) { place.set(v.key, 'gone'); log(`${v.fileName} is not in the Google Photos library. It may be in the trash.`); }
  } catch (e) { log(`Could not look for ${v.fileName}: ${e.message}`); }
}
/** Confirmed on YouTube, and no longer in Google Photos: nothing is left to do. */
async function retire({ v }) {
  if (over.has(v.key)) return false;
  over.add(v.key);
  try {
    await exclusive(async () => { const r = await getRecord(v.key); await setRecord(v.key, { ...r, deletedAt: new Date().toISOString() }); });
    records = await allRecords();
    goneNote = `${count(over.size)} ${over.size === 1 ? 'is' : 'are'} confirmed on YouTube and already deleted in Google Photos, so ${over.size === 1 ? 'it is' : 'they are'} not shown any more.`;
    say(goneNote);
    return true;
  } catch (e) { log(`Not remembered: ${e.message}`); return false; }
}
const over = new Set();
let loading = false;
async function loadFacts() {
  if (loading) return;
  loading = true;
  try {
    while ((!busy || busy.kind === 'copy') && photosOpen && channel) {
      const list = everything().filter((x) => x.v.record);
      const cur = list.find((x) => x.v.key === pairing);
      const lost = [cur, ...list].find((y) => y && !videos.has(y.v.key) && !place.has(y.v.key));
      if (lost) { await findPlace(lost); render(); continue; }
      const over = !busy && list.find((y) => place.get(y.v.key) === 'gone' && y.st.s === 'yt' && details.get(y.v.key) && !differs(factsOf(y)).length);
      if (over && await retire(over)) { render(); continue; }
      const x = [cur, ...list.filter((y) => ['yt', 'held'].includes(y.st.s))].find((y) => y && !details.has(y.v.key));
      if (x) {
        details.set(x.v.key, null);
        try {
          details.set(x.v.key, await photos.getDetails(await photosTab(), x.v.key));
          judge(x.v.key);
        } catch (e) { log(`Could not read ${x.v.fileName}: ${e.message}`); if (e instanceof StopError) break; }
      } else if (cur?.v.thumb && !big.has(cur.v.key)) {
        big.set(cur.v.key, null);
        const [src] = await photos.getThumbnails(await photosTab(), [cur.v.thumb], 'w640-h360-c').catch(() => [null]);
        big.set(cur.v.key, src);
      } else break;
      render();
    }
  } finally { loading = false; }
}

const WORDS = { same: ['check', 'Same', 'c-ok'], fine: ['check', 'Fine', 'c-ok'], wait: ['clock', 'Not yet', 'c-q'], none: ['info', 'Not checked', 'c-q'], diff: ['fail', 'Different', 'c-stop'], shared: ['held', 'Shared', 'c-q'], nothere: ['fail', 'Not there', 'c-q'], unknown: ['info', 'Not known', 'c-q'] };
const factsOf = ({ v, st }) => factsFor(v, st, details.get(v.key) ?? null, statuses.get(v.record?.id));
const names = (list) => list.map((f, i) => (i ? f.name.toLowerCase() : f.name)).join(list.length === 2 ? ' and ' : ', ');
/** One short sentence about a video, for the pair. */
function verdict(x) {
  const { st, v, p } = x;
  const out = (kind, tone, title, why) => ({ kind, tone, title, why });
  if (p === 'youtube') {
    const open = factsOf(x).filter((f) => !['same', 'fine'].includes(f.m));
    return open.length ? out('check', 'c-safe', 'Every check passed.', `${names(open)} ${open.length === 1 ? 'is' : 'are'} not checked.`)
      : out('check', 'c-safe', 'All the same.', [gb(v.size), Number.isFinite(v.timestamp) ? day(v.timestamp) : ''].filter(Boolean).join(', '));
  }
  if (p === 'look') {
    if (st.s === 'ask') return out('info', 'c-wait', 'Please look.', 'YouTube cannot say whether it arrived. If it is there, leave it.');
    if (st.s === 'stop') return out('fail', 'c-stop', 'Please look.', [st.word === 'Missing on YouTube' ? 'YouTube does not list this video.' : `${st.word}.`, st.ax].join(' '));
    const bad = differs(factsOf(x));
    return out('fail', 'c-stop', 'Please look.', `${names(bad)} ${bad.length === 1 ? 'is' : 'are'} not the same. Keep the original.`);
  }
  if (place.get(v.key) === 'gone') return out('info', 'c-wait', 'It is not in your Google Photos library.', 'It may be in the trash. Do not empty the trash before this copy is checked.');
  if (p === 'lost') return out('fail', 'c-stop', 'It did not arrive.', st.s === 'cut' ? 'The upload broke off. YouTube is asked before it is sent again.' : st.meta);
  if (p === 'moving') return out('clock', 'c-yt', 'Not yet.', st.s === 'pause' ? 'It waits for you to sign in.' : run ? 'It is on its way to YouTube.' : 'It waits for you to continue.');
  if (p === 'stays') return /shared album/.test(st.ax) ? out('held', 'c-wait', 'It stays.', st.ax) : out('info', 'c-wait', 'It stays.', /start to end/.test(st.ax) ? 'The upload broke off, so it was never checked from start to end.' : /another channel/i.test(st.word) ? 'It is on another channel. Switch channel to check it.' : st.ax);
  if (st.s === 'proc') return out('clock', 'c-yt', 'Not yet.', 'YouTube is working on it. It moves on by itself.');
  if (st.s === 'sent') return askFailed && !asking ? out('info', 'c-wait', 'Not known now.', 'YouTube did not answer. Nothing is confirmed.') : out('clock', 'c-yt', 'Not yet.', 'It was sent. YouTube is asked about it next.');
  return details.has(v.key) && !details.get(v.key) && !loading ? out('info', 'c-wait', 'Not known now.', 'Google Photos did not give its facts.') : out('clock', 'c-yt', 'Not yet.', 'It is compared with Google Photos now.');
}

const clearUncertain = async () => {
  const x = everything().find((y) => y.v.key === pairing);
  if (x?.st.s !== 'ask') return;
  if (!await ask('Is it really not on YouTube?', `Only continue if YouTube Studio does not show “${x.v.fileName}”. It then goes back to step 1.`, 'It is not there')) return;
  await work('clear', 'Clearing one entry', async () => {
    await exclusive(() => removeRecord(x.v.key));
    records = await allRecords();
    pairing = null;
    if (x.v.size) sel.add(x.v.key);
  });
};

// ---- 3. delete
async function remember(key, mark) {
  if (mark) marks.set(key, mark); else marks.delete(key);
  try { await setMark(key, mark); } catch (e) { log(`Not remembered: ${e?.message ?? e}`); }
}
/** What should happen to a video: 'copy', 'bare', or null for nothing yet. Writes nothing to Google Photos. */
function decide(key, kind) {
  sel.delete(key);
  if (kind === 'copy') sel.add(key);
  if (kind === 'bare') delSeen = 0; else if (pick === key) pick = null;
  const mark = kind === 'bare' ? { decision: 'bare', at: new Date().toISOString(), taken: videos.get(key)?.timestamp } : null;
  if (mark || marks.has(key)) remember(key, mark);
}
/** A delete the user has to look at in the trash first: { key, ...entry }, or null. It survives a reload. */
function lock() {
  const [first] = openEnds(notes);
  return first ? { key: first[0], ...first[1] } : null;
}
const photosCalls = (tabId) => ({
  getDetails: async (key) => { const x = await photos.getDetails(tabId, key); details.set(key, x); return x; },
  libraryId: (k, at) => photos.libraryId(tabId, k, at),
  itemId: (k) => photos.itemId(tabId, k),
  trashList: () => photos.trashList(tabId),
});
/** Moves the one ticked video to the Google Photos trash, after the user confirmed it by name. */
let dialog = false;
async function trashIt() {
  if (dialog) return;
  dialog = true;
  try { await trashNow(); } finally { dialog = false; }
}
const askOne = async (id) => (await yt.getStatuses(CLIENT_ID, [id])).get(id);
/** What was just read becomes what the lists show, so a video that fails goes back to step 2. */
function learn(key, d, video) {
  const id = records.get(key)?.id;
  if (d) details.set(key, d);
  if (id) { asked.add(id); if (video) statuses.set(id, video); else statuses.delete(id); }
  judge(key);
}
/** A moved video, read again from both sides. Throws why it may not be deleted. */
async function checkCopy(key, duration, signal) {
  const no = (why) => { throw new StopError(`Nothing was deleted. ${why}`); };
  const getAuth = authFor(signal);
  const record = await getRecord(key);
  const d = await photos.getDetails(await photosTab(), key);
  let video;
  try { await getAuth(false); video = await askOne(record.id); } catch (e) {
    signal.throwIfAborted();
    log(`YouTube could not be asked: ${e?.message ?? e}`);
    no('YouTube did not answer, so the copy could not be checked.');
  }
  signal.throwIfAborted();
  learn(key, d, video);
  const why = movedReasons({ record, details: d, video, channelId: channel?.id, duration });
  if (why.length) no(plainReason(why[0]));
}
/** It is gone from Google Photos on purpose. The record stays, so it is never offered again. */
async function remembered(key) {
  videos.delete(key);
  place.set(key, 'gone'); // also if the next line fails: it is never shown as still there
  try {
    const r = await getRecord(key);
    if (r?.state === 'uploaded') await setRecord(key, { ...r, deletedAt: new Date().toISOString() });
  } catch (e) { log(`Not remembered yet: ${e?.message ?? e}`); }
  records = await allRecords();
}
async function trashNow() {
  const x = delRows().find((y) => y.v.key === pick);
  if (!x || lock() || (busy && busy.kind !== 'list')) return;
  const { v } = x;
  const { key } = v;
  // Its kind is decided now, not from the caption.
  const record = await getRecord(key);
  const kind = record ? 'moved' : 'bare';
  const what = { key, fileName: v.fileName, size: v.size, duration: v.duration, kind };
  if (kind === 'moved' ? record.state !== 'uploaded' || x.p !== 'youtube' : x.p !== 'choose' || !(await allMarks()).has(key)) {
    records = await allRecords(); marks = await allMarks(); pick = null;
    notice = plainError('Nothing was deleted. It has changed since it was listed.');
    return render();
  }
  if (kind === 'moved') {
    let fine = false;
    await work('check', 'Checking the copy once more', async (signal) => { closePlayer(); await checkCopy(key, v.duration, signal); fine = true; });
    if (!fine) { pick = null; pairing = null; return render(); }
    if (pick !== key) return;
  }
  const facts = [gb(v.size), Number.isFinite(v.timestamp) ? day(v.timestamp) : '', v.duration > 0 ? length(v.duration) : ''].filter(Boolean).join(', ');
  const ok = await askDelete('Delete it from Google Photos?', { pic: thumbOf(key), name: v.fileName, facts, copy: kind === 'moved' ? 'On YouTube, Private. Checked just now.' : 'It has no copy.', safe: kind === 'moved' },
    `${kind === 'moved' ? 'The YouTube copy stays. ' : ''}It goes to the Google Photos trash, where you can restore it for 30 days. ${kind === 'moved' ? 'YouTube does not give back the original file.' : 'Then it is gone.'} It can leave your iPhone too, when Google Photos syncs there.`, 'Delete from Google Photos');
  if (!ok || pick !== key || (busy && busy.kind !== 'list')) return;
  await work('trash', 'Moving one video to the trash', () => exclusive(async () => {
    const tabId = await photosTab();
    closePlayer();
    listNote = '';
    pairing = null;
    render();
    let r;
    let last; // what the final check read
    try {
      r = await trashOne(what, {
        ...photosCalls(tabId),
        marked: async (k) => (await allMarks()).has(k),
        getRecord,
        getVideo: async (id) => { await yt.getToken(CLIENT_ID, false); last = { video: await askOne(id) }; return last.video; },
        channelId: () => channel?.id ?? null,
        entries: allTrash,
        moveToTrash: (id) => photos.moveToTrash(tabId, id),
        setTrash, now: () => new Date().toISOString(), sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
      });
    } finally {
      notes = await allTrash(); opened = false;
      pick = null;
      if (kind === 'moved') learn(key, details.get(key), last ? last.video : statuses.get(record.id));
    }
    if (r.state === 'trashed') {
      if (kind === 'moved') await remembered(key); else { await remember(key, null); videos.delete(key); }
      putInTrash(what);
    }
    log(`${what.fileName}: ${r.state === 'trashed' ? 'in the Google Photos trash, read back' : 'NOT confirmed'}.${r.extra ? ` ${r.extra} other items appeared in the trash.` : ''}${r.problem ? ` Google said: ${r.problem}` : ''}`);
    say(r.state === 'trashed' && !r.extra ? 'It is in the Google Photos trash.' : 'Look in the trash first.');
  }));
}
/** The user has looked in the trash and came back: the list is read again. Changes nothing in Google Photos. */
function cameBack() {
  const l = lock();
  if (!l || !opened || busy || step !== 3 || document.hidden) return;
  opened = false;
  work('look', 'Reading the trash again', () => exclusive(async () => {
    const at = await lookAgain(l, photosCalls(await photosTab()));
    log(`${l.fileName}: looked again, ${at}.`);
    if (at === 'unclear') { say('It is still not certain.'); return; }
    const { key, ...entry } = l;
    await setTrash(key, { ...entry, state: at, seen: true });
    notes = await allTrash();
    if (at !== 'kept') { if (records.has(key)) await remembered(key); else { await remember(key, null); videos.delete(key); } }
    if (at === 'trashed') putInTrash({ key, fileName: l.fileName, size: l.size });
    listNote = { kept: `${l.fileName} is still in Google Photos. Nothing was deleted.`, gone: `${l.fileName} is not in your library and not in the trash any more.` }[at] ?? '';
    say(listNote || 'It is in the Google Photos trash.');
  }));
}

// ---- the YouTube player. Only one at a time, kept in place while the page redraws.
let player = null; // { key, frame, why }
function closePlayer() { player = null; closeClip(); }
let clip = null; // the Google Photos copy: { key, box, why }
function closeClip() { endClip(clip?.box); clip = null; }
async function playClip(key, start = true) {
  closeClip();
  const mine = clip = { key, box: null, why: null };
  render();
  const give = (why) => { if (clip === mine) { closeClip(); clip = { key, box: null, why }; say(why); render(); } };
  try {
    const v = videos.get(key) ?? everything().find((x) => x.v.key === key)?.v;
    const url = v?.thumb ? await photos.getStream(await photosTab(), v.thumb) : null;
    if (clip !== mine) return;
    if (!url) return give(v?.thumb ? 'Google Photos has no preview of this one.' : 'Google Photos has not listed it yet.');
    const box = await makeClip(key, `Google Photos: ${v.fileName ?? 'video'}`, url, (m) => { log(`Preview of ${v.fileName ?? key}: ${m}`); give('It did not play here.'); }, start);
    if (clip !== mine) { endClip(box); return; }
    mine.box = box;
    render();
  } catch (e) {
    log(`Preview: ${e?.message ?? e}`);
    give('It did not play here.');
  }
}
function photosSide(v, start = true, tag = h('span', { class: 'tag' }, 'Google Photos')) {
  const mine = clip?.key === v.key ? clip : null;
  const key = { class: 'scr', 'data-key': `gp-${v.key}`, 'data-deep': true };
  if (mine?.box) return h('div', key, mine.box.isConnected ? h('div', { 'data-key': mine.box.dataset.key, 'data-keep': '' }) : mine.box, tag);
  return h('div', key, picture(big.get(v.key) ?? thumbs.get(v.key)), tag,
    mine?.why || (!v.thumb && (place.has(v.key) || photosOpen === false)) ? h('div', { class: 'ctl why2' }, h('span', null, mine?.why ?? (place.get(v.key) === 'gone' ? 'Not in your library. It may be in the trash.' : photosOpen === false ? 'No Google Photos tab is open.' : 'Google Photos gave no picture of it.')), link('txt', 'Open in Google Photos', `https://photos.google.com/photo/${v.key}`))
      : [h('button', { type: 'button', class: 'open', 'data-f': `gplay-${v.key}`, 'aria-label': 'Play the Google Photos copy', disabled: !!mine || !v.thumb, onclick: () => playClip(v.key, start) }, h('span', null, mark(mine || !v.thumb ? 'clock' : 'play', 28))), v.duration > 0 ? h('span', { class: 'len' }, length(v.duration)) : null]);
}
async function play(v) {
  const key = v.key;
  const allowed = allowPlayer(); // first, while the click still counts
  player = { key, frame: null, why: null };
  render();
  const still = () => player?.key === key;
  const give = (why) => { if (still()) { player = { key, frame: null, why }; say(why); render(); } };
  try {
    if (!await allowed) return give('Playing here needs your permission for YouTube.');
    const frame = await makePlayer(v.record.id, `YouTube player: ${v.fileName ?? 'video'}`, (code) => { log(`Player for ${v.fileName ?? key}: ${code}`); give(whyNotPlaying(code)); });
    if (!still()) return;
    frame.dataset.key = `player-${key}`;
    player.frame = frame;
    render();
  } catch (e) {
    log(`Player: ${e?.message ?? e}`);
    give(whyNotPlaying());
  }
}
// The real player must not leave the page while it plays, so a redraw is given a copy to compare with.
function youtubeSide(v, video, len) {
  const id = v.record?.id;
  const mine = player?.key === v.key ? player : null;
  const priv = video?.status?.privacyStatus;
  const key = { class: 'scr', 'data-key': `yt-${v.key}`, 'data-deep': true };
  if (mine?.frame) return h('div', key, mine.frame.isConnected ? mine.frame.cloneNode(false) : mine.frame);
  return h('div', key, picture(ytThumb(video)),
    h('span', { class: 'tag' }, mark('lock', 14), `YouTube${priv === 'private' ? ', Private' : priv ? `, ${priv}` : ''}`),
    !id ? null : !ytReady(video) ? h('div', { class: 'ctl why2' }, h('span', null, !video ? 'YouTube has not answered about it.' : /^(failed|rejected|deleted)$/.test(video.status?.uploadStatus) ? 'YouTube cannot play this one.' : 'YouTube is still working on it.'))
      : priv === 'private' && !mine ? h('div', { class: 'ctl why2' }, h('span', null, 'YouTube plays Private videos only on YouTube itself.'), h('button', { type: 'button', class: 'txt', 'data-f': 'playwin', onclick: () => playInWindow(id) }, 'Open on YouTube'))
      : mine?.why ? h('div', { class: 'ctl why2' }, h('span', null, mine.why), h('button', { type: 'button', class: 'txt', 'data-f': 'playwin', onclick: () => playInWindow(id) }, 'Open on YouTube'))
      : [h('button', { type: 'button', class: 'open', 'data-f': 'play', 'aria-label': 'Play the YouTube copy', disabled: !!mine, onclick: () => play(v) }, h('span', null, mark('play', 28))), len ? h('span', { class: 'len' }, len) : null]);
}

// ---- drawing
let drawing = false;
function render() {
  if (drawing) return;
  drawing = true;
  queueMicrotask(() => { drawing = false; paint(); });
}
function paint() {
  const all = everything();
  paintBar(all);
  draw($('view'), !channel ? startView() : want && !run ? pausedCheck() : step === 1 ? chooseView(all) : step === 2 ? moveView(all) : deleteView(all));
}

const main = (key, cls, ...kids) => h('main', { class: `step ${['watch', 's2', 'aft'].includes(cls) ? cls : ''}`.trim(), id: 'main', tabindex: '-1', 'data-key': `m-${key}`, 'data-deep': true, style: cls === 'one' ? 'grid-template-rows:minmax(0,1fr)' : null }, kids);
const title = (text, sub, extra) => h('div', { class: 'ttl' }, h('h1', null, text), sub ? h('span', { class: 'mute' }, sub) : null, extra);
/** One main button. A grey one always has its reason beside it. */
function foot(left, f, text, onclick, { off = '', sec = false, warn = '' } = {}) {
  return h('footer', { class: 'foot' }, left, off || warn ? h('span', { class: 'why', id: 'why' }, off || warn) : null,
    button(f, `btn${sec ? ' sec' : ''}`, text, onclick, { disabled: !!off, 'aria-describedby': off ? 'why' : null }));
}
const note = (text) => (text ? h('span', { class: 'mute sm', style: 'max-width:62ch' }, text) : null);
const calm = (key, kind, tone, head, text, footer) => [main(key, 'one', h('div', { class: 'one' }, h('span', { class: tone }, mark(kind, 72)), h('h1', null, head), text ? h('p', { class: 'big' }, text) : null)), footer];
function noticeView() {
  const n = notice;
  const photosNext = n.action === 'photos' && photosOpen === false;
  return calm('notice', n.kind, n.kind === 'stop' ? 'c-stop' : 'mute', n.title, n.text,
    photosNext ? foot(null, 'n-photos', 'Open Google Photos', openPhotos) : foot(null, 'n-again', 'Try again', () => { notice = null; render(); settle(); }));
}

const needs = (list) => list.filter((x) => ['look', 'lost'].includes(x.p)).length;
function paintBar(all) {
  $('path').hidden = $('av').hidden = !channel;
  const n1 = toCopy(all).filter((x) => canCopy(x.st.s)).length;
  const rows2 = moveRows(all);
  const n2 = needs(rows2);
  const n3 = onYouTube(all).length + [...marks].filter(([k]) => !records.has(k)).length;
  const subs = [
    busy?.kind === 'list' ? `${n1} so far` : started || n1 ? (n1 ? count(n1) : 'Nothing left') : 'Not read yet',
    run ? (want ? 'Paused' : `${pct()}%`) : n2 ? `${n2} ${n2 === 1 ? 'needs' : 'need'} you` : askFailed ? 'Not known now' : lastRun && (lastRun.stopped || lastRun.halted) && waiting(all).length ? 'Stopped' : 'Nothing to do',
    busy?.kind === 'trash' ? 'Deleting' : lock() ? 'Look first' : n3 ? count(n3) : trashed ? 'Nothing left' : 'Nothing yet',
  ];
  draw($('path'), ['Choose', 'Move', 'Delete'].map((name, i) => h('li', null, h('button', { type: 'button', 'aria-current': step === i + 1 ? 'step' : 'false', 'data-f': `step-${i + 1}`, onclick: () => go(i + 1) },
    h('span', { class: 'num', 'aria-hidden': 'true' }, String(i + 1)), h('span', null, h('b', null, name), h('small', null, subs[i]))))));
  if (channel) {
    $('av').textContent = [...channel.title][0]?.toUpperCase() ?? '?';
    $('av').title = `${channel.title}, signed in`;
    $('av').setAttribute('aria-label', `${channel.title}, signed in`);
  }
  draw($('account'), channel ? [h('h2', null, channel.title), h('p', { class: 'sm mute' }, 'Your YouTube channel. Only you can see the moved ones.'),
    signNote ? h('p', { class: 'why' }, signNote.title) : null,
    h('span', null, button('switch', 'btn sec sml', 'Switch channel', signInFresh, { disabled: !!busy && busy.kind !== 'list', title: busy && busy.kind !== 'list' ? 'You can switch when the work is done' : null }))] : []);
}

function startView() {
  return h('main', { class: 'one', id: 'main', tabindex: '-1', 'data-key': 'm-start', 'data-deep': true, style: 'padding:24px' },
    h('h1', null, 'Clean up the videos that fill your phone.'),
    h('ol', { class: 'three' }, ['Choose: delete, or move to YouTube', 'The app moves them and checks every copy', 'Delete here, one yes for each'].map((t, i) => h('li', null, h('span', { class: 'num' }, String(i + 1)), h('span', null, t)))),
    signNote ? h('p', { class: 'why', role: 'alert' }, h('span', null, `${signNote.title} ${signNote.text}`), h('button', { type: 'button', class: 'txt', popovertarget: 'menu' }, 'Details')) : null,
    button('signin', 'btn', busy?.kind === 'signin' ? 'Continue in Google’s window…' : 'Sign in to YouTube', signInFresh, { disabled: !!busy, style: 'min-height:56px;min-width:280px;font-size:18px' }),
    restoring && !busy ? h('p', { class: 'sm mute', role: 'status' }, 'Signing you in quietly…') : null,
    h('p', { class: 'sm mute' }, 'Google asks for two permissions: tick both. Only you can see the moved ones: every copy is Private, in full quality, and marked “not made for kids”. Deleting moves a video to the Google Photos trash, only after your yes. You can restore it for 30 days. It is not made by Google or YouTube.'));
}

function pausedCheck() {
  return calm('paused', 'pause', 'c-wait', want.problem ? `Still paused. ${want.problem.title}` : 'Paused. Please sign in again.', `${want.problem ? `${want.problem.text} ` : ''}Use the same channel: ${channel.title}. Nothing is confirmed right now.`, foot(note('It carries on as soon as you are signed in.'), 'resume', 'Sign in to YouTube', resumeSignIn));
}

// ---- step 1
function chooseView(all) {
  if (notice && !lastRun?.halted) return noticeView();
  const list = pile(all);
  const reading = busy?.kind === 'list' || busy?.kind === 'one';
  if (photosOpen === false && !list.length) return calm('nophotos', 'lib', 'mute', 'Open Google Photos first.', 'It opens in its own tab. Keep that tab open while you use this page.', foot(null, 'photos', 'Open Google Photos', openPhotos));
  const seen = watching && list.find((x) => x.v.key === watching);
  if (seen) return watchView(seen, list);
  const more = !started || nextToken !== null;
  if (started && !list.length && !reading) {
    return more ? calm('none', 'search', 'mute', `No videos in the newest ${items.toLocaleString()} items.`, 'There may be some further back.', foot(null, 'keep', 'Keep reading', () => goTo(0)))
      : calm('none', 'check', 'mute', 'No videos left to choose.', 'Your whole library was read.', foot(null, 'tomove', 'Go to Move', () => go(2)));
  }
  const per = perPage();
  const pages = Math.max(1, Math.ceil(list.length / per));
  page = Math.min(page, pages - 1);
  const shown = list.slice(page * per, (page + 1) * per);
  loadThumbs(shown).catch(() => {}); // pictures are optional
  const ticked = chosen(all);
  const away = ticked.filter((x) => x.p === 'choose' && !shown.some((y) => y.v.key === x.v.key)).length;
  const last = page + 1 >= pages;
  const x = single && list.find((y) => y.v.key === single.key);
  const twin = single?.twin && x && !sel.has(x.v.key) ? 'A video with the same name and size was already moved, so the first one is not ticked.' : '';
  const hints = [twin, away ? `${away} of them ${away === 1 ? 'is' : 'are'} on another page.` : '', ticked.length > 90 ? 'YouTube takes about 100 a day, so this may stop partway.' : ''].filter(Boolean).join(' ');
  const where = reading ? `${count(list.length)} so far. You can start ticking.` : `Page ${page + 1} of ${pages}${more ? '+' : ''}, ${more ? `newest ${items.toLocaleString()} items` : 'whole library'}`;
  const turn = (f, label, sign, off, fn) => h('button', { type: 'button', class: 'ib', 'data-f': f, 'aria-label': label, disabled: off, onclick: fn }, mark(sign, 20));
  return [
    main('copy', '', title(reading && !list.length ? 'Reading your videos…' : reading ? 'Reading your videos…' : 'Which videos should leave?', '', h('label', { class: 'f' }, 'Show ', h('select', { 'data-f': 'sort', onchange: (e) => { sort = e.target.value; page = 0; render(); } }, h('option', { value: 'big', selected: sort === 'big' }, 'Largest first'), h('option', { value: 'new', selected: sort === 'new' }, 'Newest first')))),
      h('ul', { class: 'grid', 'data-key': 'grid', 'data-deep': true }, shown.map(tile), reading && shown.length < per ? Array.from({ length: Math.min(per - shown.length, 6) }, () => h('li', { 'aria-hidden': 'true' }, h('div', { class: 'skel' }))) : null)),
    foot([h('span', { class: 'pg' }, turn('prev', 'Previous page', 'left', page === 0, () => { page = Math.max(0, page - 1); render(); }), h('span', null, where),
      turn('next', last ? 'Read more videos' : 'Next page', 'right', last && (!more || reading || !!run), () => { if (page + 1 < Math.ceil(pile().length / perPage())) { page += 1; render(); } else goTo(page + 1, 1); })), note(hints)],
    ...(photosOpen === false ? ['photos2', 'Open Google Photos', openPhotos, { warn: 'No Google Photos tab is open.' }] : ['copy', ticked.length ? `Move ${ticked.length} to YouTube, ${gb(sum(ticked))}` : 'Move to YouTube', () => startMove(), { off: run ? 'Wait until uploading has finished.' : ticked.length ? (busy && !reading ? 'Wait a moment.' : '') : 'Tick at least one video first.' }])),
  ];
}
function tile(x) {
  const { v, st } = x;
  const can = canCopy(st.s);
  const on = can && sel.has(v.key);
  const when = Number.isFinite(v.timestamp) ? day(v.timestamp) : '';
  const id = `t-${v.key}`;
  const name = v.fileName ?? 'the video';
  return h('li', { 'data-key': v.key, 'data-deep': true }, h('div', { class: `vid${on ? ' on' : ''}${can ? '' : ' off'}`, title: can ? null : st.meta },
    can ? h('input', { id, class: 'cb', type: 'checkbox', checked: on, 'data-f': `tick-${v.key}`, 'aria-label': `Move ${name}, ${when}, ${gb(v.size)}`, onchange: (e) => { if (e.target.checked) sel.add(v.key); else sel.delete(v.key); render(); } }) : null,
    h('button', { type: 'button', class: 'pic', 'data-f': `watch-${v.key}`, 'aria-label': `Watch ${name}, ${when}`, onclick: () => watch(v.key) }, thumbOf(v.key), v.duration > 0 ? h('span', { class: 'len' }, length(v.duration)) : null),
    h('label', { class: 'cap', for: can ? id : null }, can ? [h('b', null, gb(v.size)), ` ${when}`] : h('b', { class: 'bad' }, 'Cannot be moved'))));
}
function watch(key) {
  closePlayer();
  if (key && !watching) cameFrom = { page, y: scrollY };
  watching = key;
  said = null;
  if (key) playClip(key, false); else render();
  toMain();
  // Near the end of what was read: read on, so the arrows do not run out.
  const list = pile();
  if (key && step === 1 && nextToken !== null && started && photosOpen && !busy && list.findIndex((x) => x.v.key === key) >= list.length - 3) setTimeout(() => { if (!busy && watching) goTo(page, 1); });
}
function turnTo(by) {
  if (step !== 1) return;
  const list = pile();
  const next = list[list.findIndex((x) => x.v.key === watching) + by];
  if (next) watch(next.v.key);
}
/** Back to the same page and place, or to the page of the video reached with the arrows. */
function leaveWatch() {
  const key = watching ?? pairing;
  const one = step === 1;
  if (one) page = Math.max(0, Math.floor(pile().findIndex((x) => x.v.key === key) / perPage()));
  const same = !one || page === cameFrom?.page;
  pairing = null;
  watch(null);
  queueMicrotask(() => { scrollTo(0, same ? cameFrom?.y ?? 0 : 0); document.querySelector(`[data-f="watch-${key}"]`)?.focus({ preventScroll: same }); });
}
/** An answer only marks or ticks: nothing is sent and Google Photos is not touched. */
function answer(kind, e) {
  if (e.detail > 1) return; // a double click would answer for the next video too
  const key = watching;
  const list = pile();
  const at = list.findIndex((x) => x.v.key === key);
  if (at < 0) return;
  const was = { key, tick: sel.has(key) };
  const back = kind === 'copy' && was.tick; // given twice, it is taken back
  decide(key, back ? null : kind);
  const next = back ? key : list[at + 1]?.v.key ?? (kind === 'copy' ? key : list[at - 1]?.v.key ?? null);
  if (next !== key) watch(next);
  const text = back ? 'Not ticked any more.' : kind === 'copy' ? 'Ticked to move.' : 'In step 3 now, with no copy.';
  said = { text: !back && next === key ? `${text} That was the last one.` : text, was };
  say(said.text);
  render();
}
function undoAnswer() {
  const { key, tick } = said.was;
  decide(key, tick ? 'copy' : null);
  if (key !== watching && pile().some((x) => x.v.key === key)) watch(key);
  said = { text: 'Undone.' };
  say(said.text);
  render();
}
/** The same two answers, from the list in step 3. */
function answer3(kind) {
  const key = watching;
  if (kind === 'copy') { decide(key, 'copy'); listNote = 'It is in step 1 again, ticked to move.'; } else { pick = key; listNote = ''; }
  say(listNote || 'Ticked to delete.');
  leaveWatch();
}
function togglePlay() {
  const v = clip?.box?.querySelector('video');
  if (v) { if (v.paused) v.play().catch(() => {}); else v.pause(); }
}
const shut = () => h('button', { type: 'button', class: 'ib shut', 'data-f': 'back', 'aria-label': 'Back', title: 'Back', onclick: leaveWatch }, mark('fail', 24));
function watchView(x, list) {
  const { v, st } = x;
  const three = step === 3;
  const at = list ? list.indexOf(x) : 0;
  const can = canCopy(st.s);
  const on = !three && can && sel.has(v.key);
  const nav = (f, label, sign, by, off) => h('button', { type: 'button', class: 'ib', 'data-f': f, 'aria-label': label, title: label, disabled: off, onclick: () => turnTo(by) }, mark(sign, 28));
  const facts = [v.size ? gb(v.size) : '', Number.isFinite(v.timestamp) ? day(v.timestamp) : '', v.duration > 0 ? length(v.duration) : ''].filter(Boolean).join(', ');
  const noCopy = can ? '' : st.s !== 'no' ? 'It cannot be moved now.' : v.original === false ? 'Google Photos does not hold the original, so it cannot be moved.' : `${st.meta.replace(/\.$/, '')}, so it cannot be moved.`;
  const line = said ? [h('span', null, said.text), said.was ? button('undo', 'txt', 'Undo', undoAnswer) : null]
    : h('span', null, [on ? 'Ticked to move. Press again to untick.' : '', noCopy].filter(Boolean).join(' '));
  const reply = (kind, f, text, off, pressed) => h('button', { type: 'button', class: 'btn sec', 'data-f': f, 'aria-pressed': pressed, 'aria-describedby': 'why', disabled: off, onclick: (e) => (step === 3 ? answer3(kind) : answer(kind, e)) }, text);
  return [
    main('watch', 'watch', h('div', { class: 'ttl' }, h('h1', null, 'Delete it, or move it to YouTube?'), h('span', { class: 'mute', title: v.fileName ?? null }, three ? `${facts}. It has no copy.` : `${facts}. Video ${at + 1} of ${list.length}`), shut()),
      h('div', { class: 'film', 'data-key': 'film', 'data-deep': true }, nav('wprev', 'Previous video', 'left', -1, three || at === 0), photosSide(v, false, null), nav('wnext', 'Next video', 'right', 1, three || at >= list.length - 1))),
    h('footer', { class: 'foot ask3' }, h('span', { class: 'mute sm side1', id: 'why' }, line), reply('bare', 'wbare', 'Delete', false), reply('copy', 'wtick', 'Move to YouTube', !can, three ? null : String(on))),
  ];
}

// ---- step 2
/** Ticked and started, and waiting for "Continue". */
const waiting = (all) => (run ? [] : moveRows(all).filter((x) => x.p === 'moving' && sel.has(x.v.key) && canCopy(x.st.s)));
/** The one state under a picture. */
function caption(x) {
  const { st, p, v } = x;
  const out = (kind, text, tone, part) => ({ kind, text, tone, part });
  const part = run?.get(v.key)?.part;
  const n = Math.floor((part ?? 0) * 100);
  if (p === 'look') return out('ask', 'Please look', 'c-wait');
  if (p === 'lost') return out('fail', 'It did not arrive', 'c-stop');
  if (p === 'moving') return part === undefined ? out('up', 'Waiting', 'mute') : st.s === 'pause' ? out('up', `Paused at ${n}%`, 'c-wait', n) : out('up', `Uploading ${n}%`, 'c-go', n);
  if (p === 'stays') return /shared album/.test(st.ax) ? out('held', 'Stays: shared album', 'mute') : out('info', /another channel/i.test(st.word) ? 'Stays: another channel' : 'Stays: not fully checked', 'mute');
  if (st.s === 'proc') return out('clock', 'YouTube is working', 'c-yt');
  if (st.s === 'sent') return askFailed && !asking ? out('info', 'Not known now', 'mute') : out('clock', 'YouTube is working', 'c-yt');
  return details.has(v.key) && !details.get(v.key) && !loading ? out('info', 'Not known now', 'mute') : out('clock', 'Comparing…', 'mute');
}
/** The next step: the videos that can be deleted now, or choosing more. */
function nextFoot(all, left) {
  const n = delRows(all).length;
  return n ? foot(left, 'todelete', `Next: delete ${n}`, () => go(3)) : foot(left, 'tochoose', 'Choose videos', () => go(1));
}
function moveView(all) {
  const list = moveRows(all);
  const seen = pairing && all.find((x) => x.v.key === pairing && x.p !== 'choose');
  if (seen) return pairView(seen);
  if (notice && !run && !lastRun?.halted) return noticeView();
  if (!list.length) return calm('quiet', 'check', 'c-safe', 'Nothing needs you here.', 'What you move shows its progress here. What passes every check goes to Delete by itself.', nextFoot(all, note(goneNote)));
  const of = (p) => list.filter((x) => x.p === p);
  const work_ = of('working').filter((x) => x.st.s === 'proc').length;
  const lost = of('lost').length;
  const wait = waiting(all);
  const go_ = 'They move on to Delete by themselves.';
  const later = [goneNote, work_ ? 'You can close this page and come back later.' : ''].filter(Boolean).join(' ');
  let v;
  if (run) {
    const p = pct();
    const of_ = `Video ${Math.max(1, progress.index)} of ${progress.count}`;
    v = want ? { head: want.problem ? `Still paused. ${want.problem.title}` : 'Paused. Please sign in again.', sub: 'Nothing is lost.', n: p, isHeld: true, small: of_, foot: foot(note(`Use the same channel: ${channel.title}.`), 'resume', 'Sign in to YouTube', resumeSignIn) }
      : { head: `Moving ${count(progress.count)} to YouTube`, sub: `${of_}. ${timeLeft(progress)}`, n: p, small: sentLine(progress), foot: foot(note('Keep this tab and the Google Photos tab open.'), 'stop', 'Stop', () => busy?.abort(), { sec: true }) };
  } else if (lastRun && (lastRun.halted || lastRun.stopped) && wait.length) {
    const r = lastRun;
    const why = (r.halted && notice) || null;
    const cont = why?.action === 'photos' && photosOpen === false ? foot(null, 'photos3', 'Open Google Photos', openPhotos)
      : foot(note('The half-sent one does not count. YouTube is asked before it is sent again.'), 'continue', `Continue with ${wait.length}`, () => startMove(waiting(everything()).map((x) => x.v.key)), { off: why?.kind === 'clock' ? 'Try again tomorrow.' : busy && busy.kind !== 'list' ? 'Wait a moment.' : '' });
    v = { head: why ? why.title : r.halted ? 'Uploading stopped.' : `You stopped after ${r.up} of ${count(r.total)}.`, sub: why?.text, n: r.pct, isHeld: true, small: `${count(wait.length)} ${wait.length === 1 ? 'is' : 'are'} still ticked`, foot: cont };
  } else if (askFailed && !asking) {
    v = { head: 'Nothing is confirmed right now.', sub: 'YouTube did not answer.', foot: foot(note('Nothing moves on until it answers.'), 'askagain', 'Try again', askAgain, { off: busy && busy.kind !== 'list' ? 'Wait a moment.' : '' }) };
  } else {
    const ended = lastRun && !lastRun.stopped && !lastRun.halted;
    const look = of('look').length;
    const open = of('working').length;
    v = lost && ended ? { head: `Uploading is finished. ${lost} did not arrive.`, sub: work_ ? go_.replace('They', 'The others') : '' }
      : work_ ? { head: `YouTube is working on ${count(work_)}.`, sub: work_ === 1 ? 'It moves on to Delete by itself.' : go_ }
        : open ? { head: asking ? 'Asking YouTube…' : 'Comparing the copies…', sub: '' }
          : look + lost ? { head: `${count(look + lost)} ${look + lost === 1 ? 'needs' : 'need'} you.`, sub: '' }
            : { head: 'Nothing needs you here.', sub: wait.length ? '' : `${count(list.length)} ${list.length === 1 ? 'stays' : 'stay'} in Google Photos.` };
    v.foot = photosOpen === false && open ? foot(note(later), 'photos3', 'Open Google Photos', openPhotos, { warn: 'No Google Photos tab is open.' }) : nextFoot(all, note(later));
  }
  loadThumbs(list.slice(0, 40)).catch(() => {});
  return [
    main('move', 's2', h('div', { class: 'stack g16' }, title(v.head, v.sub),
      v.n === undefined ? null : h('div', { class: 'line g16 barline' }, h('span', { class: 'pc' }, `${v.n}%`),
        h('div', { class: `prog${v.isHeld ? ' held' : ''}`, role: 'progressbar', 'aria-label': 'Uploaded', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(v.n) }, h('span', { style: `width:${v.n}%` })),
        v.small ? h('span', { class: 'mute sm' }, v.small) : null)),
    h('ul', { class: 'grid five5', 'data-key': 'mgrid', 'data-deep': true }, list.map(moveTile))),
    v.foot,
  ];
}
function moveTile(x) {
  const { v } = x;
  const c = caption(x);
  return h('li', { 'data-key': v.key, 'data-deep': true }, h('div', { class: 'vid' },
    h('button', { type: 'button', class: 'pic', 'data-f': `watch-${v.key}`, 'aria-label': `${c.text}. Look at both copies of ${v.fileName ?? 'the video'}`, onclick: () => pair(v.key) }, thumbOf(v.key), c.part === undefined ? null : h('span', { class: 'pb' }, h('i', { style: `width:${c.part}%` }))),
    h('span', { class: 'cap' }, h('b', { class: c.tone }, mark(c.kind, 16), c.text))));
}

// ---- both copies of one video, whenever the user wants
function pair(key) {
  closePlayer();
  cameFrom = { page, y: scrollY };
  pairing = key;
  scrollTo(0, 0);
  render();
  loadFacts();
  toMain();
}
function pairView(x) {
  const { v, st, p } = x;
  const video = statuses.get(v.record?.id);
  const f = verdict(x);
  const facts = factsOf(x);
  const len = isoLength(video?.contentDetails?.duration);
  const idle = !busy || busy.kind === 'list';
  const none = st.s === 'ask' ? 'Nobody knows yet whether it is there.' : st.s === 'fail' && !v.record || st.s === 'stop' && !video ? 'It is not on YouTube.' : ['up', 'wait', 'pause', 'lib', 'cut', 'fail'].includes(st.s) ? 'It is not there yet.'
    : st.s === 'sent' ? 'YouTube has not answered about it.' : st.s === 'proc' ? 'YouTube is still working on it.' : !ytReady(video) ? 'YouTube has nothing to play.' : '';
  const can = p === 'youtube' && step === 3;
  const not = can ? lock() ? 'Look in the trash first.' : otherwork() : '';
  return [
    main('pair', 'watch', h('div', { class: 'ttl' }, h('span', { class: f.tone, style: 'align-self:center' }, mark(f.kind, 30)), h('h1', null, f.title), h('span', { class: 'mute', title: v.fileName ?? null }, f.why), shut()),
      h('section', { class: 'cmp p2', 'aria-label': 'The two copies', 'data-key': `cmp-${v.key}`, 'data-deep': true },
        h('div', { class: 'pair', 'data-key': 'pair', 'data-deep': true }, photosSide(v), none ? h('div', { class: 'scr nil', 'data-key': 'nil' }, h('p', null, none)) : youtubeSide(v, video, len ? length(len) : '')),
        h('table', null, h('thead', null, h('tr', null, h('th', { class: 'rh' }, h('span', { class: 'vh' }, 'Copy')), facts.map((t) => h('th', { scope: 'col' }, t.name)))),
          h('tbody', null, h('tr', null, h('th', { class: 'rh', scope: 'row' }, 'Google Photos'), facts.map((t) => h('td', null, t.a))), h('tr', null, h('th', { class: 'rh', scope: 'row' }, 'YouTube'), facts.map((t) => h('td', null, t.b))),
            h('tr', null, h('th', { class: 'rh', scope: 'row' }, 'Same?'), facts.map((t) => h('td', { class: 'm' }, h('span', { class: WORDS[t.m][2] }, mark(WORDS[t.m][0], 16), WORDS[t.m][1])))))))),
    h('footer', { class: 'foot ask3' }, h('span', { class: 'mute sm side1' }, not || (can ? 'The YouTube copy stays.' : '')), button('pback', 'btn sec', 'Back', leaveWatch),
      can ? button('pdel', 'btn', `Delete from Google Photos, ${gb(v.size)}`, () => { pick = pairing; trashIt(); }, { disabled: !!not }) : null,
      st.s === 'ask' ? [button('notthere', 'btn sec', 'It is not there', clearUncertain, { disabled: !idle }), link('btn', 'Open YouTube Studio', v.record?.id ? `https://studio.youtube.com/video/${v.record.id}/edit` : 'https://studio.youtube.com/')] : null,
      p === 'lost' ? button('redo', 'btn', 'Try again', () => { const k = pairing; pairing = null; startMove([k]); }, { disabled: !idle }) : null),
  ];
}

// ---- step 3
const PER = 6;
const otherwork = () => (run ? 'Wait until uploading has finished.' : busy && busy.kind !== 'list' ? 'Wait a moment.' : '');
function deleteView(all) {
  const rows = delRows(all);
  const bare = rows.filter((x) => x.p === 'choose');
  if (busy?.kind === 'trash') return calm('deleting', 'clock', 'mute', 'Moving it to the trash…', 'Please wait. It is read back to be sure.', foot(null, 'deleting', 'Deleting', null, { off: 'This takes a moment.' }));
  if (busy?.kind === 'check') return calm('checking', 'clock', 'mute', 'Checking the copy once more…', 'YouTube is asked now. Nothing is deleted yet.', foot(null, 'checking', 'Deleting', null, { off: 'This takes a moment.' }));
  if (busy?.kind === 'look') return calm('looking', 'clock', 'mute', 'Reading the trash and the list again…', 'Nothing is changed.', foot(null, 'looking', 'Reading', null, { off: 'This takes a moment.' }));
  const l = lock();
  if (l) return lockView(l);
  if (trashed) {
    const t = trashed;
    const more = rows.length > 0;
    const mine = () => trashedHere.slice(-8).map((k) => h('span', null, thumbOf(k)));
    const tap = () => h('i', { class: 'tap' });
    const COLORS = ['#6b8fb5', '#c9a36b', '#8fb07a', '#b57a8f', '#7a9fb0', '#c4b06b', '#7f86c4', '#b08a6b', '#6bb0a4'];
    const phone = (...kids) => h('div', { class: 'fone', 'aria-hidden': 'true' }, kids);
    const stepText = (n, ...kids) => h('p', null, h('b', null, String(n)), h('span', null, kids));
    const strong = (t) => h('strong', null, t);
    return [main('done', 'aft', h('div', { class: 'ttl' }, h('span', { class: 'c-ink', style: 'align-self:center' }, mark('check', 30)), h('h1', null, 'It is in the Google Photos trash.'), h('span', { class: 'mute' }, `${t.fileName}, ${gb(t.size)}.`)),
      h('section', { class: 'ph3', 'aria-labelledby': 'ph3h' }, h('h2', { id: 'ph3h' }, 'Now remove it from your iPhone'), h('ol', null,
        h('li', null, phone(h('div', { class: 'fbar' }, h('span', { class: 'fq' }, 'Search'), h('span', { class: 'fav' }, 'H', tap())), h('div', { class: 'fgrid' }, COLORS.map((c) => h('span', { style: `--c:${c}` })))),
          stepText(1, 'Open ', strong('Google Photos'), ' on your iPhone. Tap your picture, top right.')),
        h('li', null, phone(h('div', { class: 'fsheet' }, h('span', { class: 'frow' }, 'Backup', h('small', null, 'Backup complete')), h('span', { class: 'frow hot' }, 'Review out-of-sync changes', tap()), h('span', { class: 'frow no' }, '… items to delete from this device', h('em', null, '✕')), h('span', { class: 'frow' }, 'Google Photos settings'))),
          stepText(2, 'Tap ', strong('Review out-of-sync changes'), '. Not “items to delete from this device”.')),
        h('li', null, phone(h('div', { class: 'fhd' }, '‹ ', h('span', null, 'Review out-of-sync changes')), h('div', { class: 'fcard' }, h('span', { class: 'fttl' }, 'Deleted'), h('span', { class: 'fpics' }, mine()), h('span', { class: 'fbt' }, h('span', null, 'Delete'), h('span', { class: 'hot' }, 'Review', tap())))),
          stepText(3, 'Under ', strong('Deleted'), ', tap ', strong('Review'), '.')),
        h('li', null, phone(h('div', { class: 'fhd' }, '‹ ', h('span', null, 'Deleted'), h('span', { class: 'fpill hot' }, 'Delete all', tap())), h('span', { class: 'fsub' }, 'These items were deleted from a different device'), h('span', { class: 'fday' }, 'Yesterday'), h('span', { class: 'fpics' }, mine())),
          stepText(4, 'Only what you deleted here? Tap ', strong('Delete all'), '. Anything else there? Go back.'),
          h('div', { class: 'mine' }, h('span', { class: 'mute sm' }, 'Deleted here:'), trashedHere.slice(-8).map((k) => h('span', { class: 'pt3', title: videoName(k) }, thumbOf(k))))),
        h('li', null, phone(h('div', { class: 'fdim' }, h('div', { class: 'fhd' }, '‹ ', h('span', null, 'Deleted')), h('span', { class: 'fpics' }, mine())), h('div', { class: 'fdlg' }, h('strong', null, 'Allow “Google Photos” to delete this video?'), h('span', { class: 'fsub' }, 'It will be in Recently Deleted for 30 days.'), h('span', { class: 'fyn' }, h('span', null, 'Don’t Allow'), h('span', { class: 'go hot' }, 'Delete', tap())))),
          stepText(5, 'Your iPhone asks. Tap ', strong('Delete'), '.'))),
        h('div', { class: 'ph3n mute' }, 'Your iPhone keeps it in ', strong('Recently Deleted'), ' for 30 days. The space comes back after that.'))),
      foot(h('span', { class: 'mute sm' }, link('lnk', 'Open the trash', TRASH), ' to restore it, for 30 days.'), 'more3', more ? 'Next video' : 'Choose more videos', () => { trashed = null; if (delRows().length) { render(); settle(); toMain(); } else go(1); })];
  }
  if (notice) {
    const n = notice;
    const back3 = foot(null, 'backlist', 'Back to the list', () => { notice = null; render(); settle(); });
    if (n.title !== 'Nothing was deleted.') return noticeView();
    return calm('nothing', 'info', 'c-wait', n.title, n.text, n.action === 'photos' && photosOpen === false ? foot(null, 'photos5', 'Open Google Photos', openPhotos) : back3);
  }
  const seen = watching && bare.find((x) => x.v.key === watching);
  if (seen) return watchView(seen, null);
  const two = pairing && rows.find((x) => x.v.key === pairing && x.p === 'youtube');
  if (two) return pairView(two);
  if (unread().length && !run) {
    return photosOpen === false ? calm('bphotos', 'lib', 'mute', 'Open Google Photos first.', 'It opens in its own tab. Keep that tab open while you use this page.', foot(null, 'photos6', 'Open Google Photos', openPhotos))
      : calm('bread', 'clock', 'mute', 'Reading your videos…', 'Looking for the ones you chose earlier.', foot(null, 'bread', 'Delete', null, { off: 'This takes a moment.' }));
  }
  if (!rows.length) return calm('empty', 'info', 'mute', 'Nothing to delete yet.', 'Choose videos in step 1. They come here when they are ready.', foot(note(listNote), 'choose3', 'Choose videos', () => go(1)));
  const pages = Math.ceil(rows.length / PER);
  delPage = Math.min(delPage, pages - 1);
  delSeen = Math.max(delSeen, delPage);
  const shown = rows.slice(delPage * PER, (delPage + 1) * PER);
  loadThumbs(shown).catch(() => {});
  const x = rows.find((y) => y.v.key === pick);
  const turn = (f, label, sign, by, off) => h('button', { type: 'button', class: 'ib', 'data-f': f, 'aria-label': label, disabled: off, onclick: () => { delPage = Math.max(0, delPage + by); render(); } }, mark(sign, 20));
  const off = !x ? 'Tick the one to delete.' : delSeen < pages - 1 ? 'Look at every page first.' : otherwork();
  return [
    main('del', '', title(`${count(rows.length)} ${rows.length === 1 ? 'is' : 'are'} ready to delete.`),
    h('ul', { class: 'grid three3', 'data-key': 'dgrid', 'data-deep': true }, shown.map(delTile))),
    h('footer', { class: 'foot' }, pages > 1 ? h('span', { class: 'pg' }, turn('dprev', 'Previous page', 'left', -1, delPage === 0), h('span', null, `Page ${delPage + 1} of ${pages}`), turn('dnext', 'Next page', 'right', 1, delPage >= pages - 1)) : null,
      note(listNote || 'One at a time for now.'), off ? h('span', { class: 'why', id: 'why' }, off) : null,
      button('send', `btn${x?.p === 'choose' ? ' bare' : ''}`, x ? `Delete from Google Photos, ${gb(x.v.size)}` : 'Delete from Google Photos', trashIt, { disabled: !!off, 'aria-describedby': off ? 'why' : null })),
  ];
}
function delTile(x) {
  const { v, p } = x;
  const there = p === 'youtube';
  const on = pick === v.key;
  const name = v.fileName ?? 'the video';
  const when = Number.isFinite(v.timestamp) ? day(v.timestamp) : '';
  return h('li', { 'data-key': v.key, 'data-deep': true }, h('div', { class: 'vid' },
    h('input', { class: 'cb', type: 'checkbox', checked: on, 'data-f': `del-${v.key}`, 'aria-label': `Delete ${name}, ${when}, ${gb(v.size)}, ${there ? 'on YouTube' : 'no copy'}`, onchange: (e) => { pick = e.target.checked ? v.key : null; render(); } }),
    h('button', { type: 'button', class: 'pic', 'data-f': `watch-${v.key}`, 'aria-label': there ? `Look at both copies of ${name}, ${when}` : `Watch ${name}, ${when}`, onclick: () => (there ? pair(v.key) : watch(v.key)) }, thumbOf(v.key), v.duration > 0 ? h('span', { class: 'len' }, length(v.duration)) : null),
    h('span', { class: 'cap' }, h('b', null, gb(v.size)), there ? h('span', { class: 'line1 c-safe' }, mark('check', 16), 'On YouTube') : h('span', { class: 'line1 c-stop' }, mark('stop', 16), 'No copy'))));
}
const TRASH = 'https://photos.google.com/trash';
/** Nothing else can be deleted until the user has looked and everything was read again. */
function lockView(l) {
  const extra = l.state === 'trashed' ? l.extra : 0;
  const n = notice;
  return [
    main('lock', 'one', h('div', { class: 'msg stop halt', role: 'alert' }, h('div', { class: 'body', style: 'gap:18px' },
      h('div', { class: 'line g16', style: 'flex-wrap:nowrap' }, h('span', { class: 'c-stop' }, mark('stop', 52)), h('div', { class: 'stack g4' }, h('h1', null, extra ? 'Look in the trash.' : 'Look in the trash first.'),
        h('p', { class: 'big' }, extra ? `This video is in the Google Photos trash, but ${extra === 1 ? 'another item' : `${extra} other items`} appeared there at the same time. If you did not delete ${extra === 1 ? 'it' : 'them'} yourself, restore ${extra === 1 ? 'it' : 'them'} there.` : 'It is not certain that this video is in the Google Photos trash.'))),
      h('div', { class: 'row' }, h('span', { class: 'pt' }, thumbOf(l.key)), h('div', { class: 'stack g4' }, h('strong', null, l.fileName), h('span', null, [l.size ? gb(l.size) : '', Number.isFinite(videos.get(l.key)?.timestamp) ? day(videos.get(l.key).timestamp) : ''].filter(Boolean).join(', ')), h('span', null, 'It is not tried again by itself.')))))),
    n ? (n.action === 'photos' && photosOpen === false ? foot(note(`${n.title} ${n.text}`), 'photos7', 'Open Google Photos', openPhotos) : foot(note(`${n.title} ${n.text}`), 'relook', 'Try again', () => { notice = null; opened = true; cameBack(); }))
      : h('footer', { class: 'foot' }, note('When you come back, the list is read again.'), link('btn', 'Open the trash', TRASH, { 'data-f': 'opentrash', onclick: () => { opened = true; } })),
  ];
}

// ---- start
addEventListener('picture-failed', render);
addEventListener('resize', render);
addEventListener('keydown', (e) => {
  if (!(watching || pairing) || e.altKey || e.metaKey || e.ctrlKey || document.fullscreenElement || /^(INPUT|SELECT)$/.test(e.target.tagName) || document.querySelector('dialog[open],:popover-open')) return;
  const act = { Escape: leaveWatch, ArrowLeft: () => turnTo(-1), ArrowRight: () => turnTo(1) }[e.key];
  if (act && (watching || e.key === 'Escape')) { e.preventDefault(); e.stopPropagation(); return act(); } // also after a click on the player, which would seek
  if (watching && e.key === ' ' && !e.target.closest?.('button,a,summary,video')) { e.preventDefault(); if (!e.repeat) togglePlay(); }
}, true);
addEventListener('beforeunload', (e) => { if (busy && !['signin', 'list', 'one'].includes(busy.kind)) e.preventDefault(); });
addEventListener('focus', () => { watchPhotos().then(cameBack); });
addEventListener('visibilitychange', cameBack);
chrome.tabs.onRemoved.addListener(watchPhotos);
chrome.tabs.onUpdated.addListener((id, change) => { if (change.url || change.status === 'complete') watchPhotos(); });
setInterval(() => { if (channel && !busy) { render(); settle(); } }, 15_000); // YouTube is asked again now and then
await dropKeeps();
records = await allRecords();
marks = await allMarks();
notes = await allTrash();
await watchPhotos();
render();
const since = Date.now();
const back = await yt.restore(CLIENT_ID, (e) => {
  log(`Sign-in was not restored after ${Math.round((Date.now() - since) / 1000)} s. Reason: ${e?.message ?? e}`);
  signNote = { title: 'Please sign in again.', text: 'Your last sign-in could not be restored.' };
});
restoring = false;
if (!channel) {
  channel = back;
  if (channel) { signNote = null; log(`Signed in to "${channel.title}" again.`); entered(); if (!params.get('key')) settle(); }
}
render();
