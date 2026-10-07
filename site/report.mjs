// Printable report for a calculated link; the browser's print dialog saves it as PDF. Also holds the
// pure helpers that the page and the report share for a calculated link (a snapshot or saved plan).

import { labels, number, budget, noise, dataLink, inputWarnings } from './calculations.mjs';
import { esc, fmt, fmtRate, table } from './ui.mjs';
import { prepareMeasurements, measurementSummary, fitRows } from './measurements.mjs';
import { describeEstimate } from './estimator.mjs';
import { describeLossCalc } from './loss-calculators.mjs';
import { lossItemsOf, lossItemsSummary } from './path-losses.mjs';
import { t, locale } from './i18n.mjs';

export const STALE_ESTIMATE = t(
  'The atmosphere, ionosphere and radome estimate was made for a different frequency or distance; estimate it again.',
);

/** budget() options for a snapshot or plan. */
export function linkOptions(p) {
  return { ampFirst: p.ampPosition === 'before' };
}

/** EIRP against the optional limit, or null when no limit is set. */
export function eirpCheck(p, r) {
  const limit = number(p.eirpLimit ?? '');
  if (!Number.isFinite(limit)) return null;
  const eirp = r.stages[2][2];
  return { eirp, limit, exceeded: eirp > limit };
}

/** Warning that the EIRP exceeds its limit. */
export function eirpWarning(eirp) {
  return t('EIRP {eirp} dBm exceeds the {limit} dBm limit.', { eirp: fmt(eirp.eirp), limit: fmt(eirp.limit) });
}

/** Input parameters as [label, value] rows, with the itemized losses and receiver options. */
export function inputRows(p) {
  const rows = labels.map((l, i) => [l, fmt(p.values[i], 7)]);
  rows.push([t('Path loss items (dB)'), lossItemsSummary(lossItemsOf(p))]);
  if (p.lossCalcs?.polarization) {
    rows.push([t('Polarization mismatch'), describeLossCalc('polarization', p.lossCalcs.polarization)]);
  }
  if (p.lossCalcs?.pointing) rows.push([t('Pointing loss'), describeLossCalc('pointing', p.lossCalcs.pointing)]);
  if (p.atmosphereEstimate) {
    for (const [label, text] of describeEstimate(p.atmosphereEstimate)) {
      rows.push([label, text + (p.atmosphereStale ? ' ' + t('Outdated.') : '')]);
    }
  }
  rows.push([
    t('RX amplifier position'),
    linkOptions(p).ampFirst ? t('Before the RX cable (masthead LNA)') : t('After the RX cable'),
  ]);
  rows.push([t('EIRP limit (dBm)'), p.eirpLimit || t('Not set')]);
  return rows;
}

/** Antenna noise temperature; blank (or missing in older plans) means 290 K. */
function antennaTemp(p) {
  const raw = (p.antennaTemp ?? '').trim();
  return raw === '' ? 290 : number(raw);
}

function measurementsHtml(p) {
  prepareMeasurements(p);
  const summary = measurementSummary(p);
  const entered = p.measurements.map((m, i) => [m, summary.rows[i]]).filter(([, row]) => !row.blank);
  if (!entered.length) return `<p>${t('Not provided')}</p>`;
  const unit = p.measureUnit === '1' ? 'km' : 'm';
  const invalid = t('Invalid value');
  const rows = entered.map(([m, row]) =>
    row.valid ? [m.d, m.p, fmt(row.predicted), fmt(row.delta)] : [m.d, m.p, invalid, invalid],
  );
  let html = table(
    [t('Distance ({unit})', { unit }), t('Measured (dBm)'), t('Predicted (dBm)'), t('Measured − predicted (dB)')],
    rows,
  );
  if (summary.meanDelta !== null) {
    html += `<p>${t('Mean measured − predicted: {delta} dB', { delta: fmt(summary.meanDelta) })}</p>`;
  }
  if (summary.fit) html += table([t('Path-loss fit'), t('Result')], fitRows(p, summary));
  return html;
}

function dataLinkHtml(p) {
  if (!p.dataRate?.trim() && !p.requiredEbN0?.trim()) return `<p>${t('Not provided')}</p>`;
  const unit = { 1: 'bit/s', 1000: 'kbit/s', 1000000: 'Mbit/s' }[p.dataRateUnit] ?? 'kbit/s';
  const d = dataLink(
    p.values,
    number(p.noiseFigure),
    number(p.dataRate) * number(p.dataRateUnit),
    number(p.requiredEbN0),
    number(p.implLoss),
    antennaTemp(p),
  );
  const notAvailable = t('Not available');
  const invalid = t('Invalid noise input');
  const show = (x, suffix) => (x === null || x === undefined ? notAvailable : fmt(x) + suffix);
  return table(
    [t('Item'), t('Value')],
    [
      [t('Data rate ({unit})', { unit }), p.dataRate || t('Not provided')],
      [t('Required Eb/N₀ (dB)'), p.requiredEbN0 || t('Not provided')],
      [t('Implementation loss (dB)'), p.implLoss],
      ['C/N₀', d ? show(d.cn0, ' dB-Hz') : invalid],
      ['Eb/N₀', d ? show(d.ebn0, ' dB') : invalid],
      [t('Eb/N₀ margin'), d ? show(d.margin, ' dB') : invalid],
      [t('Maximum data rate'), d?.maxRate ? fmtRate(d.maxRate) : notAvailable],
    ],
  );
}

export function reportHtml(p, assumptions) {
  const r = budget(p.values, linkOptions(p));
  const bandwidthUnit = p.bandwidthUnit ?? '1';
  const n = noise(
    p.values,
    number(p.bandwidth) * number(bandwidthUnit),
    number(p.noiseFigure),
    number(p.requiredSNR),
    antennaTemp(p),
  );
  const noiseValue = (key, digits) => (n ? fmt(n[key], digits) : t('Invalid input'));
  const eirp = eirpCheck(p, r);
  const warnings = inputWarnings(p.values);
  if (eirp?.exceeded) warnings.push(eirpWarning(eirp));
  if (p.atmosphereStale) warnings.push(STALE_ESTIMATE);
  if (r.nearField) warnings.push(t('The distance is in the near field; free-space results are unreliable.'));

  const inputs = table([t('Parameter'), t('Value')], inputRows(p));
  const results = table(
    [t('Item'), t('Result')],
    [
      [t('Verdict'), r.status],
      [t('Receiver input'), fmt(r.output) + ' dBm'],
      [t('RX antenna output'), fmt(r.received) + ' dBm'],
      [
        'EIRP',
        fmt(r.stages[2][2]) + ' dBm' + (eirp ? ' ' + t('(limit {limit} dBm)', { limit: fmt(eirp.limit) }) : ''),
      ],
      ['FSPL', fmt(r.fspl) + ' dB'],
      [t('Link margin'), fmt(r.margin) + ' dB'],
      [t('Maximum distance'), fmt(r.maxDistance, 7) + ' km'],
    ],
  );
  const stages = table(
    [t('Stage'), t('Calculation'), t('Power (dBm)')],
    r.stages.map(([a, b, c]) => [a, b, fmt(c)]),
  );
  const bwUnit = { 1: 'Hz', 1000: 'kHz', 1000000: 'MHz' }[bandwidthUnit] ?? 'Hz';
  const nfSource = p.nfFromParts
    ? t('Friis cascade ({order}, receiver): RX cable {cable} dB, amplifier gain {gain} dB / NF {ampNF} dB, receiver NF {rxNF} dB', {
        order: linkOptions(p).ampFirst ? t('amplifier, cable') : t('cable, amplifier'),
        cable: p.values[7],
        gain: p.values[5],
        ampNF: p.ampNF,
        rxNF: p.rxNF,
      })
    : t('Entered directly');
  const noiseTable = table(
    [t('Item'), t('Value')],
    [
      [t('Bandwidth ({unit})', { unit: bwUnit }), p.bandwidth],
      [t('Antenna noise temperature (K)'), p.antennaTemp?.trim() || t('290 (reference)')],
      [t('Total system NF (dB)'), p.noiseFigure],
      [t('NF source'), nfSource],
      [t('Required SNR (dB)'), p.requiredSNR],
      [t('System noise temperature (K)'), noiseValue('tsys', 1)],
      [t('Input-referred noise (dBm)'), noiseValue('floor')],
      [t('Estimated SNR (dB)'), noiseValue('snr')],
      [t('SNR margin (dB)'), noiseValue('margin')],
      [t('Equivalent receiver sensitivity (dBm)'), noiseValue('sensitivity')],
      [t('Receive G/T (dB/K)'), noiseValue('gOverT')],
    ],
  );
  const measurements = measurementsHtml(p);

  return [
    `<h1>${t('LAB602 · RF Link Budget Report')}</h1>`,
    `<h2>${esc(p.name || t('Untitled link'))}</h2>`,
    `<p>${esc(new Date(p.date).toLocaleString(locale))}</p>`,
    warnings.map((w) => `<p><strong>${esc(t('Warning: {message}', { message: w }))}</strong></p>`).join(''),
    `<h2>${t('Input Parameters')}</h2>${inputs}`,
    `<h2>${t('Results')}</h2>${results}`,
    `<h2>${t('Power by Stage')}</h2>${stages}`,
    `<h2>${t('Noise')}</h2>${noiseTable}`,
    `<h2>${t('Data Rate')}</h2>${dataLinkHtml(p)}`,
    `<h2>${t('Measurements')}</h2>${measurements}`,
    `<h2>${t('Experiment Notes')}</h2><p class="report-notes">${esc(p.notes)}</p>`,
    `<h2>${t('Model Assumptions')}</h2><p>${esc(assumptions)}</p>`,
    `<p>${t(
      'The total system NF includes the RX cable, amplifier and receiver, referred to the RX antenna output; the amplifier NF alone must not be used. System noise temperature = antenna temperature + 290 K × (F − 1). Measurements are taken at the receiver input.',
    )}</p>`,
  ].join('');
}
