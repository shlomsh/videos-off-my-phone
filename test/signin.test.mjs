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
  storage: { local: { get: async (k) => ({ [k]: g.store[k] }), set: async (o) => Object.assign(g.store, o), remove: async (k) => { delete g.store[k]; } },
    session: { get: async (k) => ({ [k]: g.session[k] }), set: async (o) => Object.assign(g.session, o), remove: async (k) => { delete g.session[k]; } } },
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

test('sign out forgets the token and the channel, and keeps the records', async () => {
  reset();
  const yt = await fresh();
  await yt.signIn('client');
  g.store['upload:K'] = { state: 'uploaded', id: 'y' };
  await yt.signOut();
  assert.equal(g.session.token, undefined);
  assert.equal(g.store.channel, undefined);
  assert.deepEqual(g.store['upload:K'], { state: 'uploaded', id: 'y' });
  const n = g.flows.length;
  // Nothing signs in again by itself: not this page, not a new one.
  await assert.rejects(yt.getToken('client'), /Not signed in/);
  await assert.rejects(yt.getToken('client', true), /Not signed in/);
  assert.equal(await (await fresh()).restore('client', () => assert.fail('not a problem')), null);
  assert.equal(g.flows.length, n, 'Google was not asked');
  assert.equal((await yt.signIn('client')).id, 'UC1', 'the user can sign in again');
});

test('a sign-in that was under way when signing out counts for nothing', async () => {
  reset({ store: { channel: { id: 'UC1', title: 'a' } }, consented: true });
  const real = chrome.identity.launchWebAuthFlow;
  let release;
  chrome.identity.launchWebAuthFlow = async (o) => { await new Promise((r) => { release = r; }); return real(o); };
  const yt = await fresh();
  const slow = yt.restore('client');
  await new Promise((r) => setTimeout(r, 5));
  await yt.signOut();
  release();
  assert.equal(await slow, null);
  assert.equal(g.store.channel, undefined);
  assert.equal(g.session.token, undefined);
  chrome.identity.launchWebAuthFlow = real;
});

test('remove access asks Google with a fresh token, and says when it did not work', async () => {
  reset();
  const yt = await fresh();
  await yt.signIn('client');
  const before = globalThis.fetch;
  const sent = [];
  let status = 200;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://oauth2.googleapis.com/')) { sent.push({ url: String(url), method: init.method, body: String(init.body), type: init.headers['Content-Type'] }); return { ok: status === 200, status }; }
    return before(url, init);
  };
  try {
    const n = g.flows.length;
    await yt.revoke('client');
    assert.equal(g.flows.length, n, 'the token in hand is used');
    assert.deepEqual(sent, [{ url: 'https://oauth2.googleapis.com/revoke', method: 'POST', body: 'token=tok', type: 'application/x-www-form-urlencoded' }]);
    assert.equal(g.store.channel.id, 'UC1', 'it forgets nothing by itself');
    // Refused (an expired token cannot remove anything): renewed once and sent again.
    status = 400;
    sent.length = 0;
    await assert.rejects(yt.revoke('client'), /did not remove the access \(HTTP 400\)/);
    assert.equal(sent.length, 2);
    assert.equal(g.flows.length, n + 1, 'renewed once');
    status = 503;
    await assert.rejects(yt.revoke('client'), /HTTP 503/);
    globalThis.fetch = async (url, init) => { if (String(url).includes('oauth2')) throw new TypeError('Failed to fetch'); return before(url, init); };
    await assert.rejects(yt.revoke('client'), /Google did not answer/);
    await yt.signOut();
    await assert.rejects(yt.revoke('client'), /Not signed in/);
  } finally { globalThis.fetch = before; }
});
