import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slantRange, meanRadiatingTemperature, skyTemperature, crossing, ranges, s465Gain, groundShare } from '../site/satellite.mjs';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);

test('Slant range follows the spherical-Earth geometry', () => {
  near(slantRange(420, 90), 420);
  near(slantRange(420, 0), Math.sqrt(6791 ** 2 - 6371 ** 2)); // To the horizon: 2351 km.
  near(slantRange(500, 10), 1694.567221154679);
  near(slantRange(35786, 30), 38608.88261596886);
  // A station 14 m above sea level is slightly closer.
  near(slantRange(500, 10, 0.014), 1694.5339051257602);
  near(slantRange(500, 90, 0.014), 499.986);
  assert.equal(slantRange(0.01, 45, 0.014), null);
  assert.equal(slantRange(500, -1), null);
});

test('Sky noise temperature follows ITU-R P.618 § 3', () => {
  near(skyTemperature(0), 2.7); // Clear sky: only the cosmic background.
  near(skyTemperature(3), 138.52671628329378);
  near(skyTemperature(100), 275, 1e-6); // Opaque atmosphere: its own temperature.
  near(meanRadiatingTemperature(20.9), 37.34 + 0.81 * 294.05);
});

test('Crossings are interpolated between samples', () => {
  near(crossing([0, 10, 20], [-4, 0, 6], 3), 15);
  near(crossing([0, 10], [-5, 5], 0), 5);
  assert.equal(crossing([0, 10, 20], [1, 2, 3], 5), null);
  // Samples that are not finite are skipped.
  near(crossing([0, 10, 20, 30], [NaN, -1, 1, 2], 0), 15);
});

test('Ranges list every stretch at or above the level', () => {
  assert.deepEqual(ranges([0, 10, 20], [1, 2, 3], 0), [[0, 20]]);
  assert.deepEqual(ranges([0, 10, 20], [-1, -2, -3], 0), []);
  // Rising through the level, then falling again before the end, as a pass can near 90°.
  const r = ranges([0, 10, 20, 30, 40], [-2, 2, 4, 2, -2], 0);
  assert.equal(r.length, 1);
  near(r[0][0], 5);
  near(r[0][1], 35);
});

test('Ground pickup from the ITU-R S.465 pattern', () => {
  near(s465Gain(1), 32);
  near(s465Gain(10), 7);
  near(s465Gain(48), -10);
  // Looking straight up, the whole ground is behind 48°: −10 dBi over half the sphere, 5 %.
  near(groundShare(90), 0.05, 1e-4);
  // Lower, the near sidelobes reach the ground (reference: the same integral on a finer grid in NumPy).
  near(groundShare(5), 0.090, 2e-3);
  near(groundShare(10), 0.068, 2e-3);
  assert.ok(groundShare(5) > groundShare(20) && groundShare(20) > groundShare(60));
});
