// The account menu's two dialogs: Remove access, and what to finish before switching.
import { h, icon } from './dom.js';

const open = (d) => { document.querySelector('.ge').append(d); d.showModal(); };

/** The yellow line under a ticked "Also forget": what would be lost. */
export function forgetWarning(moved, counter) {
  return [
    moved ? `${moved} ${moved === 1 ? 'video you moved would look new again, and could be moved to YouTube twice.' : 'videos you moved would look new again, and could be moved to YouTube twice.'}` : '',
    'This cannot be undone.',
    counter ? `The ${counter} counter starts again at 0.` : '',
  ].filter(Boolean).join(' ');
}

/**
 * Asks before removing this app's access. `act(forget)` does it and resolves to null when
 * done, or to the words to show when it did not work; the dialog stays open until then.
 * Resolves when the dialog closes: true if it was done.
 */
export function askRemove({ moved, counter, act }) {
  return new Promise((resolve) => {
    let working = false;
    let done = false;
    const box = h('input', { type: 'checkbox', 'data-f': 'rv-forget', onchange: () => show() });
    const warn = h('p', { class: 'vwarn', role: 'note', hidden: true }, icon('info', 20), h('span', null, forgetWarning(moved, counter)));
    const err = h('p', { class: 'why', role: 'alert', hidden: true });
    const no = h('button', { type: 'button', class: 'btn sec', autofocus: true, onclick: () => { if (!working) d.close(); } }, 'Cancel');
    const yes = h('button', { type: 'button', class: 'btn', 'data-f': 'rv-yes', onclick: async () => {
      if (working) return;
      working = true;
      err.hidden = true;
      show();
      const why = await act(box.checked).catch((e) => e?.message ?? String(e));
      working = false;
      if (!why) { done = true; d.close(); return; }
      err.textContent = why;
      err.hidden = false;
      show();
    } });
    function show() {
      warn.hidden = !box.checked;
      box.disabled = no.disabled = yes.disabled = working;
      yes.textContent = box.checked ? 'Remove and forget' : 'Remove access';
    }
    const d = h('dialog', { class: 'dlg', 'aria-labelledby': 'rv-title' }, h('div', { class: 'in' },
      h('h2', { id: 'rv-title' }, 'Remove this app’s access to YouTube?'),
      h('p', null, 'Google stops letting this app upload to your channel or read it. Nothing on YouTube or in Google Photos is deleted.'),
      h('p', { class: 'mute' }, 'This Chrome forgets your channel and the YouTube links of the videos you moved.'),
      h('label', { class: 'tickrow' }, box, h('span', { class: 'stack g4' }, h('strong', null, 'Also forget which videos were moved and deleted'), h('span', { class: 'sm mute' }, 'Leave this off if you may come back. Then nothing is moved twice.'))),
      warn, err,
      h('p', { class: 'sm mute' }, 'You can also remove it later in your Google Account settings.'),
      h('div', { class: 'bt' }, no, yes)));
    show();
    d.oncancel = (e) => { if (working) e.preventDefault(); };
    d.onclick = (e) => { if (e.target === d && !working) d.close(); };
    d.onclose = () => { resolve(done); d.remove(); };
    open(d);
    no.focus();
  });
}

/** The lines of "finish first", from finishCounts(): a line whose count is 0 is left out. */
export function finishLines({ done, left, sending }) {
  const one = (n, a, b) => (n === 1 ? a : b);
  return [
    done ? { tone: 'c-safe', icon: 'check', text: `${done} ${one(done, 'moved video is', 'moved videos are')} deleted from Google Photos. Nothing to do.` } : null,
    left ? { tone: 'c-wait', icon: 'info', strong: `${left} ${one(left, 'moved video is', 'moved videos are')} still in Google Photos.`, text: one(left, ' Delete it here first, or the new version may move it again.', ' Delete them here first, or the new version may move them again.') } : null,
    sending ? { tone: 'c-yt', icon: 'clock', strong: `${sending} ${one(sending, 'is', 'are')} still uploading.`, text: one(sending, ' Wait until YouTube has it.', ' Wait until YouTube has them.') } : null,
  ].filter(Boolean);
}

/** "Before switching: finish first". Resolves true for "Show the N". */
export function askFinish(counts, counter) {
  return new Promise((resolve) => {
    const lines = finishLines(counts);
    const later = h('button', { type: 'button', class: 'btn sec', autofocus: true, onclick: () => d.close('no') }, 'Later');
    const d = h('dialog', { class: 'dlg', 'aria-labelledby': 'fin-title' }, h('div', { class: 'in' },
      h('h2', { id: 'fin-title' }, 'Switching to the Web Store version?'),
      h('p', null, 'The new version starts with an empty list. It cannot see what this one did.'),
      lines.length ? h('ul', { class: 'fin' }, lines.map((l) => h('li', null, h('span', { class: l.tone }, icon(l.icon, 22)), h('span', null, l.strong ? h('strong', null, l.strong) : null, l.text))))
        : h('p', { class: 'fin0' }, h('span', { class: 'c-safe' }, icon('check', 22)), h('span', null, 'Nothing left to finish. You can switch.')),
      counter ? h('p', { class: 'sm mute' }, `The ${counter} counter starts again at 0 in the new version.`) : null,
      h('div', { class: 'bt' }, later, counts.left ? h('button', { type: 'button', class: 'btn', 'data-f': 'fin-show', onclick: () => d.close('yes') }, `Show the ${counts.left}`) : null)));
    d.onclick = (e) => { if (e.target === d) d.close('no'); };
    d.onclose = () => { resolve(d.returnValue === 'yes'); d.remove(); };
    open(d);
    later.focus();
  });
}
