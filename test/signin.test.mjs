import { test } from 'node:test';
import assert from 'node:assert/strict';

// A small stand-in for Chrome and Google's sign-in.
const g = { store: {}, session: {}, flows: [], signedIn: 'UC1', consented: false, scopes: null, real: globalThis.fetch };
globalThis.chrome = {
  identity: {
    getRedirectURL: () => 'https://x.chromiumapp.org/',
    launchWebAuthFlow: async ({ url, interactive }) => {
      const u = new URL(url);
      g.flows.push({ interactive, prompt: u.searchParams.get('prompt') });
      if (!interactive && !g.consented) throw new Error('The user did not approve access.');
      if (interactive) g.consented = true;
      const h = new URLSearchParams({ state: u.searchParams.get('state'), access_token: 'tok', expires_in: '3600', scope: u.searchParams.get('scope') });
      return `https://x.chromiumapp.org/#${h}`;
    },
  },
  storage: { local: { get: async (k) => ({ [k]: g.store[k] }), set: async (o) => Object.assign(g.store, o) },
    session: { get: async (k) => ({ [k]: g.session[k] }), set: async (o) => Object.assign(g.session, o) } },
};
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ items: [{ id: g.signedIn, snippet: { title: `Name ${g.signedIn}` } }] }) });

const fresh = () => import(`../extension/lib/youtube.js?${Math.random()}`); // a new page
const reset = (o = {}) => Object.assign(g, { store: {}, session: {}, flows: [], signedIn: 'UC1', consented: false }, o);

test('first visit asks nothing by itself', async () => {
  reset();
  const yt = await fresh();
  assert.equal(await yt.restore('client', () => assert.fail('not a problem')), null);
  assert.equal(g.flows.length, 0);
});

test('a new page signs in again without a window', async () => {
  reset();
  await (await fresh()).signIn('client');
  assert.equal(g.flows[0].prompt, 'select_account'); // consent is not forced every time
  assert.deepEqual(g.store.channel, { id: 'UC1', title: 'Name UC1' });
  assert.ok(!JSON.stringify(g.store).includes('tok'), 'no token is stored');
  g.session = {}; // Chrome was restarted
  const yt = await fresh();
  assert.deepEqual(await yt.restore('client'), { id: 'UC1', title: 'Name UC1' });
  assert.deepEqual(g.flows.map((f) => f.interactive), [true, false]);
  assert.equal(await yt.getToken('client'), 'tok');
  assert.equal(g.flows.length, 2);
});

test('a reopened page uses the sign-in in memory, without asking Google', async () => {
  reset();
  await (await fresh()).signIn('client');
  const yt = await fresh();
  assert.equal((await yt.restore('client')).id, 'UC1');
  assert.equal(await yt.getToken('client'), 'tok');
  assert.equal(g.flows.length, 1);
  assert.ok(!JSON.stringify(g.store).includes('tok'), 'nothing secret on disk');
  // Not for another client, another channel, or when about to expire.
  for (const change of [{ clientId: 'other' }, { channel: { id: 'UC9' } }, { expires: Date.now() + 60_000 }]) {
    const before = g.session.token;
    g.session.token = { ...before, ...change };
    const n = g.flows.length;
    await (await fresh()).restore('client');
    assert.equal(g.flows.length, n + 1);
    g.session.token = before;
  }
});

test('a sign-in by the user wins over a slow restore', async () => {
  reset({ store: { channel: { id: 'UC1', title: 'a' } }, consented: true });
  const real = chrome.identity.launchWebAuthFlow;
  let release;
  chrome.identity.launchWebAuthFlow = async (o) => { if (!o.interactive) await new Promise((r) => { release = r; }); return real(o); };
  const yt = await fresh();
  const slow = yt.restore('client', () => assert.fail('not a problem'));
  await new Promise((r) => setTimeout(r, 5));
  g.signedIn = 'UC2';
  assert.equal((await yt.signIn('client')).id, 'UC2');
  g.signedIn = 'UC1';
  release();
  assert.equal(await slow, null);
  assert.equal(g.session.token.channel.id, 'UC2');
  chrome.identity.launchWebAuthFlow = real;
});

test('does not restore into a different channel or without consent', async () => {
  reset({ store: { channel: { id: 'UC1', title: 'a' } }, consented: true, signedIn: 'UC2' });
  assert.equal(await (await fresh()).restore('client'), null);
  reset({ store: { channel: { id: 'UC1', title: 'a' } } });
  let why;
  assert.equal(await (await fresh()).restore('client', (e) => { why = e; }), null);
  assert.ok(why, 'the reason is reported');
});

test('can switch channel, but not while a queue needs the same one', async () => {
  reset();
  const yt = await fresh();
  await yt.signIn('client');
  g.signedIn = 'UC2';
  await assert.rejects(yt.signIn('client', { keepChannel: true }), /different YouTube channel/);
  assert.equal(g.store.channel.id, 'UC1');
  assert.equal((await yt.signIn('client')).id, 'UC2');
  assert.equal(g.store.channel.id, 'UC2');
});
