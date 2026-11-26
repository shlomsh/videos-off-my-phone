import { StopError } from './transfer.js';
import { VIS, chosenVis } from './gate.js';

/**
 * Uploads videos one after another. `d` supplies every outside effect, so the
 * rules can be tested without Google. Never uploads a key twice on its own.
 */
export async function runQueue(keys, d, { signal, onState = () => {} } = {}) {
  let failuresInRow = 0;
  const done = [];
  for (const key of keys) {
    signal?.throwIfAborted();
    try {
      const result = await uploadOne(key, d, { signal, onState });
      done.push({ key, result });
      failuresInRow = 0;
    } catch (e) {
      if (signal?.aborted) throw e;
      onState(key, `Failed: ${e.message ?? e}`);
      done.push({ key, result: 'failed' });
      if (e instanceof StopError) throw e;
      if (++failuresInRow === 3) throw new StopError('Three videos in a row failed, so the queue stopped.');
    }
  }
  return done;
}

async function uploadOne(key, d, { signal, onState }) {
  const before = await d.getRecord(key);
  if (before?.state === 'uploaded') { onState(key, 'Already uploaded'); return 'skipped'; }
  if (before?.state === 'uncertain') { onState(key, 'Check YouTube Studio first'); return 'uncertain'; }

  // Proves renewal works and gives every video a fresh hour. Also tied to one channel.
  onState(key, 'Preparing');
  await d.getAuth(true);

  let from = null; // set when an earlier try goes on in its own session
  if (before?.state === 'sending') {
    if (before.channel !== d.channelId) throw new Error('An earlier upload was started on another channel.');
    const p = await d.probe(before);
    if (p.state === 'finished') {
      await d.setRecord(key, recovered(before, p.id, d.now()));
      onState(key, 'Already on YouTube (recovered)');
      return 'recovered';
    }
    if (p.state === 'expired') {
      await d.setRecord(key, { ...before, state: 'uncertain' });
      onState(key, 'Check YouTube Studio first');
      return 'uncertain';
    }
    // Still open on YouTube. It goes on in that same session: a new one could become a second copy.
    from = p.offset ?? 0;
  }

  // Who may watch it: chosen at Move, or, when an earlier try is sent again, what that try was given.
  const privacy = before?.state === 'sending' ? chosenVis(before) : d.privacyOf(key);
  if (!VIS.includes(privacy)) throw new Error('It is not known who may watch it, so it was not sent.');
  const details = await d.getDetails(key);
  if (!details.original) throw new Error('Not Original quality in Google Photos.');
  let sessionUri;
  if (from === null) {
    // Its title and description, as chosen at Move. None: the defaults. A try that goes on keeps its own.
    sessionUri = await d.startSession(details, privacy, d.metaOf?.(key) ?? null);
    await d.setRecord(key, { state: 'sending', sessionUri, size: details.size, fileName: details.fileName, channel: d.channelId, privacy, at: d.now() });
  } else {
    // The record stays as it is, so a failure from here is asked about again next time.
    if (details.size !== before.size) throw new Error('Google Photos now lists another size than when it was started, so it was not sent.');
    sessionUri = before.sessionUri;
  }
  onState(key, 'Uploading');
  const r = await d.stream({ details, key, sessionUri, from: from ?? 0, signal, onProgress: (n) => onState(key, 'Uploading', n / details.size) });
  if (r.bytes !== details.size) throw new Error('Byte count does not match.');
  await d.setRecord(key, { state: 'uploaded', id: r.video.id, sha256: r.sha256, size: r.bytes, fileName: details.fileName, channel: d.channelId, privacy, at: d.now() });
  onState(key, 'Uploaded');
  return 'uploaded';
}

/** An interrupted upload that YouTube says is complete. This app did not hash it, so the gate holds it back. */
function recovered(before, id, at) {
  const { sessionUri, ...rest } = before;
  return { ...rest, state: 'uploaded', id, sha256: null, at };
}

/**
 * What "Put them back in Choose" does with a half-sent upload, from YouTube's answer about it
 * (probeSession, or null when YouTube could not be asked):
 *   drop   YouTube holds only part of it: the record goes, so a later Move starts over.
 *   keep   YouTube has all of it: it stays, as uploaded (`record`), and the gate still holds it back.
 *   leave  anything else (expired, every byte there but not finished, not asked, another channel,
 *          not a half-sent record): nothing changes, and it still waits to continue.
 */
export function putBackPlan(record, probe, channelId, at) {
  if (record?.state !== 'sending' || !record.sessionUri || !(record.size > 0)) return { do: 'leave' };
  if (!channelId || record.channel !== channelId) return { do: 'leave' };
  if (probe?.state === 'finished' && probe.id) return { do: 'keep', record: recovered(record, probe.id, at) };
  if (probe?.state === 'incomplete' && Number.isInteger(probe.offset) && probe.offset >= 0 && probe.offset < record.size) return { do: 'drop' };
  return { do: 'leave' };
}
