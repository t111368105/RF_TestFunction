// Signal math for the Learn page: spectra, sampling, analog modulation and digital constellations.

/** A small seeded random generator (mulberry32), so a demo shows the same noise for the same inputs. */
export function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal samples from a uniform generator (Box–Muller). */
export function gaussian(rand) {
  const u = 1 - rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

/** Complementary error function (Numerical Recipes erfcc, relative error below 1.2e-7). */
export function erfc(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + z / 2);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 +
        t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

/** Gaussian tail probability Q(x). */
export const qFunction = (x) => erfc(x / Math.SQRT2) / 2;

/**
 * Single-sided amplitude spectrum of samples taken over `duration` seconds: [frequency, amplitude]
 * for bins 0 … maxBin, scaled so a sine of amplitude A shows A. Bins are 1/duration apart.
 */
export function amplitudeSpectrum(samples, duration, maxBin) {
  const n = samples.length;
  const out = [];
  for (let k = 0; k <= maxBin; k++) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const a = (-2 * Math.PI * k * i) / n;
      re += samples[i] * Math.cos(a);
      im += samples[i] * Math.sin(a);
    }
    out.push([k / duration, (Math.hypot(re, im) / n) * (k === 0 ? 1 : 2)]);
  }
  return out;
}

/**
 * The frequency a sine of frequency f appears at after sampling at fs: signed, between −fs/2 and
 * fs/2, so sin(2π f n / fs) = sin(2π alias n / fs) at every sample n.
 */
export function aliasFrequency(f, fs) {
  return f - fs * Math.round(f / fs);
}

/** Carson's rule: the bandwidth (Hz) holding about 98 % of an FM signal's power. */
export const carsonBandwidth = (beta, fm) => 2 * (beta + 1) * fm;

const gray = (i) => i ^ (i >> 1);
const toBits = (value, k) => value.toString(2).padStart(k, '0');

export const SCHEMES = {
  bpsk: { name: 'BPSK', M: 2 },
  qpsk: { name: 'QPSK', M: 4 },
  '8psk': { name: '8PSK', M: 8 },
  '16qam': { name: '16QAM', M: 16 },
  '64qam': { name: '64QAM', M: 64 },
};

/**
 * Gray-coded constellation points { i, q, bits } with an average symbol energy of 1. Square QAM
 * (QPSK as 4-QAM) codes I with the first half of the bits and Q with the second half, so
 * neighbouring points differ in one bit; 8PSK is Gray-coded around the circle.
 */
export function constellation(scheme) {
  const { M } = SCHEMES[scheme];
  const k = Math.log2(M);
  if (scheme === 'bpsk') return [0, 1].map((b) => ({ i: b ? 1 : -1, q: 0, bits: String(b) }));
  if (scheme === '8psk') {
    return Array.from({ length: M }, (_, n) => {
      const a = (2 * Math.PI * n) / M + Math.PI / M;
      return { i: Math.cos(a), q: Math.sin(a), bits: toBits(gray(n), k) };
    });
  }
  const side = Math.sqrt(M);
  const half = k / 2;
  const level = (n) => 2 * n - (side - 1);
  const points = [];
  for (let a = 0; a < side; a++) {
    for (let b = 0; b < side; b++) {
      points.push({ i: level(a), q: level(b), bits: toBits(gray(a), half) + toBits(gray(b), half) });
    }
  }
  const scale = Math.sqrt(points.reduce((sum, p) => sum + p.i ** 2 + p.q ** 2, 0) / M);
  return points.map((p) => ({ ...p, i: p.i / scale, q: p.q / scale }));
}

/** Splits a bit string into symbols of the scheme, padding the last one with zeros. */
export function bitsToSymbols(bits, scheme) {
  const k = Math.log2(SCHEMES[scheme].M);
  const clean = bits.replace(/[^01]/g, '');
  const points = constellation(scheme);
  const out = [];
  for (let n = 0; n < clean.length; n += k) {
    const group = clean.slice(n, n + k);
    const padded = group.padEnd(k, '0');
    out.push({ bits: padded, padded: group.length < k, point: points.find((p) => p.bits === padded) });
  }
  return out;
}

/** The constellation point nearest to (i, q): the receiver's decision. */
export function decide(points, i, q) {
  let best = points[0];
  let distance = Infinity;
  for (const p of points) {
    const d = (p.i - i) ** 2 + (p.q - q) ** 2;
    if (d < distance) {
      distance = d;
      best = p;
    }
  }
  return best;
}

/** Smallest distance between two points of a constellation (average symbol energy 1). */
export function minimumDistance(points) {
  let d = Infinity;
  for (let a = 0; a < points.length; a++) {
    for (let b = a + 1; b < points.length; b++) d = Math.min(d, Math.hypot(points[a].i - points[b].i, points[a].q - points[b].q));
  }
  return d;
}

/**
 * Sends n random symbols through additive white Gaussian noise at Eb/N0 (dB): the received
 * points with their decisions, and the measured bit and symbol error rates.
 */
export function simulate(scheme, ebn0dB, n, seed = 1) {
  const points = constellation(scheme);
  const k = Math.log2(points.length);
  const esn0 = k * 10 ** (ebn0dB / 10);
  const sigma = Math.sqrt(1 / (2 * esn0)); // Per dimension, for a symbol energy of 1.
  const rand = random(seed);
  let bitErrors = 0;
  let symbolErrors = 0;
  const received = [];
  for (let s = 0; s < n; s++) {
    const sent = points[Math.floor(rand() * points.length)];
    const i = sent.i + sigma * gaussian(rand);
    const q = sent.q + sigma * gaussian(rand);
    const got = decide(points, i, q);
    if (got !== sent) {
      symbolErrors++;
      for (let b = 0; b < k; b++) if (got.bits[b] !== sent.bits[b]) bitErrors++;
    }
    received.push({ i, q, error: got !== sent });
  }
  return { received, ber: bitErrors / (n * k), ser: symbolErrors / n };
}

/**
 * Bit error rate in AWGN at Eb/N0 (dB) with Gray coding: exact for BPSK and QPSK, the usual
 * nearest-neighbour approximations for 8PSK and square QAM.
 */
export function theoreticalBer(scheme, ebn0dB) {
  const { M } = SCHEMES[scheme];
  const k = Math.log2(M);
  const g = 10 ** (ebn0dB / 10);
  if (scheme === 'bpsk' || scheme === 'qpsk') return qFunction(Math.sqrt(2 * g));
  if (scheme === '8psk') return (2 / k) * qFunction(Math.sqrt(2 * k * g) * Math.sin(Math.PI / M));
  return (4 / k) * (1 - 1 / Math.sqrt(M)) * qFunction(Math.sqrt((3 * k * g) / (M - 1)));
}
