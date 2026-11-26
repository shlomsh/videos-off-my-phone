import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { Sha256 } from '../extension/lib/sha256.js';
import { hashSource, streamToSession, probeSession, FatalError } from '../extension/lib/transfer.js';

const MIB = 1024 * 1024;
const sha = (b) => createHash('sha256').update(b).digest('hex');
const listen = (h) => new Promise((r) => { const s = http.createServer(h).listen(0, '127.0.0.1', () => r({ s, url: `http://127.0.0.1:${s.address().port}/` })); });
const close = (...all) => all.forEach((x) => { x.s.closeAllConnections(); x.s.close(); });

function source(data, { ranges = false, dropAt = [], type = 'video/quicktime', length = data.length } = {}) {
  const drops = [...dropAt];
  return listen((req, res) => {
    const m = ranges && /bytes=(\d+)-/.exec(req.headers.range ?? '');
    const start = m ? Number(m[1]) : 0;
    res.writeHead(m ? 206 : 200, { 'content-type': type, 'content-length': length - start, ...(m && { 'content-range': `bytes ${start}-${length - 1}/${length}` }) });
    const drop = drops.shift();
    if (drop !== undefined) { res.write(data.subarray(start, drop), () => setTimeout(() => res.destroy(), 20)); return; }
    res.end(data.subarray(start));
  });
}

// Mimics YouTube's resumable session, with scripted faults per request.
// `held`: bytes it already holds from an earlier try. `puts`: the range of every request.
function sink(size, { faults = [], mode308 = 'real', held = null } = {}) {
  const got = held ? [held] : [];
  let have = held?.length ?? 0; let n = 0;
  const api = { tokens: [], puts: [], get data() { return Buffer.concat(got); } };
  const p = listen((req, res) => {
    const body = [];
    api.tokens.push(req.headers.authorization);
    api.puts.push(req.headers['content-range']);
    req.on('data', (c) => body.push(c)).on('end', () => {
      const data = Buffer.concat(body);
      const fault = faults[n++];
      const incomplete = () => {
        const h = have ? { range: `bytes=0-${have - 1}` } : {};
        if (mode308 === 'real') res.writeHead(308, h); else res.writeHead(200, { ...h, 'x-http-status-code-override': '308' });
        res.end();
      };
      const reply = () => (have === size ? (res.writeHead(200, { 'content-type': 'application/json' }), res.end('{"id":"vid123"}')) : incomplete());
      const range = req.headers['content-range'];
      if (range.startsWith('bytes */')) return fault === 500 ? (res.writeHead(500), res.end()) : fault === 308 ? incomplete() : reply();
      const [, a, b] = /bytes (\d+)-(\d+)\//.exec(range).map(Number);
      if (a !== have || b - a + 1 !== data.length) { res.writeHead(400); return res.end('bad range'); }
      if (fault === 500 || fault === 401) { res.writeHead(fault); return res.end(); }
      if (fault === 'half') { got.push(data.subarray(0, 262144)); have += 262144; return incomplete(); }
      got.push(data); have += data.length;
      if (fault === 'lostreply') return req.socket.destroy();
      if (fault === 'early') { res.writeHead(200); return res.end('{"id":"early"}'); }
      reply();
    });
  });
  return p.then((x) => Object.assign(x, { api }));
}

const opts = (src, dst, size, extra = {}) => ({
  getUrl: async () => src.url, sessionUri: dst?.url, size, chunkSize: MIB, retryMs: 1, getAuth: async (f) => (f ? 'fresh' : 'tok'), ...extra,
});

test('sha256 matches node for many lengths and splits', () => {
  for (const n of [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 1000, 100_003]) {
    const b = randomBytes(n);
    const h = new Sha256();
    for (let i = 0; i < n;) { const k = 1 + (i * 7) % 777; h.update(b.subarray(i, i + k)); i += k; }
    assert.equal(h.hex(), sha(b), `length ${n}`);
  }
});

for (const ranges of [false, true]) {
  test(`source survives dropped connections (ranges ${ranges})`, async () => {
    const d = randomBytes(5 * MIB + 12345);
    const s = await source(d, { ranges, dropAt: [700_000, 3 * MIB + 5] });
    const r = await hashSource(opts(s, null, d.length));
    close(s);
    assert.deepEqual(r, { bytes: d.length, sha256: sha(d) });
  });
}

test('refuses a source whose size differs from the listing', async () => {
  const d = randomBytes(MIB);
  const s = await source(d);
  await assert.rejects(hashSource(opts(s, null, d.length + 1)), FatalError);
  await assert.rejects(hashSource(opts(s, null, d.length - 1)), FatalError);
  close(s);
});

test('refuses a source that is not a video', async () => {
  const d = randomBytes(1000);
  const s = await source(d, { type: 'text/html' });
  await assert.rejects(hashSource(opts(s, null, d.length)), /Expected a video/);
  close(s);
});

for (const [name, faults] of Object.entries({
  clean: [], 'server errors': [undefined, 500, undefined, undefined, 500], 'partly accepted chunk': [undefined, 'half'],
  'lost reply mid-file': [undefined, 'lostreply'], 'lost final reply': [undefined, undefined, undefined, 'lostreply'],
  'expired sign-in': [undefined, 401], 'error then failed status check': [500, 500],
})) {
  for (const mode308 of ['real', 'override']) {
    test(`upload delivers identical bytes: ${name} (${mode308} 308)`, async () => {
      const d = randomBytes(3 * MIB + 777);
      const s = await source(d, { dropAt: [MIB + 9] });
      const y = await sink(d.length, { faults, mode308 });
      const r = await streamToSession(opts(s, y, d.length));
      close(s, y);
      assert.equal(sha(y.api.data), sha(d));
      assert.equal(r.sha256, sha(d));
      assert.equal(r.video.id, 'vid123');
      if (name === 'expired sign-in') assert.ok(y.api.tokens.includes('Bearer fresh'));
    });
  }
}

test('does not accept an early "finished" answer', async () => {
  const d = randomBytes(3 * MIB);
  const s = await source(d); const y = await sink(d.length, { faults: ['early'] });
  await assert.rejects(streamToSession(opts(s, y, d.length)), /before the whole file/);
  close(s, y);
});

test('gives up after repeated server errors', async () => {
  const d = randomBytes(MIB);
  const s = await source(d); const y = await sink(d.length, { faults: Array(40).fill(500) });
  await assert.rejects(streamToSession(opts(s, y, d.length)), /HTTP 500/);
  close(s, y);
});

test('stops when asked', async () => {
  const d = randomBytes(4 * MIB);
  const s = await source(d); const y = await sink(d.length);
  const ac = new AbortController();
  await assert.rejects(streamToSession(opts(s, y, d.length, { signal: ac.signal, onProgress: () => ac.abort() })));
  assert.ok(y.api.data.length < d.length);
  close(s, y);
});

// ---- Stop, then Continue
const sent = (y) => y.api.puts.filter((r) => !r.startsWith('bytes */'));

test('Stop then Continue goes on in the same session without sending a byte twice', async () => {
  const d = randomBytes(5 * MIB + 4321);
  const s = await source(d); const y = await sink(d.length);
  const ac = new AbortController();
  let n = 0;
  await assert.rejects(streamToSession(opts(s, y, d.length, { signal: ac.signal, onProgress: () => { if (++n === 2) ac.abort(); } })));
  const held = y.api.data.length;
  assert.equal(held, 2 * MIB);
  const p = await probeSession({ sessionUri: y.url, size: d.length, token: 't' });
  assert.deepEqual(p, { state: 'incomplete', offset: held });
  const before = sent(y).length;
  const r = await streamToSession(opts(s, y, d.length, { from: p.offset }));
  close(s, y);
  assert.equal(sha(y.api.data), sha(d), 'YouTube holds the file exactly once');
  assert.equal(sent(y)[before], `bytes ${held}-${3 * MIB - 1}/${d.length}`, 'the first part sent again starts at the byte YouTube holds');
  assert.equal(r.sha256, sha(d), 'the hash covers the whole file, read again from the start');
  assert.equal(r.bytes, d.length);
  assert.equal(r.video.id, 'vid123');
});

for (const ranges of [false, true]) {
  test(`goes on from a byte inside a part (ranges ${ranges})`, async () => {
    const d = randomBytes(3 * MIB + 777);
    const held = MIB + 256 * 1024;
    const s = await source(d, { ranges, dropAt: [2 * MIB + 3] }); const y = await sink(d.length, { held: d.subarray(0, held) });
    const r = await streamToSession(opts(s, y, d.length, { from: held }));
    close(s, y);
    assert.equal(sha(y.api.data), sha(d));
    assert.equal(r.sha256, sha(d));
    assert.deepEqual(sent(y), [`bytes ${held}-${2 * MIB - 1}/${d.length}`, `bytes ${2 * MIB}-${3 * MIB - 1}/${d.length}`, `bytes ${3 * MIB}-${d.length - 1}/${d.length}`]);
  });
}

test('every byte arrived but YouTube had not finished: it only asks, and sends nothing', async () => {
  const d = randomBytes(3 * MIB + 777);
  const s = await source(d); const y = await sink(d.length, { held: d, faults: [308] });
  const p = await probeSession({ sessionUri: y.url, size: d.length, token: 't' });
  assert.deepEqual(p, { state: 'incomplete', offset: d.length });
  const r = await streamToSession(opts(s, y, d.length, { from: p.offset }));
  close(s, y);
  assert.deepEqual(sent(y), []);
  assert.equal(y.api.puts.length, 2);
  assert.equal(r.sha256, sha(d));
  assert.equal(r.video.id, 'vid123');
});

test('refuses to go on from a byte outside the file', async () => {
  const d = randomBytes(MIB);
  const s = await source(d); const y = await sink(d.length);
  for (const from of [-1, d.length + 1, 0.5, NaN]) await assert.rejects(streamToSession(opts(s, y, d.length, { from })), FatalError, String(from));
  close(s, y);
  assert.deepEqual(y.api.puts, []);
});
