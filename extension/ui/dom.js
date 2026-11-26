// Small helpers to build the page. Text always goes in as text, never as HTML.
const SVG = 'http://www.w3.org/2000/svg';
const PATHS = {
  lib: 'M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4',
  up: 'M12 19V5 M6 11l6-6 6 6',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2',
  yt: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M10 8.5v7l6-3.5z',
  safe: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M8.5 12l2.5 2.5 4.5-5',
  album: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  stop: 'M8 3h8l5 5v8l-5 5H8l-5-5V8z M8 12h8',
  held: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 19c0-3 2.5-5 6-5s6 2 6 5 M16 5.5a3 3 0 0 1 0 5.5 M17.5 14c2 .5 3.5 2.3 3.5 5',
  ask: 'M12 2.5l9.5 9.5-9.5 9.5L2.5 12z M10 10a2 2 0 1 1 3 1.7c-.7.4-1 .8-1 1.8 M12 16.4v.1',
  pause: 'M8.5 5v14 M15.5 5v14',
  fail: 'M6 6l12 12 M18 6L6 18',
  cut: 'M2 12h6 M16 12h6 M10.5 7l-1 10 M14.5 7l-1 10',
  no: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M6 6l12 12',
  phone: 'M7 2.5h10v19H7z M11 18.5h2',
  open: 'M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6',
  check: 'M5 12.5l5 5 9-11',
  lock: 'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 11v5 M12 7.6v.1',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M16 16l4.5 4.5',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  film: 'M4 5h16v14H4z M8 5v14 M16 5v14 M4 9.5h4 M4 14.5h4 M16 9.5h4 M16 14.5h4',
  play: 'M8 5.5v13l11-6.5z',
  full: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
  out: 'M10 4H5v16h5 M14 8l4 4-4 4 M18 12H9',
};

export function icon(kind, size = 20) {
  const s = document.createElementNS(SVG, 'svg');
  for (const [k, v] of Object.entries({
    class: 'mk', width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
  })) s.setAttribute(k, v);
  const p = document.createElementNS(SVG, 'path');
  p.setAttribute('d', PATHS[kind] ?? PATHS.info);
  s.append(p);
  return s;
}

/** h('button', { class: 'btn', onclick }, 'Text', node, null) */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el[k] = v;
    else if (k === 'checked') { el.setAttribute('checked', ''); el.checked = true; } else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...kids.flat(9).filter((x) => x !== null && x !== undefined && x !== false && x !== ''));
  return el;
}

/** A button with a label. `f` names it, so the keyboard stays there when the page redraws. */
export const button = (f, cls, text, onclick, props = {}) => h('button', { type: 'button', class: cls, 'data-f': f, onclick, ...props }, text);
export const link = (cls, text, href, props = {}) => h('a', { class: cls, href, target: '_blank', rel: 'noreferrer', ...props }, text);
export const broken = new Set(); // addresses that did not load
export const picture = (src) => (src && !broken.has(src) ? h('img', { class: 'th', src, alt: '', referrerpolicy: 'no-referrer', onerror: () => { broken.add(src); dispatchEvent(new Event('picture-failed')); } }) : h('span', { class: 'th miss' }, icon('film', 30)));

/** Replaces what is in `box` only where it changed, and keeps the keyboard where it was. */
export function draw(box, nodes) {
  const next = [nodes].flat(9).filter((x) => x !== null && x !== undefined && x !== false && x !== '');
  const had = box.contains(document.activeElement) ? document.activeElement.dataset.f : null;
  patch(box, next);
  if (had && document.activeElement?.dataset?.f !== had) {
    const again = box.querySelector(`[data-f="${CSS.escape(had)}"]`);
    if (again && !again.disabled) again.focus({ preventScroll: true });
    else (box.closest('main') ?? box.querySelector('main'))?.focus({ preventScroll: true });
  }
}
function patch(box, next) {
  const byKey = new Map([...box.childNodes].filter((n) => n.dataset?.key).map((n) => [n.dataset.key, n]));
  const loose = [...box.childNodes].filter((n) => !n.dataset?.key);
  const out = next.map((n, i) => {
    const old = n.dataset?.key ? byKey.get(n.dataset.key) : loose.find((o) => o.isEqualNode?.(n));
    if (!old) return n;
    if (!n.dataset?.key) loose.splice(loose.indexOf(old), 1);
    if (n.hasAttribute?.('data-keep')) return old; // plays on, whatever is drawn around it
    if (old.isEqualNode(n) && !stale(old)) return old;
    // Same outer element with a changed part: keep the element, redo its children.
    if (n.dataset?.key && old.cloneNode(false).isEqualNode(n.cloneNode(false)) && n.hasAttribute('data-deep')) {
      patch(old, [...n.childNodes]);
      return old;
    }
    return n;
  });
  out.forEach((n, i) => { if (box.childNodes[i] !== n) box.insertBefore(n, box.childNodes[i] ?? null); });
  while (box.childNodes.length > out.length) box.lastChild.remove();
}
// A box the user clicked differs from its markup until it is drawn again.
const stale = (n) => [...(n.querySelectorAll?.('input[type=checkbox]') ?? [])].some((i) => i.checked !== i.hasAttribute('checked'));

export function ask(title, text, yes, no = 'Cancel') {
  return new Promise((resolve) => {
    const d = h('dialog', { class: 'ask', 'aria-labelledby': 'ask-title' },
      h('form', { method: 'dialog', class: 'stack g16' }, h('h2', { id: 'ask-title' }, title), h('p', null, text),
        h('div', { class: 'line push' }, h('button', { class: 'btn sec', value: 'no' }, no), h('button', { class: 'btn', value: 'yes' }, yes))));
    d.onclose = () => { resolve(d.returnValue === 'yes'); d.remove(); };
    document.querySelector('.ge').append(d);
    d.showModal();
  });
}

/** Asks about one video, shown with its picture. Cancel has the focus; Esc and a click outside cancel. */
export const askDelete = (title, one, text, yes = 'Delete') => askDeleteMany(title, [one], text, yes);
/** The same, for several videos: each with its picture and its own line. */
export function askDeleteMany(title, list, text, yes = 'Delete') {
  return new Promise((resolve) => {
    const no = h('button', { type: 'button', class: 'btn sec', autofocus: true, onclick: () => d.close('no') }, 'Cancel');
    const d = h('dialog', { class: 'dlg', 'aria-labelledby': 'dlg-title' }, h('div', { class: 'in' },
      h('h2', { id: 'dlg-title' }, title),
      h('ul', null, list.map(({ pic, name, facts, copy, safe = false }) => h('li', null, h('span', { class: 'pt2' }, pic), h('span', { class: 'stack g4' }, h('strong', null, name), h('span', null, facts), h('span', { class: `line1 ${safe ? 'c-safe' : 'c-stop'}` }, icon(safe ? 'check' : 'stop', 16), copy))))),
      h('p', null, text),
      h('div', { class: 'bt' }, no, h('button', { type: 'button', class: 'btn bare', onclick: () => d.close('yes') }, yes))));
    // A click outside cancels, but not the second click of a double click that opened it.
    let at = 0;
    d.onclick = (e) => { if (e.target === d && performance.now() - at > 400) d.close('no'); };
    d.onclose = () => { resolve(d.returnValue === 'yes'); d.remove(); };
    document.querySelector('.ge').append(d);
    d.showModal();
    at = performance.now();
    // Cancel has the keyboard, but the question opens at its top: on a small window Cancel is far below.
    no.focus({ preventScroll: true });
    d.scrollTop = 0;
    requestAnimationFrame(() => { d.scrollTop = 0; });
  });
}

/**
 * Asks for one of several choices, shown as radio rows. Resolves to the chosen value, or null.
 * Cancel has the focus; Esc and a click outside cancel. `first` is chosen when it opens.
 * options: [{ value, name, text, icon }]; warn: { [value]: text } shown while that one is chosen;
 * yes(option) gives the button's words for the current choice.
 */
export function askChoice(title, sub, { options, first, warn = {}, note = '', yes, group = title }) {
  return new Promise((resolve) => {
    let now = options.some((o) => o.value === first) ? first : options[0].value;
    const no = h('button', { type: 'button', class: 'btn sec', autofocus: true, onclick: () => d.close('') }, 'Cancel');
    const go = h('button', { type: 'button', class: 'btn', onclick: () => d.close(now) });
    const tip = h('p', { class: 'vwarn', role: 'note' }, icon('info', 20), h('span'));
    const rows = options.map((o) => h('label', { class: 'vopt', 'data-v': o.value },
      h('input', { type: 'radio', name: 'dlg-choice', value: o.value, checked: o.value === now, onchange: (e) => { if (e.target.checked) show(o.value); } }),
      icon(o.icon, 22), h('span', { class: 'stack g4' }, h('strong', null, o.name), h('span', { class: 'sm mute' }, o.text))));
    const show = (v) => {
      now = v;
      for (const r of rows) r.classList.toggle('on', r.dataset.v === v);
      tip.hidden = !warn[v];
      tip.lastChild.textContent = warn[v] ?? '';
      go.textContent = yes(options.find((o) => o.value === v));
    };
    const d = h('dialog', { class: 'dlg', 'aria-labelledby': 'dlg-title', 'aria-describedby': 'dlg-sub' }, h('div', { class: 'in' },
      h('div', { class: 'stack g4' }, h('h2', { id: 'dlg-title' }, title), h('span', { id: 'dlg-sub', class: 'mute' }, sub)),
      h('div', { class: 'vlist', role: 'radiogroup', 'aria-label': group }, rows),
      tip,
      note ? h('p', { class: 'sm mute' }, note) : null,
      h('div', { class: 'bt' }, no, go)));
    show(now);
    d.onclick = (e) => { if (e.target === d) d.close(''); };
    d.onclose = () => { const v = d.returnValue; resolve(options.some((o) => o.value === v) ? v : null); d.remove(); };
    document.querySelector('.ge').append(d);
    d.showModal();
    no.focus();
  });
}

/** A small progress ring: `part` from 0 to 1. */
export function ring(size, r, width, part) {
  const box = r * 2 + width * 2;
  const c = 2 * Math.PI * r;
  const s = document.createElementNS(SVG, 'svg');
  for (const [k, v] of Object.entries({ class: 'ring', width: size, height: size, viewBox: `0 0 ${box} ${box}`, 'aria-hidden': 'true' })) s.setAttribute(k, v);
  const circle = (attrs) => {
    const e = document.createElementNS(SVG, 'circle');
    for (const [k, v] of Object.entries({ cx: box / 2, cy: box / 2, r, fill: 'none', 'stroke-width': width, ...attrs })) e.setAttribute(k, v);
    return e;
  };
  const p = Math.max(0, Math.min(1, Number(part) || 0));
  s.append(circle({ stroke: 'var(--edge)', opacity: '.35' }),
    circle({ stroke: 'var(--safe)', 'stroke-linecap': 'round', transform: `rotate(-90 ${box / 2} ${box / 2})`, 'stroke-dasharray': `${(p * c).toFixed(2)} ${c.toFixed(2)}`, ...(p ? {} : { opacity: '0' }) }));
  return s;
}
