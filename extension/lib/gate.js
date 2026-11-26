/**
 * Decides whether a moved video passes every check. Returns the reasons it does
 * not; an empty list means it passes. Anything missing counts against it.
 */
export function unsafeReasons({ record, details, video, channelId }) {
  const no = [];
  const need = (ok, why) => { if (!ok) no.push(why); };
  if (record?.state !== 'uploaded' || !record.id) return ['no finished upload on record'];
  if (!video || video.id !== record.id) return ['not found on YouTube'];
  if (!details) return ['not found in Google Photos'];

  need(/^[0-9a-f]{64}$/.test(record.sha256 ?? ''), 'the upload was interrupted, so its bytes were not fully checked');
  need(channelId && record.channel === channelId && video.snippet?.channelId === channelId, 'not on the signed-in channel');
  need(details.original, 'not Original quality in Google Photos');
  need(record.size > 0 && record.size === details.size, 'the Google Photos file changed since the upload');
  need(Array.isArray(details.sharedAlbums), 'shared albums unknown');
  need(!details.sharedAlbums?.length, `in a shared album (${(details.sharedAlbums ?? []).join(', ')})`);

  const s = video.status ?? {};
  if (s.uploadStatus === 'failed' || s.uploadStatus === 'rejected' || s.uploadStatus === 'deleted') {
    need(false, `YouTube says ${s.uploadStatus}: ${s.failureReason ?? s.rejectionReason ?? 'no reason given'}`);
  } else {
    need(s.uploadStatus === 'processed' && video.processingDetails?.processingStatus === 'succeeded', 'YouTube is still processing');
  }
  need(s.privacyStatus === 'private', `privacy is ${s.privacyStatus ?? 'unknown'}, not private`);
  need(Number(video.fileDetails?.fileSize) === details.size, 'size at YouTube not confirmed');
  const v = video.fileDetails?.videoStreams?.[0];
  // Portrait clips may be reported rotated, so compare without orientation.
  const dims = (a, b) => [Number(a), Number(b)].sort((x, y) => x - y).join('x');
  need(v?.widthPixels > 0 && details.width > 0 && dims(v.widthPixels, v.heightPixels) === dims(details.width, details.height), 'resolution at YouTube not confirmed');
  return no;
}
export const stillProcessing = (reasons) => reasons.length > 0 && reasons.every((r) => /still processing|not confirmed/.test(r));

/** What YouTube itself says about an uploaded video, for showing to the user. */
export function confirmation(record, video, channelId) {
  if (!video) return { mark: '✗', level: 'bad', text: 'YouTube does not list this video. Do not delete the original.' };
  const s = video.status ?? {};
  const got = Number(video.fileDetails?.fileSize);
  const n = (x) => x.toLocaleString('en-US');
  const bad = [];
  if (['failed', 'rejected', 'deleted'].includes(s.uploadStatus)) bad.push(`YouTube says ${s.uploadStatus}${s.failureReason || s.rejectionReason ? ` (${s.failureReason ?? s.rejectionReason})` : ''}`);
  if (got && got !== record.size) bad.push(`YouTube received ${n(got)} of ${n(record.size)} bytes`);
  if (s.privacyStatus !== 'private') bad.push(`privacy is ${s.privacyStatus ?? 'unknown'}`);
  if (channelId && video.snippet?.channelId !== channelId) bad.push('on another channel');
  if (bad.length) return { mark: '✗', level: 'bad', text: `${bad.join('; ')}.` };
  const v = video.fileDetails?.videoStreams?.[0];
  const facts = [
    got ? `YouTube received all ${n(got)} bytes` : 'size not reported yet',
    'Private',
    v?.widthPixels && `${v.widthPixels}×${v.heightPixels}${v.frameRateFps ? ` at ${Math.round(v.frameRateFps)} fps` : ''}`,
  ];
  const ready = s.uploadStatus === 'processed' && video.processingDetails?.processingStatus === 'succeeded' && got > 0;
  facts.push(ready ? 'processing finished' : 'still processing');
  return { mark: ready ? '✓' : '…', level: ready ? 'good' : 'wait', text: `${facts.filter(Boolean).join(' · ')}.` };
}
