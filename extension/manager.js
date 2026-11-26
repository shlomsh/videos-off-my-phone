import { getDetails, getDownloadUrl } from './lib/photos.js';
import { hashSource, streamToSession } from './lib/transfer.js';
import * as yt from './lib/youtube.js';
import { getRecord, setRecord, exclusive } from './lib/records.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const key = params.get('key');
const tabId = Number(params.get('tab'));
let video = null;
let channel = null;
let busy = null;
let uploadedId = null;

const log = (m) => { $('log').textContent += `${m}\n`; };
const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;
const clientId = () => $('client').value.trim();
const kids = () => $('kids').checked;

function refresh() {
  $('check').disabled = !video || !!busy;
  $('upload').disabled = !video?.original || !channel || !!busy;
  $('signin').disabled = !!busy;
  $('stop').hidden = !busy;
}

function showDetails() {
  const rows = {
    File: video.fileName,
    Recorded: new Date(video.timestamp).toLocaleString(),
    Size: `${mb(video.size)} (${video.size.toLocaleString()} bytes)`,
    Resolution: `${video.width} × ${video.height}`,
    Backup: video.original ? 'Original quality' : 'Not original quality',
  };
  $('details').replaceChildren(...Object.entries(rows).flatMap(([k, v]) => {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    return [dt, dd];
  }));
  $('details').hidden = false;
  $('pick').hidden = true;
  const warn = [];
  if (!video.original) warn.push('This copy is not Original quality, so it cannot be uploaded.');
  if (video.sharedAlbums.length) warn.push(`In shared album: ${video.sharedAlbums.join(', ')}. Deleting it later would remove it there too.`);
  $('warn').textContent = warn.join(' ');
  $('warn').hidden = !warn.length;
}

// Runs one task at a time with Stop support and visible errors.
async function run(name, task) {
  if (busy) return;
  busy = new AbortController();
  refresh();
  $('bar').value = 0;
  log(`— ${name} —`);
  try {
    await task(busy.signal);
  } catch (e) {
    log(busy.signal.aborted ? 'Stopped.' : `Failed: ${e.message ?? e}`);
  } finally {
    busy = null;
    refresh();
  }
}

const source = (signal) => ({
  size: video.size,
  signal,
  getUrl: () => getDownloadUrl(tabId, key),
  onInfo: (i) => log(`Source: ${i.type}, partial downloads ${i.ranged ? 'supported' : 'not supported (reading as one stream)'}`),
  onProgress: (n) => { $('bar').value = n / video.size; },
});

$('check').onclick = () => run('Checking original', async (signal) => {
  const r = await hashSource(source(signal));
  log(`Read ${r.bytes.toLocaleString()} bytes\nSHA-256 ${r.sha256}`);
  const want = $('expected').value.trim().toLowerCase();
  if (want) log(want === r.sha256 ? 'MATCH: identical to the expected file.' : 'DIFFERENT from the expected file.');
});

$('signin').onclick = () => run('Signing in', async () => {
  if (!/\.apps\.googleusercontent\.com$/.test(clientId())) throw new Error('Paste your Google OAuth client ID first.');
  await chrome.storage.local.set({ clientId: clientId() });
  channel = null;
  refresh();
  channel = await yt.signIn(clientId());
  $('channel').textContent = `Channel: ${channel.title}`;
  log(`Signed in to "${channel.title}".`);
});

$('upload').onclick = () => run('Uploading', (signal) => exclusive(async () => {
  const before = await getRecord(key);
  if (before?.state === 'uploaded' && !confirm(`Already uploaded${before.id ? ` as ${before.id}` : ''}. Upload a second copy?`)) return;
  if (before && before.state !== 'uploaded') throw new Error('An earlier upload was interrupted. Use the list page, which checks YouTube first.');
  const meta = yt.buildVideo({ ...video, privacy: 'private', madeForKids: kids() });
  const type = /\.mov$/i.test(video.fileName) ? 'video/quicktime' : 'video/*';
  const sessionUri = await yt.startSession(clientId(), meta, { size: video.size, type });
  const base = { size: video.size, fileName: video.fileName, channel: channel.id };
  if (!before) await setRecord(key, { ...base, state: 'sending', sessionUri, at: new Date().toISOString() });
  const started = Date.now();
  const r = await streamToSession({ ...source(signal), sessionUri, getAuth: (force) => yt.getToken(clientId(), force) });
  uploadedId = r.video.id;
  await setRecord(key, { ...base, state: 'uploaded', id: r.video.id, sha256: r.sha256, size: r.bytes, at: new Date().toISOString() });
  log(`Sent ${r.bytes.toLocaleString()} bytes in ${Math.round((Date.now() - started) / 1000)} s\nSHA-256 ${r.sha256}\nhttps://youtu.be/${r.video.id}`);
  const want = $('expected').value.trim().toLowerCase();
  if (want) log(want === r.sha256 ? 'MATCH: the bytes sent are identical to the expected file.' : 'DIFFERENT from the expected file.');
  $('status').hidden = false;
  await report();
}));

async function report() {
  const s = await yt.getStatus(clientId(), uploadedId);
  const v = s.fileDetails?.videoStreams?.[0];
  const got = Number(s.fileDetails?.fileSize);
  log([
    `Privacy applied: ${s.status?.privacyStatus}${s.status?.privacyStatus === 'private' ? '' : '  ← NOT the private setting requested'}`,
    `Upload: ${s.status?.uploadStatus}, processing: ${s.processingDetails?.processingStatus ?? 'unknown'}`,
    `File size at YouTube: ${got ? `${got.toLocaleString()}${got === video.size ? ' (matches)' : ' (DOES NOT MATCH)'}` : 'not reported yet'}`,
    v ? `Source seen by YouTube: ${v.widthPixels}×${v.heightPixels}, ${v.frameRateFps} fps, ${v.codec}` : 'Source details: not reported yet',
    `Recording date: ${s.recordingDetails?.recordingDate ?? 'not set'}`,
    'HDR and 2160p60 playback: check in the YouTube player once processing ends.',
  ].join('\n'));
}
$('status').onclick = () => run('Checking YouTube', report);
$('stop').onclick = () => busy?.abort();
$('kids').onchange = () => { $('kidsstate').textContent = $('kids').checked ? 'On' : 'Off'; };
addEventListener('beforeunload', (e) => { if (busy) e.preventDefault(); });

$('redirect').textContent = chrome.identity.getRedirectURL();
$('client').value = (await chrome.storage.local.get('clientId')).clientId ?? '';
yt.restore(clientId(), (e) => log(`Sign-in was not restored. Reason: ${e.message ?? e}`)).then((c) => {
  if (!c || channel) return;
  channel = c;
  $('channel').textContent = `Channel: ${channel.title}`;
  refresh();
});
if (key && tabId) {
  await run('Reading details', async () => {
    video = await getDetails(tabId, key);
    showDetails();
    log('Ready.');
  });
}
refresh();
