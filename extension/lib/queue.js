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
      // Really on YouTube, but this run did not hash it, so the gate holds it back.
      const { sessionUri, ...rest } = before;
      await d.setRecord(key, { ...rest, state: 'uploaded', id: p.id, sha256: null, at: d.now() });
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
    sessionUri = await d.startSession(details, privacy);
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
