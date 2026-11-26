// Incremental SHA-256. WebCrypto can only hash a whole buffer at once, and
// these files are too large to hold in memory.
const K = new Uint32Array(64);
const H0 = new Uint32Array(8);
{
  const frac = (x) => ((x - Math.floor(x)) * 2 ** 32) >>> 0;
  let n = 0;
  for (let p = 2; n < 64; p++) {
    let prime = true;
    for (let d = 2; d * d <= p; d++) if (p % d === 0) { prime = false; break; }
    if (!prime) continue;
    if (n < 8) H0[n] = frac(Math.sqrt(p));
    K[n++] = frac(Math.cbrt(p));
  }
}

export class Sha256 {
  #h = H0.slice();
  #w = new Uint32Array(64);
  #buf = new Uint8Array(64);
  #fill = 0;
  #length = 0;

  get length() { return this.#length; }

  update(data) {
    this.#length += data.length;
    let i = 0;
    if (this.#fill) {
      const n = Math.min(64 - this.#fill, data.length);
      this.#buf.set(data.subarray(0, n), this.#fill);
      this.#fill += n;
      i = n;
      if (this.#fill < 64) return this;
      this.#block(this.#buf, 0);
      this.#fill = 0;
    }
    for (; i + 64 <= data.length; i += 64) this.#block(data, i);
    if (i < data.length) {
      this.#buf.set(data.subarray(i), 0);
      this.#fill = data.length - i;
    }
    return this;
  }

  hex() {
    const bits = BigInt(this.#length) * 8n;
    const pad = new Uint8Array((this.#fill < 56 ? 56 : 120) - this.#fill + 8);
    pad[0] = 0x80;
    new DataView(pad.buffer).setBigUint64(pad.length - 8, bits);
    this.update(pad);
    return [...this.#h].map((x) => x.toString(16).padStart(8, '0')).join('');
  }

  #block(d, o) {
    const w = this.#w;
    for (let i = 0; i < 16; i++, o += 4) w[i] = (d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3];
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15], b = w[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    const h = this.#h;
    let [A, B, C, D, E, F, G, H] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = ((E >>> 6) | (E << 26)) ^ ((E >>> 11) | (E << 21)) ^ ((E >>> 25) | (E << 7));
      const t1 = (H + S1 + ((E & F) ^ (~E & G)) + K[i] + w[i]) | 0;
      const S0 = ((A >>> 2) | (A << 30)) ^ ((A >>> 13) | (A << 19)) ^ ((A >>> 22) | (A << 10));
      const t2 = (S0 + ((A & B) ^ (A & C) ^ (B & C))) | 0;
      H = G; G = F; F = E; E = (D + t1) | 0; D = C; C = B; B = A; A = (t1 + t2) | 0;
    }
    h[0] += A; h[1] += B; h[2] += C; h[3] += D; h[4] += E; h[5] += F; h[6] += G; h[7] += H;
  }
}
