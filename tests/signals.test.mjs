import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  erfc,
  qFunction,
  amplitudeSpectrum,
  aliasFrequency,
  carsonBandwidth,
  SCHEMES,
  constellation,
  bitsToSymbols,
  minimumDistance,
  simulate,
  theoreticalBer,
  noisePower,
  noiseFloor,
  fromAnalyzerReading,
} from '../site/signals.mjs';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

test('erfc and Q match reference values', () => {
  near(erfc(0), 1, 1e-7);
  near(erfc(1), 0.157299207050285, 2e-7);
  near(erfc(-1), 1.842700792949715, 2e-7);
  near(qFunction(0), 0.5, 1e-7);
  near(qFunction(3), 0.0013498980316301, 1e-9);
});

test('The amplitude spectrum shows each sine at its frequency and amplitude', () => {
  const n = 512;
  const x = Array.from({ length: n }, (_, i) => 0.8 * Math.sin((2 * Math.PI * 5 * i) / n) + 0.3 * Math.cos((2 * Math.PI * 12 * i) / n) + 0.2);
  const s = amplitudeSpectrum(x, 1, 20);
  near(s[0][1], 0.2, 1e-9);
  near(s[5][1], 0.8, 1e-9);
  near(s[12][1], 0.3, 1e-9);
  near(s[7][1], 0, 1e-9);
  assert.equal(s[5][0], 5);
});

test('Aliasing folds frequencies above fs/2', () => {
  assert.equal(aliasFrequency(3, 20), 3);
  assert.equal(aliasFrequency(9, 10), -1);
  assert.equal(aliasFrequency(11, 10), 1);
  // The alias passes through every sample of the original sine.
  for (let n = 0; n < 10; n++) near(Math.sin((2 * Math.PI * 9 * n) / 10), Math.sin((2 * Math.PI * -1 * n) / 10), 1e-9);
  assert.equal(carsonBandwidth(3, 4), 32);
});

test('Constellations have unit energy and Gray-coded neighbours', () => {
  for (const scheme of Object.keys(SCHEMES)) {
    const points = constellation(scheme);
    assert.equal(points.length, SCHEMES[scheme].M);
    assert.equal(new Set(points.map((p) => p.bits)).size, points.length);
    near(points.reduce((sum, p) => sum + p.i ** 2 + p.q ** 2, 0) / points.length, 1, 1e-12);
    // Points at the minimum distance differ in exactly one bit.
    const d = minimumDistance(points);
    for (const a of points) {
      for (const b of points) {
        if (a === b || Math.abs(Math.hypot(a.i - b.i, a.q - b.q) - d) > 1e-9) continue;
        const differing = [...a.bits].filter((bit, k) => bit !== b.bits[k]).length;
        assert.equal(differing, 1, `${scheme}: ${a.bits} next to ${b.bits}`);
      }
    }
  }
  near(minimumDistance(constellation('qpsk')), Math.SQRT2, 1e-12);
  near(minimumDistance(constellation('16qam')), 2 / Math.sqrt(10), 1e-12);
});

test('Bits are grouped into symbols, padding the last group', () => {
  const s = bitsToSymbols('0110 1', 'qpsk');
  assert.deepEqual(
    s.map((x) => [x.bits, x.padded]),
    [
      ['01', false],
      ['10', false],
      ['10', true],
    ],
  );
  assert.equal(s[0].point.bits, '01');
});

test('Simulated bit error rates agree with theory', () => {
  // BPSK needs about 9.6 dB for a BER of 1e-5.
  near(theoreticalBer('bpsk', 9.6), 1e-5, 2e-6);
  for (const [scheme, ebn0] of [
    ['qpsk', 4],
    ['16qam', 8],
  ]) {
    const theory = theoreticalBer(scheme, ebn0);
    const sim = simulate(scheme, ebn0, 100000, 11).ber;
    assert.ok(Math.abs(sim - theory) < 0.1 * theory, `${scheme}: ${sim} vs ${theory}`);
  }
});

test('The noise floor adds the antenna and receiver noise temperatures', () => {
  // kTB at 290 K in 1 MHz.
  near(noisePower(290, 1e6), -113.975, 1e-9);
  // 290 K antenna and NF 3 dB: the receiver adds about as much again (288.6 K).
  const n = noiseFloor(290, 3, 1e6);
  near(n.receiverK, 290 * (10 ** 0.3 - 1), 1e-9);
  near(n.total, -113.975 + 10 * Math.log10((290 + n.receiverK) / 290), 1e-9);
  near(n.density, n.total - 60, 1e-9);
  // A 50 K sky with a noiseless receiver: 10 log(50/290) below kT0B.
  near(noiseFloor(50, 0, 1e6).total, -113.975 + 10 * Math.log10(50 / 290), 1e-9);
  assert.equal(noiseFloor(50, 0, 1e6).receiver, -Infinity);
});

test('Spectrum analyzer readings convert to a noise density and temperature', () => {
  const m = fromAnalyzerReading(-124, 1e5, 1e6, false);
  near(m.density, -174, 1e-9);
  near(m.power, -114, 1e-9);
  near(m.temperatureK, 290 * 10 ** ((-174 + 173.975) / 10), 1e-9);
  // Log averaging reads 2.51 dB low.
  near(fromAnalyzerReading(-124, 1e5, 1e6, true).density, -171.49, 1e-9);
});
