// The Move dialog (canvas v32, v35, v50): who can watch them, and their title and description.
// One box with three pages: the choice (E23/E24), "Title and description" (E45) and "Titles, one by one" (E46).
import { h, icon } from './dom.js';
import { gb, count } from './text.js';
import { titleFor, ownTitle, takenDay, originalLine, WORDS_MAX, TITLE_MAX } from '../lib/meta.js';

/** The row's summary of the title and description setting, from drawn words. */
export function titleSummary({ mode, words, date, text }, first) {
  const desc = String(text ?? '').trim() ? 'Description added.' : 'No description.';
  if (mode === 'each') return `Titles: one by one. ${desc}`;
  const day = takenDay(first?.timestamp);
  const plain = !String(words ?? '').replace(/[<>]/g, '').trim() && date && day;
  return `${plain ? `Title: the date taken, like “${day}”.` : `Title: “${titleFor({ words, date }, first)}”.`} ${desc}`;
}

/**
 * Asks who can watch them, with the title row. Resolves to null (cancelled) or
 * { who, setting: { words, date }, titles: Map key -> final title, text }.
 * list: [{ key, fileName, size, timestamp }] in upload order; pic(key) gives a picture node.
 * saved: the words and box state remembered from the last Move in this Chrome.
 */
export function askMove({ sub, options, first = 'private', warn = {}, note = '', yes, group, list, pic, saved = {} }) {
  return new Promise((resolve) => {
    let who = options.some((o) => o.value === first) ? first : options[0].value;
    // What Done last kept, and what the open page is changing.
    let set = { mode: 'pattern', words: String(saved.words ?? '').slice(0, WORDS_MAX), date: saved.date !== false, text: '', each: new Map() };
    let draft = null;
    const one = list[0];
    const d = h('dialog', { class: 'dlg', 'aria-labelledby': 'dlg-title', 'aria-describedby': 'dlg-sub' });
    const box = h('div', { class: 'in' });
    d.append(box);
    let page = 'main';
    const show = (p, focus) => {
      page = p;
      box.replaceChildren(...({ main: mainPage, pat: patPage, each: eachPage }[p])());
      (focus ? box.querySelector(focus) : null)?.focus();
    };
    const head = (title, text) => h('div', { class: 'stack g4' }, h('h2', { id: 'dlg-title' }, title), h('span', { id: 'dlg-sub', class: 'mute' }, text));

    function mainPage() {
      const go = h('button', { type: 'button', class: 'btn', 'data-f': 'dlg-yes', onclick: () => finish() });
      const tip = h('p', { class: 'vwarn', role: 'note' }, icon('info', 20), h('span'));
      const rows = options.map((o) => h('label', { class: 'vopt', 'data-v': o.value },
        h('input', { type: 'radio', name: 'dlg-choice', value: o.value, checked: o.value === who, onchange: (e) => { if (e.target.checked) pickWho(o.value); } }),
        icon(o.icon, 22), h('span', { class: 'stack g4' }, h('strong', null, o.name), h('span', { class: 'sm mute' }, o.text))));
      const pickWho = (v) => {
        who = v;
        for (const r of rows) r.classList.toggle('on', r.dataset.v === v);
        tip.hidden = !warn[v];
        tip.lastChild.textContent = warn[v] ?? '';
        go.textContent = yes(options.find((o) => o.value === v));
      };
      pickWho(who);
      return [
        head('Who can watch them on YouTube?', sub),
        h('div', { class: 'vlist', role: 'radiogroup', 'aria-label': group }, rows),
        tip,
        h('div', { class: 'trow' }, h('span', { class: 'stack g4' }, h('strong', null, 'Title and description'), h('span', { class: 'sm mute', 'data-f': 'tsum' }, titleSummary(set, one))),
          h('button', { type: 'button', class: 'btn sec sml', 'data-f': 'tchange', onclick: () => { draft = { ...set, each: new Map(set.each) }; show('pat', 'input[type=text]'); } }, 'Change')),
        note ? h('p', { class: 'sm mute' }, note) : null,
        h('div', { class: 'bt' }, h('button', { type: 'button', class: 'btn sec', 'data-f': 'dlg-no', autofocus: true, onclick: () => d.close('') }, 'Cancel'), go),
      ];
    }

    function patPage() {
      const ex = h('strong', null, titleFor(draft, one));
      const redo = () => { ex.textContent = titleFor(draft, one); };
      return [
        head('Title and description', `For the ${count(list.length)} you move now.`),
        h('label', { class: 'fld' }, h('span', { class: 'fl' }, 'Title'),
          h('input', { type: 'text', value: draft.words, placeholder: 'Your words, optional', maxlength: String(WORDS_MAX), 'data-f': 'twords', oninput: (e) => { draft.words = e.target.value; redo(); } })),
        h('label', { class: 'chk2' }, h('input', { type: 'checkbox', checked: draft.date, 'data-f': 'tdate', onchange: (e) => { draft.date = e.target.checked; redo(); } }), h('span', null, 'Add the date taken')),
        h('p', { class: 'ex' }, h('span', { class: 'mute' }, 'Example:'), ' ', ex),
        h('label', { class: 'fld' }, h('span', { class: 'fl' }, 'Description'),
          h('textarea', { rows: '3', placeholder: 'Optional', 'data-f': 'tdesc', oninput: (e) => { draft.text = e.target.value; } }, draft.text)),
        h('p', { class: 'sm mute' }, `One line is added at the end: “${originalLine(one?.fileName ?? '')}”. It lets this app find each video on YouTube again, so please leave it there.`),
        h('div', { class: 'bt' },
          h('button', { type: 'button', class: 'lnkb lft', 'data-f': 'teach', onclick: () => show('each', 'input[type=text]') }, 'Set each title one by one'),
          h('button', { type: 'button', class: 'btn sec', 'data-f': 'tback', onclick: back }, 'Back'),
          h('button', { type: 'button', class: 'btn', 'data-f': 'tdone', onclick: () => { set = { ...draft, mode: 'pattern' }; draft = null; show('main', '[data-f=tchange]'); } }, 'Done')),
      ];
    }

    function eachPage() {
      // Each starts with the date taken (or, without one, the file name).
      const rows = list.map((v) => {
        if (!draft.each.has(v.key)) draft.each.set(v.key, titleFor({ words: '', date: true }, v));
        const day = takenDay(v.timestamp);
        return h('li', null, h('span', { class: 'pt4' }, pic(v.key)),
          h('label', { class: 'stack g4' }, h('span', { class: 'sm mute' }, `${v.fileName}, ${gb(v.size)}`),
            h('input', { type: 'text', value: draft.each.get(v.key), maxlength: String(TITLE_MAX), 'aria-label': day ? `Title for the video from ${day}` : `Title for ${v.fileName}`, oninput: (e) => { draft.each.set(v.key, e.target.value); } })));
      });
      return [
        head('Titles, one by one', 'Each starts with the date taken. Change any you like.'),
        h('ul', { class: 'each' }, rows),
        h('div', { class: 'bt' },
          h('button', { type: 'button', class: 'btn sec', 'data-f': 'eback', onclick: back }, 'Back'),
          h('button', { type: 'button', class: 'btn', 'data-f': 'edone', onclick: () => { set = { ...draft, mode: 'each' }; draft = null; show('main', '[data-f=tchange]'); } }, 'Done')),
      ];
    }
    // Back, and Esc on the two title pages: one page back, without keeping what that page changed.
    function back() {
      if (page === 'each') return show('pat', '[data-f=teach]');
      draft = null;
      show('main', '[data-f=tchange]');
    }
    // Handled here, so the browser never closes the box by itself on a second Esc.
    const esc = (e) => { e.preventDefault(); if (page !== 'main') back(); else d.close(''); };
    d.onkeydown = (e) => { if (e.key === 'Escape') esc(e); };
    d.oncancel = esc;

    let answer = null;
    function finish() {
      const titles = new Map(list.map((v) => [v.key, set.mode === 'each' ? ownTitle(set.each.get(v.key) ?? titleFor({ words: '', date: true }, v), v.fileName) : titleFor(set, v)]));
      answer = { who, setting: { words: set.words, date: set.date }, titles, text: set.text };
      d.close('yes');
    }
    d.onclick = (e) => { if (e.target === d) d.close(''); };
    d.onclose = () => { resolve(d.returnValue === 'yes' ? answer : null); d.remove(); };
    show('main');
    document.querySelector('.ge').append(d);
    d.showModal();
    box.querySelector('[data-f=dlg-no]').focus();
  });
}
