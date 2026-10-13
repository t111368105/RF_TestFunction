import { test } from 'node:test';
import assert from 'node:assert/strict';
import { budget } from '../site/calculations.mjs';
import { linkAt, maxDistance, valuesAt } from '../site/link-model.mjs';
import { reestimate } from '../site/estimator.mjs';
import { estimateAtmosphere, cloudAttenuation, tropoScintillation } from '../site/atmosphere.mjs';
import { radioHorizon } from '../site/terrain.mjs';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

// 12 GHz over 10 km, 33 dBm, 8 + 32 dBi, 1 dB cables, sensitivity −100 dBm, no required margin.
const values = [12000, 10, 33, 8, 32, 0, 1, 1, -100, 0, 0];
const taipei = {
  path: 'terrestrial',
  polarization: 'circular',
  fMHz: 12000,
  distanceKm: 10,
  rainRate: 86.9,
  percent: 0.01,
  tempC: 20.9,
  pressure: 1013.25,
  waterVapour: 17.2,
};

/** A snapshot whose atmospheric loss was estimated with these inputs. */
function withRain(inputs) {
  const value = String(Number(estimateAtmosphere(inputs).total.toFixed(3)));
  const v = [...values];
  v[10] = Number(value);
  return { values: v, ampPosition: 'after', atmosphereEstimate: { items: { atmospheric: { value, inputs } } } };
}

test('Without estimated losses the maximum distance is the free-space one', () => {
  const s = { values, ampPosition: 'after', atmosphereEstimate: null };
  near(maxDistance(s), budget(values).maxDistance, 1e-6 * budget(values).maxDistance);
  near(linkAt(s, 20).output, budget(values).output - 20 * Math.log10(2), 1e-9);
});

test('Rain on a terrestrial path is recalculated at each distance', () => {
  const s = withRain(taipei);
  const at20 = estimateAtmosphere({ ...taipei, distanceKm: 20 }).total;
  // linkAt counts the rain over 20 km, not the 10 km value.
  near(linkAt(s, 20).output - budget(valuesAt(s, (i) => i, 20)).output, -(at20 - s.values[10]), 0.002);
  const farthest = maxDistance(s);
  assert.ok(farthest < budget(s.values).maxDistance / 2, `${farthest} km`);
  near(linkAt(s, farthest).margin, 0, 0.01);
  // A link that misses its margin even in the far field has no maximum distance.
  assert.equal(maxDistance({ ...s, values: s.values.map((x, i) => (i === 9 ? 200 : x)) }), null);
});

test('The radio horizon of two antennas follows √(2kR)(√h1 + √h2)', () => {
  near(radioHorizon(10, 10), 4.122 * 2 * Math.sqrt(10), 0.05); // two 10 m masts: 26 km
  near(radioHorizon(100, 0, 1), Math.sqrt(2 * 6371 * 0.1), 1e-9);
});

test('A high-gain antenna moves the far-field limit to 2D²/λ', () => {
  const r = budget([2400, 0.05, 33, 8, 32, 0, 1, 1, -100, 0, 0]);
  const lambda = 299792458 / 2.4e9;
  const d = (lambda / Math.PI) * Math.sqrt(10 ** 3.2 / 0.55);
  near(r.farFieldMin * 1000, (2 * d * d) / lambda, 1e-6);
  assert.equal(r.nearField, true); // 50 m < 73 m
  near(r.farFieldAntenna.gain, 32, 0);
  // Low gains keep the 10-wavelength limit.
  assert.equal(budget([2400, 1, 20, 2, 2, 0, 0, 0, -90, 0, 0]).farFieldAntenna, null);
});

test('Cloud and scintillation follow the ITU-R P.618 §2.5 combination', () => {
  const inputs = {
    ...taipei,
    path: 'slant',
    distanceKm: 600,
    elevation: 30,
    stationAltitude: 0.014,
    latitude: 25.04,
    rainHeight: 4.67,
    cloudWater: 4.204, // the Taipei L for 0.01 %, as the field shows it
    nWet: 98.6,
    dish: null,
    efficiency: 0.5,
  };
  const estimate = { items: { cloud: { value: '0', inputs }, 'tropo-scintillation': { value: '0', inputs } } };
  const now = reestimate(estimate, (i) => i);
  const cloud = cloudAttenuation(12, 30, 3.508); // Below 1 % the cloud is taken at 1 %.
  near(now.cloud, cloud, 0.001);
  const rain = estimateAtmosphere(inputs).rain;
  const alone = tropoScintillation(12, 30, 0.01, 0, 0.5, 98.6, 600e3);
  near(now['tropo-scintillation'], Math.hypot(rain + cloud, alone) - (rain + cloud), 0.001);
  assert.ok(now['tropo-scintillation'] < alone / 10);
});
