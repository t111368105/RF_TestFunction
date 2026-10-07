import { test } from 'node:test';
import assert from 'node:assert/strict';
import { polarizationLoss, pointingLoss, dishBeamwidth } from '../site/alignment.mjs';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const linear = { type: 'linear' };
const rhcp = (axialRatio = 0) => ({ type: 'rhcp', axialRatio });
const lhcp = (axialRatio = 0) => ({ type: 'lhcp', axialRatio });

test('Polarization mismatch reduces to the textbook special cases', () => {
  // Linear to linear: −20 log10 |cos ψ|.
  close(polarizationLoss(linear, linear, 'angle', 0), 0);
  close(polarizationLoss(linear, linear, 'angle', 30), -20 * Math.log10(Math.cos(Math.PI / 6)));
  close(polarizationLoss(linear, linear, 'angle', 45), 10 * Math.log10(2));
  assert.equal(polarizationLoss(linear, linear, 'angle', 90), Infinity);
  assert.equal(polarizationLoss(linear, linear, 'worst'), Infinity);
  close(polarizationLoss(linear, linear, 'average'), 10 * Math.log10(2));
  // Linear to circular: 3 dB whatever the angle.
  for (const mode of ['angle', 'average', 'worst']) close(polarizationLoss(linear, rhcp(), mode, 70), 10 * Math.log10(2));
  // Ideal circular: matched with the same sense, no coupling with the opposite sense.
  close(polarizationLoss(rhcp(), rhcp(), 'worst'), 0);
  assert.equal(polarizationLoss(rhcp(), lhcp(), 'average'), Infinity);
});

test('Elliptical polarization matches the axial-ratio form of the loss factor', () => {
  // Reference: PLF = ½ + [4 r1 r2 + (r1² − 1)(r2² − 1) cos 2ψ] / [2 (r1² + 1)(r2² + 1)].
  close(polarizationLoss(rhcp(1), rhcp(1), 'worst'), 0.057437907597720675);
  close(polarizationLoss(rhcp(1), rhcp(1), 'angle', 45), 0.028623998379135925);
  close(polarizationLoss(rhcp(1), lhcp(3), 'angle', 0), 12.961836201528483);
  assert.equal(polarizationLoss(rhcp(-1), rhcp(), 'angle', 0), null);
  assert.equal(polarizationLoss(linear, linear, 'angle', NaN), null);
});

test('Pointing loss and dish beamwidth', () => {
  close(pointingLoss(0.5, 1), 3);
  close(pointingLoss(0, 3), 0);
  assert.equal(pointingLoss(-1, 3), null);
  assert.equal(pointingLoss(1, 0), null);
  close(dishBeamwidth(2270, 3), 3.0815671160058735);
  assert.equal(dishBeamwidth(2270, 0), null);
});
