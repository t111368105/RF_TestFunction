import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gasSpecificAttenuation,
  gasEquivalentHeights,
  rainCoefficients,
  rainTerrestrial,
  rainSlant,
  estimateAtmosphere,
  interpolateLogP,
  cloudCoefficient,
  cloudAttenuation,
  tropoScintillation,
  gammaP,
  ionoScintillation,
  ionoAbsorption,
  waterViscosity,
  radomeFilmThickness,
  waterFilmLoss,
} from '../site/atmosphere.mjs';

const close = (a, b) => assert.ok(Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(b)), `${a} != ${b}`);

// Reference values from ITU-Rpy (itur 0.4.0) with the same inputs; see site/atmosphere.mjs.
// [f GHz, p hPa, T K, rho g/m³, oxygen dB/km, water dB/km, h0 km, hw km]
const GAS = [
  [2.4, 1013.25, 288.15, 7.5, 0.006901064552190512, 0.0002949635052613218, 5.008778920391555, 1.6973054247130832],
  [2.4, 1013.25, 303.15, 20.0, 0.006107789651377499, 0.000829275472723594, 5.625195324787249, 1.7186094718151326],
  [10, 1013.25, 288.15, 7.5, 0.008224416702709883, 0.005974125245476721, 4.901077737007381, 1.704158919401979],
  [10, 1013.25, 303.15, 20.0, 0.007256889540672031, 0.01671631152354639, 5.50364246989198, 1.7253949499829317],
  [22.235, 1013.25, 288.15, 7.5, 0.013292678183376018, 0.17897799237293666, 4.867310087567293, 2.3589228173275583],
  [22.235, 1013.25, 303.15, 20.0, 0.01170230637483451, 0.4561460486034091, 5.465536632989984, 2.371629111434759],
  [60, 1013.25, 288.15, 7.5, 14.623474796486061, 0.15484184063624667, 10.731486112612314, 1.6945606894812002],
  [60, 1013.25, 303.15, 20.0, 12.898373135855213, 0.4377805492348781, 10.787793935551804, 1.7158918568567134],
  [183.31, 800.0, 273.15, 2.0, 0.009824025883499512, 10.107227881211351, 4.630479486968325, 2.9151470721203117],
];
// [f GHz, elevation, tau, k, alpha]
const RAIN_COEFFICIENTS = [
  [1.5, 60, 0, 4.916804263737431e-05, 0.9647970437126987],
  [10, 0, 0, 0.012166987989459295, 1.2570968548417663],
  [10, 0, 90, 0.011291870303547438, 1.2156450116856028],
  [20, 30, 45, 0.09387693776663214, 1.0198776311671576],
];
// P.530-17: [f GHz, d km, R0.01 mm/h, p %, tau, A dB]
const TERRESTRIAL = [
  [5.8, 20, 50, 0.01, 0, 2.780891794945862],
  [10, 5, 50, 0.01, 0, 6.312453901849221],
  [20, 20, 120, 0.001, 90, 168.27376908860444],
  [38, 0.5, 10, 1, 0, 0.345114431881736],
  [80, 60, 50, 0.1, 90, 77.27202087152463],
];
// P.618-13: [f GHz, elevation, hs km, latitude, hR km, R0.01 mm/h, p %, tau, A dB]
const SLANT = [
  [5.8, 90, 0.05, 52.0, 2.5, 80, 0.01, 45, 0.819139285922454],
  [12, 30, 0.1, 25.0, 4.9, 80, 0.01, 45, 14.848324930742132],
  [20, 10, 0.05, 52.0, 2.5, 20, 0.1, 0, 7.313450367139016],
  [30, 60, 1.2, -10.0, 5.0, 80, 3, 45, 3.0624775001449334],
  [50, 5, 0.1, 25.0, 4.9, 20, 1, 0, 22.93316995731075],
];

test('P.676-12 specific attenuation and equivalent heights match ITU-Rpy', () => {
  for (const [f, p, T, rho, oxygen, water, h0, hw] of GAS) {
    const g = gasSpecificAttenuation(f, p, T, rho);
    close(g.oxygen, oxygen);
    close(g.water, water);
    const h = gasEquivalentHeights(f, p, T, rho);
    close(h.oxygen, h0);
    close(h.water, hw);
  }
});

test('P.838-3 coefficients match ITU-Rpy and the published table', () => {
  for (const [f, el, tau, k, alpha] of RAIN_COEFFICIENTS) {
    const c = rainCoefficients(f, el, tau);
    close(c.k, k);
    close(c.alpha, alpha);
  }
  // P.838-3 table values at 10 GHz, horizontal polarization.
  assert.equal(rainCoefficients(10, 0, 0).k.toFixed(5), '0.01217');
  assert.equal(rainCoefficients(10, 0, 0).alpha.toFixed(4), '1.2571');
});

test('P.530-17 and P.618-13 rain attenuation match ITU-Rpy', () => {
  for (const [f, d, R, p, tau, A] of TERRESTRIAL) {
    const r = rainTerrestrial(f, d, R, p, tau);
    assert.ok(r.reductionDefined);
    close(r.attenuation, A);
  }
  for (const [f, el, hs, lat, hR, R, p, tau, A] of SLANT) close(rainSlant(f, el, hs, lat, hR, R, p, tau), A);
});

test('Rain edge cases', () => {
  assert.deepEqual(rainTerrestrial(10, 5, 0, 0.01, 0), { attenuation: 0, reductionDefined: true });
  assert.equal(rainSlant(12, 30, 0.1, 25, 4.9, 0, 0.01, 45), 0);
  assert.equal(rainSlant(12, 30, 5, 25, 4.9, 50, 0.01, 45), 0); // Station above the rain height.
  // Where ITU-Rpy returns a negative attenuation, the full path is used instead.
  const long = rainTerrestrial(1.5, 60, 10, 0.01, 90);
  assert.equal(long.reductionDefined, false);
  assert.ok(long.attenuation > 0);
});

const terrestrial = {
  path: 'terrestrial',
  fMHz: 10000,
  distanceKm: 5,
  rainRate: 50,
  percent: 0.01,
  polarization: 'horizontal',
  tempC: 15,
  pressure: 1013.25,
  waterVapour: 7.5,
};

test('Estimator totals, validity notes and input checks', () => {
  const e = estimateAtmosphere(terrestrial);
  const g = gasSpecificAttenuation(10, 1013.25, 288.15, 7.5);
  close(e.gas, (g.oxygen + g.water) * 5);
  close(e.rain, rainTerrestrial(10, 5, 50, 0.01, 0).attenuation);
  close(e.total, e.gas + e.rain);
  assert.deepEqual(e.notes, []);

  const uhf = estimateAtmosphere({ ...terrestrial, fMHz: 437 });
  assert.equal(uhf.total, 0);
  assert.match(uhf.notes[0], /Below 1 GHz/);

  const slant = estimateAtmosphere({
    ...terrestrial,
    path: 'slant',
    elevation: 30,
    stationAltitude: 0.1,
    latitude: 25,
    rainHeight: 4.9,
  });
  const h = gasEquivalentHeights(10, 1013.25, 288.15, 7.5);
  close(slant.gas, (g.oxygen * h.oxygen + g.water * h.water) / Math.sin(Math.PI / 6));
  close(slant.rain, rainSlant(10, 30, 0.1, 25, 4.9, 50, 0.01, 0));

  assert.match(estimateAtmosphere({ ...terrestrial, rainRate: -1 }).error, /rain rate/);
  assert.match(estimateAtmosphere({ ...terrestrial, fMHz: NaN }).error, /frequency/);
  assert.match(estimateAtmosphere({ ...terrestrial, path: 'slant', elevation: 2 }).error, /elevation/);
  assert.match(estimateAtmosphere({ ...terrestrial, percent: 5 }).notes[0], /0.001 % to 1 %/);
  assert.match(estimateAtmosphere({ ...terrestrial, fMHz: 1500, distanceKm: 60, rainRate: 10 }).notes[0], /path-reduction/);
});

// More reference values: K_l (P.840) and tropospheric scintillation (P.618-13, Taipei N_wet
// 98.62024586666641) from ITU-Rpy; Nakagami fades from SciPy's gammaincinv.
const NWET = 98.62024586666641;
// [f GHz, T °C, K_l]
const CLOUD_KL = [
  [2.27, 0, 0.004815590343434927],
  [2.27, 20, 0.002760616572994635],
  [12, 0, 0.1326785335926417],
  [12, 20, 0.07683337895231726],
  [50, 0, 1.8707778484037079],
  [50, 20, 1.2485677362345808],
  [300, 0, 14.357597610338606],
  [300, 20, 15.556052479747736],
];
// [f GHz, elevation, D m, efficiency, p %, A dB]
const TROPO = [
  [4, 90, 0.5, 0.5, 50, 0.00010337417602441742],
  [8.2, 10, 3.2, 0.6, 1, 1.0749408136933394],
  [12, 5, 0.5, 0.5, 0.1, 5.180364517485931],
  [12, 30, 9, 0.65, 0.01, 0.5452786322096986],
  [20, 5, 3.2, 0.6, 10, 1.7798430214195482],
];
// [S4, fraction q, Nakagami m, fade dB]
const NAKAGAMI = [
  [0.1, 0.001, 89.51041411134644, 1.5187376817142362],
  [0.3, 0.01, 13.453886042382159, 3.2214195780521853],
  [0.5, 0.1, 4.86454870481531, 3.183175287634803],
  [0.7, 0.01, 2.8347757369159625, 8.720842561022852],
  [1.0, 0.5, 1.973911767606925, 0.7720301674548979],
];

test('P.840 cloud coefficient and attenuation match ITU-Rpy', () => {
  for (const [f, T, kl] of CLOUD_KL) close(cloudCoefficient(f, T), kl);
  close(cloudAttenuation(12, 30, 3.5), (3.5 * cloudCoefficient(12, 0)) / 0.5);
});

test('P.618 tropospheric scintillation matches ITU-Rpy', () => {
  for (const [f, el, D, eta, p, A] of TROPO) close(tropoScintillation(f, el, p, D, eta, NWET), A);
});

test('P.531 ionospheric scintillation: Table 1, frequency scaling and Nakagami fades', () => {
  // Table 1: S4 0.1 → 1.5 dB, 0.5 → 11 dB, 1.0 → 27.5 dB peak-to-peak.
  assert.equal(ionoScintillation(4, 0.1, 4, 0.01).pfluc.toFixed(1), '1.5');
  assert.equal(Math.round(ionoScintillation(4, 0.5, 4, 0.01).pfluc), 11);
  close(ionoScintillation(4, 1, 4, 0.01).pfluc, 27.5);
  close(ionoScintillation(6, 0.4, 1.5, 0.01).s4, 0.4 * 4 ** -1.5);
  for (const [s4, q, m, fade] of NAKAGAMI) {
    const r = ionoScintillation(1.5, s4, 1.5, q);
    close(r.m, m);
    assert.ok(Math.abs(r.fade - fade) < 1e-9, `${r.fade} != ${fade}`);
  }
  close(gammaP(1, 2), 1 - Math.exp(-2));
  // Below S4 = 0.1, m = 1/S4²: the fade at 1 % is close to the Gaussian 2.33 σ with σ = S4.
  const weak = ionoScintillation(1.5, 0.02, 1.5, 0.01);
  close(weak.m, 2500);
  assert.ok(Math.abs(weak.fade - -10 * Math.log10(1 - 2.326 * 0.02)) < 0.01, String(weak.fade));
});

test('P.531 ionospheric absorption scales as sec(i)/f²', () => {
  close(ionoAbsorption(0.03, 90, 0.5), 0.5);
  close(ionoAbsorption(0.3, 90, 0.5), 0.005);
  // Table 3: below 0.01 dB at 1 GHz and 30° elevation at middle latitudes.
  assert.ok(ionoAbsorption(1, 30, 0.5) < 0.01);
  assert.ok(ionoAbsorption(1, 10, 0.5) > ionoAbsorption(1, 30, 0.5));
});

test('Wet radome: film thickness and loss', () => {
  close(waterViscosity(20), 2.414e-5 * 10 ** (247.8 / 153.15));
  // h³ = 3 ν R r / 2g, so doubling the rain rate multiplies h by 2^(1/3).
  close(radomeFilmThickness(100, 1, 20) / radomeFilmThickness(50, 1, 20), 2 ** (1 / 3));
  // Laboratory measurements give about 18 dB per mm of water at 24 GHz.
  const perMm = waterFilmLoss(24, 1e-3, 20);
  assert.ok(perMm > 16 && perMm < 21, String(perMm));
  assert.equal(waterFilmLoss(12, 0, 20), 0);
  assert.ok(waterFilmLoss(2.27, 1.5e-4, 20) < waterFilmLoss(12, 1.5e-4, 20));
});

test('Log-percentage interpolation', () => {
  close(interpolateLogP([0.1, 1], [4, 3], 0.1), 4);
  close(interpolateLogP([0.1, 1], [4, 3], Math.sqrt(0.1)), 3.5);
  close(interpolateLogP([0.1, 1], [4, 3], 0.01), 4);
  close(interpolateLogP([0.1, 1], [4, 3], 5), 3);
});
