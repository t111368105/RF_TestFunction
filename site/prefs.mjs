// Appearance preference.

import { $, read, write } from './ui.mjs';

const media = matchMedia('(prefers-color-scheme: dark)');

function applyTheme() {
  const choice = $('theme').value;
  document.documentElement.dataset.theme = choice === 'system' ? (media.matches ? 'dark' : 'light') : choice;
}

export function initPrefs() {
  const prefs = read('rf.prefs', {});
  $('theme').value = ['system', 'light', 'dark'].includes(prefs.theme) ? prefs.theme : 'system';
  applyTheme();
  media.addEventListener('change', applyTheme);
  $('theme').onchange = () => {
    applyTheme();
    write('rf.prefs', { theme: $('theme').value });
  };
}
