// Link Budget page: input form, results, distance/noise/measurement analysis, save and print.

import { labels, number, invalidIndex, budget, powerAt, noise, cascadeNF, dataLink } from './calculations.mjs';
import { $, esc, fmt, fmtRate, notice, read, write, field, table, bindUnit, newId } from './ui.mjs';
import { distanceChart } from './chart.mjs';
import { reportHtml } from './report.mjs';
import { initMeasurements, showMeasurements, chartMeasurements } from './measurements.mjs';

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
  'Other path losses',
];
const units = ['MHz', 'km', 'dBm', 'dBi', 'dBi', 'dB', 'dB', 'dB', 'dBm', 'dB', 'dB'];
const defaults = ['', '', '', '', '', '0', '0', '0', '', '0', '0'];
const placeholders = ['2.4', '1', '20', '2', '2', '0', '0', '0', '-90', '10', '3'];
// Inputs that may be negative get a ± button for keypads without a minus key.
const SIGNED = [2, 3, 4, 5, 8];
const inputIds = Array.from({ length: COUNT }, (_, i) => 'v' + i);
const draftIds = [...inputIds, 'frequency-unit', 'distance-unit'];

// Analysis fields stored on the snapshot: [element id, snapshot key].
const META = [
  ['plan-name', 'name'],
  ['notes', 'notes'],
  ['bandwidth', 'bandwidth'],
  ['noiseFigure', 'noiseFigure'],
  ['requiredSNR', 'requiredSNR'],
  ['amp-nf', 'ampNF'],
  ['rx-nf', 'rxNF'],
  ['data-rate', 'dataRate'],
  ['data-rate-unit', 'dataRateUnit'],
  ['required-ebn0', 'requiredEbN0'],
  ['impl-loss', 'implLoss'],
];

// Analysis defaults for new calculations, also filled into plans saved before a field existed.
const ANALYSIS_DEFAULTS = {
  bandwidth: '1000000',
  noiseFigure: '3',
  requiredSNR: '10',
  nfFromParts: false,
  ampNF: '',
  rxNF: '',
  dataRate: '',
  dataRateUnit: '1000',
  requiredEbN0: '',
  implLoss: '0',
};

let snapshot = null; // The last calculated link, plus its analysis fields.
let loaded = null; // The saved plan whose parameters are in the form, if any.
let undo = null; // Form state before the last Clear.
let resetFrequencyUnit;
let resetDistanceUnit;
let resetDataRateUnit;

function groupOf(i) {
  return i < 2 || i === 10 ? 'propagation' : i < 5 ? 'antenna' : i < 8 ? 'losses' : 'requirements';
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
    // Cloned so editing this calculation never changes the loaded plan.
    snapshot = structuredClone({
      ...ANALYSIS_DEFAULTS,
      ...(loaded ?? {}),
      id: newId(),
      date: new Date().toISOString(),
      values: v,
      name: loaded?.name ?? '',
      notes: loaded?.notes ?? '',
    });
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
    `<div class="metrics">${metrics}</div>` +
    nearFieldWarning(r)
  );
}

function nearFieldWarning(r) {
  const limit = `${fmt(r.farFieldMin * 1000, 3)} m`;
  if (r.nearField) {
    return (
      `<p class="status warn">Near field: the distance is under 10 wavelengths (${limit}). ` +
      'Free-space loss does not apply here, so these results are unreliable.</p>'
    );
  }
  if (r.maxDistance !== null && r.maxDistance < r.farFieldMin) {
    return `<p class="status warn">Maximum distance is under 10 wavelengths (${limit}), in the near field, so it is unreliable.</p>`;
  }
  return '';
}

function breakdownHtml(r) {
  const stages = r.stages
    .map(
      ([n, o, p], i) =>
        `<div class="stage"><div>${i + 1}. ${n}<small>${esc(o)}</small></div><b>${fmt(p)} dBm</b></div>`,
    )
    .join('');
  return '<h3>Power Breakdown by Stage</h3>' + stages;
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
  for (const [key, value] of Object.entries(ANALYSIS_DEFAULTS)) snapshot[key] ??= value;
  for (const [id, key] of META) $(id).value = snapshot[key] ?? '';
  resetDataRateUnit();
  $('nf-from-parts').checked = !!snapshot.nfFromParts;
  showMeasurements(snapshot);
  drawChart(true);
  updateAnalysis();
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
  const nf = cascadeNF(v[7], v[5], number(snapshot.ampNF), number(snapshot.rxNF));
  snapshot.noiseFigure = nf === null ? '' : String(Number(nf.toFixed(4)));
  $('noiseFigure').value = snapshot.noiseFigure;
  return nf !== null;
}

function updateAnalysis() {
  if (!snapshot) return;
  syncMeta();
  const partsValid = updateNoiseFigure();
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
    : partsValid
      ? '<p class="error">Enter a positive bandwidth, a non-negative NF and a finite required SNR.</p>'
      : '<p class="error">Enter non-negative amplifier and receiver noise figures.</p>';
  $('data-results').innerHTML = dataLinkHtml();
}

function dataLinkHtml() {
  const s = snapshot;
  const rate = number(s.dataRate) * number(s.dataRateUnit);
  const required = number(s.requiredEbN0);
  const implLoss = number(s.implLoss);
  const d = dataLink(s.values, number(s.noiseFigure), rate, required, implLoss);
  if (!d) return '<p class="error">Enter a valid total system noise figure above.</p>';

  const rateNote = s.dataRate.trim() === '' ? 'Enter a data rate' : 'Enter a positive data rate';
  const targetNote =
    s.requiredEbN0.trim() === ''
      ? 'Enter the required Eb/N₀'
      : 'Enter a finite required Eb/N₀ and a non-negative implementation loss';
  const rows = [
    ['C/N₀', fmt(d.cn0) + ' dB-Hz'],
    ['Eb/N₀', d.ebn0 === null ? rateNote : fmt(d.ebn0) + ' dB'],
    ['Eb/N₀ margin', d.margin === null ? (d.ebn0 === null ? rateNote : targetNote) : fmt(d.margin) + ' dB'],
  ];
  if (d.margin !== null) rows.push(['Verdict', d.margin >= 0 ? 'Data rate supported' : 'Data rate not supported']);
  rows.push(['Maximum data rate', d.maxRate === null ? targetNote : fmtRate(d.maxRate)]);
  return table(['Item', 'Result'], rows);
}

/** Redraws the chart; the slider returns to the link distance only when resetSlider is true. */
function drawChart(resetSlider) {
  const measured = chartMeasurements(snapshot);
  const { svg, lo, hi, center, maxDistance, cursorAt } = distanceChart(snapshot.values, measured);
  chartCursorAt = cursorAt;
  $('chart').innerHTML = svg;
  $('max-distance').textContent = 'Maximum distance ' + fmt(maxDistance, 5) + ' km';
  $('legend-measured').hidden = !measured.points.length;
  $('legend-fit').hidden = !measured.fit;
  if (measured.fit) $('legend-fit').textContent = `╌ Fitted, n = ${fmt(measured.fit.n, 2)}`;
  const slider = $('distance-slider');
  const previous = number(slider.value);
  slider.min = lo;
  slider.max = hi;
  slider.value = resetSlider ? center : previous;
  inspectDistance();
}

let chartCursorAt = null;

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
  const near = d < budget(snapshot.values).farFieldMin ? ' (near field, unreliable)' : '';
  $('distance-readout').textContent =
    `Distance ${fmt(d, 6)} km → receiver input ${fmt(powerAt(snapshot.values, d))} dBm${near}`;
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
      field(
        'v' + i,
        names[i],
        defaults[i],
        i < 2 ? '' : units[i],
        `placeholder="e.g. ${placeholders[i]}"`,
        SIGNED.includes(i),
      ),
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
    ['requiredSNR', 'Required SNR', '10', 'dB', '', true],
    ['amp-nf', 'RX amplifier noise figure', '', 'dB', 'placeholder="e.g. 1"'],
    ['rx-nf', 'Receiver noise figure', '', 'dB', 'placeholder="e.g. 6"'],
    ['noiseFigure', 'Total system noise figure', '3', 'dB'],
  ];
  $('noise-fields').insertAdjacentHTML(
    'beforeend',
    noiseFields.slice(0, 2).map((f) => field(...f)).join('') +
      '<label class="span"><input type="checkbox" id="nf-from-parts"> ' +
      'Calculate total NF from the RX cable loss, amplifier and receiver</label>' +
      noiseFields.slice(2).map((f) => field(...f)).join(''),
  );
  $('data-fields').insertAdjacentHTML(
    'beforeend',
    field('data-rate', 'Data rate', '', '', 'placeholder="e.g. 9.6"') +
      field('required-ebn0', 'Required Eb/N₀', '', 'dB', 'placeholder="e.g. 9.6"', true) +
      field('impl-loss', 'Implementation loss', '0', 'dB', 'placeholder="e.g. 2"'),
  );
  $('data-rate').after(
    unitSelect(
      'data-rate-unit',
      'Data rate unit',
      '<option value="1">bit/s</option><option value="1000" selected>kbit/s</option><option value="1000000">Mbit/s</option>',
    ),
  );
  resetDataRateUnit = bindUnit('data-rate-unit', 'data-rate', updateAnalysis);
  for (const [id] of META) $(id).oninput = updateAnalysis;
  $('nf-from-parts').onchange = updateAnalysis;
  initMeasurements(() => drawChart(false));

  $('distance-slider').oninput = inspectDistance;
  $('save').onclick = () => save(addPlan);
  $('pdf').onclick = print;
}
