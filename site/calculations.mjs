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
];

const POSITIVE = [0, 1];
const NON_NEGATIVE = [6, 7, 9];

/** Index of the first link value that fails validation, or -1. */
export function invalidIndex(values) {
  return values.findIndex(
    (x, i) =>
      !Number.isFinite(x) ||
      (POSITIVE.includes(i) && x <= 0) ||
      (NON_NEGATIVE.includes(i) && x < 0),
  );
}

/** Strict decimal parser; accepts a comma as decimal separator. Returns NaN when invalid. */
export function number(x) {
  const s = String(x).trim().replaceAll(',', '.');
  const valid = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(s) && Number.isFinite(Number(s));
  return valid ? Number(s) : NaN;
}

export function budget(v) {
  if (v.length !== 10) throw Error('Ten link parameters are required');
  const bad = invalidIndex(v);
  if (bad >= 0) throw Error(`Please check ${labels[bad]}`);

  const [f, d, p, t, r, a, tl, rl, s, m] = v;
  if (d < 1e-140 || d > 1e140) throw Error('Distance is outside the analysis range');

  const fspl = 20 * Math.log10(d) + 20 * Math.log10(f) + FSPL_CONSTANT;
  const received = p - tl + t + r - fspl;
  const output = received - rl + a;
  const margin = output - s;
  const stages = [
    ['Transmitter output', 'Initial TX power', p],
    ['TX antenna input', `TX cable loss −${tl} dB`, p - tl],
    ['EIRP', `TX antenna gain ${t} dB`, p - tl + t],
    ['After free-space loss', `FSPL −${fspl} dB`, p - tl + t - fspl],
    ['RX antenna output', `RX antenna gain ${r} dB`, received],
    ['RX amplifier input', `RX cable loss −${rl} dB`, received - rl],
    ['Receiver input', `Amplifier gain ${a} dB`, output],
  ];
  const results = [fspl, received, output, margin, ...stages.map((x) => x[2]), s + m];
  if (!results.every(Number.isFinite)) throw Error('Values are outside the calculation range');

  // Distance at which the margin exactly equals the required margin (20 dB per decade).
  const maxDistance = 10 ** (Math.log10(d) + (margin - m) / 20);
  return {
    fspl,
    received,
    output,
    margin,
    stages,
    maxDistance: Number.isFinite(maxDistance) && maxDistance > 0 ? maxDistance : null,
    meets: margin >= m,
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
