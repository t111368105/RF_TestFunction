// Appearance, calculation animation and haptic feedback preferences.

import { $, read, write } from './ui.mjs';

const media = matchMedia('(prefers-color-scheme: dark)');

function applyTheme() {
  const choice = $('theme').value;
  document.body.dataset.theme = choice === 'system' ? (media.matches ? 'dark' : 'light') : choice;
}

export function initPrefs() {
  const prefs = read('rf.prefs', {});
  $('theme').value = ['system', 'light', 'dark'].includes(prefs.theme) ? prefs.theme : 'system';
  $('animation').checked = prefs.animation !== false;
  $('haptics').checked = prefs.haptics === true;
  applyTheme();
  media.addEventListener('change', applyTheme);
  for (const id of ['theme', 'animation', 'haptics']) {
    $(id).onchange = () => {
      applyTheme();
      write('rf.prefs', {
        theme: $('theme').value,
        animation: $('animation').checked,
        haptics: $('haptics').checked,
      });
    };
  }
}
