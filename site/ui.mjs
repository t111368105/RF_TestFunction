// Shared DOM, formatting and storage helpers.

import { number } from './calculations.mjs';

export const $ = (id) => document.getElementById(id);

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ENTITIES[c]);

export function fmt(x, digits = 2) {
  if (x == null || !Number.isFinite(x)) return 'Out of range';
  if (x !== 0 && (Math.abs(x) < 0.001 || Math.abs(x) >= 1e9)) return x.toExponential(6);
  return x.toLocaleString('en-US', { maximumFractionDigits: digits });
}

let noticeTimer;
export function notice(message) {
  $('notice').textContent = message;
  $('notice').hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => ($('notice').hidden = true), 5500);
}

export function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    notice('Unable to save: browser storage is full or unavailable.');
    return false;
  }
}

export function field(id, title, value, unit = '', extra = '') {
  const suffix = unit ? `<span>${unit}</span>` : '';
  return (
    `<label for="${id}">${title}<div class="input-unit">` +
    `<input id="${id}" inputmode="decimal" value="${esc(value)}" ${extra}>${suffix}</div></label>`
  );
}

export function table(head, rows) {
  const th = head.map((x) => `<th>${esc(x)}</th>`).join('');
  const tr = rows.map((row) => `<tr>${row.map((x) => `<td>${esc(x)}</td>`).join('')}</tr>`).join('');
  return `<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

/**
 * Keeps an input's physical value when its unit <select> changes (the option values are scale
 * factors). Returns a function that re-reads the current unit after a programmatic change.
 */
export function bindUnit(selectId, inputId, onChange) {
  const select = $(selectId);
  let old = number(select.value);
  select.addEventListener('change', () => {
    const value = number($(inputId).value);
    const next = number(select.value);
    if (Number.isFinite(value)) {
      const converted = value * (old / next);
      const ok = Number.isFinite(converted) && !(value !== 0 && converted === 0);
      $(inputId).value = ok ? String(Number(converted.toPrecision(15))) : '';
    }
    old = next;
    onChange();
  });
  return () => (old = number(select.value));
}
