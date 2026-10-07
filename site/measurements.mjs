// Measured vs. Predicted: a table of (distance, measured receiver input) points, compared with the
// prediction and fitted with a log-distance path-loss model.

import { number, budget, powerAt, fitPathLoss, fittedPower, fittedMaxDistance } from './calculations.mjs';
import { $, esc, fmt, notice, table, signButton } from './ui.mjs';

const blankRow = () => ({ d: '', p: '' });

/** Fills in measurement fields, converting the single "measured" value of older snapshots. */
export function prepareMeasurements(s) {
  if (!['0.001', '1'].includes(s.measureUnit)) s.measureUnit = '0.001';
  if (!Array.isArray(s.measurements)) {
    const legacy = typeof s.measured === 'string' ? s.measured.trim() : '';
    // The old value was measured at the link distance.
    const d = String(Number((s.values[1] / number(s.measureUnit)).toPrecision(12)));
    s.measurements = legacy ? [{ d, p: legacy }] : [];
  }
  delete s.measured;
  if (!s.measurements.length) s.measurements.push(blankRow());
}

/**
 * Parsed rows with their prediction, plus the fit. Pure: used by the page and the printed report.
 * Each row: { d (km), p (dBm), blank, valid, predicted, delta }.
 */
export function measurementSummary(s) {
  const v = s.values;
  const scale = number(s.measureUnit);
  const rows = s.measurements.map(({ d, p }) => {
    const blank = d.trim() === '' && p.trim() === '';
    const km = number(d) * scale;
    const dbm = number(p);
    const valid = !blank && Number.isFinite(km) && km > 0 && Number.isFinite(dbm);
    const predicted = valid ? powerAt(v, km) : NaN;
    return { d: km, p: dbm, blank, valid, predicted, delta: dbm - predicted };
  });
  const used = rows.filter((r) => r.valid && Number.isFinite(r.delta));
  const fit = fitPathLoss(used.map((r) => [r.d, r.p]), v[1]);
  return {
    rows,
    used,
    fit,
    meanDelta: used.length ? used.reduce((sum, r) => sum + r.delta, 0) / used.length : null,
    fitMaxDistance: fit ? fittedMaxDistance(fit, v[1], v[8] + v[9]) : null,
  };
}

/** Points and fit for the chart, in km and dBm. */
export function chartMeasurements(s) {
  const { used, fit } = measurementSummary(s);
  return { points: used.map((r) => [r.d, r.p]), fit };
}

const signed = (x) => (x > 0 ? '+' : '') + fmt(x);

function deltaText(r) {
  if (r.blank) return '';
  if (!r.valid || !Number.isFinite(r.delta)) return 'Invalid';
  return `${signed(r.delta)} dB`;
}

/** Fit results as [label, value] rows; shared by the page and the report. */
export function fitRows(s, summary) {
  const { fit, fitMaxDistance } = summary;
  const v = s.values;
  // A line through two points always fits exactly, so the spread is only meaningful from three.
  const spread = fit.count > 2;
  return [
    ['Points used', String(fit.count)],
    ['Path-loss exponent n', `${fmt(fit.n, 3)} (free space: 2)`],
    [`Fitted receiver input at ${fmt(v[1], 6)} km`, `${fmt(fit.p0)} dBm (predicted ${fmt(budget(v).output)} dBm)`],
    ['Shadowing σ (RMS residual)', spread ? `${fmt(fit.rmse)} dB` : 'Needs 3 or more points'],
    ['R²', spread ? fmt(fit.r2, 4) : 'Needs 3 or more points'],
    ['Maximum distance (fitted model)', fitMaxDistance === null ? 'Not reached' : `${fmt(fitMaxDistance, 5)} km`],
  ];
}

function resultsHtml(s, summary) {
  const { used, fit, meanDelta } = summary;
  if (!used.length) return '<p>No measured value entered yet</p>';
  const verdict =
    meanDelta < 0
      ? 'Measured is lower on average; this may include unmodeled losses or measurement differences.'
      : 'Measured meets or exceeds the prediction on average.';
  let html = `<p>Mean measured − predicted: ${signed(meanDelta)} dB over ${used.length} point${used.length > 1 ? 's' : ''}. ${verdict}</p>`;
  if (fit) {
    html += `<h3>Path-Loss Fit</h3>${table(['Item', 'Result'], fitRows(s, summary))}`;
    html +=
      '<p class="hint">Model: P(d) = P₀ − 10 n log₁₀(d / d₀), fitted by least squares. ' +
      'n below 2 can occur with guided propagation such as corridors; n above 2 indicates obstruction or ground reflections.</p>';
  } else {
    html += '<p class="hint">Add measurements at two or more different distances to fit a path-loss exponent.</p>';
  }
  return html;
}

let current = null; // Snapshot whose measurements are on screen.
let changed = () => {};

function updateResults() {
  const summary = measurementSummary(current);
  $('measure-rows')
    .querySelectorAll('tr')
    .forEach((tr, i) => (tr.querySelector('.delta').textContent = deltaText(summary.rows[i])));
  $('fit-results').innerHTML = resultsHtml(current, summary);
}

function renderRows() {
  $('measure-unit').value = current.measureUnit;
  $('measure-rows').innerHTML = current.measurements
    .map(
      ({ d, p }, i) =>
        `<tr data-row="${i}">` +
        `<td><input data-key="d" inputmode="decimal" aria-label="Distance, row ${i + 1}" value="${esc(d)}"></td>` +
        `<td><div class="input-unit"><input data-key="p" inputmode="decimal" aria-label="Measured dBm, row ${i + 1}" value="${esc(p)}">` +
        `${signButton('', `Toggle minus sign, row ${i + 1}`)}</div></td>` +
        '<td class="delta mono"></td>' +
        `<td><button type="button" data-remove aria-label="Remove row ${i + 1}">✕</button></td></tr>`,
    )
    .join('');
  updateResults();
}

/** Shows (and from then on edits) the measurements of snapshot s. */
export function showMeasurements(s) {
  current = s;
  prepareMeasurements(s);
  renderRows();
}

/** Splits pasted spreadsheet text into [distance, dBm] string pairs; returns them and the skipped count. */
export function parsePasted(text) {
  const rows = [];
  let skipped = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let cells = line.trim().split(/[\t;]+|\s+/).filter(Boolean);
    if (cells.length === 1) cells = cells[0].split(',');
    const [d, p] = cells;
    if (cells.length >= 2 && Number.isFinite(number(d)) && Number.isFinite(number(p))) rows.push({ d, p });
    else skipped++;
  }
  return { rows, skipped };
}

function edit(apply) {
  if (!current) return;
  apply();
  if (!current.measurements.length) current.measurements.push(blankRow());
  renderRows();
  changed();
}

/** onChange runs after any edit, e.g. to redraw the chart. */
export function initMeasurements(onChange) {
  changed = onChange;
  $('measure-rows').addEventListener('input', (e) => {
    const key = e.target.dataset.key;
    if (!current || !key) return;
    current.measurements[Number(e.target.closest('tr').dataset.row)][key] = e.target.value;
    updateResults();
    changed();
  });
  $('measure-rows').addEventListener('click', (e) => {
    const button = e.target.closest('[data-remove]');
    if (button) edit(() => current.measurements.splice(Number(button.closest('tr').dataset.row), 1));
  });
  $('measure-add').onclick = () => {
    if (!current) return;
    edit(() => current.measurements.push(blankRow()));
    $('measure-rows').querySelector('tr:last-child input').focus();
  };
  // Keep each distance physically the same when the unit changes.
  $('measure-unit').onchange = () =>
    edit(() => {
      const ratio = number(current.measureUnit) / number($('measure-unit').value);
      for (const row of current.measurements) {
        const d = number(row.d);
        if (Number.isFinite(d)) row.d = String(Number((d * ratio).toPrecision(15)));
      }
      current.measureUnit = $('measure-unit').value;
    });
  $('measure-import').onclick = () => {
    const { rows, skipped } = parsePasted($('measure-paste').value);
    if (!rows.length) {
      notice('No rows found. Paste one "distance, dBm" pair per line.');
      return;
    }
    edit(() => {
      current.measurements = current.measurements.filter((r) => r.d.trim() || r.p.trim()).concat(rows);
    });
    $('measure-paste').value = '';
    notice(`Added ${rows.length} row${rows.length > 1 ? 's' : ''}${skipped ? `; skipped ${skipped} invalid line${skipped > 1 ? 's' : ''}` : ''}.`);
  };
}
