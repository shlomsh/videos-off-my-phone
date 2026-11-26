import { Sha256 } from './sha256.js';

export const CHUNK = 8 * 1024 * 1024; // YouTube requires a multiple of 256 KiB; progress moves once per chunk
const RETRIES = 5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class FatalError extends Error {}
// Nothing else in the queue can succeed either (sign-in, quota, lost tab).
export class StopError extends FatalError {}

/**
 * Reads the source as one continuous stream and yields fixed-size chunks.
 * Only one chunk is held in memory and nothing is written to disk. If the
 * connection drops, it reopens and continues from the same byte, skipping
 * ahead when the server ignores Range (Google Photos did, 2026-11-25).
 */
export async function* sourceChunks({ getUrl, size, chunkSize = CHUNK, signal, retryMs = 1000, fetchFn = fetch, onInfo }) {
  let offset = 0; // bytes already yielded or buffered
  let buf = new Uint8Array(Math.min(chunkSize, size));
  let fill = 0;
  let failures = 0;
  while (offset < size) {
    try {
      const res = await fetchFn(await getUrl(), { signal, cache: 'no-store', credentials: 'omit', headers: { Range: `bytes=${offset}-` } });
      if (res.status !== 200 && res.status !== 206) throw new Error(`Download answered HTTP ${res.status}`);
      const type = res.headers.get('content-type') ?? '';
      if (!type.startsWith('video/')) throw new FatalError(`Expected a video, got "${type}".`);
      const ranged = res.status === 206;
      const start = ranged ? Number(/^bytes (\d+)-/.exec(res.headers.get('content-range') ?? '')?.[1] ?? NaN) : 0;
      if (ranged && start !== offset) throw new FatalError('Download resumed at the wrong position.');
      const length = Number(res.headers.get('content-length'));
      if (length && length !== size - start) {
        throw new FatalError(`Google Photos offers ${start + length} bytes but lists ${size}. This may be an edited or converted copy, so it was not used.`);
      }
      onInfo?.({ ranged, type });
      let skip = offset - start;
      const reader = res.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          let v = value;
          if (skip) {
            const n = Math.min(skip, v.length);
            skip -= n;
            v = v.subarray(n);
          }
          while (v.length) {
            if (offset >= size) throw new FatalError('Download is longer than listed.');
            const n = Math.min(v.length, buf.length - fill);
            buf.set(v.subarray(0, n), fill);
            fill += n; offset += n; v = v.subarray(n);
            if (fill === buf.length) {
              failures = 0;
              yield { start: offset - fill, bytes: buf };
              buf = new Uint8Array(Math.min(chunkSize, size - offset));
              fill = 0;
            }
          }
        }
      } finally {
        reader.cancel().catch(() => {});
      }
      if (offset < size) throw new Error('Download ended early');
    } catch (e) {
      if (e instanceof FatalError || signal?.aborted || ++failures > RETRIES) throw e;
      await sleep(retryMs * failures);
    }
  }
}

/** Spike 1: hash the original without keeping it. */
export async function hashSource(opts) {
  const sha = new Sha256();
  for await (const c of sourceChunks(opts)) {
    sha.update(c.bytes);
    opts.onProgress?.(sha.length);
  }
  return { bytes: sha.length, sha256: sha.hex() };
}

function nextOffset(res) {
  const r = res.headers.get('range');
  return r ? Number(/(\d+)$/.exec(r)[1]) + 1 : 0;
}
const isIncomplete = (res) => res.status === 308 || res.headers.get('x-http-status-code-override') === '308';

/**
 * Spike 3: stream the source into a YouTube resumable session.
 * The video counts as sent only if the byte count matches and YouTube
 * answers with a video id.
 */
export async function streamToSession({ sessionUri, getAuth, size, chunkSize = CHUNK, retryMs = 1000, signal, onProgress, fetchFn = fetch, ...source }) {
  if (chunkSize % (256 * 1024)) throw new Error('Chunk size must be a multiple of 256 KiB');
  const sha = new Sha256();
  let video = null;

  let forceAuth = false;
  const put = async (range, body) => {
    const token = await getAuth(forceAuth);
    forceAuth = false;
    return fetchFn(sessionUri, {
      method: 'PUT', body, signal,
      headers: { 'Content-Range': range, 'X-GUploader-No-308': 'yes', Authorization: `Bearer ${token}` },
    });
  };

  // Sends one chunk. After any failure it asks YouTube how much arrived
  // before sending more, so nothing is skipped or sent twice.
  const sendChunk = async (start, bytes) => {
    const end = start + bytes.length;
    let pos = start;
    let query = false;
    let failures = 0;
    for (;;) {
      let res;
      try {
        res = query
          ? await put(`bytes */${size}`)
          : await put(`bytes ${pos}-${end - 1}/${size}`, bytes.subarray(pos - start));
        if (res.status === 401) forceAuth = true;
        if (res.status === 401 || res.status === 429 || res.status >= 500) throw new Error(`YouTube answered HTTP ${res.status}`);
      } catch (e) {
        if (e instanceof FatalError || signal?.aborted || ++failures > RETRIES) throw e;
        await sleep(retryMs * failures);
        query = true;
        continue;
      }
      if (isIncomplete(res)) {
        const got = nextOffset(res);
        if (got < start || got > end) throw new FatalError(`YouTube reports ${got} bytes, outside the part being sent.`);
        if (got === end && end < size) return;
        if (got === end || (got === pos && !query)) {
          // All bytes arrived but YouTube has not finished, or no progress.
          if (++failures > RETRIES) throw new FatalError('YouTube stopped accepting data.');
          await sleep(retryMs * failures);
          query = true;
          continue;
        }
        if (got > pos) failures = 0;
        pos = got;
        query = false;
        continue;
      }
      if (res.status === 404 || res.status === 410) throw new FatalError('The YouTube upload session expired.');
      if (!res.ok) throw new FatalError(`YouTube rejected the upload: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
      if (end !== size) throw new FatalError('YouTube finished before the whole file was sent.');
      video = await res.json();
      return;
    }
  };

  for await (const c of sourceChunks({ ...source, size, chunkSize, retryMs, signal, fetchFn })) {
    sha.update(c.bytes);
    await sendChunk(c.start, c.bytes);
    onProgress?.(c.start + c.bytes.length);
  }
  if (sha.length !== size) throw new FatalError(`Sent ${sha.length} of ${size} bytes.`);
  if (!video?.id) throw new FatalError('YouTube did not return a video id.');
  return { video, bytes: sha.length, sha256: sha.hex() };
}

/** Asks YouTube what became of an interrupted upload, before sending anything again. */
export async function probeSession({ sessionUri, size, token, fetchFn = fetch, signal }) {
  const res = await fetchFn(sessionUri, {
    method: 'PUT', signal,
    headers: { 'Content-Range': `bytes */${size}`, 'X-GUploader-No-308': 'yes', Authorization: `Bearer ${token}` },
  });
  if (isIncomplete(res)) return { state: 'incomplete' };
  if (res.status === 404 || res.status === 410) return { state: 'expired' };
  if (!res.ok) throw new Error(`YouTube answered HTTP ${res.status} about the earlier upload.`);
  const id = (await res.json())?.id;
  return id ? { state: 'finished', id } : { state: 'expired' };
}
