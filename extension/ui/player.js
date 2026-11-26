// YouTube's own player, inside the page. Needs access to www.youtube.com, asked for on the first play.
const HOST = { origins: ['https://www.youtube.com/*'] };
const ORIGIN = 'https://www.youtube.com';
const START_MS = 15_000;

/** Call straight from a click: Chrome asks the user the first time. */
export const allowPlayer = () => chrome.permissions.request(HOST).catch(() => false);

// YouTube refuses a player that does not say where it is. Pages of an extension send nothing,
// so this says it, for players in this extension only (no other page is affected).
async function introduce() {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1],
    addRules: [{
      id: 1,
      action: { type: 'modifyHeaders', requestHeaders: [{ header: 'referer', operation: 'set', value: chrome.identity.getRedirectURL() }] },
      condition: { urlFilter: '||www.youtube.com/embed/', initiatorDomains: [chrome.runtime.id], resourceTypes: ['sub_frame'] },
    }],
  });
}

/** Why a video did not play, in plain words. */
export function whyNotPlaying(code) {
  if (code === 'slow') return 'The player did not start.';
  if ([100, 101, 150].includes(code)) return 'YouTube does not play this video inside another page.';
  return `YouTube did not allow the player here${Number.isFinite(code) ? ` (${code})` : ''}.`;
}

/** A player that calls onFail(code) once if it cannot play. */
export async function makePlayer(id, title, onFail) {
  await introduce();
  const f = document.createElement('iframe');
  Object.assign(f, { title, allow: 'autoplay; fullscreen; encrypted-media; picture-in-picture' }); // 'allow' already covers full screen
  const url = new URL(`${ORIGIN}/embed/${encodeURIComponent(id)}`);
  url.search = new URLSearchParams({ autoplay: 1, enablejsapi: 1, playsinline: 1, rel: 0, origin: location.origin });
  f.src = url.href;
  let timer = null;
  let asking = null;
  const stop = () => { clearTimeout(timer); clearInterval(asking); removeEventListener('message', hear); };
  const fail = (code) => { stop(); onFail(code); };
  const tell = (m) => f.contentWindow?.postMessage(JSON.stringify({ id: 1, channel: 'widget', ...m }), ORIGIN);
  function hear(e) {
    if (e.source !== f.contentWindow || e.origin !== ORIGIN) return;
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m.event === 'onReady' || m.event === 'initialDelivery') { clearInterval(asking); clearTimeout(timer); }
    if (m.event === 'onError') fail(Number(m.info));
  }
  addEventListener('message', hear);
  timer = setTimeout(() => fail('slow'), START_MS);
  f.onload = () => {
    asking = setInterval(() => { if (!f.isConnected) return stop(); tell({ event: 'listening' }); }, 400);
    tell({ event: 'listening' });
    tell({ event: 'command', func: 'addEventListener', args: ['onError'] });
  };
  return f;
}

/** A small window with the video on YouTube itself, next to this page. */
export const playInWindow = (id) => chrome.windows.create({ type: 'popup', width: 1120, height: 760, url: `${ORIGIN}/watch?v=${encodeURIComponent(id)}` });

// ---- the Google Photos copy. Google plays it only for a page that says it is Google Photos.
async function introduceClip() {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [2],
    addRules: [{
      id: 2,
      action: { type: 'modifyHeaders', requestHeaders: [{ header: 'referer', operation: 'set', value: 'https://photos.google.com/' }] },
      condition: { urlFilter: '||googlevideo.com/', initiatorDomains: [chrome.runtime.id], resourceTypes: ['media'] },
    }],
  });
}
/** A box with a playing video. It stays in the page while the rest is drawn again. */
export async function makeClip(key, title, url, onFail, start = true) {
  await introduceClip();
  const box = document.createElement('div');
  box.className = 'clip';
  box.dataset.key = `clip-${key}`;
  box.dataset.keep = '';
  const v = document.createElement('video');
  Object.assign(v, { controls: true, autoplay: start, preload: start ? 'auto' : 'metadata', playsInline: true, title, src: url });
  v.setAttribute('controlslist', 'nodownload');
  v.onerror = () => onFail(v.error?.message || `error ${v.error?.code}`);
  box.append(v);
  return box;
}
/** A video out of sight would go on making sound. */
export function endClip(box) {
  const v = box?.querySelector('video');
  if (!v) return;
  v.onerror = null;
  v.pause();
  v.removeAttribute('src');
  v.load();
}
