const mb = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${(n / 1e6).toFixed(0)} MB`);
const time = (s) => (s < 60 ? `${Math.max(1, Math.round(s))} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);

/**
 * Progress over the whole queue. `bytes` is what finished videos and the
 * current one account for; `sent` only what was really sent, for the speed.
 */
export function progressLine({ index, count, name, part, bytes, total, sent, seconds }) {
  const share = total ? Math.min(1, bytes / total) : 0;
  // Never show 100% before everything is confirmed.
  const pct = Math.floor(share * 100);
  const speed = seconds > 2 ? sent / seconds : 0;
  return [
    `${pct}%`,
    `video ${index} of ${count}: ${name}${part === undefined ? '' : ` ${Math.floor(part * 100)}%`}`,
    `${mb(bytes)} of ${mb(total)}`,
    speed > 0 && `${(speed / 1e6).toFixed(1)} MB/s`,
    speed > 0 && bytes < total && `about ${time((total - bytes) / speed)} left`,
  ].filter(Boolean).join(' · ');
}
