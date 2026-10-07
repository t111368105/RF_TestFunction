// Printable report for a calculated link; the browser's print dialog saves it as PDF.

import { labels, number, budget, noise } from './calculations.mjs';
import { esc, fmt, table } from './ui.mjs';

export function reportHtml(p, assumptions) {
  const r = budget(p.values);
  const n = noise(p.values, number(p.bandwidth), number(p.noiseFigure), number(p.requiredSNR));
  const noiseValue = (key) => (n ? fmt(n[key]) : 'Invalid input');
  const measured = p.measured.trim();
  const measuredDelta = !measured
    ? 'Not provided'
    : Number.isFinite(number(measured))
      ? fmt(number(measured) - r.output)
      : 'Invalid value';

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
      ['Required SNR (dB)', p.requiredSNR],
      ['Input-referred noise (dBm)', noiseValue('floor')],
      ['Estimated SNR (dB)', noiseValue('snr')],
      ['SNR margin (dB)', noiseValue('margin')],
      ['Measured receiver input (dBm)', measured || 'Not provided'],
      ['Measured − predicted (dB)', measuredDelta],
    ],
  );

  return [
    '<h1>LAB602 · RF Link Budget Report</h1>',
    `<h2>${esc(p.name || 'Untitled link')}</h2>`,
    `<p>${esc(new Date(p.date).toLocaleString())}</p>`,
    `<h2>Input Parameters</h2>${inputs}`,
    `<h2>Results</h2>${results}`,
    `<h2>Seven-Stage Power</h2>${stages}`,
    `<h2>Noise and Measurement</h2>${noiseTable}`,
    `<h2>Experiment Notes</h2><p class="report-notes">${esc(p.notes)}</p>`,
    `<h2>Model Assumptions</h2><p>${esc(assumptions)}</p>`,
    '<p>Noise assumes 290 K. The total system NF includes the RX cable, amplifier and receiver, ' +
      'referred to the RX antenna output; the amplifier NF alone must not be used. ' +
      'Measurements are taken at the receiver input.</p>',
  ].join('');
}
