// Power Converter and Doppler Shift pages.

import { number, convertPower, doppler } from './calculations.mjs';
import { $, fmt, read, write, bindUnit } from './ui.mjs';
import { t } from './i18n.mjs';

const toolIds = [
  'power-direction',
  'power-input',
  'doppler-frequency',
  'doppler-frequency-unit',
  'doppler-speed',
  'doppler-speed-unit',
  'motion',
];

function persistTools() {
  write('rf.tools', Object.fromEntries(toolIds.map((id) => [id, $(id).value])));
}

function powerResult() {
  const toWatts = $('power-direction').value === 'watts';
  const v = convertPower(number($('power-input').value), toWatts);
  $('power-label').textContent = t('Input power ({unit})', { unit: toWatts ? 'dBm' : 'W' });
  $('power-result').innerHTML =
    `<p class="eyebrow">${t('CONVERTED POWER')}</p>` +
    `<div class="big">${v === null ? '— —' : fmt(v, 10)}</div>` +
    `<p>${toWatts ? 'W' : 'dBm'}</p>` +
    (v === null
      ? `<small>${t('Enter a valid power; W must be greater than zero and the result must be finite.')}</small>`
      : '');
  persistTools();
}

function dopplerResult() {
  const scale = number($('doppler-frequency-unit').value);
  const speed = number($('doppler-speed').value);
  const f = number($('doppler-frequency').value) * scale;
  const v = speed * number($('doppler-speed-unit').value) * number($('motion').value);
  const r = speed >= 0 ? doppler(f, v) : null;
  const unit = $('doppler-frequency-unit').selectedOptions[0]?.textContent ?? 'Hz';

  let html = `<p class="eyebrow">${t('FREQUENCY OFFSET')}</p>`;
  if (r) {
    const direction =
      r.shift === 0
        ? t('No radial motion, no frequency shift.')
        : r.shift > 0
          ? t('Approaching: received frequency increases.')
          : t('Receding: received frequency decreases.');
    html +=
      `<div class="big">${(r.shift > 0 ? '+' : '') + fmt(r.shift, 9)}</div>` +
      `<p>Hz · ${fmt(r.shift / 1000, 9)} kHz</p>` +
      `<hr><p>${t('Received frequency')}</p>` +
      `<h2 class="mono">${fmt(r.received / scale, 12)} ${unit}</h2>` +
      `<p>${direction}</p>`;
  } else {
    html +=
      '<div class="big">— —</div><p>Hz </p>' +
      `<small>${t('Enter a positive frequency and a non-negative radial velocity between 0 and 2,997.92458 km/s.')}</small>`;
  }
  $('doppler-result').innerHTML = html;
  persistTools();
}

export function initTools() {
  const saved = read('rf.tools', {});
  for (const id of toolIds) if (typeof saved[id] === 'string') $(id).value = saved[id];

  // Power: each direction remembers its own last input.
  const powerInputs = read('rf.powerInputs', { watts: '', dbm: '' });
  let direction = $('power-direction').value;
  $('power-input').oninput = powerResult;
  $('power-input').addEventListener('input', () => {
    powerInputs[$('power-direction').value] = $('power-input').value;
    write('rf.powerInputs', powerInputs);
  });
  $('power-direction').onchange = () => {
    powerInputs[direction] = $('power-input').value;
    direction = $('power-direction').value;
    $('power-input').value = powerInputs[direction] ?? '';
    powerResult();
  };
  $('power-clear').onclick = () => {
    $('power-input').value = '';
    powerInputs[direction] = '';
    write('rf.powerInputs', powerInputs);
    powerResult();
  };

  bindUnit('doppler-frequency-unit', 'doppler-frequency', dopplerResult);
  bindUnit('doppler-speed-unit', 'doppler-speed', dopplerResult);
  for (const id of ['doppler-frequency', 'doppler-speed']) $(id).oninput = dopplerResult;
  $('motion').onchange = dopplerResult;
  $('doppler-clear').onclick = () => {
    $('doppler-frequency').value = '';
    $('doppler-speed').value = '';
    dopplerResult();
  };

  powerResult();
  dopplerResult();
}
