import { confirmation, unsafeReasons, visibility, visName, visWho } from '../lib/gate.js';
import { recordingDate } from '../lib/youtube.js';
import { gb, length, day, isoLength, picture4k, plainReason } from './text.js';

/**
 * What one row says. `s` is the state: which group it belongs to.
 * Everything unknown ends up as "not yet" or "keep it", never as safe.
 */
export function rowState(v, c) {
  const { record: r, key, size } = v;
  const out = (s, kind, word, meta, ak, at, ax) => ({ s, kind, word, meta, ak, at, ax });
  const bytes = size ? gb(size) : 'size unknown';

  const live = c.run?.get(key);
  if (live) {
    if (live.text === 'waiting') {
      return c.paused ? out('pause', 'pause', 'Waiting for sign-in', 'It starts when you are signed in again.', 'clock', 'Not yet', 'Not on YouTube yet.')
        : out('wait', 'lib', 'Waiting to upload', 'It starts after the ones before it.', 'clock', 'Not yet', 'Not on YouTube yet.');
    }
    if (live.text === 'Preparing' || live.text === 'Uploading') {
      if (c.paused) return out('pause', 'pause', 'Waiting for sign-in', 'It continues when you are signed in again.', 'clock', 'Not yet', 'Not on YouTube yet.');
      return out('up', 'up', live.part === undefined ? 'Getting ready' : `Uploading, ${Math.floor(live.part * 100)}%`,
        live.part === undefined ? '' : `${gb(live.part * size)} of ${bytes} sent.`, 'clock', 'Not yet', 'Uploading now.');
    }
  }

  const failed = c.failed?.get(key);
  if (r?.state !== 'uploaded' && r?.state !== 'uncertain' && failed) {
    return out('fail', 'fail', 'Did not upload', plainReason(failed), 'clock', 'Not yet', r ? 'YouTube is asked before it is sent again.' : 'It is not on YouTube.');
  }
  if (!r) {
    if (v.original === false) return out('no', 'no', 'Cannot be moved', 'Google Photos does not hold it in Original quality.', 'held', 'Keep it', 'There is no full copy to move.');
    if (!size) return out('no', 'no', 'Cannot be moved', 'Google Photos did not give its size.', 'held', 'Keep it', 'It cannot be checked.');
    return out('lib', 'lib', 'Not on YouTube', `Move it to free ${bytes}.`, 'up', 'Not yet', 'Move it to YouTube first.');
  }
  if (r.state === 'sending') return out('cut', 'cut', 'Started, not finished', 'YouTube is asked before it is sent again.', 'clock', 'Not yet', 'It may not be on YouTube.');
  if (r.state === 'uncertain') return out('ask', 'ask', 'YouTube cannot say', 'Look for it in YouTube Studio. If it is there, leave it.', 'held', 'Keep it', 'Nobody knows yet whether it arrived.');

  // Uploaded, but its YouTube link was forgotten ("Remove access"): never moved again, never deleted here.
  if (r.forgotten || !r.id) return out('again', 'info', 'Moved before', 'Not found on YouTube yet.', 'held', 'Keep it', 'Moved before. Not found on YouTube yet.');
  // Uploaded.
  if (!c.channelId) return out('sent', 'clock', 'Uploaded, not confirmed now', 'Sign in to ask YouTube.', 'clock', 'Not yet', 'YouTube has not been asked.');
  if (r.channel !== c.channelId) return out('sent', 'clock', 'On another channel', 'Switch channel to check it.', 'clock', 'Not yet', 'It cannot be checked from this channel.');
  if (!c.asked.has(r.id)) {
    return c.askFailed ? out('sent', 'clock', 'Not known', 'YouTube did not answer.', 'clock', 'Not yet', 'Nothing is confirmed right now.')
      : out('sent', 'clock', 'Uploaded, not confirmed yet', 'Waiting for YouTube to report it.', 'clock', 'Not yet', 'YouTube has not confirmed it.');
  }
  const video = c.statuses.get(r.id);
  const conf = confirmation(r, video, c.channelId);
  if (conf.level === 'bad') {
    if (!video) return out('stop', 'stop', 'Missing on YouTube', 'YouTube does not list this video.', 'stop', 'Do not delete', 'Keep the original.');
    const vis = visibility(r, video);
    if (vis.way === 'less') {
      const [now, chose] = [visName(vis.actual), visName(vis.chosen)];
      return out('stop', 'stop', 'Not as you chose', `It is ${now} on YouTube. You chose ${chose}.`, 'stop', 'Do not delete', `Set it back to ${chose} in YouTube Studio, then check again.`);
    }
    return out('stop', 'stop', 'Something is wrong', conf.text, 'stop', 'Do not delete', 'Keep the original.');
  }
  const seen = visName(visibility(r, video).actual); // known here: anything else is 'bad' above
  const got = Number(video.fileDetails?.fileSize) === r.size;
  const vs = video.fileDetails?.videoStreams?.[0];
  if (conf.level === 'wait') return out('proc', 'clock', 'Arrived, still processing', `${got ? `The whole file, ${gb(r.size)}.` : 'Size not reported yet.'} ${seen}.`, 'clock', 'Not yet', 'YouTube is still processing it.');
  const pic = picture4k(vs?.widthPixels, vs?.heightPixels);
  const meta = `The whole file, ${gb(r.size)}. ${seen}.${pic ? ` ${pic}${vs.frameRateFps ? `, ${Math.round(vs.frameRateFps)} frames a second` : ''}.` : ''}`;
  if (!/^[0-9a-f]{64}$/.test(r.sha256 ?? '')) return out('held', 'yt', 'On YouTube, not fully checked', `${seen}. The upload was interrupted.`, 'held', 'Keep it', 'It was never checked from start to end.');
  const held = c.held?.get(key);
  const shared = held?.find((x) => x.startsWith('in a shared album'));
  if (held?.length) return out('held', 'yt', 'Confirmed', meta, 'held', shared ? 'Keep it' : 'Not yet', plainReason(shared ?? held[0]));
  return out('yt', 'yt', 'Confirmed', meta, 'yt', c.ready?.has(key) ? 'Every check passed' : 'Not compared yet', 'Google Photos has not been compared yet.');
}

export const canCopy = (s) => ['lib', 'cut', 'fail'].includes(s);
/**
 * Side-by-side facts. `m` is same, wait, fine, diff or none (not checked); for 'Seen by' also
 * shared, more (YouTube made it more private than chosen) or asyou (as chosen, not Private).
 * Only diff counts as different.
 */
export function compare(v, st, details, video) {
  const r = v.record;
  const out = [];
  const add = (name, a, b, m) => out.push({ name, a: a ?? 'Not checked', b: b ?? 'Not reported yet', m });
  const pending = !video || st.s === 'proc' || st.s === 'sent';
  const size = details?.size ?? v.size;
  const got = Number(video?.fileDetails?.fileSize) || null;
  const bytes = (n) => `${n.toLocaleString()} bytes`;
  const say = size && size === got ? gb : bytes; // a difference is shown to the byte
  add('Size', size ? say(size) : null, got ? say(got) : null, !size ? 'none' : !got ? 'wait' : got === size ? 'same' : 'diff');
  const vs = video?.fileDetails?.videoStreams?.[0];
  const ytPic = picture4k(vs?.widthPixels, vs?.heightPixels);
  const pic = picture4k(details?.width, details?.height);
  const sorted = (x, y) => [Number(x), Number(y)].sort((p, q) => p - q).join();
  add('Picture', pic, ytPic && `${ytPic}${vs.frameRateFps ? `, ${Math.round(vs.frameRateFps)} frames a second` : ''}`,
    !ytPic ? 'wait' : !pic ? 'none' : sorted(details.width, details.height) === sorted(vs.widthPixels, vs.heightPixels) ? 'same' : 'diff');
  const vis = visibility(r, video);
  const raw = video?.status?.privacyStatus;
  add('Seen by', details ? (details.sharedAlbums?.length ? `You, and the shared album “${details.sharedAlbums.join('”, “')}”` : 'You, as far as Google Photos says') : null,
    vis.actual ? `${visWho(vis.actual)} (${visName(vis.actual)})` : raw ? String(raw) : null,
    !video ? 'wait' : vis.way === 'less' || vis.way === 'unknown' ? 'diff' : !details ? 'none' : details.sharedAlbums?.length ? 'shared'
      : vis.way === 'more' ? 'more' : vis.chosen !== 'private' ? 'asyou' : 'fine');
  add('State', details ? (details.original ? 'Original quality' : 'Not Original quality') : null,
    pending ? (video ? 'Still processing' : null) : 'Processing finished', pending ? 'wait' : !details ? 'none' : details.original ? 'fine' : 'diff');
  const whole = /^[0-9a-f]{64}$/.test(r?.sha256 ?? '');
  add('Every byte', whole ? 'Read from start to end' : 'Not checked', whole ? 'Counted while sending' : 'The upload was interrupted', whole ? 'same' : 'none');
  return out;
}

/** Every compared fact, from what is handed in and nothing else. */
export function factsFor(v, st, d, video) {
  const by = new Map(compare(v, st, d, video).map((f) => [f.name, f]));
  const vs = video?.fileDetails?.videoStreams?.[0];
  const fps = vs?.frameRateFps ? `, ${Math.round(vs.frameRateFps)} a second` : '';
  // The short name is enough while both sides agree.
  const short = (f) => (f.m === 'same' && /^4K/.test(f.a) ? { a: '4K', b: `4K${fps}` } : { a: f.a, b: f.b.replace(/ frames a second/, ' a second') });
  const len = isoLength(video?.contentDetails?.duration);
  const own = v.duration > 0 ? v.duration : null; // Google Photos gives 0 for some
  const ts = d?.timestamp ?? v.timestamp;
  const rec = video?.recordingDetails?.recordingDate?.slice(0, 10);
  const mine = d ? recordingDate(d.timestamp, d.tzOffset).slice(0, 10) : null;
  const wait = 'Waiting';
  const how = lostWord(st);
  const pic = by.get('Picture'); const size = by.get('Size'); const state = by.get('State'); const every = by.get('Every byte'); const seen = by.get('Seen by');
  const list = [
    { name: 'Size', ...size, b: size.m === 'wait' ? wait : size.b },
    { name: 'Picture', ...pic, ...short(pic), ...(pic.m === 'wait' ? { b: wait } : {}) },
    { name: 'Length', a: own ? length(own) : 'Not checked', b: len ? length(len) : wait, m: !len ? 'wait' : !own ? 'none' : Math.abs(len - own) <= 1500 ? 'same' : 'diff' },
    { name: 'Recorded', a: Number.isFinite(ts) ? day(ts) : 'Not checked', b: rec ? day(Date.parse(`${rec}T12:00:00Z`)) : wait, m: !rec ? 'wait' : !mine ? 'none' : mine === rec ? 'same' : 'diff' },
    { name: 'State', ...state, b: state.m === 'wait' ? (video ? 'Busy' : wait) : 'Finished' },
    { name: 'Every byte', ...every, a: every.m === 'same' ? 'Read to the end' : 'Not checked', b: every.m === 'same' ? 'All arrived' : 'Broke off' },
    { name: 'Seen by', a: !d ? 'Not checked' : d.sharedAlbums?.length ? 'A shared album' : 'No shared album', b: !video ? wait : visWho(visibility(v.record, video).actual) ?? 'Not known', m: seen.m },
  ];
  // Nothing has arrived: say that instead of "waiting for YouTube".
  if (how) for (const f of list) if (f.m === 'wait') Object.assign(f, { b: how, m: how === 'Waiting' ? 'wait' : how === 'Not there' ? 'nothere' : 'unknown' });
  if (how && st.s !== 'again') { const e = list.find((f) => f.name === 'Every byte'); Object.assign(e, how === 'Waiting' ? { a: 'Waiting', b: 'Waiting', m: 'wait' } : { a: 'Not to the end', b: 'Broke off' }); }
  return list;
}
const lostWord = (st) => (['up', 'wait', 'pause', 'lib'].includes(st.s) ? 'Waiting' : ['fail', 'cut'].includes(st.s) ? 'Not there' : ['ask', 'again'].includes(st.s) ? 'Not known' : '');
export const differs = (facts) => facts.filter((f) => f.m === 'diff');

/** What the rules say about an uploaded video once both sides have answered: null (nothing known yet), 'ready', or the reasons. */
export function gate({ record, details, video, channelId }) {
  if (!details) return null;
  const why = unsafeReasons({ record, details, video, channelId });
  return !why.length ? 'ready' : why.some((w) => /still processing/.test(w)) ? null : why;
}

/**
 * The one place a video is in now:
 *   choose   step 1
 *   look     step 2: the user must look
 *   lost     step 2: it did not arrive
 *   moving   step 2: uploading or waiting for it
 *   working  step 2: YouTube, or this app, is still at it
 *   stays    step 2: it stays in Google Photos, with a reason (also: moved before, its YouTube link forgotten)
 *   youtube  step 3: every check passed
 * `facts` are the compared facts; `o.ready` says the rules passed; `o.gone` that Google Photos does not have it any more.
 */
export function placeOf(st, facts, o = {}) {
  if (['lib', 'no'].includes(st.s)) return 'choose';
  if (['wait', 'up', 'pause'].includes(st.s)) return 'moving';
  if (st.s === 'fail') return 'lost';
  if (st.s === 'again') return 'stays';
  if (st.s === 'cut') return o.queued ? 'moving' : 'lost';
  if (['ask', 'stop'].includes(st.s)) return 'look';
  if (st.s === 'proc') return 'working';
  if (st.s === 'sent') return /another channel/i.test(st.word) ? 'stays' : 'working';
  if (facts.some((f) => f.m === 'diff')) return 'look';
  if (st.s === 'held') return 'stays';
  if (st.s !== 'yt' || o.gone || !o.ready) return 'working';
  return 'youtube';
}
