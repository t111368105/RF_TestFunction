// Printable report for a calculated link; the browser's print dialog saves it as PDF.

import { labels, number, budget, noise, dataLink } from './calculations.mjs';
import { esc, fmt, fmtRate, table } from './ui.mjs';
import { prepareMeasurements, measurementSummary, fitRows } from './measurements.mjs';

function measurementsHtml(p) {
  prepareMeasurements(p);
  const summary = measurementSummary(p);
  const entered = p.measurements.map((m, i) => [m, summary.rows[i]]).filter(([, row]) => !row.blank);
  if (!entered.length) return '<p>Not provided</p>';
  const unit = p.measureUnit === '1' ? 'km' : 'm';
  const rows = entered.map(([m, row]) =>
    row.valid
      ? [m.d, m.p, fmt(row.predicted), fmt(row.delta)]
      : [m.d, m.p, 'Invalid value', 'Invalid value'],
  );
  let html = table([`Distance (${unit})`, 'Measured (dBm)', 'Predicted (dBm)', 'Measured − predicted (dB)'], rows);
  if (summary.meanDelta !== null) html += `<p>Mean measured − predicted: ${fmt(summary.meanDelta)} dB</p>`;
  if (summary.fit) html += table(['Path-loss fit', 'Result'], fitRows(p, summary));
  return html;
}

function dataLinkHtml(p) {
  if (!p.dataRate?.trim() && !p.requiredEbN0?.trim()) return '<p>Not provided</p>';
  const unit = { 1: 'bit/s', 1000: 'kbit/s', 1000000: 'Mbit/s' }[p.dataRateUnit] ?? 'kbit/s';
  const d = dataLink(
    p.values,
    number(p.noiseFigure),
    number(p.dataRate) * number(p.dataRateUnit),
    number(p.requiredEbN0),
    number(p.implLoss),
  );
  const show = (x, suffix) => (x === null || x === undefined ? 'Not available' : fmt(x) + suffix);
  return table(
    ['Item', 'Value'],
    [
      [`Data rate (${unit})`, p.dataRate || 'Not provided'],
      ['Required Eb/N₀ (dB)', p.requiredEbN0 || 'Not provided'],
      ['Implementation loss (dB)', p.implLoss],
      ['C/N₀', d ? show(d.cn0, ' dB-Hz') : 'Invalid noise figure'],
      ['Eb/N₀', d ? show(d.ebn0, ' dB') : 'Invalid noise figure'],
      ['Eb/N₀ margin', d ? show(d.margin, ' dB') : 'Invalid noise figure'],
      ['Maximum data rate', d?.maxRate ? fmtRate(d.maxRate) : 'Not available'],
    ],
  );
}

export function reportHtml(p, assumptions) {
  const r = budget(p.values);
  const n = noise(p.values, number(p.bandwidth), number(p.noiseFigure), number(p.requiredSNR));
  const noiseValue = (key) => (n ? fmt(n[key]) : 'Invalid input');

  const inputs = table(
    ['Parameter', 'Value'],
    labels.map((l, i) => [l, fmt(p.values[i], 7)]),
  );
  const results = table(
    ['Item', 'Result'],
    [
      ['Verdict', r.status],
      ['Receiver input', fmt(r.output) + ' dBm'],
      ['RX antenna output', fmt(r.received) + ' dBm'],
      ['FSPL', fmt(r.fspl) + ' dB'],
      ['Link margin', fmt(r.margin) + ' dB'],
      ['Maximum distance', fmt(r.maxDistance, 7) + ' km'],
    ],
  );
  const stages = table(
    ['Stage', 'Calculation', 'Power (dBm)'],
    r.stages.map(([a, b, c]) => [a, b, fmt(c)]),
  );
  const noiseTable = table(
    ['Item', 'Value'],
    [
      ['Bandwidth (Hz)', p.bandwidth],
      ['Total system NF (dB)', p.noiseFigure],
      [
        'NF source',
        p.nfFromParts
          ? `Friis cascade: RX cable ${p.values[7]} dB, amplifier gain ${p.values[5]} dB / NF ${p.ampNF} dB, receiver NF ${p.rxNF} dB`
          : 'Entered directly',
      ],
      ['Required SNR (dB)', p.requiredSNR],
      ['Input-referred noise (dBm)', noiseValue('floor')],
      ['Estimated SNR (dB)', noiseValue('snr')],
      ['SNR margin (dB)', noiseValue('margin')],
    ],
  );
  const measurements = measurementsHtml(p);

  return [
    '<h1>LAB602 · RF Link Budget Report</h1>',
    `<h2>${esc(p.name || 'Untitled link')}</h2>`,
    `<p>${esc(new Date(p.date).toLocaleString())}</p>`,
    r.nearField ? '<p><strong>Warning: the distance is in the near field; free-space results are unreliable.</strong></p>' : '',
    `<h2>Input Parameters</h2>${inputs}`,
    `<h2>Results</h2>${results}`,
    `<h2>Power by Stage</h2>${stages}`,
    `<h2>Noise</h2>${noiseTable}`,
    `<h2>Data Rate</h2>${dataLinkHtml(p)}`,
    `<h2>Measurements</h2>${measurements}`,
    `<h2>Experiment Notes</h2><p class="report-notes">${esc(p.notes)}</p>`,
    `<h2>Model Assumptions</h2><p>${esc(assumptions)}</p>`,
    '<p>Noise assumes 290 K. The total system NF includes the RX cable, amplifier and receiver, ' +
      'referred to the RX antenna output; the amplifier NF alone must not be used. ' +
      'Measurements are taken at the receiver input.</p>',
  ].join('');
}
