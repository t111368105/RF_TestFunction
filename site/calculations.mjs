// Pure RF calculations shared by the UI and the Node tests. Formulas follow the original Swift app.

import { t } from './i18n.mjs';

const SPEED_OF_LIGHT = 299792458; // m/s
const FSPL_CONSTANT = 32.44; // dB, for MHz and km
const THERMAL_NOISE_290K = -173.975; // dBm/Hz
const T0 = 290; // K, the reference temperature for noise figures
/** dBd + DBD_TO_DBI = dBi: a half-wave dipole has 2.15 dBi. */
export const DBD_TO_DBI = 2.15;

// Link-budget input order: every array of link values uses these indices.
export const labels = [
  'Frequency (MHz)',
  'Distance (km)',
  'TX power (dBm)',
  'TX antenna gain (dBi)',
  'RX antenna gain (dBi)',
  'Amplifier gain (dB)',
  'TX cable loss (dB)',
  'RX cable loss (dB)',
  'Receiver sensitivity (dBm)',
  'Required margin (dB)',
  'Additional path losses (dB)',
].map((label) => t(label));

const POSITIVE = [0, 1];
const NON_NEGATIVE = [6, 7, 9, 10];
// Free-space loss is only valid in the far field; below this many wavelengths results are flagged.
const FAR_FIELD_WAVELENGTHS = 10;

/** Index of the first link value that fails validation, or -1. */
export function invalidIndex(values) {
  return values.findIndex(
    (x, i) =>
      !Number.isFinite(x) ||
      (POSITIVE.includes(i) && x <= 0) ||
      (NON_NEGATIVE.includes(i) && x < 0),
  );
}

// Commas that group digits in threes ("1,000", "-1,234,567.5") are thousands separators, matching
// how the page itself formats numbers; any other comma ("2,4") is a decimal separator.
const GROUPED = /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d*)?(?:e[+-]?\d+)?$/i;

/** Strict decimal parser. Returns NaN when invalid. */
export function number(x) {
  const raw = String(x).trim();
  const s = GROUPED.test(raw) ? raw.replaceAll(',', '') : raw.replaceAll(',', '.');
  const valid = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(s) && Number.isFinite(Number(s));
  return valid ? Number(s) : NaN;
}

/**
 * ampFirst puts the RX amplifier before the RX cable (e.g. a masthead LNA) instead of after it. The
 * receiver input power is the same either way; only the intermediate stage and the noise differ.
 */
export function budget(v, { ampFirst = false } = {}) {
  if (v.length !== labels.length) throw Error(t('{count} link parameters are required', { count: labels.length }));
  const bad = invalidIndex(v);
  if (bad >= 0) throw Error(t('Please check {name}', { name: labels[bad] }));

  const [f, d, p, tg, r, a, tl, rl, s, m, o] = v;
  if (d < 1e-140 || d > 1e140) throw Error(t('Distance is outside the analysis range'));

  const fspl = 20 * Math.log10(d) + 20 * Math.log10(f) + FSPL_CONSTANT;
  const received = p - tl + tg + r - fspl - o;
  const output = received - rl + a;
  const margin = output - s;
  const stages = [
    [t('Transmitter output'), t('Initial TX power'), p],
    [t('TX antenna input'), t('TX cable loss −{value} dB', { value: tl }), p - tl],
    [t('EIRP'), t('TX antenna gain {value} dB', { value: tg }), p - tl + tg],
    [t('After free-space loss'), t('FSPL −{value} dB', { value: fspl }), p - tl + tg - fspl],
    [t('After additional path losses'), t('Path losses −{value} dB', { value: o }), p - tl + tg - fspl - o],
    [t('RX antenna output'), t('RX antenna gain {value} dB', { value: r }), received],
    ampFirst
      ? [t('RX amplifier output'), t('Amplifier gain {value} dB', { value: a }), received + a]
      : [t('RX amplifier input'), t('RX cable loss −{value} dB', { value: rl }), received - rl],
    ampFirst
      ? [t('Receiver input'), t('RX cable loss −{value} dB', { value: rl }), output]
      : [t('Receiver input'), t('Amplifier gain {value} dB', { value: a }), output],
  ];
  const results = [fspl, received, output, margin, ...stages.map((x) => x[2]), s + m];
  if (!results.every(Number.isFinite)) throw Error(t('Values are outside the calculation range'));

  // Distance at which the margin exactly equals the required margin (20 dB per decade).
  const maxDistance = 10 ** (Math.log10(d) + (margin - m) / 20);
  const wavelength = SPEED_OF_LIGHT / (f * 1e6) / 1000; // km
  const farFieldMin = FAR_FIELD_WAVELENGTHS * wavelength;
  return {
    fspl,
    received,
    output,
    margin,
    stages,
    maxDistance: Number.isFinite(maxDistance) && maxDistance > 0 ? maxDistance : null,
    meets: margin >= m,
    farFieldMin,
    nearField: d < farFieldMin,
    status:
      margin < 0 ? t('Below receiver sensitivity') : margin < m ? t('Margin target not met') : t('Margin target met'),
  };
}

// Values that are valid but almost certainly a typo or a wrong unit: [index, test, message].
const PLAUSIBILITY = [
  [0, (x) => x < 0.003 || x > 3e6, 'Frequency is outside the radio range of 3 kHz to 3 THz; check the unit.'],
  [2, (x) => x > 70, 'TX power is above 70 dBm (10 kW); check the value and unit.'],
  [3, (x) => x > 60 || x < -30, 'TX antenna gain is outside −30 to 60 dBi; check the value.'],
  [4, (x) => x > 60 || x < -30, 'RX antenna gain is outside −30 to 60 dBi; check the value.'],
  [5, (x) => x > 80 || x < -40, 'RX amplifier gain is outside −40 to 80 dB; check the value.'],
  [6, (x) => x > 40, 'TX cable loss is above 40 dB; check the value.'],
  [7, (x) => x > 40, 'RX cable loss is above 40 dB; check the value.'],
  [8, (x) => x > 0, 'Receiver sensitivity is positive; sensitivities are normally negative, e.g. −90 dBm. Is a minus sign missing?'],
  [8, (x) => x < -190, 'Receiver sensitivity is below −190 dBm; check the value.'],
  [9, (x) => x > 60, 'Required margin is above 60 dB; check the value.'],
  [10, (x) => x > 100, 'Additional path losses are above 100 dB; check the value.'],
];

/** Soft warnings for valid but implausible link values; calculation still proceeds. */
export function inputWarnings(v) {
  return PLAUSIBILITY.filter(([i, test]) => test(v[i])).map(([, , message]) => t(message));
}

/** Receiver input power (dBm) at distance d (km), scaling FSPL from the configured distance. */
export function powerAt(v, d) {
  return budget(v).output - 20 * (Math.log10(d) - Math.log10(v[1]));
}

/**
 * Noise density (dBm/Hz) and system noise temperature Tsys (K) at the RX antenna output:
 * Tsys = Ta + T0 (F − 1), where F is the receive chain's noise factor and Ta the antenna noise
 * temperature. With Ta = 290 K this is exactly −173.975 + NF. Returns null when invalid.
 */
export function noiseDensity(nf, antennaTemp = T0) {
  if (!Number.isFinite(nf) || nf < 0 || !Number.isFinite(antennaTemp) || antennaTemp < 0) return null;
  const tsys = antennaTemp + T0 * (10 ** (nf / 10) - 1);
  if (!(tsys > 0) || !Number.isFinite(tsys)) return null;
  return { n0: THERMAL_NOISE_290K + 10 * Math.log10(tsys / T0), tsys };
}

/**
 * Noise floor referred to the RX antenna output; SNR uses the RX antenna output power.
 * sensitivity is the receiver input level that just meets the target SNR, for comparison with the
 * entered sensitivity; gOverT is the receive figure of merit G/T (dB/K).
 */
export function noise(v, bw, nf, target, antennaTemp = T0) {
  const density = noiseDensity(nf, antennaTemp);
  if (!density || ![bw, target].every(Number.isFinite) || bw <= 0) return null;
  const r = budget(v);
  const floor = density.n0 + 10 * Math.log10(bw);
  const snr = r.received - floor;
  const margin = snr - target;
  const sensitivity = floor + target + (r.output - r.received);
  const gOverT = v[4] - 10 * Math.log10(density.tsys);
  const result = { floor, snr, margin, sensitivity, tsys: density.tsys, gOverT };
  return Object.values(result).every(Number.isFinite) ? result : null;
}

/**
 * Digital link quality at the RX antenna output (the same reference as noise()), with N0 at 290 K:
 * C/N0 (dB-Hz), Eb/N0 = C/N0 − 10 log10(rate), and the margin over required Eb/N0 plus implementation
 * loss. rate (bit/s) and required may be NaN when not entered; the dependent results are then null.
 * Returns null when the noise figure is invalid.
 */
export function dataLink(v, nf, rate, required, implLoss, antennaTemp = T0) {
  const density = noiseDensity(nf, antennaTemp);
  if (!density) return null;
  const cn0 = budget(v).received - density.n0;
  const hasRate = Number.isFinite(rate) && rate > 0;
  const hasTarget = Number.isFinite(required) && Number.isFinite(implLoss) && implLoss >= 0;
  const ebn0 = hasRate ? cn0 - 10 * Math.log10(rate) : null;
  const maxRate = hasTarget ? 10 ** ((cn0 - required - implLoss) / 10) : null;
  return {
    cn0,
    ebn0,
    margin: hasRate && hasTarget ? ebn0 - required - implLoss : null,
    maxRate: Number.isFinite(maxRate) && maxRate > 0 ? maxRate : null,
  };
}

/**
 * Friis cascade noise figure (dB) referred to the RX antenna output. The RX cable is a passive loss
 * at 290 K, so its NF equals its loss. Order: cable, amplifier, receiver; or with ampFirst (a masthead
 * LNA), amplifier, cable, receiver. Returns null when invalid.
 */
export function cascadeNF(cableLoss, ampGain, ampNF, rxNF, ampFirst = false) {
  const inputs = [cableLoss, ampGain, ampNF, rxNF];
  if (!inputs.every(Number.isFinite) || cableLoss < 0 || ampNF < 0 || rxNF < 0) return null;
  const linear = (db) => 10 ** (db / 10);
  const cable = { f: linear(cableLoss), g: 1 / linear(cableLoss) };
  const amp = { f: linear(ampNF), g: linear(ampGain) };
  const [first, second] = ampFirst ? [amp, cable] : [cable, amp];
  const f = first.f + (second.f - 1) / first.g + (linear(rxNF) - 1) / (first.g * second.g);
  const nf = 10 * Math.log10(f);
  return Number.isFinite(nf) ? nf : null;
}

/**
 * Least-squares fit of the log-distance model P(d) = p0 − 10 n log10(d / d0) to measured
 * [distance km, power dBm] points. Needs at least two distinct distances; returns null otherwise.
 * rmse is the RMS residual (the shadowing standard deviation, σ).
 */
export function fitPathLoss(points, d0) {
  const valid = points.filter(([d, p]) => Number.isFinite(d) && d > 0 && Number.isFinite(p));
  if (valid.length < 2 || !(d0 > 0)) return null;
  const xs = valid.map(([d]) => 10 * Math.log10(d / d0));
  const ys = valid.map(([, p]) => p);
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const mx = mean(xs);
  const my = mean(ys);
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  if (!(sxx > 1e-12)) return null; // All points at the same distance.
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / sxx;
  const p0 = my - slope * mx;
  const sse = xs.reduce((s, x, i) => s + (ys[i] - (p0 + slope * x)) ** 2, 0);
  const sst = ys.reduce((s, y) => s + (y - my) ** 2, 0);
  const fit = {
    n: -slope,
    p0,
    rmse: Math.sqrt(sse / valid.length),
    r2: sst > 0 ? 1 - sse / sst : 1,
    count: valid.length,
  };
  return Object.values(fit).every(Number.isFinite) ? fit : null;
}

export function fittedPower(fit, d0, d) {
  return fit.p0 - 10 * fit.n * Math.log10(d / d0);
}

/** Distance (km) at which the fitted power falls to threshold (dBm); null if it never does. */
export function fittedMaxDistance(fit, d0, threshold) {
  if (!(fit.n > 0)) return null;
  const d = d0 * 10 ** ((fit.p0 - threshold) / (10 * fit.n));
  return Number.isFinite(d) && d > 0 ? d : null;
}

/** Saved plans from before "Other path losses" existed have ten values; treat that loss as 0 dB. */
export function upgradePlan(p) {
  return Array.isArray(p?.values) && p.values.length === 10 ? { ...p, values: [...p.values, 0] } : p;
}

/** dBm → W when toWatts is true, otherwise W → dBm. Returns null when out of range. */
export function convertPower(x, toWatts) {
  if (!Number.isFinite(x) || (!toWatts && x <= 0)) return null;
  const y = toWatts ? 10 ** ((x - 30) / 10) : 10 * Math.log10(x) + 30;
  return Number.isFinite(y) && (!toWatts || y > 0) ? y : null;
}

/** One-way, first-order Doppler shift. v is radial velocity in m/s, positive when receding. */
export function doppler(f, v) {
  if (![f, v].every(Number.isFinite) || f <= 0 || Math.abs(v) > SPEED_OF_LIGHT / 100) return null;
  const shift = -f * (v / SPEED_OF_LIGHT);
  const received = f + shift;
  return Number.isFinite(shift) && Number.isFinite(received) && received > 0 ? { shift, received } : null;
}

export function validPlan(p) {
  try {
    return (
      !!p &&
      typeof p.id === 'string' &&
      typeof p.name === 'string' &&
      typeof p.notes === 'string' &&
      typeof p.date === 'string' &&
      Number.isFinite(Date.parse(p.date)) &&
      !!budget(p.values)
    );
  } catch {
    return false;
  }
}
