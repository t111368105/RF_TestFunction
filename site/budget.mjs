// Link Budget page: input form, results, distance/noise/measurement analysis, save and print.

import {
  labels,
  number,
  invalidIndex,
  budget,
  powerAt,
  noise,
  cascadeNF,
  dataLink,
  convertPower,
  inputWarnings,
  DBD_TO_DBI,
} from './calculations.mjs';
import { $, esc, fmt, fmtRate, notice, read, write, field, table, bindUnit, newId } from './ui.mjs';
import { distanceChart } from './chart.mjs';
import { reportHtml, inputRows, linkOptions, eirpCheck, eirpWarning, STALE_ESTIMATE } from './report.mjs';
import { initMeasurements, showMeasurements, chartMeasurements } from './measurements.mjs';
import { initEstimator, currentEstimate, restoreEstimate, refreshEstimates, surfaceTemperature } from './estimator.mjs';
import { initLossCalculators, currentLossCalcs, restoreLossCalcs, refreshLossCalcs } from './loss-calculators.mjs';
import { LOSS_GROUPS, LOSS_ITEMS, lossItemsOf } from './path-losses.mjs';
import { attachHelp } from './help.mjs';
import { initSlant, currentOrbit } from './slant.mjs';
import { initPass, showPass, showAvailability } from './pass.mjs';
import { skyTemperature } from './satellite.mjs';
import { t, locale } from './i18n.mjs';

const COUNT = labels.length;
const names = [
  'Frequency',
  'Distance',
  'TX power',
  'TX antenna gain',
  'RX antenna gain',
  'RX amplifier gain',
  'TX cable loss',
  'RX cable loss',
  'Receiver sensitivity',
  'Required margin',
].map((name) => t(name));
const units = ['MHz', 'km', 'dBm', 'dBi', 'dBi', 'dB', 'dB', 'dB', 'dBm', 'dB'];
const defaults = ['', '', '', '', '', '0', '0', '0', '', '0'];
const placeholders = ['2.4', '590', '33', '8', '2', '0', '0', '0', '-90', '10'];
// Inputs that may be negative get a ± button for keypads without a minus key.
const SIGNED = [2, 3, 4, 5, 8];
// Form sections in signal-flow order, matching the power breakdown. Value 10 (additional path
// losses) is not an input of its own: it is the sum of the itemized LOSS_ITEMS (path-losses.mjs).
const LAYOUT = { transmitter: [2, 6, 3], path: [0, 1], receiver: [4, 7, 5], requirements: [8, 9] };
const INPUTS = Object.values(LAYOUT).flat();
// Unit selects next to an input: [input id, select id, label, options]. The first option is the default.
const UNIT_SELECTS = [
  ['v0', 'frequency-unit', 'Frequency unit', [['1000', 'GHz'], ['1', 'MHz']]],
  ['v1', 'distance-unit', 'Distance unit', [['1', 'km'], ['0.001', 'm']]],
  ['v2', 'tx-power-unit', 'TX power unit', [['dBm', 'dBm'], ['W', 'W']]],
  ['v3', 'tx-gain-unit', 'TX antenna gain unit', [['dBi', 'dBi'], ['dBd', 'dBd']]],
  ['v4', 'rx-gain-unit', 'RX antenna gain unit', [['dBi', 'dBi'], ['dBd', 'dBd']]],
];
const draftIds = [
  ...INPUTS.map((i) => 'v' + i),
  ...UNIT_SELECTS.map(([, id]) => id),
  ...LOSS_ITEMS.map(({ id }) => id),
  'amp-position',
  'eirp-limit',
];

// Analysis fields stored on the snapshot: [element id, snapshot key].
const META = [
  ['plan-name', 'name'],
  ['notes', 'notes'],
  ['bandwidth', 'bandwidth'],
  ['bandwidth-unit', 'bandwidthUnit'],
  ['noiseFigure', 'noiseFigure'],
  ['requiredSNR', 'requiredSNR'],
  ['antenna-temp', 'antennaTemp'],
  ['amp-nf', 'ampNF'],
  ['rx-nf', 'rxNF'],
  ['data-rate', 'dataRate'],
  ['data-rate-unit', 'dataRateUnit'],
  ['required-ebn0', 'requiredEbN0'],
  ['impl-loss', 'implLoss'],
];

// Defaults for new calculations, also filled into plans saved before a field existed. Bandwidth
// stays in Hz so that older plans, which stored it in Hz, keep their meaning.
const ANALYSIS_DEFAULTS = {
  bandwidth: '1000000',
  bandwidthUnit: '1',
  noiseFigure: '3',
  requiredSNR: '10',
  antennaTemp: '',
  nfFromParts: false,
  ampNF: '',
  rxNF: '',
  dataRate: '',
  dataRateUnit: '1000',
  requiredEbN0: '',
  implLoss: '0',
};

let snapshot = null; // The last calculated link, plus its analysis fields.
// Analysis fields kept from the last calculation while the inputs are incomplete, for the next one.
let carried = null;
let pending = 0; // Timer for the next live calculation.
// Fields the sky noise estimator filled: the attenuation taken from the path and the antenna
// temperature. Each follows its source while it still holds that value.
const sky = { atten: null, temp: null };
let loaded = null; // The saved plan whose parameters are in the form, if any.
let undo = null; // Form state before the last Clear.
const unitResets = []; // Re-sync unit converters after values are set programmatically.

function persist() {
  write('rf.inputs', Object.fromEntries(draftIds.map((id) => [id, $(id).value])));
}

function addUnitSelect(inputId, id, label, options, selected = options[0][0]) {
  const select = Object.assign(document.createElement('select'), {
    id,
    ariaLabel: t(label),
    innerHTML: options
      .map(([value, text]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${t(text)}</option>`)
      .join(''),
  });
  $(inputId).parentElement.append(select);
}

const lossValues = () => LOSS_ITEMS.map(({ id }) => number($(id).value));

/** Link values in base units (MHz, km, dBm, dBi). */
function values() {
  const v = Array.from({ length: COUNT }, (_, i) => (i === 10 ? 0 : number($('v' + i).value)));
  v[0] *= number($('frequency-unit').value);
  v[1] *= number($('distance-unit').value);
  if ($('tx-power-unit').value === 'W') v[2] = convertPower(v[2], false) ?? NaN;
  if ($('tx-gain-unit').value === 'dBd') v[3] += DBD_TO_DBI;
  if ($('rx-gain-unit').value === 'dBd') v[4] += DBD_TO_DBI;
  v[10] = lossValues().reduce((sum, x) => sum + x, 0);
  return v;
}

function updateLossTotal() {
  const total = values()[10];
  $('path-loss-total').textContent = Number.isFinite(total)
    ? t('Total additional path loss: {total} dB', { total: fmt(total) })
    : t('Total additional path loss: check the values above');
}

// The analysis fields and measurements a new calculation keeps from the previous one.
const CARRIED = [...META.map(([, key]) => key), 'nfFromParts', 'measurements', 'measureUnit'];

/** Recalculates shortly after the inputs change, so a burst of changes calculates once. */
function invalidate() {
  updateLossTotal();
  persist();
  clearTimeout(pending);
  pending = setTimeout(() => compute({ live: true }), 120);
}

/** Shows that the inputs are incomplete, keeping the last results dimmed until they are valid again. */
function showIncomplete(message) {
  if (snapshot) {
    syncMeta();
    carried = Object.fromEntries(CARRIED.map((key) => [key, structuredClone(snapshot[key])]));
  }
  snapshot = null;
  for (const id of ['analysis', 'breakdown']) {
    $(id).classList.add('stale');
    $(id).inert = true;
  }
  $('error').textContent = '';
  $('result').innerHTML =
    `<p class="eyebrow">${t('LINK PERFORMANCE')}</p><h2>${t('Check the inputs')}</h2>` + `<p>${esc(message)}</p>`;
}

function unitText(i) {
  const select = UNIT_SELECTS.find(([input]) => input === 'v' + i)?.[1];
  return select ? $(select).selectedOptions[0].textContent : units[i];
}

/** Why link value i is invalid, in the unit the user selected, and the input to focus. */
function fieldProblem(i) {
  if (i === 10) {
    const k = lossValues().findIndex((x) => !Number.isFinite(x) || x < 0);
    if (k < 0) return { el: $(LOSS_ITEMS[0].id), message: t('Additional path losses are too large.') };
    const { id, label } = LOSS_ITEMS[k];
    const raw = $(id).value.trim();
    const name = t('{label} (dB)', { label });
    const message =
      raw === ''
        ? t('Enter {name}; use 0 if there is none.', { name })
        : !Number.isFinite(number(raw))
          ? t('{name} must be a number.', { name })
          : t('{name} cannot be negative.', { name });
    return { el: $(id), message };
  }
  const el = $('v' + i);
  const name = t('{name} ({unit})', { name: names[i], unit: unitText(i) });
  const raw = el.value.trim();
  let message;
  if (raw === '') message = t('Enter {name}.', { name });
  else if (!Number.isFinite(number(raw))) message = t('{name} must be a number, e.g. {example}.', { name, example: placeholders[i] });
  else if (i === 2 && $('tx-power-unit').value === 'W' && number(raw) <= 0) message = t('{name} must be greater than 0.', { name });
  else if (!Number.isFinite(values()[i])) message = t('{name} is too large.', { name });
  else if (i < 2) message = t('{name} must be greater than 0.', { name });
  else message = t('{name} cannot be negative.', { name });
  return { el, message };
}

function showProblem({ el, message }) {
  $('error').textContent = message;
  el.focus();
}

/** The first invalid input as { el, message }, or null. */
function inputProblem() {
  // Checked one by one: a negative item could otherwise hide inside a positive total.
  if (lossValues().some((x) => !Number.isFinite(x) || x < 0)) return fieldProblem(10);
  const v = values();
  try {
    budget(v);
  } catch (err) {
    const i = invalidIndex(v);
    return i >= 0 ? fieldProblem(i) : { el: $('v0'), message: err.message };
  }
  const eirpLimit = $('eirp-limit').value.trim();
  if (eirpLimit && !Number.isFinite(number(eirpLimit))) {
    return { el: $('eirp-limit'), message: t('EIRP limit (dBm) must be a number, or leave it blank.') };
  }
  return null;
}

/**
 * Calculates the link from the form. Live calculations, after each change, only describe a problem;
 * the Calculate button also focuses the field and plays the feedback.
 */
function compute({ live }) {
  clearTimeout(pending);
  const problem = inputProblem();
  if (problem) {
    showIncomplete(problem.message);
    if (!live) showProblem(problem);
    return;
  }
  const v = values();
  const estimate = currentEstimate(v[0], v[1]);
  if (snapshot) syncMeta();
  const kept = snapshot ? Object.fromEntries(CARRIED.map((key) => [key, snapshot[key]])) : carried;
  // Cloned so editing this calculation never changes the loaded plan.
  snapshot = structuredClone({
    ...ANALYSIS_DEFAULTS,
    ...(loaded ?? {}),
    name: loaded?.name ?? '',
    notes: loaded?.notes ?? '',
    ...(kept ?? {}),
    id: newId(),
    date: new Date().toISOString(),
    values: v,
    lossItems: Object.fromEntries(LOSS_ITEMS.map(({ key, id }) => [key, $(id).value.trim()])),
    ampPosition: $('amp-position').value,
    eirpLimit: $('eirp-limit').value.trim(),
    atmosphereEstimate: estimate?.estimate ?? null,
    lossCalcs: currentLossCalcs(),
    atmosphereStale: !!estimate?.stale,
    orbit: currentOrbit(v[1]),
  });
  carried = null;
  for (const id of ['analysis', 'breakdown']) {
    $(id).classList.remove('stale');
    $(id).inert = false;
  }
  $('error').textContent = '';
  showSnapshot();
  if (live) return;
  if ($('animation').checked && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    $('result').classList.remove('pulse');
    void $('result').offsetWidth; // Restart the CSS animation.
    $('result').classList.add('pulse');
  }
  if ($('haptics').checked && navigator.vibrate) navigator.vibrate(30);
}

function calculate(e) {
  e.preventDefault();
  compute({ live: false });
}

function setFormValue(id, value) {
  $(id).value = value;
}

function clearForm() {
  undo = { fields: Object.fromEntries(draftIds.map((id) => [id, $(id).value])), loaded };
  for (const i of INPUTS) setFormValue('v' + i, defaults[i]);
  for (const { id } of LOSS_ITEMS) setFormValue(id, '0');
  setFormValue('eirp-limit', '');
  loaded = null;
  invalidate();
  $('undo').hidden = false;
}

function undoClear() {
  if (!undo) return;
  for (const [id, v] of Object.entries(undo.fields)) setFormValue(id, v);
  loaded = undo.loaded;
  unitResets.forEach((reset) => reset());
  undo = null;
  $('undo').hidden = true;
  invalidate();
}

function resultHtml(r) {
  const metrics = [
    [t('Receiver input'), r.output, 'dBm'],
    [t('RX antenna output'), r.received, 'dBm'],
    [t('Free-space loss'), r.fspl, 'dB'],
    [t('Maximum distance'), r.maxDistance, 'km'],
  ]
    .map(([l, v, u]) => `<div><small>${l}</small><strong>${fmt(v)} ${u}</strong></div>`)
    .join('');
  return (
    `<p class="eyebrow">${t('LINK PERFORMANCE')}</p>` +
    `<p class="status ${r.meets ? '' : 'warn'}">${r.status}</p>` +
    `<p>${t('Link margin')}</p>` +
    `<div class="big">${fmt(r.margin)} <small>dB</small></div>` +
    `<small>${t('Required margin {margin} dB', { margin: fmt(snapshot.values[9]) })}</small>` +
    `<div class="metrics">${metrics}</div>` +
    warnings(r)
      .map((w) => `<p class="status warn">${esc(w)}</p>`)
      .join('')
  );
}

/** Warnings shown with the result: implausible inputs, EIRP over its limit and the near field. */
function warnings(r) {
  const list = inputWarnings(snapshot.values);
  const eirp = eirpCheck(snapshot, r);
  if (eirp?.exceeded) list.push(eirpWarning(eirp));
  if (snapshot.atmosphereStale) list.push(STALE_ESTIMATE);
  const limit = `${fmt(r.farFieldMin * 1000, 3)} m`;
  if (r.nearField) {
    list.push(
      t(
        'Near field: the distance is under 10 wavelengths ({limit}). Free-space loss does not apply here, so these results are unreliable.',
        { limit },
      ),
    );
  } else if (r.maxDistance !== null && r.maxDistance < r.farFieldMin) {
    list.push(t('Maximum distance is under 10 wavelengths ({limit}), in the near field, so it is unreliable.', { limit }));
  }
  return list;
}

function breakdownHtml(r) {
  const stages = r.stages
    .map(
      ([n, o, p], i) =>
        `<div class="stage"><div>${i + 1}. ${n}<small>${esc(o)}</small></div><b>${fmt(p)} dBm</b></div>`,
    )
    .join('');
  return `<h3>${t('Power Breakdown by Stage')}</h3>` + stages;
}

function showSnapshot() {
  const r = budget(snapshot.values, linkOptions(snapshot));
  $('result').innerHTML = resultHtml(r);
  $('breakdown').hidden = false;
  $('breakdown').innerHTML = breakdownHtml(r);
  $('analysis').hidden = false;
  $('calculated-at').textContent = new Date(snapshot.date).toLocaleString(locale);
  $('snapshot-inputs').innerHTML = table([t('Parameter'), t('Value')], inputRows(snapshot));
  for (const [key, value] of Object.entries(ANALYSIS_DEFAULTS)) snapshot[key] ??= value;
  for (const [id, key] of META) $(id).value = snapshot[key] ?? '';
  unitResets.forEach((reset) => reset());
  $('nf-from-parts').checked = !!snapshot.nfFromParts;
  showMeasurements(snapshot);
  drawChart(true);
  showPass(snapshot);
  showAvailability(snapshot);
  followSky();
  updateAnalysis();
}

/**
 * Keeps the sky noise estimator in step: a blank or path-derived attenuation follows the path
 * losses, and an antenna temperature it filled follows the estimator's fields.
 */
function followSky() {
  if (snapshot && ($('sky-atten').value.trim() === '' || $('sky-atten').value === sky.atten)) {
    $('sky-atten').value = sky.atten = pathAbsorption();
  }
  if (sky.temp !== null && $('antenna-temp').value === sky.temp) skyCalculate(true);
}

/** The atmospheric and cloud losses of the shown calculation (dB), as text. */
function pathAbsorption() {
  const items = lossItemsOf(snapshot);
  const total = number(items.atmospheric) + number(items.cloud);
  return Number.isFinite(total) ? String(Number(total.toFixed(3))) : '';
}

/** Copies the analysis fields from the page into the snapshot. */
function syncMeta() {
  if (!snapshot) return;
  for (const [id, key] of META) snapshot[key] = $(id).value;
  snapshot.nfFromParts = $('nf-from-parts').checked;
}

/** In component mode, derives the total NF from the RX cable, amplifier and receiver. */
function updateNoiseFigure() {
  const fromParts = snapshot.nfFromParts;
  $('amp-nf').closest('label').hidden = !fromParts;
  $('rx-nf').closest('label').hidden = !fromParts;
  $('noiseFigure').readOnly = fromParts;
  if (!fromParts) return true;
  const v = snapshot.values;
  const nf = cascadeNF(v[7], v[5], number(snapshot.ampNF), number(snapshot.rxNF), linkOptions(snapshot).ampFirst);
  snapshot.noiseFigure = nf === null ? '' : String(Number(nf.toFixed(4)));
  $('noiseFigure').value = snapshot.noiseFigure;
  return nf !== null;
}

/** Antenna noise temperature in K; blank means the 290 K reference. NaN when invalid. */
function antennaTemp() {
  const raw = snapshot.antennaTemp.trim();
  return raw === '' ? 290 : number(raw);
}

function noiseError(partsValid) {
  if (!partsValid) return t('Enter non-negative amplifier and receiver noise figures.');
  const ta = antennaTemp();
  if (!Number.isFinite(ta) || ta < 0) return t('Enter a non-negative antenna noise temperature, or leave it blank for 290 K.');
  return t('Enter a positive bandwidth, a non-negative NF and a finite required SNR.');
}

function updateAnalysis() {
  if (!snapshot) return;
  syncMeta();
  const partsValid = updateNoiseFigure();
  const v = snapshot.values;
  const n = noise(
    v,
    number(snapshot.bandwidth) * number(snapshot.bandwidthUnit),
    number(snapshot.noiseFigure),
    number(snapshot.requiredSNR),
    antennaTemp(),
  );
  $('noise-results').innerHTML = n
    ? table(
        [t('Item'), t('Result')],
        [
          [t('System noise temperature'), `${fmt(n.tsys, 1)} K`],
          [t('Input-referred noise'), fmt(n.floor) + ' dBm'],
          [t('Estimated SNR'), fmt(n.snr) + ' dB'],
          [t('SNR margin'), fmt(n.margin) + ' dB'],
          [t('Verdict'), n.margin >= 0 ? t('SNR target met') : t('SNR target not met')],
          [
            t('Equivalent receiver sensitivity'),
            t('{value} dBm (entered {entered} dBm, difference {difference} dB)', {
              value: fmt(n.sensitivity),
              entered: fmt(v[8]),
              difference: fmt(v[8] - n.sensitivity),
            }),
          ],
          [t('Receive G/T'), `${fmt(n.gOverT)} dB/K`],
        ],
      )
    : `<p class="error">${noiseError(partsValid)}</p>`;
  $('data-results').innerHTML = dataLinkHtml();
}

function dataLinkHtml() {
  const s = snapshot;
  const rate = number(s.dataRate) * number(s.dataRateUnit);
  const required = number(s.requiredEbN0);
  const implLoss = number(s.implLoss);
  const d = dataLink(s.values, number(s.noiseFigure), rate, required, implLoss, antennaTemp());
  if (!d) return `<p class="error">${t('Enter a valid noise figure and antenna noise temperature above.')}</p>`;

  const rateNote = s.dataRate.trim() === '' ? t('Enter a data rate') : t('Enter a positive data rate');
  const targetNote =
    s.requiredEbN0.trim() === ''
      ? t('Enter the required Eb/N₀')
      : t('Enter a finite required Eb/N₀ and a non-negative implementation loss');
  const rows = [
    ['C/N₀', fmt(d.cn0) + ' dB-Hz'],
    ['Eb/N₀', d.ebn0 === null ? rateNote : fmt(d.ebn0) + ' dB'],
    [t('Eb/N₀ margin'), d.margin === null ? (d.ebn0 === null ? rateNote : targetNote) : fmt(d.margin) + ' dB'],
  ];
  if (d.margin !== null) {
    rows.push([t('Verdict'), d.margin >= 0 ? t('Data rate supported') : t('Data rate not supported')]);
  }
  rows.push([t('Maximum data rate'), d.maxRate === null ? targetNote : fmtRate(d.maxRate)]);
  return table([t('Item'), t('Result')], rows);
}

let chartCursorAt = null;

/** Redraws the chart; the slider returns to the link distance only when resetSlider is true. */
function drawChart(resetSlider) {
  const measured = chartMeasurements(snapshot);
  const { svg, lo, hi, center, maxDistance, cursorAt } = distanceChart(snapshot.values, measured);
  chartCursorAt = cursorAt;
  $('chart').innerHTML = svg;
  $('max-distance').textContent = t('Maximum distance {distance} km', { distance: fmt(maxDistance, 5) });
  $('legend-measured').hidden = !measured.points.length;
  $('legend-fit').hidden = !measured.fit;
  if (measured.fit) $('legend-fit').textContent = t('╌ Fitted, n = {n}', { n: fmt(measured.fit.n, 2) });
  const slider = $('distance-slider');
  const previous = number(slider.value);
  slider.min = lo;
  slider.max = hi;
  slider.value = resetSlider ? center : previous;
  inspectDistance();
}

function inspectDistance() {
  if (!snapshot) return;
  const log = number($('distance-slider').value);
  const d = 10 ** log;
  const { x, y } = chartCursorAt(log);
  const cursor = $('chart-cursor');
  cursor.querySelector('line').setAttribute('x1', x);
  cursor.querySelector('line').setAttribute('x2', x);
  cursor.querySelector('circle').setAttribute('cx', x);
  cursor.querySelector('circle').setAttribute('cy', y);
  const near = d < budget(snapshot.values).farFieldMin ? ' ' + t('(near field, unreliable)') : '';
  $('distance-readout').textContent =
    t('Distance {distance} km → receiver input {power} dBm', { distance: fmt(d, 6), power: fmt(powerAt(snapshot.values, d)) }) +
    near;
}

function save(addPlan) {
  if (!snapshot) return;
  syncMeta();
  const p = structuredClone(snapshot);
  p.id = newId();
  p.name = p.name.trim() || t('Untitled link');
  if (addPlan(p)) notice(t('Saved "{name}"', { name: p.name }));
}

function print() {
  if (!snapshot) return;
  syncMeta();
  $('print-report').innerHTML = reportHtml(snapshot, document.querySelector('.assumptions').textContent);
  window.print();
}

/** Puts a saved plan's parameters into the form, in base units (MHz, km, dBm, dBi). */
export function loadPlan(p) {
  loaded = structuredClone(p);
  for (const [, id, , options] of UNIT_SELECTS) setFormValue(id, id === 'frequency-unit' ? '1' : options[0][0]);
  unitResets.forEach((reset) => reset());
  for (const i of INPUTS) setFormValue('v' + i, p.values[i]);
  const items = lossItemsOf(p);
  for (const { key, id } of LOSS_ITEMS) setFormValue(id, items[key]);
  setFormValue('amp-position', p.ampPosition === 'before' ? 'before' : 'after');
  setFormValue('eirp-limit', p.eirpLimit ?? '');
  restoreEstimate(p.atmosphereEstimate);
  restoreLossCalcs(p.lossCalcs);
  snapshot = null;
  carried = null;
  updateLossTotal();
  persist();
  compute({ live: true });
}

/** Shows a saved plan's results and analysis without recalculating. */
export function analyzePlan(p) {
  showCalculation(p);
  $('analysis').scrollIntoView();
}

/** Shows a calculation (a saved plan or a carried-over snapshot) without recalculating. */
export function showCalculation(p) {
  snapshot = structuredClone(p);
  for (const id of ['analysis', 'breakdown']) {
    $(id).classList.remove('stale');
    $(id).inert = false;
  }
  showSnapshot();
}

/** The current calculation with its analysis fields, or null. */
export function currentSnapshot() {
  syncMeta();
  return snapshot && structuredClone(snapshot);
}

function buildForm() {
  for (const [group, indices] of Object.entries(LAYOUT)) {
    $(group).insertAdjacentHTML(
      'beforeend',
      indices
        .map((i) =>
          field(
            'v' + i,
            names[i],
            defaults[i],
            UNIT_SELECTS.some(([input]) => input === 'v' + i) ? '' : units[i],
            `placeholder="${t('e.g. {value}', { value: placeholders[i] })}"`,
            SIGNED.includes(i),
          ),
        )
        .join(''),
    );
  }
  for (const [input, id, label, options] of UNIT_SELECTS) addUnitSelect(input, id, label, options);
  for (const group of LOSS_GROUPS) {
    $(`losses-${group.id}`).insertAdjacentHTML(
      'beforeend',
      LOSS_ITEMS.filter((item) => item.group === group.id)
        .map(({ id, label }) => field(id, label, '0', 'dB', 'placeholder="0"'))
        .join(''),
    );
  }
  // Each single-field calculator sits under its own field, in the same grid cell.
  const calculators = [
    ['v1', 'slant-calc'],
    ['loss-polarization', 'pol-calc'],
    ['loss-pointing', 'point-calc'],
    ...[
      'atmospheric',
      'cloud',
      'tropo-scintillation',
      'iono-scintillation',
      'iono-absorption',
      'radome',
      'vegetation',
      'building',
      'clutter',
      'diffraction',
      'multipath',
    ].map((key) => [
      'loss-' + key,
      'calc-' + key,
    ]),
  ];
  for (const [input, calculator] of calculators) {
    const label = $(input).closest('label');
    const cell = Object.assign(document.createElement('div'), { className: 'loss-cell' });
    label.replaceWith(cell);
    cell.append(label, $(calculator));
  }
  $('receiver').insertAdjacentHTML(
    'beforeend',
    `<label for="amp-position" class="span">${t('RX amplifier position')}<select id="amp-position">` +
      `<option value="after">${t('After the RX cable, at the receiver')}</option>` +
      `<option value="before">${t('Before the RX cable, at the antenna (masthead LNA)')}</option></select></label>`,
  );
  $('requirements').insertAdjacentHTML(
    'beforeend',
    field('eirp-limit', t('EIRP limit (optional)'), '', 'dBm', `placeholder="${t('e.g. {value}', { value: 36 })}"`, true),
  );
}

function buildAnalysisFields() {
  const example = (value) => `placeholder="${t('e.g. {value}', { value })}"`;
  const noiseFields = [
    ['bandwidth', t('Bandwidth'), '1000000', '', example(1)],
    ['requiredSNR', t('Required SNR'), '10', 'dB', '', true],
    ['antenna-temp', t('Antenna noise temperature (optional)'), '', 'K', 'placeholder="290"'],
    ['amp-nf', t('RX amplifier noise figure'), '', 'dB', example(1)],
    ['rx-nf', t('Receiver noise figure'), '', 'dB', example(6)],
    ['noiseFigure', t('Total system noise figure'), '3', 'dB'],
  ];
  $('noise-fields').insertAdjacentHTML(
    'beforeend',
    noiseFields.slice(0, 3).map((f) => field(...f)).join('') +
      '<label class="span"><input type="checkbox" id="nf-from-parts"> ' +
      `${t('Calculate total NF from the RX cable loss, amplifier and receiver')}</label>` +
      noiseFields.slice(3).map((f) => field(...f)).join(''),
  );
  addUnitSelect('bandwidth', 'bandwidth-unit', 'Bandwidth unit', [['1', 'Hz'], ['1000', 'kHz'], ['1000000', 'MHz']]);
  $('data-fields').insertAdjacentHTML(
    'beforeend',
    field('data-rate', t('Data rate'), '', '', example(9.6)) +
      field('required-ebn0', t('Required Eb/N₀'), '', 'dB', example(9.6), true) +
      field('impl-loss', t('Implementation loss'), '0', 'dB', example(2)),
  );
  addUnitSelect(
    'data-rate',
    'data-rate-unit',
    'Data rate unit',
    [['1', 'bit/s'], ['1000', 'kbit/s'], ['1000000', 'Mbit/s']],
    '1000',
  );
  buildSkyCalculator();
}

/** The sky noise estimator under the antenna noise temperature field. */
function buildSkyCalculator() {
  const label = $('antenna-temp').closest('label');
  const cell = Object.assign(document.createElement('div'), { className: 'loss-cell' });
  label.replaceWith(cell);
  cell.append(label, $('sky-calc'));
  $('sky-calc-fields').insertAdjacentHTML(
    'beforeend',
    field('sky-atten', t('Atmospheric attenuation A'), '', 'dB', `placeholder="${t('e.g. {value}', { value: 2 })}"`) +
      field('sky-tmr', t('Mean radiating temperature T_mr'), '275', 'K', '') +
      field('sky-ground', t('Ground pickup T_g'), '0', 'K', ''),
  );
  $('sky-calc-path').onclick = () => {
    if (!snapshot) return;
    $('sky-atten').value = sky.atten = pathAbsorption();
    followSky();
  };
  $('sky-calc-run').onclick = () => skyCalculate(false);
  for (const id of ['sky-atten', 'sky-tmr', 'sky-ground']) {
    $(id).addEventListener('input', () => {
      if (sky.temp !== null && $('antenna-temp').value === sky.temp) skyCalculate(true);
    });
  }
}

/** Fills the antenna temperature from the sky noise fields; quiet skips invalid fields silently. */
function skyCalculate(quiet) {
  const out = $('sky-calc-result');
  const a = number($('sky-atten').value);
  const tmr = number($('sky-tmr').value);
  const ground = number($('sky-ground').value);
  if (!(a >= 0 && tmr > 0 && ground >= 0)) {
    if (!quiet) {
      out.innerHTML = `<p class="error">${t('Enter an attenuation of 0 dB or more, a positive T_mr and a ground pickup of 0 K or more.')}</p>`;
    }
    return;
  }
  const skyK = skyTemperature(a, tmr);
  const total = String(Number((skyK + ground).toFixed(1)));
  sky.temp = total;
  if ($('antenna-temp').value !== total) {
    $('antenna-temp').value = total;
    $('antenna-temp').dispatchEvent(new Event('input'));
  }
  const ts = surfaceTemperature();
  out.innerHTML =
    `<p>${t('Sky {sky} K + ground {ground} K = {total} K, filled in above.', { sky: fmt(skyK, 1), ground: fmt(ground, 1), total })}</p>` +
    (ts === null
      ? ''
      : `<p class="hint">${t('In clear or cloudy weather at {temperature} °C, T_mr ≈ {tmr} K.', {
          temperature: fmt(ts),
          tmr: fmt(37.34 + 0.81 * (ts + 273.15), 1),
        })}</p>`);
}

const powerUnits = (value, from, to) => (from === to ? value : convertPower(value, to === 'W'));
const gainUnits = (value, from, to) => value + (from === 'dBd' ? DBD_TO_DBI : 0) - (to === 'dBd' ? DBD_TO_DBI : 0);

/** addPlan(plan) stores a new plan and returns whether it was saved. */
export function initBudget({ addPlan }) {
  buildForm();

  // Restore the draft before binding units so the converters start from the restored units.
  const saved = read('rf.inputs', {});
  // Drafts from before itemized losses kept the single total in v10.
  if (typeof saved.v10 === 'string' && saved['loss-other'] === undefined) saved['loss-other'] = saved.v10;
  for (const [id, v] of Object.entries(saved)) {
    if ($(id) && typeof v === 'string' && draftIds.includes(id)) $(id).value = v;
  }
  if (![...$('amp-position').options].some((o) => o.selected)) $('amp-position').value = 'after';

  for (const id of draftIds) $(id).addEventListener('input', invalidate);
  $('amp-position').addEventListener('change', invalidate);
  const converters = { 'tx-power-unit': powerUnits, 'tx-gain-unit': gainUnits, 'rx-gain-unit': gainUnits };
  for (const [input, id] of UNIT_SELECTS) unitResets.push(bindUnit(id, input, invalidate, converters[id]));

  const link = () => {
    const v = values();
    return { fMHz: v[0], distanceKm: v[1] };
  };
  const fill = (id, value) => {
    $(id).value = value;
    $(id).dispatchEvent(new Event('input'));
  };
  initLossCalculators({ link, fill });
  initEstimator({ link, fill });
  initSlant({ fill });
  attachHelp();
  // Calculated losses follow the link frequency and distance; estimator.mjs refreshes them for its
  // own conditions.
  const refresh = () => {
    const l = link();
    refreshEstimates(l, fill);
    refreshLossCalcs(l.fMHz, fill);
  };
  for (const id of ['v0', 'v1', 'frequency-unit', 'distance-unit']) $(id).addEventListener('input', refresh);
  for (const id of ['frequency-unit', 'distance-unit']) $(id).addEventListener('change', refresh);

  $('budget-form').onsubmit = calculate;
  $('clear').onclick = clearForm;
  $('undo').onclick = undoClear;
  updateLossTotal();

  buildAnalysisFields();
  attachHelp();
  initPass();
  unitResets.push(bindUnit('bandwidth-unit', 'bandwidth', updateAnalysis));
  unitResets.push(bindUnit('data-rate-unit', 'data-rate', updateAnalysis));
  for (const [id] of META) $(id).oninput = updateAnalysis;
  $('nf-from-parts').onchange = updateAnalysis;
  initMeasurements(() => drawChart(false));

  $('distance-slider').oninput = inspectDistance;
  $('save').onclick = () => save(addPlan);
  $('pdf').onclick = print;
  compute({ live: true });
}
