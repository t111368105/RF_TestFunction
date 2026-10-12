// DVB-S2 (ETSI EN 302 307-1 V1.4.1) parameters and the parts of the transmit chain that are small
// enough to compute on the page: frame sizes, constellations, BB and PL scrambling, PL signalling
// and the root raised cosine spectrum. Table and clause numbers refer to that standard.

// Table 5a (normal FECFRAME, nldpc = 64 800) and 5b (short, 16 200): [Kbch, Nbch, t] by code rate,
// and tables 7a/7b: the LDPC accumulator step q.
export const CODES = {
  '1/4': { normal: [16008, 16200, 12, 135], short: [3072, 3240, 12, 36] },
  '1/3': { normal: [21408, 21600, 12, 120], short: [5232, 5400, 12, 30] },
  '2/5': { normal: [25728, 25920, 12, 108], short: [6312, 6480, 12, 27] },
  '1/2': { normal: [32208, 32400, 12, 90], short: [7032, 7200, 12, 25] },
  '3/5': { normal: [38688, 38880, 12, 72], short: [9552, 9720, 12, 18] },
  '2/3': { normal: [43040, 43200, 10, 60], short: [10632, 10800, 12, 15] },
  '3/4': { normal: [48408, 48600, 12, 45], short: [11712, 11880, 12, 12] },
  '4/5': { normal: [51648, 51840, 12, 36], short: [12432, 12600, 12, 10] },
  '5/6': { normal: [53840, 54000, 10, 30], short: [13152, 13320, 12, 8] },
  '8/9': { normal: [57472, 57600, 8, 20], short: [14232, 14400, 12, 5] },
  '9/10': { normal: [58192, 58320, 8, 18], short: null },
};

export const NLDPC = { normal: 64800, short: 16200 };
export const BITS_PER_SYMBOL = { QPSK: 2, '8PSK': 3, '16APSK': 4, '32APSK': 5 };

// Table 12 (MODCOD number) and table 13 (ideal Es/N0 at QEF, normal frame, no pilots, AWGN).
export const MODCODS = [
  ['QPSK', '1/4', 1, -2.35],
  ['QPSK', '1/3', 2, -1.24],
  ['QPSK', '2/5', 3, -0.3],
  ['QPSK', '1/2', 4, 1.0],
  ['QPSK', '3/5', 5, 2.23],
  ['QPSK', '2/3', 6, 3.1],
  ['QPSK', '3/4', 7, 4.03],
  ['QPSK', '4/5', 8, 4.68],
  ['QPSK', '5/6', 9, 5.18],
  ['QPSK', '8/9', 10, 6.2],
  ['QPSK', '9/10', 11, 6.42],
  ['8PSK', '3/5', 12, 5.5],
  ['8PSK', '2/3', 13, 6.62],
  ['8PSK', '3/4', 14, 7.91],
  ['8PSK', '5/6', 15, 9.35],
  ['8PSK', '8/9', 16, 10.69],
  ['8PSK', '9/10', 17, 10.98],
  ['16APSK', '2/3', 18, 8.97],
  ['16APSK', '3/4', 19, 10.21],
  ['16APSK', '4/5', 20, 11.03],
  ['16APSK', '5/6', 21, 11.61],
  ['16APSK', '8/9', 22, 12.89],
  ['16APSK', '9/10', 23, 13.13],
  ['32APSK', '3/4', 24, 12.73],
  ['32APSK', '4/5', 25, 13.64],
  ['32APSK', '5/6', 26, 14.28],
  ['32APSK', '8/9', 27, 15.69],
  ['32APSK', '9/10', 28, 16.05],
].map(([mod, rate, code, esn0]) => ({ mod, rate, code, esn0, name: `${mod} ${rate}` }));

// Table 9 (16APSK γ = R2/R1) and table 10 (32APSK γ1 = R2/R1, γ2 = R3/R1), linear channel.
const APSK16 = { '2/3': 3.15, '3/4': 2.85, '4/5': 2.75, '5/6': 2.7, '8/9': 2.6, '9/10': 2.57 };
const APSK32 = { '3/4': [2.84, 5.27], '4/5': [2.72, 4.87], '5/6': [2.64, 4.64], '8/9': [2.54, 4.33], '9/10': [2.53, 4.3] };

export const SLOT = 90; // symbols
export const PILOT_BLOCK = 36; // symbols, every 16 slots
export const BBHEADER_BITS = 80;
export const TS_PACKET_BITS = 188 * 8;

/**
 * Frame structure for a MODCOD: BCH and LDPC sizes, slots S, PLFRAME length in symbols (clause 5.5,
 * figure 13) and the spectral efficiency: useful bits (Kbch minus the BBHEADER) per PLFRAME symbol.
 * Null for a code rate the frame size does not offer (9/10 short).
 */
export function frameInfo(modcod, frame = 'normal', pilots = false) {
  const code = CODES[modcod.rate][frame];
  if (!code) return null;
  const [kbch, nbch, t, q] = code;
  const nldpc = NLDPC[frame];
  const m = BITS_PER_SYMBOL[modcod.mod];
  const slots = nldpc / m / SLOT;
  const pilotBlocks = pilots ? Math.floor((slots - 1) / 16) : 0;
  const plSymbols = SLOT * (slots + 1) + PILOT_BLOCK * pilotBlocks;
  return {
    kbch,
    nbch,
    nldpc,
    t,
    q,
    bitsPerSymbol: m,
    slots,
    pilotBlocks,
    plSymbols,
    plEfficiency: (SLOT * slots) / plSymbols,
    efficiency: (kbch - BBHEADER_BITS) / plSymbols,
    codeRate: kbch / nldpc,
  };
}

/**
 * The interleaver of table 8: written column-wise, read row-wise; none for QPSK. 8PSK rate 3/5 reads
 * each row from the last column, so the first BBHEADER bit leaves third (clause 5.3.3, figure 8).
 */
export function interleaver(mod, frame = 'normal', rate = null) {
  const columns = BITS_PER_SYMBOL[mod];
  return mod === 'QPSK' ? null : { columns, rows: NLDPC[frame] / columns, reversed: mod === '8PSK' && rate === '3/5' };
}

const polar = (r, a, bits) => ({ i: r * Math.cos(a), q: r * Math.sin(a), bits });
const PI = Math.PI;

/**
 * Constellation points { i, q, bits } with unit average energy (figures 9 to 12): Gray-coded QPSK and
 * 8PSK, and 16APSK and 32APSK with the ring ratios of tables 9 and 10 for the code rate.
 */
export function constellation(mod, rate) {
  if (mod === 'QPSK') {
    return [
      [PI / 4, '00'],
      [-PI / 4, '01'],
      [(3 * PI) / 4, '10'],
      [(-3 * PI) / 4, '11'],
    ].map(([a, b]) => polar(1, a, b));
  }
  if (mod === '8PSK') {
    return [
      [PI / 4, '000'],
      [0, '001'],
      [PI, '010'],
      [(5 * PI) / 4, '011'],
      [PI / 2, '100'],
      [(7 * PI) / 4, '101'],
      [(3 * PI) / 4, '110'],
      [(3 * PI) / 2, '111'],
    ].map(([a, b]) => polar(1, a, b));
  }
  if (mod === '16APSK') {
    const g = APSK16[rate];
    const r1 = Math.sqrt(4 / (1 + 3 * g * g)); // R1² + 3 R2² = 4
    const r2 = g * r1;
    return [
      [r2, PI / 4, '0000'], [r2, -PI / 4, '0001'], [r2, (3 * PI) / 4, '0010'], [r2, (-3 * PI) / 4, '0011'],
      [r2, PI / 12, '0100'], [r2, -PI / 12, '0101'], [r2, (11 * PI) / 12, '0110'], [r2, (-11 * PI) / 12, '0111'],
      [r2, (5 * PI) / 12, '1000'], [r2, (-5 * PI) / 12, '1001'], [r2, (7 * PI) / 12, '1010'], [r2, (-7 * PI) / 12, '1011'],
      [r1, PI / 4, '1100'], [r1, -PI / 4, '1101'], [r1, (3 * PI) / 4, '1110'], [r1, (-3 * PI) / 4, '1111'],
    ].map(([r, a, b]) => polar(r, a, b));
  }
  const [g1, g2] = APSK32[rate];
  const r1 = Math.sqrt(8 / (1 + 3 * g1 * g1 + 4 * g2 * g2)); // R1² + 3 R2² + 4 R3² = 8
  const [r2, r3] = [g1 * r1, g2 * r1];
  return [
    [r2, PI / 4, '00000'], [r2, (5 * PI) / 12, '00001'], [r2, -PI / 4, '00010'], [r2, (-5 * PI) / 12, '00011'],
    [r2, (3 * PI) / 4, '00100'], [r2, (7 * PI) / 12, '00101'], [r2, (-3 * PI) / 4, '00110'], [r2, (-7 * PI) / 12, '00111'],
    [r3, PI / 8, '01000'], [r3, (3 * PI) / 8, '01001'], [r3, -PI / 4, '01010'], [r3, -PI / 2, '01011'],
    [r3, (3 * PI) / 4, '01100'], [r3, PI / 2, '01101'], [r3, (-7 * PI) / 8, '01110'], [r3, (-5 * PI) / 8, '01111'],
    [r2, PI / 12, '10000'], [r1, PI / 4, '10001'], [r2, -PI / 12, '10010'], [r1, -PI / 4, '10011'],
    [r2, (11 * PI) / 12, '10100'], [r1, (3 * PI) / 4, '10101'], [r2, (-11 * PI) / 12, '10110'], [r1, (-3 * PI) / 4, '10111'],
    [r3, 0, '11000'], [r3, PI / 4, '11001'], [r3, -PI / 8, '11010'], [r3, (-3 * PI) / 8, '11011'],
    [r3, (7 * PI) / 8, '11100'], [r3, (5 * PI) / 8, '11101'], [r3, PI, '11110'], [r3, (-3 * PI) / 4, '11111'],
  ].map(([r, a, b]) => polar(r, a, b));
}

/** Ring radii of an APSK constellation with unit average energy. */
export function ringRadii(mod, rate) {
  const radii = [...new Set(constellation(mod, rate).map((p) => Math.hypot(p.i, p.q).toFixed(6)))].map(Number);
  return radii.sort((a, b) => a - b);
}

/**
 * The BB scrambling sequence (clause 5.2.2): PRBS 1 + X^14 + X^15 loaded with 100101010000000 at the
 * start of every BBFRAME. Returns its first n bits.
 */
export function bbScramblingSequence(n) {
  const reg = [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0]; // stages 1 … 15
  const out = [];
  for (let k = 0; k < n; k++) {
    const bit = reg[13] ^ reg[14];
    out.push(bit);
    reg.pop();
    reg.unshift(bit);
  }
  return out;
}

// Clause 5.5.2.4: the (32,6) code is a first-order Reed-Muller code; its generator rows, from the
// MODCOD MSB to the TYPE MSB, match the reference implementation in GNU Radio gr-dtv
// (0x55555555, 0x33333333, 0x0F0F0F0F, 0x00FF00FF, 0x0000FFFF, 0xFFFFFFFF).
const PLS_G = [0x55555555, 0x33333333, 0x0f0f0f0f, 0x00ff00ff, 0x0000ffff, 0xffffffff].map((row) =>
  Array.from({ length: 32 }, (_, k) => (row >>> (31 - k)) & 1),
);
const PLS_SCRAMBLE = [...'0111000110011101100000111100100101010011010000100010110111111010'].map(Number);
export const SOF_BITS = [...parseInt('18D2E82', 16).toString(2).padStart(26, '0')].map(Number);

/**
 * The 64-bit PLS code for a MODCOD number (0 for a dummy PLFRAME) and TYPE (2 bits: short frame,
 * pilots), after its scrambling sequence.
 */
export function plsCode(modcod, short = false, pilots = false) {
  const b = [...modcod.toString(2).padStart(5, '0')].map(Number).concat(short ? 1 : 0);
  const y = PLS_G[0].map((_, col) => b.reduce((acc, bit, row) => acc ^ (bit & PLS_G[row][col]), 0));
  const code = y.flatMap((bit) => [bit, pilots ? 1 - bit : bit]);
  return code.map((bit, k) => bit ^ PLS_SCRAMBLE[k]);
}

/** PLHEADER bits (SOF then PLS code) as π/2-BPSK symbols (clause 5.5.2). */
export function plHeaderSymbols(bits) {
  const s = Math.SQRT1_2;
  return bits.map((y, k) => {
    const v = s * (1 - 2 * y);
    // Odd positions (1-based) sit on the +45° line, even ones on the −45° line.
    return k % 2 === 0 ? { i: v, q: v } : { i: -v, q: v };
  });
}

/** Root raised cosine amplitude |H(f)| (clause 5.6) with fN = Rs/2. */
export function rrc(f, rs, alpha) {
  const fn = rs / 2;
  const a = Math.abs(f);
  if (a < fn * (1 - alpha)) return 1;
  if (a > fn * (1 + alpha)) return 0;
  return Math.sqrt(0.5 + 0.5 * Math.sin((Math.PI / (2 * fn)) * ((fn - a) / alpha)));
}

// ---------------------------------------------------------------- receiver side
// The standard leaves the receiver open; these are the textbook techniques the page illustrates.

const sinc = (x) => (Math.abs(x) < 1e-12 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));

/** Raised cosine pulse at t symbol periods: the SRRC of the transmitter and the matched filter in cascade. */
export function rcPulse(t, alpha) {
  const d = 1 - (2 * alpha * t) ** 2;
  if (Math.abs(d) < 1e-9) return (Math.PI / 4) * sinc(1 / (2 * alpha));
  return (sinc(t) * Math.cos(Math.PI * alpha * t)) / d;
}

/** Square-root raised cosine impulse response at t symbol periods, with unit energy. */
export function srrcPulse(t, alpha) {
  if (Math.abs(t) < 1e-12) return 1 - alpha + (4 * alpha) / Math.PI;
  if (Math.abs(Math.abs(t) - 1 / (4 * alpha)) < 1e-9) {
    const a = Math.PI / (4 * alpha);
    return (alpha / Math.SQRT2) * ((1 + 2 / Math.PI) * Math.sin(a) + (1 - 2 / Math.PI) * Math.cos(a));
  }
  return (
    (Math.sin(Math.PI * t * (1 - alpha)) + 4 * alpha * t * Math.cos(Math.PI * t * (1 + alpha))) /
    (Math.PI * t * (1 - (4 * alpha * t) ** 2))
  );
}

/**
 * SOF search over complex samples r ({i, q}): at each start n, the coherent correlation
 * |Σ r(n+i) s*(i)| / 26 and the differential one |Σ r(n+i) r*(n+i−1) (s(i) s*(i−1))*| / 25, both 1 for
 * a clean SOF. The differential form ignores a constant frequency offset.
 */
export function sofCorrelation(r) {
  const sof = plHeaderSymbols(SOF_BITS);
  const mul = (a, b) => ({ i: a.i * b.i - a.q * b.q, q: a.i * b.q + a.q * b.i });
  const conj = (a) => ({ i: a.i, q: -a.q });
  const ref = sof.slice(1).map((s, k) => conj(mul(s, conj(sof[k]))));
  const out = [];
  for (let n = 0; n + sof.length <= r.length; n++) {
    let ci = 0;
    let cq = 0;
    let di = 0;
    let dq = 0;
    for (let k = 0; k < sof.length; k++) {
      const c = mul(r[n + k], conj(sof[k]));
      ci += c.i;
      cq += c.q;
      if (k > 0) {
        const d = mul(mul(r[n + k], conj(r[n + k - 1])), ref[k - 1]);
        di += d.i;
        dq += d.q;
      }
    }
    out.push({ coherent: Math.hypot(ci, cq) / sof.length, differential: Math.hypot(di, dq) / (sof.length - 1) });
  }
  return out;
}

const logAdd = (a, b) => {
  const m = Math.max(a, b);
  return m === -Infinity ? m : m + Math.log(Math.exp(a - m) + Math.exp(b - m));
};

/** LLR ln P(b_k = 0) / P(b_k = 1) of each bit of a received point, exact or max-log, for noise density n0. */
export function bitLlrs(points, i, q, n0, maxLog = false) {
  return Array.from({ length: points[0].bits.length }, (_, k) => {
    let zero = -Infinity;
    let one = -Infinity;
    for (const p of points) {
      const metric = -((p.i - i) ** 2 + (p.q - q) ** 2) / n0;
      if (p.bits[k] === '0') zero = maxLog ? Math.max(zero, metric) : logAdd(zero, metric);
      else one = maxLog ? Math.max(one, metric) : logAdd(one, metric);
    }
    return zero - one;
  });
}

/**
 * A small regular LDPC code after Gallager: n bits, every bit in wc checks, every check over wr bits.
 * The first band of checks covers consecutive bits; the others are seeded column permutations of it.
 * Returns the bits of each check and the checks of each bit.
 */
export function gallagerLdpc(n, wc = 3, wr = 6, seed = 1) {
  let state = seed >>> 0;
  const rand = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const band = n / wr;
  const checks = [];
  for (let b = 0; b < wc; b++) {
    const perm = Array.from({ length: n }, (_, k) => k);
    if (b > 0) {
      for (let k = n - 1; k > 0; k--) {
        const j = Math.floor(rand() * (k + 1));
        [perm[k], perm[j]] = [perm[j], perm[k]];
      }
    }
    for (let c = 0; c < band; c++) checks.push(perm.slice(c * wr, (c + 1) * wr));
  }
  const bits = Array.from({ length: n }, () => []);
  checks.forEach((row, c) => row.forEach((v) => bits[v].push(c)));
  return { n, checks, bits };
}

/**
 * Flooding min-sum decoding of channel LLRs (positive for 0) on a code from gallagerLdpc. Stops when
 * every check is satisfied. Returns the hard decisions and, from iteration 0 (the channel alone), the
 * number of unsatisfied checks and of ones (bit errors when the all-zero codeword was sent).
 */
export function minSumDecode({ checks }, channel, maxIterations = 30) {
  const c2v = checks.map((row) => row.map(() => 0));
  let total = channel.slice();
  let hard = total.map((l) => (l < 0 ? 1 : 0));
  const status = () => ({
    unsatisfied: checks.filter((row) => row.reduce((acc, v) => acc ^ hard[v], 0)).length,
    errors: hard.reduce((a, b) => a + b, 0),
  });
  const history = [status()];
  for (let it = 0; it < maxIterations && history[history.length - 1].unsatisfied > 0; it++) {
    checks.forEach((row, c) => {
      const v2c = row.map((v, j) => total[v] - c2v[c][j]);
      let sign = 1;
      let min1 = Infinity;
      let min2 = Infinity;
      let at = -1;
      v2c.forEach((m, j) => {
        if (m < 0) sign = -sign;
        const a = Math.abs(m);
        if (a < min1) {
          [min2, min1, at] = [min1, a, j];
        } else if (a < min2) min2 = a;
      });
      row.forEach((_, j) => {
        c2v[c][j] = sign * (v2c[j] < 0 ? -1 : 1) * (j === at ? min2 : min1);
      });
    });
    total = channel.slice();
    checks.forEach((row, c) => row.forEach((v, j) => (total[v] += c2v[c][j])));
    hard = total.map((l) => (l < 0 ? 1 : 0));
    history.push(status());
  }
  return { hard, history };
}

/**
 * SYNCD of BBFRAME j (bits from the DATA FIELD start to the first packet start) when a packet stream
 * of upl-bit packets starts with frame 0 and every DATA FIELD holds dfl bits.
 */
export function syncd(j, dfl, upl = TS_PACKET_BITS) {
  return (upl - ((j * dfl) % upl)) % upl;
}

/** The MODCODs whose ideal Es/N0 plus margin is met, most efficient last. */
export function usableModcods(esn0, margin = 0) {
  return MODCODS.filter((m) => m.esn0 + margin <= esn0).sort((a, b) => frameInfo(a).efficiency - frameInfo(b).efficiency);
}
