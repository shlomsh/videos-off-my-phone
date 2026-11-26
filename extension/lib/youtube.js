import { FatalError, StopError } from './transfer.js';

const API = 'https://www.googleapis.com/youtube/v3';
const UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos';
// Upload, plus read-only to confirm the result. Neither can delete videos.
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
].join(' ');

const SILENT_MS = 10_000;

// Kept in this page and in chrome.storage.session: Chrome's memory, never on disk,
// closed to web pages, and cleared when Chrome closes or the extension reloads.
let token = null;
let boundChannel = null; // every later sign-in must be this channel
let turn = 0; // a newer sign-in makes an unfinished older one count for nothing

const getChannelWith = async (value) => {
  const res = await fetch(`${API}/channels?part=snippet&mine=true`, { headers: { Authorization: `Bearer ${value}` }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new FatalError(`YouTube did not confirm the channel (HTTP ${res.status}).`);
  const item = (await res.json()).items?.[0];
  if (!item) throw new FatalError('This account has no YouTube channel.');
  return { id: item.id, title: item.snippet.title };
};

// Asks Google for access and returns it with its channel. Changes nothing by itself.
async function authorize(clientId, interactive, mustBe) {
  const state = crypto.randomUUID();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId, response_type: 'token', scope: SCOPES, state,
    redirect_uri: chrome.identity.getRedirectURL(),
    // Google still asks for consent the first time, or when it was withdrawn.
    prompt: interactive ? 'select_account' : 'none',
  });
  const back = await chrome.identity.launchWebAuthFlow({
    url: url.href, interactive,
    // Google may pass through a page of its own before it answers.
    ...(!interactive && { abortOnLoadForNonInteractive: false, timeoutMsForNonInteractive: SILENT_MS }),
  });
  const p = new URLSearchParams(new URL(back).hash.slice(1));
  if (p.get('state') !== state) throw new FatalError('Sign-in response did not match the request.');
  if (p.get('error')) throw new FatalError(`Sign-in failed: ${p.get('error')}`);
  const granted = (p.get('scope') ?? '').split(' ');
  if (!SCOPES.split(' ').every((s) => granted.includes(s))) throw new FatalError('Please tick both YouTube permissions when signing in.');
  const value = p.get('access_token');
  const channel = await getChannelWith(value);
  if (mustBe && channel.id !== mustBe) throw new FatalError('That is a different YouTube channel.');
  return { value, expires: Date.now() + Number(p.get('expires_in')) * 1000, clientId, channel };
}

async function keep(t) {
  token = t;
  boundChannel = t.channel.id;
  await chrome.storage.session.set({ token: t });
  await chrome.storage.local.set({ channel: t.channel });
}
const fresh = (t) => !!t && t.expires - Date.now() > 5 * 60_000;

/** Signs in with Google's window. Pass keepChannel when only the same channel will do. */
export async function signIn(clientId, { keepChannel = false } = {}) {
  const mine = ++turn;
  const t = await authorize(clientId, true, keepChannel ? boundChannel : null);
  if (mine !== turn) throw new FatalError('A newer sign-in replaced this one.');
  await keep(t);
  return t.channel;
}

/**
 * Signs in again without a window, for the channel used last time. Null on a first
 * visit or if Google wants to ask; the second case is reported to onProblem.
 */
export async function restore(clientId, onProblem = () => {}) {
  const mine = turn;
  const { channel } = await chrome.storage.local.get('channel');
  if (!clientId || !channel?.id) return null;
  const { token: saved } = await chrome.storage.session.get('token');
  if (mine !== turn) return null;
  if (fresh(saved) && saved.clientId === clientId && saved.channel.id === channel.id) {
    token = saved;
    boundChannel = channel.id;
    return channel;
  }
  try {
    const t = await authorize(clientId, false, channel.id);
    if (mine !== turn) return null;
    await keep(t);
    return t.channel;
  } catch (e) {
    if (mine === turn) onProblem(e);
    return null;
  }
}

export async function getToken(clientId, force = false) {
  if (!force && fresh(token) && token.clientId === clientId) return token.value;
  // Signed out: only a new sign-in by the user may pick a channel.
  if (!boundChannel) throw new FatalError('Not signed in.');
  const mine = turn;
  const t = await authorize(clientId, false, boundChannel);
  if (mine !== turn) return getToken(clientId);
  await keep(t);
  return t.value;
}

/** Forgets the sign-in and the channel in this browser. Changes nothing at Google. */
export async function signOut() {
  turn += 1; // an unfinished sign-in counts for nothing
  token = null;
  boundChannel = null;
  await chrome.storage.session.remove('token');
  await chrome.storage.local.remove('channel');
}

const REVOKE = 'https://oauth2.googleapis.com/revoke';
/**
 * Asks Google to withdraw this app's access to the channel. An expired token cannot withdraw
 * anything, so a refused one is renewed once and sent again. Throws unless Google confirms it.
 * Forgets nothing by itself.
 */
export async function revoke(clientId) {
  const send = async (force) => {
    const value = await getToken(clientId, force);
    try {
      return await fetch(REVOKE, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: value }), signal: AbortSignal.timeout(20_000) });
    } catch (e) { throw new FatalError(`Google did not answer (${e?.message ?? e}).`); }
  };
  let res = await send(false);
  if (res.status === 400) res = await send(true);
  if (!res.ok) throw new FatalError(`Google did not remove the access (HTTP ${res.status}).`);
}

async function call(clientId, url, init = {}) {
  const send = async (force) => fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${await getToken(clientId, force)}` } });
  let res = await send(false);
  if (res.status === 401) res = await send(true);
  if (!res.ok) {
    const error = (await res.json().catch(() => null))?.error;
    const reason = error?.errors?.[0]?.reason ?? '';
    const message = `YouTube: ${error?.message ?? `HTTP ${res.status}`}`.replace(/<[^>]*>/g, '');
    // Sign-in, quota and daily upload limits affect every video that follows.
    if ([401, 403, 429].includes(res.status) || /limit|quota/i.test(reason)) throw new StopError(message);
    throw new FatalError(message);
  }
  return res;
}

// YouTube keeps only the day, so send the time as it was where the video was filmed.
// The offset is in milliseconds; anything else than a plausible one is ignored (UTC).
export function recordingDate(timestamp, tzOffset) {
  const plausible = Number.isInteger(tzOffset) && Math.abs(tzOffset) <= 14 * 3600_000 && tzOffset % 900_000 === 0;
  return new Date(timestamp + (plausible ? tzOffset : 0)).toISOString();
}

export function buildVideo({ fileName, timestamp, tzOffset, privacy, madeForKids }) {
  const title = fileName.replace(/[<>]/g, '').slice(0, 100) || 'Video';
  return {
    snippet: { title, categoryId: '22' },
    status: { privacyStatus: privacy, selfDeclaredMadeForKids: madeForKids },
    ...(Number.isFinite(timestamp) && { recordingDetails: { recordingDate: recordingDate(timestamp, tzOffset) } }),
  };
}

export async function startSession(clientId, video, { size, type }) {
  const parts = Object.keys(video).join(',');
  const res = await call(clientId, `${UPLOAD}?uploadType=resumable&part=${parts}&notifySubscribers=false`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(size), 'X-Upload-Content-Type': type },
    body: JSON.stringify(video),
  });
  const uri = new URL(res.headers.get('location') ?? 'invalid:');
  if (uri.protocol !== 'https:' || uri.host !== 'www.googleapis.com') throw new FatalError('YouTube returned an unexpected upload address.');
  return uri.href;
}

export async function getStatuses(clientId, ids) {
  const out = new Map();
  const parts = 'snippet,status,contentDetails,processingDetails,fileDetails,recordingDetails';
  for (let i = 0; i < ids.length; i += 50) {
    const q = new URLSearchParams({ part: parts, id: ids.slice(i, i + 50).join(','), maxResults: '50' });
    const j = await (await call(clientId, `${API}/videos?${q}`)).json();
    for (const v of j.items ?? []) out.set(v.id, v);
  }
  return out;
}

export async function getStatus(clientId, id) {
  const v = (await getStatuses(clientId, [id])).get(id);
  if (!v) throw new FatalError('YouTube does not list the uploaded video.');
  return v;
}
