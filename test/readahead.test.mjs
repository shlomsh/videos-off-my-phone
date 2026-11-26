// Reading one chunk ahead while the current one is sent, with fake download and
// YouTube fetches that take time. No network, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { streamToSession, FatalError } from '../extension/lib/transfer.js';

const MIB = 1024 * 1024;
const PIECE = 256 * 1024; // what one read() of the download hands over
const sha = (b) => createHash('sha256').update(b).digest('hex');
const headers = (h) => ({ get: (k) => (h[k.toLowerCase()] ?? null) === null ? null : String(h[k.toLowerCase()]) });

/**
 * A fake Google Photos download and a fake YouTube session behind one fetchFn.
 * readMs / sendMs: milliseconds per MiB. Both honour the fetch signal like real fetch.
 * downloads: what each download request does ({ dropAt }, { status }, { type }), in order.
 * putFaults: an HTTP status to answer instead, per PUT, in order.
 */
function world(data, { readMs = 0, sendMs = 0, ranges = true, downloads = [], putFaults = [], held = 0 } = {}) {
  const size = data.length;
  const live = { fetches: 0, readers: 0, puts: 0, timers: new Set() };
  const calls = [];
  const stats = { pulled: 0, asked: 0, maxAhead: 0, askedAtPutEnd: [], bodies: [] };
  const got = [data.subarray(0, held)];
  let have = held;
  let gets = 0; let puts = 0;
  const t0 = performance.now();
  const now = () => performance.now() - t0;

  const wait = (ms, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const t = setTimeout(() => { live.timers.delete(t); signal?.removeEventListener('abort', stop); resolve(); }, ms);
    const stop = () => { clearTimeout(t); live.timers.delete(t); reject(signal.reason); };
    live.timers.add(t);
    signal?.addEventListener('abort', stop, { once: true });
  });

  async function download(init) {
    const script = downloads[gets++] ?? {};
    calls.push({ kind: 'get', range: init.headers.Range, t: now() });
    live.fetches++;
    try { await wait(1, init.signal); } finally { live.fetches--; }
    if (script.status) return { status: script.status, headers: headers({}) };
    const m = ranges && /bytes=(\d+)-/.exec(init.headers.Range);
    const start = m ? Number(m[1]) : 0;
    const stopAt = script.dropAt ?? size;
    let pos = start;
    let open = false;
    const close = () => { if (open) { open = false; live.readers--; } };
    const reader = {
      async read() {
        if (!open || pos >= size) { close(); return { done: true, value: undefined }; }
        if (pos >= stopAt) { close(); throw new TypeError('network error'); }
        const n = Math.min(PIECE, size - pos, stopAt - pos);
        stats.asked = Math.max(stats.asked, pos + n); // this piece is being read
        try { await wait((readMs * n) / MIB, init.signal); } catch (e) { close(); throw e; }
        const value = new Uint8Array(data.subarray(pos, pos + n));
        pos += n;
        stats.pulled = Math.max(stats.pulled, pos);
        stats.maxAhead = Math.max(stats.maxAhead, stats.pulled - have);
        return { done: false, value };
      },
      async cancel() { close(); },
    };
    return {
      status: m ? 206 : 200,
      headers: headers({ 'content-type': script.type ?? 'video/mp4', 'content-length': size - start, ...(m && { 'content-range': `bytes ${start}-${size - 1}/${size}` }) }),
      body: { getReader: () => { open = true; live.readers++; return reader; } },
    };
  }

  const reply = () => (have === size
    ? { status: 200, ok: true, headers: headers({}), json: async () => ({ id: 'vid' }), text: async () => '' }
    : { status: 308, ok: false, headers: headers(have ? { range: `bytes=0-${have - 1}` } : {}), text: async () => '' });

  async function put(init) {
    const range = init.headers['Content-Range'];
    const fault = putFaults[puts++];
    calls.push({ kind: 'put', range, t: now() });
    live.puts++;
    try {
      await wait(1 + (sendMs * (init.body?.length ?? 0)) / MIB, init.signal);
      if (fault) return { status: fault, ok: false, headers: headers({}), text: async () => '' };
      if (range.startsWith('bytes */')) return reply();
      const [, a, b] = /bytes (\d+)-(\d+)\//.exec(range).map(Number);
      if (a !== have || b - a + 1 !== init.body.length) return { status: 400, ok: false, headers: headers({}), text: async () => 'bad range' };
      // Copied only now, after the delay: a chunk changed while it was being sent would show.
      got.push(Buffer.from(init.body));
      stats.bodies.push({ a, length: init.body.length });
      have += init.body.length;
      stats.askedAtPutEnd.push(stats.asked);
      return reply();
    } finally { live.puts--; }
  }

  const fetchFn = (url, init) => (init.method === 'PUT' ? put(init) : download(init));
  const idle = () => live.fetches === 0 && live.readers === 0 && live.puts === 0 && live.timers.size === 0;
  return { fetchFn, live, calls, stats, idle, get data() { return Buffer.concat(got); }, get have() { return have; } };
}

const run = (w, size, extra = {}) => streamToSession({
  sessionUri: 'https://upload.example/session', getUrl: async () => 'https://photos.example/video', getAuth: async () => 'tok',
  size, chunkSize: MIB, retryMs: 1, fetchFn: w.fetchFn, ...extra,
});

/** Collects unhandled rejections while `fn` runs, and a little after. */
async function noStray(fn) {
  const stray = [];
  const h = (e) => stray.push(e);
  process.on('unhandledRejection', h);
  try { await fn(); await new Promise((r) => setTimeout(r, 30)); } finally { process.off('unhandledRejection', h); }
  assert.deepEqual(stray, [], 'no unhandled rejections');
}

test('reading and sending overlap: the time is about the larger of the two, not their sum', async (t) => {
  // Small chunks, so the hashing (about 20 ms per MiB in plain JS) hardly counts.
  const chunk = 256 * 1024;
  for (const [readMs, sendMs] of [[400, 400], [240, 560], [560, 240]]) { // ms per MiB: 100, 60 or 140 ms per chunk
    const d = randomBytes(8 * chunk);
    const w = world(d, { readMs, sendMs });
    const started = performance.now();
    const r = await run(w, d.length, { chunkSize: chunk });
    const took = performance.now() - started;
    const read = (readMs * d.length) / MIB; const send = (sendMs * d.length) / MIB;
    t.diagnostic(`read ${read} ms, send ${send} ms, sum ${read + send} ms: took ${Math.round(took)} ms (${((read + send) / took).toFixed(2)}x faster than one after the other)`);
    assert.equal(r.sha256, sha(d));
    assert.ok(took >= Math.max(read, send), `took ${took} ms`);
    // One after the other it would take read + send. Overlapped, only the first read of the
    // smaller side shows, plus hashing and timer slack.
    assert.ok(took < Math.max(read, send) + 0.6 * Math.min(read, send), `took ${took} ms, sum ${read + send} ms`);
    // The second chunk was being read before the first had arrived.
    assert.ok(w.stats.askedAtPutEnd[0] > chunk, `reading up to ${w.stats.askedAtPutEnd[0]} when the first chunk arrived`);
    // Never more than two chunks read but not yet held by YouTube.
    assert.ok(w.stats.maxAhead <= 2 * chunk, `ahead ${w.stats.maxAhead}`);
    assert.ok(w.idle());
  }
});

for (const ranges of [true, false]) {
  test(`bytes arrive in order and identical, parts are multiples of 256 KiB (ranges ${ranges})`, async () => {
    await noStray(async () => {
      const d = randomBytes(4 * MIB + 777);
      // Dropped twice mid-chunk while a chunk is being sent; it reconnects and goes on.
      const w = world(d, { readMs: 4, sendMs: 8, ranges, downloads: [{ dropAt: MIB + 3 * PIECE }, { dropAt: 3 * MIB + PIECE }] });
      const progress = [];
      const r = await run(w, d.length, { onProgress: (n) => progress.push(n) });
      assert.equal(sha(w.data), sha(d));
      assert.equal(r.sha256, sha(d));
      assert.equal(r.bytes, d.length);
      assert.equal(r.video.id, 'vid');
      assert.deepEqual(progress, [MIB, 2 * MIB, 3 * MIB, 4 * MIB, d.length]);
      let at = 0;
      w.stats.bodies.forEach((b, i) => {
        assert.equal(b.a, at, 'each part starts where the last ended');
        if (i < w.stats.bodies.length - 1) assert.equal(b.length % (256 * 1024), 0);
        at += b.length;
      });
      assert.equal(at, d.length);
      assert.equal(w.calls.filter((c) => c.kind === 'get').length, 3);
      assert.ok(w.idle());
    });
  });
}

test('goes on from `from`: sending starts there, the hash still covers the whole file', async () => {
  await noStray(async () => {
    const d = randomBytes(3 * MIB + 777);
    const from = MIB + 256 * 1024;
    const w = world(d, { readMs: 4, sendMs: 8, held: from });
    const r = await run(w, d.length, { from });
    const sent = w.calls.filter((c) => c.kind === 'put').map((c) => c.range);
    assert.deepEqual(sent, [`bytes ${from}-${2 * MIB - 1}/${d.length}`, `bytes ${2 * MIB}-${3 * MIB - 1}/${d.length}`, `bytes ${3 * MIB}-${d.length - 1}/${d.length}`]);
    assert.equal(sha(w.data), sha(d));
    assert.equal(r.sha256, sha(d));
    assert.ok(w.idle());
  });
});

test('Stop in the middle leaves nothing running', async () => {
  await noStray(async () => {
    const d = randomBytes(8 * MIB);
    const w = world(d, { readMs: 30, sendMs: 30 });
    const ac = new AbortController();
    let both = null;
    setTimeout(() => { both = { readers: w.live.readers, puts: w.live.puts }; ac.abort(); }, 100); // mid-file
    await assert.rejects(run(w, d.length, { signal: ac.signal }), { name: 'AbortError' });
    assert.deepEqual(both, { readers: 1, puts: 1 }, 'a read and a send were both under way at Stop');
    assert.ok(w.idle(), `still running: ${JSON.stringify({ ...w.live, timers: w.live.timers.size })}`);
    assert.ok(w.have < d.length);
    const calls = w.calls.length;
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(w.calls.length, calls, 'nothing new was asked for after Stop');
  });
});

test('Stop from onProgress sends nothing more, even with the next chunk already read', async () => {
  await noStray(async () => {
    const d = randomBytes(4 * MIB);
    const w = world(d, { readMs: 1, sendMs: 20 }); // the next chunk is always ready first
    const ac = new AbortController();
    let n = 0;
    await assert.rejects(run(w, d.length, { signal: ac.signal, onProgress: () => { if (++n === 2) ac.abort(); } }), { name: 'AbortError' });
    assert.equal(w.have, 2 * MIB);
    assert.equal(w.calls.filter((c) => c.kind === 'put').length, 2);
    assert.ok(w.idle());
  });
});

test('a failed send stops the read at once, even while it waits to retry', async () => {
  await noStray(async () => {
    const d = randomBytes(4 * MIB);
    // The second chunk's download drops and waits 1 s to retry; the first chunk's send then fails.
    const w = world(d, { readMs: 2, sendMs: 40, downloads: [{ dropAt: MIB + PIECE }], putFaults: [404] });
    const started = performance.now();
    await assert.rejects(run(w, d.length, { retryMs: 1000 }), (e) => e instanceof FatalError && /expired/.test(e.message));
    assert.ok(performance.now() - started < 500, 'it did not wait out the retry');
    assert.ok(w.idle());
    assert.equal(w.calls.filter((c) => c.kind === 'get').length, 1);
  });
});

test('a read that fails for good one chunk ahead: that chunk is still sent, then the same error', async () => {
  await noStray(async () => {
    const d = randomBytes(3 * MIB);
    // Drops inside the second chunk, then every retry fails, all while the first chunk is sent.
    const w = world(d, { readMs: 1, sendMs: 100, downloads: [{ dropAt: MIB + PIECE }, ...Array(10).fill({ status: 500 })] });
    const progress = [];
    await assert.rejects(run(w, d.length, { onProgress: (n) => progress.push(n) }), /Download answered HTTP 500/);
    assert.deepEqual(progress, [MIB], 'the first chunk finished and was reported');
    assert.equal(w.have, MIB);
    assert.equal(w.calls.filter((c) => c.kind === 'put').length, 1);
    assert.equal(w.calls.filter((c) => c.kind === 'get').length, 6, 'one download and five retries, as before');
    assert.ok(w.idle());
  });
});

test('a read that is refused one chunk ahead: that chunk is still sent, then the same error', async () => {
  await noStray(async () => {
    const d = randomBytes(3 * MIB);
    const w = world(d, { readMs: 1, sendMs: 60, downloads: [{ dropAt: MIB + PIECE }, { type: 'text/html' }] });
    const progress = [];
    await assert.rejects(run(w, d.length, { onProgress: (n) => progress.push(n) }), (e) => e instanceof FatalError && /Expected a video/.test(e.message));
    assert.deepEqual(progress, [MIB]);
    assert.equal(w.have, MIB);
    assert.equal(w.calls.filter((c) => c.kind === 'get').length, 2);
    assert.ok(w.idle());
  });
});

test('YouTube retries still work while reading ahead', async () => {
  await noStray(async () => {
    const d = randomBytes(3 * MIB + 5);
    const w = world(d, { readMs: 5, sendMs: 10, putFaults: [undefined, 500, undefined, 503] });
    const r = await run(w, d.length);
    assert.equal(sha(w.data), sha(d));
    assert.equal(r.sha256, sha(d));
    assert.ok(w.idle());
  });
});
