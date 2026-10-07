// Shared DOM, formatting and storage helpers.

import { number } from './calculations.mjs';
import { t } from './i18n.mjs';

export const $ = (id) => document.getElementById(id);

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ENTITIES[c]);

export function fmt(x, digits = 2) {
  if (x == null || !Number.isFinite(x)) return t('Out of range');
  if (x !== 0 && (Math.abs(x) < 0.001 || Math.abs(x) >= 1e9)) return x.toExponential(6);
  return x.toLocaleString('en-US', { maximumFractionDigits: digits });
}

/** Random id; randomUUID only exists in secure contexts (https or localhost), not plain-http LAN hosts. */
export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Formats a bit rate with the largest fitting unit. */
export function fmtRate(bps) {
  const [scale, unit] = bps >= 1e6 ? [1e6, 'Mbit/s'] : bps >= 1e3 ? [1e3, 'kbit/s'] : [1, 'bit/s'];
  return `${fmt(bps / scale, 4)} ${unit}`;
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
    notice(t('Unable to save: browser storage is full or unavailable.'));
    return false;
  }
}

/** signed adds a ± button for values that can be negative (see signButton). */
export function field(id, title, value, unit = '', extra = '', signed = false) {
  const suffix = unit ? `<span>${unit}</span>` : '';
  return (
    `<label for="${id}">${title}<div class="input-unit">` +
    `<input id="${id}" inputmode="decimal" value="${esc(value)}" ${extra}>${signed ? signButton(id) : ''}${suffix}</div></label>`
  );
}

/**
 * Touch decimal keypads (notably iOS) have no minus key, so fields that can be negative get a ±
 * button. It is only shown for coarse pointers; see .sign in style.css.
 */
export function signButton(id, label = t('Toggle minus sign')) {
  return `<button type="button" class="sign" data-sign-for="${id}" aria-label="${esc(label)}">±</button>`;
}

function toggleSign(input) {
  const v = input.value.trim();
  input.value = v.startsWith('-') ? v.slice(1) : '-' + v.replace(/^\+/, '');
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Handles every ± button on the page, including ones rendered later. */
export function initSignButtons() {
  // Keep focus (and the on-screen keyboard) on the field while the button is pressed.
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('[data-sign-for]')) e.preventDefault();
  });
  document.addEventListener('click', (e) => {
    const button = e.target.closest('[data-sign-for]');
    if (!button) return;
    const input = button.dataset.signFor
      ? document.getElementById(button.dataset.signFor)
      : button.parentElement.querySelector('input');
    if (input) toggleSign(input);
  });
}

export function table(head, rows) {
  const th = head.map((x) => `<th>${esc(x)}</th>`).join('');
  const tr = rows.map((row) => `<tr>${row.map((x) => `<td>${esc(x)}</td>`).join('')}</tr>`).join('');
  return `<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

/** Default converter for bindUnit: option values are scale factors to a base unit. */
function scaleUnits(value, from, to) {
  const converted = value * (number(from) / number(to));
  return value !== 0 && converted === 0 ? null : converted; // Underflow.
}

/**
 * Keeps an input's physical value when its unit <select> changes. convert(value, fromUnit, toUnit)
 * receives the option values and returns the converted number, or null when it has no equivalent.
 * Returns a function that re-reads the current unit after a programmatic change.
 */
export function bindUnit(selectId, inputId, onChange, convert = scaleUnits) {
  const select = $(selectId);
  let old = select.value;
  select.addEventListener('change', () => {
    const value = number($(inputId).value);
    const next = select.value;
    if (Number.isFinite(value)) {
      const converted = convert(value, old, next);
      $(inputId).value = Number.isFinite(converted) ? String(Number(converted.toPrecision(15))) : '';
    }
    old = next;
    onChange();
  });
  return () => (old = select.value);
}
