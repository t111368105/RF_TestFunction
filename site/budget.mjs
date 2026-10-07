// Link Budget page: input form, results, distance/noise/measurement analysis, save and print.

import { labels, number, invalidIndex, budget, powerAt, noise } from './calculations.mjs';
import { $, esc, fmt, notice, read, write, field, table, bindUnit, newId } from './ui.mjs';
import { distanceChart } from './chart.mjs';
import { reportHtml } from './report.mjs';

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
];
const units = ['MHz', 'km', 'dBm', 'dBi', 'dBi', 'dB', 'dB', 'dB', 'dBm', 'dB'];
const defaults = ['', '', '', '', '', '0', '0', '0', '', '0'];
const placeholders = ['2.4', '1', '20', '2', '2', '0', '0', '0', '-90', '10'];
const inputIds = Array.from({ length: COUNT }, (_, i) => 'v' + i);
const draftIds = [...inputIds, 'frequency-unit', 'distance-unit'];

// Analysis fields stored on the snapshot: [element id, snapshot key].
const META = [
  ['plan-name', 'name'],
  ['notes', 'notes'],
  ['measured', 'measured'],
  ['bandwidth', 'bandwidth'],
  ['noiseFigure', 'noiseFigure'],
  ['requiredSNR', 'requiredSNR'],
];

let snapshot = null; // The last calculated link, plus its analysis fields.
let loaded = null; // The saved plan whose parameters are in the form, if any.
let undo = null; // Form state before the last Clear.
let resetFrequencyUnit;
let resetDistanceUnit;

function groupOf(i) {
  return i < 2 ? 'propagation' : i < 5 ? 'antenna' : i < 8 ? 'losses' : 'requirements';
}

function unitSelect(id, label, options) {
  return Object.assign(document.createElement('select'), { id, ariaLabel: label, innerHTML: options });
}

function persist() {
  write('rf.inputs', Object.fromEntries(draftIds.map((id) => [id, $(id).value])));
}

/** Link values in base units (MHz, km). */
function values() {
  return Array.from({ length: COUNT }, (_, i) => {
    const scale = i === 0 ? number($('frequency-unit').value) : i === 1 ? number($('distance-unit').value) : 1;
    return number($('v' + i).value) * scale;
  });
}

function invalidate() {
  snapshot = null;
  $('analysis').hidden = true;
  $('breakdown').hidden = true;
  $('error').textContent = '';
  $('result').innerHTML =
    '<p class="eyebrow">LINK PERFORMANCE</p><h2>Awaiting calculation</h2>' +
    '<p>Parameters have changed. Press "Calculate Link Budget".</p>';
  persist();
}

/** Explains why input i is invalid, in the unit the user selected. */
function fieldError(i) {
  const unitSelect = { 0: 'frequency-unit', 1: 'distance-unit' }[i];
  const unit = unitSelect ? $(unitSelect).selectedOptions[0].textContent : units[i];
  const name = `${names[i]} (${unit})`;
  const raw = $('v' + i).value.trim();
  if (raw === '') return `Enter ${name}.`;
  if (!Number.isFinite(number(raw))) return `${name} must be a number, e.g. ${placeholders[i]}.`;
  if (!Number.isFinite(values()[i])) return `${name} is too large.`;
  if (i < 2) return `${name} must be greater than 0.`;
  return `${name} cannot be negative.`;
}

function calculate(e) {
  e.preventDefault();
  try {
    const v = values();
    budget(v);
    snapshot = {
      ...(loaded ?? {}),
      id: newId(),
      date: new Date().toISOString(),
      values: v,
      name: loaded?.name ?? '',
      notes: loaded?.notes ?? '',
      bandwidth: loaded?.bandwidth ?? '1000000',
      noiseFigure: loaded?.noiseFigure ?? '3',
      requiredSNR: loaded?.requiredSNR ?? '10',
      measured: loaded?.measured ?? '',
    };
    $('error').textContent = '';
    showSnapshot();
    if ($('animation').checked && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      $('result').classList.remove('pulse');
      void $('result').offsetWidth; // Restart the CSS animation.
      $('result').classList.add('pulse');
    }
    if ($('haptics').checked && navigator.vibrate) navigator.vibrate(30);
  } catch (err) {
    const i = invalidIndex(values());
    $('error').textContent = i >= 0 ? fieldError(i) : err.message;
    if (i >= 0) {
      const el = $('v' + i);
      const detail = el.closest('details');
      if (detail) detail.open = true;
      el.focus();
    }
  }
}

function clearForm() {
  undo = { fields: Object.fromEntries(draftIds.map((id) => [id, $(id).value])), loaded };
  for (let i = 0; i < COUNT; i++) $('v' + i).value = defaults[i];
  loaded = null;
  invalidate();
  $('undo').hidden = false;
}

function undoClear() {
  if (!undo) return;
  for (const [id, v] of Object.entries(undo.fields)) $(id).value = v;
  loaded = undo.loaded;
  resetFrequencyUnit();
  resetDistanceUnit();
  undo = null;
  $('undo').hidden = true;
  invalidate();
}

function resultHtml(r) {
  const metrics = [
    ['Receiver input', r.output, 'dBm'],
    ['RX antenna output', r.received, 'dBm'],
    ['Free-space loss', r.fspl, 'dB'],
    ['Maximum distance', r.maxDistance, 'km'],
  ]
    .map(([l, v, u]) => `<div><small>${l}</small><strong>${fmt(v)} ${u}</strong></div>`)
    .join('');
  return (
    '<p class="eyebrow">LINK PERFORMANCE</p>' +
    `<p class="status ${r.meets ? '' : 'warn'}">${r.status}</p>` +
    '<p>Link margin</p>' +
    `<div class="big">${fmt(r.margin)} <small>dB</small></div>` +
    `<small>Required margin ${fmt(snapshot.values[9])} dB</small>` +
    `<div class="metrics">${metrics}</div>`
  );
}

function breakdownHtml(r) {
  const stages = r.stages
    .map(
      ([n, o, p], i) =>
        `<div class="stage"><div>${i + 1}. ${n}<small>${esc(o)}</small></div><b>${fmt(p)} dBm</b></div>`,
    )
    .join('');
  return '<h3>Seven-Stage Power Breakdown</h3>' + stages;
}

function showSnapshot() {
  const r = budget(snapshot.values);
  $('result').innerHTML = resultHtml(r);
  $('breakdown').hidden = false;
  $('breakdown').innerHTML = breakdownHtml(r);
  $('analysis').hidden = false;
  $('calculated-at').textContent = new Date(snapshot.date).toLocaleString();
  $('snapshot-inputs').innerHTML = table(
    ['Parameter', 'Value'],
    labels.map((l, i) => [l, fmt(snapshot.values[i], 7)]),
  );
  for (const [id, key] of META) $(id).value = snapshot[key] ?? '';
  drawChart();
  updateAnalysis();
}

/** Copies the analysis fields from the page into the snapshot. */
function syncMeta() {
  if (!snapshot) return;
  for (const [id, key] of META) snapshot[key] = $(id).value;
}

function updateAnalysis() {
  if (!snapshot) return;
  syncMeta();
  const n = noise(
    snapshot.values,
    number(snapshot.bandwidth),
    number(snapshot.noiseFigure),
    number(snapshot.requiredSNR),
  );
  $('noise-results').innerHTML = n
    ? table(
        ['Item', 'Result'],
        [
          ['Input-referred noise', fmt(n.floor) + ' dBm'],
          ['Estimated SNR', fmt(n.snr) + ' dB'],
          ['SNR margin', fmt(n.margin) + ' dB'],
          ['Verdict', n.margin >= 0 ? 'SNR target met' : 'SNR target not met'],
        ],
      )
    : '<p class="error">Enter a positive bandwidth, a non-negative NF and a finite required SNR.</p>';

  const delta = number(snapshot.measured) - budget(snapshot.values).output;
  let text;
  if (snapshot.measured.trim() === '') text = 'No measured value entered yet';
  else if (!Number.isFinite(delta)) text = 'Enter a finite power within range.';
  else {
    const verdict =
      delta < 0
        ? 'Measured is lower; this may include unmodeled losses or measurement differences.'
        : 'Measured meets or exceeds the prediction.';
    text = `Measured − predicted: ${fmt(delta)} dB. ${verdict}`;
  }
  $('measurement').textContent = text;
}

function drawChart() {
  const { svg, lo, hi, center, maxDistance } = distanceChart(snapshot.values);
  $('chart').innerHTML = svg;
  $('max-distance').textContent = 'Maximum distance ' + fmt(maxDistance, 5) + ' km';
  const slider = $('distance-slider');
  slider.min = lo;
  slider.max = hi;
  slider.value = center;
  inspectDistance();
}

function inspectDistance() {
  if (!snapshot) return;
  const d = 10 ** number($('distance-slider').value);
  $('distance-readout').textContent =
    `Distance ${fmt(d, 6)} km → receiver input ${fmt(powerAt(snapshot.values, d))} dBm`;
}

function save(addPlan) {
  if (!snapshot) return;
  syncMeta();
  const p = structuredClone(snapshot);
  p.id = newId();
  p.name = p.name.trim() || 'Untitled link';
  if (addPlan(p)) notice(`Saved "${p.name}"`);
}

function print() {
  if (!snapshot) return;
  syncMeta();
  $('print-report').innerHTML = reportHtml(snapshot, document.querySelector('.assumptions').textContent);
  window.print();
}

/** Puts a saved plan's parameters into the form (in MHz and km). */
export function loadPlan(p) {
  loaded = structuredClone(p);
  $('frequency-unit').value = '1';
  $('distance-unit').value = '1';
  resetFrequencyUnit();
  resetDistanceUnit();
  p.values.forEach((v, i) => ($('v' + i).value = v));
  invalidate();
}

/** Shows a saved plan's results and analysis without recalculating. */
export function analyzePlan(p) {
  snapshot = structuredClone(p);
  showSnapshot();
  $('analysis').scrollIntoView();
}

/** addPlan(plan) stores a new plan and returns whether it was saved. */
export function initBudget({ addPlan }) {
  for (let i = 0; i < COUNT; i++) {
    $(groupOf(i)).insertAdjacentHTML(
      'beforeend',
      field('v' + i, names[i], defaults[i], i < 2 ? '' : units[i], `placeholder="e.g. ${placeholders[i]}"`),
    );
  }
  $('v0').after(
    unitSelect('frequency-unit', 'Frequency unit', '<option value="1000">GHz</option><option value="1">MHz</option>'),
  );
  $('v1').after(
    unitSelect('distance-unit', 'Distance unit', '<option value="1">km</option><option value="0.001">m</option>'),
  );

  // Restore the draft before binding units so the converters start from the restored unit.
  const saved = read('rf.inputs', {});
  for (const [id, v] of Object.entries(saved)) {
    if ($(id) && typeof v === 'string') $(id).value = v;
  }

  for (let i = 0; i < COUNT; i++) $('v' + i).addEventListener('input', invalidate);
  resetFrequencyUnit = bindUnit('frequency-unit', 'v0', invalidate);
  resetDistanceUnit = bindUnit('distance-unit', 'v1', invalidate);

  $('budget-form').onsubmit = calculate;
  $('clear').onclick = clearForm;
  $('undo').onclick = undoClear;

  const noiseFields = [
    ['bandwidth', 'Bandwidth', '1000000', 'Hz'],
    ['noiseFigure', 'Total system noise figure', '3', 'dB'],
    ['requiredSNR', 'Required SNR', '10', 'dB'],
  ];
  for (const [id, label, v, u] of noiseFields) {
    $('noise-fields').insertAdjacentHTML('beforeend', field(id, label, v, u));
  }
  for (const [id] of META) $(id).oninput = updateAnalysis;

  $('distance-slider').oninput = inspectDistance;
  $('save').onclick = () => save(addPlan);
  $('pdf').onclick = print;
}
