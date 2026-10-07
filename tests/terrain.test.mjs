import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalInverse,
  fresnelRadius,
  knifeEdgeLoss,
  earthBulge,
  woodlandParameters,
  woodlandLoss,
  slantVegetationLoss,
  buildingEntryLoss,
  terrestrialClutterLoss,
  slantClutterLoss,
  multipathOccurrence,
  multipathExceedance,
  multipathFade,
  worstMonthPercent,
} from '../site/terrain.mjs';

// Reference values were computed independently with SciPy (norm.ppf, special.fresnel, brentq).
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);

test('The inverse normal distribution matches SciPy', () => {
  near(normalInverse(0.5), 0, 1e-12);
  near(normalInverse(0.9), 1.2815515655446004, 1e-8);
  near(normalInverse(0.001), -3.090232306167813, 1e-8);
  assert.ok(Number.isNaN(normalInverse(0)));
});

test('Knife-edge loss follows the P.526 approximation, close to the exact Fresnel integrals', () => {
  assert.equal(knifeEdgeLoss(-0.78), 0);
  // [ν, eq. (30) from SciPy's Fresnel integrals]: eq. (31) is within about 0.1 dB.
  for (const [nu, exact] of [
    [0, 6.020599913279624],
    [1, 13.864105413629094],
    [2.4, 20.618195412007584],
  ]) {
    near(knifeEdgeLoss(nu), exact, 0.1);
  }
  near(knifeEdgeLoss(0), 6.032852208563606, 1e-9);
  // First Fresnel radius 17.32 √(d1 d2 / (f d)) m in practical units.
  near(fresnelRadius(8, 10, 20), 17.31 * Math.sqrt((10 * 20) / (8 * 30)), 0.01);
  // Earth bulge d1 d2 / (12.74 k) m.
  near(earthBulge(10, 20, 4 / 3), (10 * 20) / (12.742 * (4 / 3)), 1e-3);
});

test('Vegetation follows P.833 Table 1 and the slant-path fit', () => {
  const p = woodlandParameters(949);
  near(p.gamma, 0.17, 1e-12);
  near(p.am, 26.5, 1e-12);
  assert.deepEqual(woodlandParameters(8000), { gamma: 0.34, am: 34.1 });
  near(woodlandLoss(20, 0.34, 34.1), 34.1 * (1 - Math.exp((-20 * 0.34) / 34.1)), 1e-12);
  near(slantVegetationLoss(2270, 20, 30), 0.25 * 2270 ** 0.39 * 20 ** 0.25 * 30 ** 0.05, 1e-12);
});

test('Building entry loss matches P.2109', () => {
  near(buildingEntryLoss(1, 0.5, 0, 'traditional'), 14.312813341405839);
  near(buildingEntryLoss(8, 0.9, 0, 'traditional'), 31.431855725562148);
  near(buildingEntryLoss(2.27, 0.5, 30, 'efficient'), 35.22581316181768);
  near(buildingEntryLoss(28, 0.1, 10, 'efficient'), 20.873282306251298);
});

test('Clutter loss matches P.2108, with the terrestrial value held at 2 km', () => {
  near(terrestrialClutterLoss(1, 0.5, 50), 23.85217484728091);
  near(terrestrialClutterLoss(3.5, 1, 90), 35.52773184184606);
  near(terrestrialClutterLoss(8, 30, 50), 32.748166502976645);
  near(terrestrialClutterLoss(8, 30, 50), terrestrialClutterLoss(8, 2, 50), 1e-12);
  near(terrestrialClutterLoss(28, 0.3, 10), 17.134144939181247);
  near(slantClutterLoss(30, 10, 50), 15.183036546383036);
  near(slantClutterLoss(20, 45, 90), 4.075820913702726);
  near(slantClutterLoss(30, 90, 50), 0, 1e-9);
});

test('Multipath fading follows P.530-19 § 2.3 and the P.841 worst-month conversion', () => {
  const { p0 } = multipathOccurrence({ f: 8, d: 30, he: 120, hr: 80, ht: 30, logK: -5.24, dN75: 11.6 });
  near(p0, 4.280361207491241, 1e-9);
  near(multipathExceedance(p0, 3), 6.396497036093907);
  near(multipathExceedance(p0, 10), 0.37716325325263256);
  near(multipathExceedance(p0, 30), 0.004280361207491241, 1e-12);
  const pw = worstMonthPercent(0.01);
  near(pw, 0.05186147447038453, 1e-12);
  near(multipathFade(p0, pw), 18.54248781634577, 1e-6);
  assert.equal(multipathFade(p0, 70), 0);
});
