// Pure RF calculations shared by the UI and the Node tests. Formulas follow the original Swift app.

const SPEED_OF_LIGHT = 299792458; // m/s
const FSPL_CONSTANT = 32.44; // dB, for MHz and km
const THERMAL_NOISE_290K = -173.975; // dBm/Hz

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
  'Other path losses (dB)',
];

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

export function budget(v) {
  if (v.length !== labels.length) throw Error(`${labels.length} link parameters are required`);
  const bad = invalidIndex(v);
  if (bad >= 0) throw Error(`Please check ${labels[bad]}`);

  const [f, d, p, t, r, a, tl, rl, s, m, o] = v;
  if (d < 1e-140 || d > 1e140) throw Error('Distance is outside the analysis range');

  const fspl = 20 * Math.log10(d) + 20 * Math.log10(f) + FSPL_CONSTANT;
  const received = p - tl + t + r - fspl - o;
  const output = received - rl + a;
  const margin = output - s;
  const stages = [
    ['Transmitter output', 'Initial TX power', p],
    ['TX antenna input', `TX cable loss −${tl} dB`, p - tl],
    ['EIRP', `TX antenna gain ${t} dB`, p - tl + t],
    ['After free-space loss', `FSPL −${fspl} dB`, p - tl + t - fspl],
    ['After other path losses', `Other losses −${o} dB`, p - tl + t - fspl - o],
    ['RX antenna output', `RX antenna gain ${r} dB`, received],
    ['RX amplifier input', `RX cable loss −${rl} dB`, received - rl],
    ['Receiver input', `Amplifier gain ${a} dB`, output],
  ];
  const results = [fspl, received, output, margin, ...stages.map((x) => x[2]), s + m];
  if (!results.every(Number.isFinite)) throw Error('Values are outside the calculation range');

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
      margin < 0 ? 'Below receiver sensitivity' : margin < m ? 'Margin target not met' : 'Margin target met',
  };
}

/** Receiver input power (dBm) at distance d (km), scaling FSPL from the configured distance. */
export function powerAt(v, d) {
  return budget(v).output - 20 * (Math.log10(d) - Math.log10(v[1]));
}

/** Noise floor referred to the RX antenna output at 290 K; SNR uses the RX antenna output power. */
export function noise(v, bw, nf, target) {
  if (![bw, nf, target].every(Number.isFinite) || bw <= 0 || nf < 0) return null;
  const floor = THERMAL_NOISE_290K + 10 * Math.log10(bw) + nf;
  const snr = budget(v).received - floor;
  const margin = snr - target;
  return [floor, snr, margin].every(Number.isFinite) ? { floor, snr, margin } : null;
}

/**
 * Digital link quality at the RX antenna output (the same reference as noise()), with N0 at 290 K:
 * C/N0 (dB-Hz), Eb/N0 = C/N0 − 10 log10(rate), and the margin over required Eb/N0 plus implementation
 * loss. rate (bit/s) and required may be NaN when not entered; the dependent results are then null.
 * Returns null when the noise figure is invalid.
 */
export function dataLink(v, nf, rate, required, implLoss) {
  if (!Number.isFinite(nf) || nf < 0) return null;
  const cn0 = budget(v).received - (THERMAL_NOISE_290K + nf);
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
 * Friis cascade noise figure (dB) referred to the RX antenna output: RX cable (a passive loss at
 * 290 K, so its NF equals its loss), then the amplifier, then the receiver. Returns null when invalid.
 */
export function cascadeNF(cableLoss, ampGain, ampNF, rxNF) {
  const inputs = [cableLoss, ampGain, ampNF, rxNF];
  if (!inputs.every(Number.isFinite) || cableLoss < 0 || ampNF < 0 || rxNF < 0) return null;
  const linear = (db) => 10 ** (db / 10);
  const g1 = 1 / linear(cableLoss);
  const g2 = linear(ampGain);
  const f = linear(cableLoss) + (linear(ampNF) - 1) / g1 + (linear(rxNF) - 1) / (g1 * g2);
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
