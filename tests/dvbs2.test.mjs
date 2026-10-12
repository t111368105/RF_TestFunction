import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODCODS,
  frameInfo,
  interleaver,
  constellation,
  ringRadii,
  bbScramblingSequence,
  plsCode,
  plHeaderSymbols,
  SOF_BITS,
  rrc,
  usableModcods,
  rcPulse,
  srrcPulse,
  sofCorrelation,
  bitLlrs,
  gallagerLdpc,
  minSumDecode,
  syncd,
} from '../site/dvbs2.mjs';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

// ETSI EN 302 307-1 V1.4.1, table 13: spectral efficiency, normal FECFRAME, no pilots.
const TABLE_13 = {
  'QPSK 1/4': 0.490243, 'QPSK 1/3': 0.656448, 'QPSK 2/5': 0.789412, 'QPSK 1/2': 0.988858, 'QPSK 3/5': 1.188304,
  'QPSK 2/3': 1.322253, 'QPSK 3/4': 1.487473, 'QPSK 4/5': 1.587196, 'QPSK 5/6': 1.654663, 'QPSK 8/9': 1.766451,
  'QPSK 9/10': 1.788612, '8PSK 3/5': 1.779991, '8PSK 2/3': 1.980636, '8PSK 3/4': 2.228124, '8PSK 5/6': 2.478562,
  '8PSK 8/9': 2.646012, '8PSK 9/10': 2.679207, '16APSK 2/3': 2.637201, '16APSK 3/4': 2.966728, '16APSK 4/5': 3.165623,
  '16APSK 5/6': 3.300184, '16APSK 8/9': 3.523143, '16APSK 9/10': 3.567342, '32APSK 3/4': 3.703295, '32APSK 4/5': 3.951571,
  '32APSK 5/6': 4.11954, '32APSK 8/9': 4.397854, '32APSK 9/10': 4.453027,
};

test('Spectral efficiencies match table 13', () => {
  assert.equal(MODCODS.length, 28);
  for (const m of MODCODS) near(frameInfo(m).efficiency, TABLE_13[m.name], 1e-6);
});

test('Slots and framing efficiency match table 11', () => {
  const qpsk = MODCODS[0];
  const byMod = (mod) => MODCODS.find((m) => m.mod === mod);
  for (const [mod, normal, short, eff] of [
    ['QPSK', 360, 90, 99.72],
    ['8PSK', 240, 60, 99.59],
    ['16APSK', 180, 45, 99.45],
    ['32APSK', 144, 36, 99.31],
  ]) {
    assert.equal(frameInfo(byMod(mod)).slots, normal);
    assert.equal(frameInfo(byMod(mod), 'short').slots, short);
    near(100 * frameInfo(byMod(mod)).plEfficiency, eff, 0.005);
  }
  // With pilots: 36 symbols every 16 slots, none at the frame end.
  const p = frameInfo(qpsk, 'normal', true);
  assert.equal(p.pilotBlocks, 22);
  assert.equal(p.plSymbols, 90 * 361 + 36 * 22);
  assert.equal(frameInfo(MODCODS.find((m) => m.rate === '9/10'), 'short'), null);
  assert.deepEqual(interleaver('8PSK', 'normal', '3/4'), { columns: 3, rows: 21600, reversed: false });
  assert.deepEqual(interleaver('32APSK', 'short'), { columns: 5, rows: 3240, reversed: false });
  assert.equal(interleaver('8PSK', 'normal', '3/5').reversed, true); // figure 8
  assert.equal(interleaver('QPSK'), null);
});

test('Constellations have unit energy, the table 9 and 10 ring ratios, and Gray-coded PSK', () => {
  for (const m of MODCODS) {
    const pts = constellation(m.mod, m.rate);
    assert.equal(pts.length, 2 ** { QPSK: 2, '8PSK': 3, '16APSK': 4, '32APSK': 5 }[m.mod]);
    assert.equal(new Set(pts.map((p) => p.bits)).size, pts.length);
    near(pts.reduce((s, p) => s + p.i ** 2 + p.q ** 2, 0) / pts.length, 1, 1e-12);
  }
  const r16 = ringRadii('16APSK', '2/3');
  near(r16[1] / r16[0], 3.15, 1e-4); // The radii are rounded to 6 decimals.
  const r32 = ringRadii('32APSK', '3/4');
  near(r32[1] / r32[0], 2.84, 1e-4);
  near(r32[2] / r32[0], 5.27, 1e-4);
  // Neighbouring PSK points differ in one bit.
  for (const mod of ['QPSK', '8PSK']) {
    const pts = constellation(mod).sort((a, b) => Math.atan2(a.q, a.i) - Math.atan2(b.q, b.i));
    pts.forEach((p, k) => {
      const next = pts[(k + 1) % pts.length];
      assert.equal([...p.bits].filter((b, j) => b !== next.bits[j]).length, 1, `${mod} ${p.bits} ${next.bits}`);
    });
  }
});

test('BB scrambling starts as in figure 5 of the standard', () => {
  assert.equal(bbScramblingSequence(8).join(''), '00000011');
  // The sequence repeats with period 2^15 − 1.
  const s = bbScramblingSequence(32767 + 20);
  assert.equal(s.slice(32767).join(''), s.slice(0, 20).join(''));
});

test('PLHEADER: SOF, PLS codewords 32 apart, and π/2-BPSK', () => {
  assert.equal(parseInt(SOF_BITS.join(''), 2).toString(16).toUpperCase(), '18D2E82');
  const codes = [];
  for (let modcod = 0; modcod < 32; modcod++) {
    for (const short of [false, true]) for (const pilots of [false, true]) codes.push(plsCode(modcod, short, pilots));
  }
  let min = Infinity;
  for (let a = 0; a < codes.length; a++) {
    for (let b = a + 1; b < codes.length; b++) min = Math.min(min, codes[a].filter((x, k) => x !== codes[b][k]).length);
  }
  assert.equal(min, 32); // (64,7) code with dmin = 32 (clause 5.5.2)
  const sym = plHeaderSymbols([0, 0, 1, 1]);
  near(sym[0].i, Math.SQRT1_2, 1e-12);
  near(sym[0].q, Math.SQRT1_2, 1e-12);
  near(sym[1].i, -Math.SQRT1_2, 1e-12);
  near(sym[1].q, Math.SQRT1_2, 1e-12);
  near(sym[2].i, -Math.SQRT1_2, 1e-12);
  near(sym[3].q, -Math.SQRT1_2, 1e-12);
});

test('The SRRC is flat, half power at the Nyquist frequency, and zero beyond (1 + α)', () => {
  near(rrc(0.3, 1, 0.2), 1, 1e-12);
  near(rrc(0.5, 1, 0.2) ** 2, 0.5, 1e-12);
  assert.equal(rrc(0.61, 1, 0.2), 0);
  // ACM: at 10 dB with 1 dB margin, 8PSK 5/6 (9.35 dB) is out and 8PSK 3/4 (7.91 dB) in.
  const usable = usableModcods(10, 1).map((m) => m.name);
  assert.ok(usable.includes('8PSK 3/4') && !usable.includes('8PSK 5/6'));
});

test('Two SRRC filters in cascade make a raised cosine, zero at the other symbol instants', () => {
  for (const alpha of [0.2, 0.25, 0.35]) {
    for (const k of [1, 2, 3, -4]) near(rcPulse(k, alpha), 0, 1e-12);
    near(rcPulse(0, alpha), 1, 1e-12);
    for (const t of [0, 0.5, 1, 1.5]) {
      let sum = 0;
      const dt = 0.005;
      for (let x = -40; x <= 40; x += dt) sum += srrcPulse(x, alpha) * srrcPulse(t - x, alpha) * dt;
      near(sum, rcPulse(t, alpha), 5e-3);
    }
    // The special points are continuous with their neighbours.
    near(srrcPulse(1 / (4 * alpha), alpha), srrcPulse(1 / (4 * alpha) + 1e-6, alpha), 1e-4);
    near(rcPulse(1 / (2 * alpha), alpha), rcPulse(1 / (2 * alpha) + 1e-6, alpha), 1e-4);
  }
});

test('The differential SOF correlation finds the frame despite a frequency offset', () => {
  const header = plHeaderSymbols([...SOF_BITS, ...plsCode(4)]);
  const stream = (df) =>
    Array.from({ length: 200 }, (_, n) => {
      const s = header[n - 60] ?? { i: Math.cos(n * 2.1), q: Math.sin(n * 2.1) };
      const a = 2 * Math.PI * df * n;
      return { i: s.i * Math.cos(a) - s.q * Math.sin(a), q: s.i * Math.sin(a) + s.q * Math.cos(a) };
    });
  const peak = (c, key) => c.reduce((best, x, n) => (x[key] > c[best][key] ? n : best), 0);
  const still = sofCorrelation(stream(0));
  near(still[60].coherent, 1, 1e-12);
  near(still[60].differential, 1, 1e-12);
  const moving = sofCorrelation(stream(0.05));
  assert.equal(peak(moving, 'differential'), 60);
  near(moving[60].differential, 1, 1e-12);
  assert.ok(moving[60].coherent < 0.3);
});

test('Bit LLRs: the QPSK closed form, and max-log keeps the sign', () => {
  const qpsk = constellation('QPSK');
  const [i, q, n0] = [0.3, -0.2, 0.5];
  const [l0, l1] = bitLlrs(qpsk, i, q, n0);
  near(l0, (2 * Math.SQRT2 * i) / n0, 1e-12); // first bit: 0 on the right half
  near(l1, (2 * Math.SQRT2 * q) / n0, 1e-12); // second bit: 0 on the upper half
  const apsk = constellation('16APSK', '3/4');
  for (const p of apsk) {
    const exact = bitLlrs(apsk, p.i, p.q, 0.1);
    const maxLog = bitLlrs(apsk, p.i, p.q, 0.1, true);
    exact.forEach((l, k) => {
      assert.equal(Math.sign(l), p.bits[k] === '0' ? 1 : -1);
      assert.equal(Math.sign(maxLog[k]), Math.sign(l));
    });
  }
});

test('The toy LDPC code is regular and min-sum corrects a few errors', () => {
  const code = gallagerLdpc(480, 3, 6, 7);
  assert.equal(code.checks.length, 240);
  assert.ok(code.checks.every((row) => row.length === 6 && new Set(row).size === 6));
  assert.ok(code.bits.every((c) => c.length === 3));
  const llr = Array(480).fill(4);
  for (const k of [3, 100, 250, 401]) llr[k] = -1.5;
  const { hard, history } = minSumDecode(code, llr);
  assert.equal(history[0].errors, 4);
  assert.ok(history[0].unsatisfied > 0);
  assert.equal(hard.reduce((a, b) => a + b, 0), 0);
  assert.equal(history[history.length - 1].unsatisfied, 0);
});

test('SYNCD follows the packets across frames', () => {
  assert.equal(syncd(0, 48328), 0);
  assert.equal(syncd(1, 48328), 1504 - (48328 % 1504));
  assert.equal(syncd(4, 1504 * 3), 0);
});
