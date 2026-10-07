import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  budget,
  powerAt,
  noise,
  convertPower,
  doppler,
  cascadeNF,
  dataLink,
  fitPathLoss,
  fittedPower,
  fittedMaxDistance,
  number,
  upgradePlan,
  invalidIndex,
  validPlan,
} from '../site/calculations.mjs';

// Reference values ported from the original Swift project (Tests/main.swift).
const base = [2400, 1, 20, 2, 2, 0, 0, 0, -90, 0, 0];
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('Swift reference link budget and stage breakdown', () => {
  const b = budget(base);
  close(b.fspl, 100.044224834232);
  close(b.output, -76.044224834232);
  close(b.margin, 13.955775165768);

  const v = [2400, 1, 20, 2, 2, 10, 2, 3, -90, 10, 0];
  const r = budget(v);
  close(r.output, b.output + 5);
  assert.equal(r.stages.length, 8);
  [20, 18, 20, 20 - r.fspl, 20 - r.fspl, r.received, r.received - 3, r.output].forEach((x, i) =>
    close(x, r.stages[i][2]),
  );
  close(powerAt(v, r.maxDistance), -80);
  close(powerAt(v, 10), r.output - 20);
});

test('Margin boundaries and invalid inputs', () => {
  const r = budget(base);
  assert.ok(budget([...base.slice(0, 8), r.output, 0, 0]).meets);
  assert.equal(budget([...base.slice(0, 9), 20, 0]).meets, false);
  for (const i of [0, 1, 6, 7, 9, 10]) {
    const v = [...base];
    v[i] = -1;
    assert.throws(() => budget(v));
    assert.equal(invalidIndex(v), i);
  }
  assert.equal(invalidIndex(base), -1);
  assert.throws(() => budget([NaN, ...base.slice(1)]));
  assert.throws(() => budget([2400, 1e141, ...base.slice(2)]));
  assert.throws(() => budget(base.slice(0, 10)));
});

test('Other path losses reduce every stage after free-space loss', () => {
  const b = budget(base);
  const r = budget([...base.slice(0, 10), 3]);
  close(r.stages[4][2], r.stages[3][2] - 3);
  close(r.received, b.received - 3);
  close(r.output, b.output - 3);
  close(r.margin, b.margin - 3);
  close(r.maxDistance, b.maxDistance * 10 ** (-3 / 20));
});

test('Near field is flagged below ten wavelengths', () => {
  const r = budget(base); // 2400 MHz: 10 λ = 1.249 m
  close(r.farFieldMin, 0.0012491352416666667);
  assert.equal(r.nearField, false);
  assert.equal(budget([2400, 0.001, ...base.slice(2)]).nearField, true);
  assert.equal(budget([2400, 0.00125, ...base.slice(2)]).nearField, false);
});

test('Noise is referred to RX antenna before amplifier', () => {
  const v = [2400, 1, 20, 2, 2, 10, 2, 3, -90, 10, 0];
  const n = noise(v, 1e6, 3, 10);
  close(n.floor, -110.975);
  close(n.snr, budget(v).received + 110.975);
  assert.equal(noise(v, 0, 3, 10), null);
  assert.equal(noise(v, 1e6, -1, 10), null);
});

test('C/N0, Eb/N0 and maximum data rate', () => {
  const v = [2400, 1, 20, 2, 2, 10, 2, 3, -90, 10, 0];
  const received = budget(v).received;
  const d = dataLink(v, 3, 1e6, 9.6, 2);
  close(d.cn0, received + 170.975);
  // At a rate equal to the bandwidth, Eb/N0 equals the SNR in that bandwidth.
  close(d.ebn0, noise(v, 1e6, 3, 10).snr);
  close(d.margin, d.ebn0 - 11.6);
  // At the maximum rate the margin is exactly zero.
  close(dataLink(v, 3, d.maxRate, 9.6, 2).margin, 0);
  close(d.maxRate, 10 ** ((d.cn0 - 11.6) / 10));

  const partial = dataLink(v, 3, NaN, NaN, 0);
  close(partial.cn0, d.cn0);
  assert.equal(partial.ebn0, null);
  assert.equal(partial.margin, null);
  assert.equal(partial.maxRate, null);
  assert.equal(dataLink(v, 3, 0, 9.6, 0).ebn0, null);
  assert.equal(dataLink(v, 3, 1e6, 9.6, -1).margin, null);
  assert.equal(dataLink(v, -1, 1e6, 9.6, 0), null);
});

test('Friis cascade noise figure', () => {
  close(cascadeNF(2, 20, 1, 10), 3.299879362235896);
  close(cascadeNF(3, 0, 0, 5), 8); // A passive loss in front adds directly when there is no gain.
  close(cascadeNF(0, 30, 0.5, 8), 0.520503046103113);
  close(cascadeNF(0, 0, 0, 0), 0);
  for (const bad of [[-1, 0, 0, 0], [0, 0, -1, 0], [0, 0, 0, -1], [NaN, 0, 0, 0], [0, Infinity, 0, 0]]) {
    assert.equal(cascadeNF(...bad), null);
  }
});

test('Log-distance path-loss fit', () => {
  // Exact n = 3 data around d0 = 0.01 km.
  const exact = [0.005, 0.01, 0.02, 0.05].map((d) => [d, -40 - 30 * Math.log10(d / 0.01)]);
  const f = fitPathLoss(exact, 0.01);
  close(f.n, 3);
  close(f.p0, -40);
  close(f.rmse, 0);
  close(f.r2, 1);
  assert.equal(f.count, 4);
  close(fittedPower(f, 0.01, 0.1), -70);
  close(fittedMaxDistance(f, 0.01, -70), 0.1);

  // Points that follow the free-space prediction fit n = 2 and the predicted output at d0.
  const v = [2400, 1, 20, 2, 2, 10, 2, 3, -90, 10, 0];
  const fs = fitPathLoss([0.5, 1, 4].map((d) => [d, powerAt(v, d)]), 1);
  close(fs.n, 2);
  close(fs.p0, budget(v).output);
  close(fittedMaxDistance(fs, 1, -80), budget(v).maxDistance);

  // Residuals ±1 dB alternating: σ = 1 and n unchanged by the symmetric noise.
  const noisy = fitPathLoss([[1, -50 + 1], [1, -50 - 1], [10, -70 + 1], [10, -70 - 1]], 1);
  close(noisy.n, 2);
  close(noisy.rmse, 1);

  assert.equal(fitPathLoss([[1, -50]], 1), null);
  assert.equal(fitPathLoss([[1, -50], [1, -52]], 1), null); // One distance only.
  assert.equal(fitPathLoss([[0, -50], [-1, -52], [NaN, 1]], 1), null);
  assert.equal(fittedMaxDistance({ ...f, n: -1 }, 0.01, -70), null);
});

test('Power references, round trips, overflow and underflow', () => {
  for (const [dbm, w] of [[0, 0.001], [30, 1], [40, 10], [-30, 0.000001]]) {
    close(convertPower(dbm, true), w);
    close(convertPower(w, false), dbm);
  }
  for (const v of [-120, -30, 0, 13.5, 30, 60]) close(convertPower(convertPower(v, true), false), v);
  for (const x of [Infinity, NaN, 10000, -10000]) assert.equal(convertPower(x, true), null);
  for (const x of [0, -1, NaN]) assert.equal(convertPower(x, false), null);
});

test('Doppler reference, direction, zero and rejection', () => {
  close(doppler(437e6, 7500).shift, -10932.563220119429);
  close(doppler(437e6, -7500).shift, 10932.563220119429);
  close(doppler(437e6, 0).shift, 0);
  assert.equal(doppler(0, 1), null);
  assert.equal(doppler(1e9, 299792458), null);
  assert.equal(doppler(1e9, Infinity), null);
});

test('Strict parser and saved plan round trip', () => {
  for (const s of ['', ' ', 'Infinity', 'NaN', '0x20', '1.2.3']) assert.ok(Number.isNaN(number(s)));
  close(number(' 2,4 '), 2.4);
  close(number('1e-3'), 0.001);

  // Thousands separators, as the page itself formats numbers.
  for (const [s, v] of [['1,000', 1000], ['-1,234,567.5', -1234567.5], ['2,400', 2400], ['1,000e3', 1e6]]) {
    close(number(s), v);
  }
  // Any other comma is a decimal separator.
  for (const [s, v] of [['1,00', 1], ['12,3456', 12.3456], ['-0,5', -0.5]]) close(number(s), v);
  for (const s of ['1,000,5', '1,0,0', ',']) assert.ok(Number.isNaN(number(s)));

  const p = { id: 'test', date: new Date().toISOString(), name: 'Test', notes: 'Notes', values: base };
  assert.ok(validPlan(JSON.parse(JSON.stringify(p))));
  assert.equal(validPlan({ ...p, values: [] }), false);

  // Plans saved before "Other path losses" existed gain a 0 dB loss.
  const old = { ...p, values: base.slice(0, 10) };
  assert.equal(validPlan(old), false);
  assert.deepEqual(upgradePlan(old).values, base);
  assert.ok(validPlan(upgradePlan(old)));
  assert.equal(upgradePlan(p), p);
});
