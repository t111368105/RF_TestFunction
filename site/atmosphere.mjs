// Atmospheric gas and rain attenuation estimates, following ITU-R Recommendations:
//   P.676-12 (gaseous attenuation: line-by-line specific attenuation, Annex 1; equivalent heights for
//            slant paths, Annex 2), P.838-3 (rain specific attenuation), P.530-17 (rain on terrestrial
//            paths) and P.618-13 (rain on Earth-space paths).
// Constants and line data match the ITU-Rpy implementation (itur 0.4.0), and tests compare results
// with it. Frequencies are in GHz, temperatures in K, pressures in hPa and water vapour in g/m³.

import { t } from './i18n.mjs';

// P.676-12 Tables 1 and 2: spectroscopic data for oxygen and water vapour attenuation.
// [f0 GHz, a1, a2, a3, a4, a5, a6]
const OXYGEN_LINES = [
  [50.474214, 0.975, 9.651, 6.69, 0.0, 2.566, 6.85],
  [50.987745, 2.529, 8.653, 7.17, 0.0, 2.246, 6.8],
  [51.50336, 6.193, 7.709, 7.64, 0.0, 1.947, 6.729],
  [52.021429, 14.32, 6.819, 8.11, 0.0, 1.667, 6.64],
  [52.542418, 31.24, 5.983, 8.58, 0.0, 1.388, 6.526],
  [53.066934, 64.29, 5.201, 9.06, 0.0, 1.349, 6.206],
  [53.595775, 124.6, 4.474, 9.55, 0.0, 2.227, 5.085],
  [54.130025, 227.3, 3.8, 9.96, 0.0, 3.17, 3.75],
  [54.67118, 389.7, 3.182, 10.37, 0.0, 3.558, 2.654],
  [55.221384, 627.1, 2.618, 10.89, 0.0, 2.56, 2.952],
  [55.783815, 945.3, 2.109, 11.34, 0.0, -1.172, 6.135],
  [56.264774, 543.4, 0.014, 17.03, 0.0, 3.525, -0.978],
  [56.363399, 1331.8, 1.654, 11.89, 0.0, -2.378, 6.547],
  [56.968211, 1746.6, 1.255, 12.23, 0.0, -3.545, 6.451],
  [57.612486, 2120.1, 0.91, 12.62, 0.0, -5.416, 6.056],
  [58.323877, 2363.7, 0.621, 12.95, 0.0, -1.932, 0.436],
  [58.446588, 1442.1, 0.083, 14.91, 0.0, 6.768, -1.273],
  [59.164204, 2379.9, 0.387, 13.53, 0.0, -6.561, 2.309],
  [59.590983, 2090.7, 0.207, 14.08, 0.0, 6.957, -0.776],
  [60.306056, 2103.4, 0.207, 14.15, 0.0, -6.395, 0.699],
  [60.434778, 2438.0, 0.386, 13.39, 0.0, 6.342, -2.825],
  [61.150562, 2479.5, 0.621, 12.92, 0.0, 1.014, -0.584],
  [61.800158, 2275.9, 0.91, 12.63, 0.0, 5.014, -6.619],
  [62.41122, 1915.4, 1.255, 12.17, 0.0, 3.029, -6.759],
  [62.486253, 1503.0, 0.083, 15.13, 0.0, -4.499, 0.844],
  [62.997984, 1490.2, 1.654, 11.74, 0.0, 1.856, -6.675],
  [63.568526, 1078.0, 2.108, 11.34, 0.0, 0.658, -6.139],
  [64.127775, 728.7, 2.617, 10.88, 0.0, -3.036, -2.895],
  [64.67891, 461.3, 3.181, 10.38, 0.0, -3.968, -2.59],
  [65.224078, 274.0, 3.8, 9.96, 0.0, -3.528, -3.68],
  [65.764779, 153.0, 4.473, 9.55, 0.0, -2.548, -5.002],
  [66.302096, 80.4, 5.2, 9.06, 0.0, -1.66, -6.091],
  [66.836834, 39.8, 5.982, 8.58, 0.0, -1.68, -6.393],
  [67.369601, 18.56, 6.818, 8.11, 0.0, -1.956, -6.475],
  [67.900868, 8.172, 7.708, 7.64, 0.0, -2.216, -6.545],
  [68.431006, 3.397, 8.652, 7.17, 0.0, -2.492, -6.6],
  [68.960312, 1.334, 9.65, 6.69, 0.0, -2.773, -6.65],
  [118.750334, 940.3, 0.01, 16.64, 0.0, -0.439, 0.079],
  [368.498246, 67.4, 0.048, 16.4, 0.0, 0.0, 0.0],
  [424.76302, 637.7, 0.044, 16.4, 0.0, 0.0, 0.0],
  [487.249273, 237.4, 0.049, 16.0, 0.0, 0.0, 0.0],
  [715.392902, 98.1, 0.145, 16.0, 0.0, 0.0, 0.0],
  [773.83949, 572.3, 0.141, 16.2, 0.0, 0.0, 0.0],
  [834.145546, 183.1, 0.145, 14.7, 0.0, 0.0, 0.0],
];

// [f0 GHz, b1, b2, b3, b4, b5, b6]
const WATER_VAPOUR_LINES = [
  [22.23508, 0.1079, 2.144, 26.38, 0.76, 5.087, 1.0],
  [67.80396, 0.0011, 8.732, 28.58, 0.69, 4.93, 0.82],
  [119.99594, 0.0007, 8.353, 29.48, 0.7, 4.78, 0.79],
  [183.310087, 2.273, 0.668, 29.06, 0.77, 5.022, 0.85],
  [321.22563, 0.047, 6.179, 24.04, 0.67, 4.398, 0.54],
  [325.152888, 1.514, 1.541, 28.23, 0.64, 4.893, 0.74],
  [336.227764, 0.001, 9.825, 26.93, 0.69, 4.74, 0.61],
  [380.197353, 11.67, 1.048, 28.11, 0.54, 5.063, 0.89],
  [390.134508, 0.0045, 7.347, 21.52, 0.63, 4.81, 0.55],
  [437.346667, 0.0632, 5.048, 18.45, 0.6, 4.23, 0.48],
  [439.150807, 0.9098, 3.595, 20.07, 0.63, 4.483, 0.52],
  [443.018343, 0.192, 5.048, 15.55, 0.6, 5.083, 0.5],
  [448.001085, 10.41, 1.405, 25.64, 0.66, 5.028, 0.67],
  [470.888999, 0.3254, 3.597, 21.34, 0.66, 4.506, 0.65],
  [474.689092, 1.26, 2.379, 23.2, 0.65, 4.804, 0.64],
  [488.490108, 0.2529, 2.852, 25.86, 0.69, 5.201, 0.72],
  [503.568532, 0.0372, 6.731, 16.12, 0.61, 3.98, 0.43],
  [504.482692, 0.0124, 6.731, 16.12, 0.61, 4.01, 0.45],
  [547.67644, 0.9785, 0.158, 26.0, 0.7, 4.5, 1.0],
  [552.02096, 0.184, 0.158, 26.0, 0.7, 4.5, 1.0],
  [556.935985, 497.0, 0.159, 30.86, 0.69, 4.552, 1.0],
  [620.700807, 5.015, 2.391, 24.38, 0.71, 4.856, 0.68],
  [645.766085, 0.0067, 8.633, 18.0, 0.6, 4.0, 0.5],
  [658.00528, 0.2732, 7.816, 32.1, 0.69, 4.14, 1.0],
  [752.033113, 243.4, 0.396, 30.86, 0.68, 4.352, 0.84],
  [841.051732, 0.0134, 8.177, 15.9, 0.33, 5.76, 0.45],
  [859.965698, 0.1325, 8.055, 30.6, 0.68, 4.09, 0.84],
  [899.303175, 0.0547, 7.914, 29.85, 0.68, 4.53, 0.9],
  [902.611085, 0.0386, 8.429, 28.65, 0.7, 5.1, 0.95],
  [906.205957, 0.1836, 5.11, 24.08, 0.7, 4.7, 0.53],
  [916.171582, 8.4, 1.441, 26.73, 0.7, 5.15, 0.78],
  [923.112692, 0.0079, 10.293, 29.0, 0.7, 5.0, 0.8],
  [970.315022, 9.009, 1.919, 25.5, 0.64, 4.94, 0.67],
  [987.926764, 134.6, 0.257, 29.85, 0.68, 4.55, 0.9],
  [1780.0, 17506.0, 0.952, 196.3, 2.0, 24.15, 5.0],
];

// P.676-12 Annex 2 Table 3 [c_i, f_i GHz] and Table 4 [f_i GHz, a_i, b_i] for the equivalent heights.
const OXYGEN_HEIGHT_LINES = [
  [0.1597, 118.750334],
  [0.1066, 368.498246],
  [0.1325, 424.76302],
  [0.1242, 487.249273],
  [0.0938, 715.392902],
  [0.1448, 773.83949],
  [0.1374, 834.145546],
];
const WATER_HEIGHT_LINES = [
  [22.23508, 1.52, 2.56],
  [183.310087, 7.62, 10.2],
  [325.152888, 1.56, 2.7],
  [380.197353, 4.15, 5.7],
  [439.150807, 0.2, 0.91],
  [448.001085, 1.63, 2.46],
  [474.689092, 0.76, 2.22],
  [488.490108, 0.26, 2.49],
  [556.935985, 7.81, 10],
  [620.70087, 1.25, 2.35],
  [752.033113, 16.2, 20],
  [916.171582, 1.47, 2.58],
  [970.315022, 1.36, 2.44],
  [987.926764, 1.6, 1.86],
];

// P.838-3 Tables 1–4: regression coefficients for k and α.
const RAIN_K_H = {
  a: [-5.3398, -0.35351, -0.23789, -0.94158],
  b: [-0.10008, 1.2697, 0.86036, 0.64552],
  c: [1.13098, 0.454, 0.15354, 0.16817],
  m: -0.18961,
  k: 0.71147,
};
const RAIN_K_V = {
  a: [-3.80595, -3.44965, -0.39902, 0.50167],
  b: [0.56934, -0.22911, 0.73042, 1.07319],
  c: [0.81061, 0.51059, 0.11899, 0.27195],
  m: -0.16398,
  k: 0.63297,
};
const RAIN_A_H = {
  a: [-0.14318, 0.29591, 0.32177, -5.3761, 16.1721],
  b: [1.82442, 0.77564, 0.63773, -0.9623, -3.2998],
  c: [-0.55187, 0.19822, 0.13164, 1.47828, 3.4399],
  m: 0.67849,
  k: -1.95537,
};
const RAIN_A_V = {
  a: [-0.07771, 0.56727, -0.20238, -48.2991, 48.5833],
  b: [2.3384, 0.95545, 1.1452, 0.791669, 0.791459],
  c: [-0.76284, 0.54039, 0.26809, 0.116226, 0.116479],
  m: -0.053739,
  k: 0.83433,
};

const RAD = Math.PI / 180;
const EFFECTIVE_EARTH_RADIUS = 8500; // km, P.618
const sum = (xs) => xs.reduce((s, x) => s + x, 0);

/** Polarization tilt τ (degrees) for P.838: 0 horizontal, 90 vertical, 45 circular. */
export const POLARIZATION_TILT = { horizontal: 0, vertical: 90, circular: 45 };

/**
 * P.676-12 Annex 1 specific attenuation (dB/km) of dry air (oxygen) and water vapour.
 * p: dry air pressure (hPa), T: temperature (K), rho: water vapour density (g/m³).
 */
export function gasSpecificAttenuation(f, p, T, rho) {
  const theta = 300 / T;
  const e = (rho * T) / 216.7; // Water vapour partial pressure (hPa)

  const oxygen = sum(
    OXYGEN_LINES.map(([f0, a1, a2, a3, a4, a5, a6]) => {
      const strength = a1 * 1e-7 * p * theta ** 3 * Math.exp(a2 * (1 - theta));
      let width = a3 * 1e-4 * (p * theta ** (0.8 - a4) + 1.1 * e * theta);
      width = Math.sqrt(width ** 2 + 2.25e-6);
      const delta = (a5 + a6 * theta) * 1e-4 * (p + e) * theta ** 0.8;
      const shape =
        (f / f0) *
        ((width - delta * (f0 - f)) / ((f0 - f) ** 2 + width ** 2) +
          (width - delta * (f0 + f)) / ((f0 + f) ** 2 + width ** 2));
      return strength * shape;
    }),
  );
  const d = 5.6e-4 * (p + e) * theta ** 0.8;
  const dryContinuum =
    f *
    p *
    theta ** 2 *
    (6.14e-5 / (d * (1 + (f / d) ** 2)) + (1.4e-12 * p * theta ** 1.5) / (1 + 1.9e-5 * f ** 1.5));

  const water = sum(
    WATER_VAPOUR_LINES.map(([f0, b1, b2, b3, b4, b5, b6]) => {
      const strength = b1 * 1e-1 * e * theta ** 3.5 * Math.exp(b2 * (1 - theta));
      let width = b3 * 1e-4 * (p * theta ** b4 + b5 * e * theta ** b6);
      width = 0.535 * width + Math.sqrt(0.217 * width ** 2 + (2.1316e-12 * f0 ** 2) / theta);
      const shape = (f / f0) * (width / ((f0 - f) ** 2 + width ** 2) + width / ((f0 + f) ** 2 + width ** 2));
      return strength * shape;
    }),
  );
  return { oxygen: 0.182 * f * (oxygen + dryContinuum), water: 0.182 * f * water };
}

/** P.676-12 Annex 2 equivalent heights (km) of oxygen and water vapour for slant paths. */
export function gasEquivalentHeights(f, p, T, rho) {
  const e = (rho * T) / 216.7;
  const rp = (p + e) / 1013.25;
  const t1 =
    (5.104 / (1 + 0.066 * rp ** -2.3)) * Math.exp(-(((f - 59.7) / (2.87 + 12.4 * Math.exp(-7.9 * rp))) ** 2));
  const t2 = sum(
    OXYGEN_HEIGHT_LINES.map(([c, fi]) => (c * Math.exp(2.12 * rp)) / ((f - fi) ** 2 + 0.025 * Math.exp(2.2 * rp))),
  );
  const t3 =
    ((0.0114 * f) / (1 + 0.14 * rp ** -2.6)) *
    ((15.02 * f ** 2 - 1353 * f + 5.333e4) / (f ** 3 - 151.3 * f ** 2 + 9629 * f - 6803));
  let oxygen = ((6.1 * (0.7832 + 0.00709 * (T - 273.15))) / (1 + 0.17 * rp ** -1.1)) * (1 + t1 + t2 + t3);
  if (f < 70) oxygen = Math.min(oxygen, 10.7 * rp ** 0.3);

  const a = 1.9298 - 0.04166 * (T - 273.15) + 0.0517 * rho;
  const b = 1.1674 - 0.00622 * (T - 273.15) + 0.0063 * rho;
  const sigma = 1.013 / (1 + Math.exp(-8.6 * (rp - 0.57)));
  const water = a + b * sum(WATER_HEIGHT_LINES.map(([fi, ai, bi]) => (ai * sigma) / ((f - fi) ** 2 + bi * sigma)));
  return { oxygen, water };
}

/** P.838-3 coefficients k and α for elevation el and polarization tilt tau (degrees). */
export function rainCoefficients(f, el, tau) {
  const lf = Math.log10(f);
  const curve = (t) => sum(t.a.map((a, j) => a * Math.exp(-(((lf - t.b[j]) / t.c[j]) ** 2)))) + t.m * lf + t.k;
  const kH = 10 ** curve(RAIN_K_H);
  const kV = 10 ** curve(RAIN_K_V);
  const aH = curve(RAIN_A_H);
  const aV = curve(RAIN_A_V);
  const tilt = Math.cos(el * RAD) ** 2 * Math.cos(2 * tau * RAD);
  const k = (kH + kV + (kH - kV) * tilt) / 2;
  const alpha = (kH * aH + kV * aV + (kH * aH - kV * aV) * tilt) / (2 * k);
  return { k, alpha };
}

/**
 * P.530-17 §2.4.1 rain attenuation (dB) exceeded for p % of the time on a terrestrial path of d km.
 * reductionDefined is false when the path-reduction fit (Eq. 32) breaks down, which happens for long
 * paths at low frequencies and rain rates: its denominator turns negative and would give a negative
 * attenuation. The full path length (r = 1) is then used instead, a conservative choice.
 */
export function rainTerrestrial(f, d, R001, p, tau) {
  if (R001 === 0) return { attenuation: 0, reductionDefined: true };
  const { k, alpha } = rainCoefficients(f, 0, tau);
  const gamma = k * R001 ** alpha;
  const denominator =
    0.477 * d ** 0.633 * R001 ** (0.073 * alpha) * f ** 0.123 - 10.579 * (1 - Math.exp(-0.024 * d));
  const reductionDefined = denominator > 0;
  const r = reductionDefined ? Math.min(1 / denominator, 2.5) : 1;
  const A001 = gamma * r * d;
  const C0 = f >= 10 ? 0.12 + 0.4 * Math.log10(f / 10) ** 0.8 : 0.12;
  const C1 = 0.07 ** C0 * 0.12 ** (1 - C0);
  const C2 = 0.855 * C0 + 0.546 * (1 - C0);
  const C3 = 0.139 * C0 + 0.043 * (1 - C0);
  return { attenuation: A001 * C1 * p ** -(C2 + C3 * Math.log10(p)), reductionDefined };
}

/**
 * P.618-13 §2.2.1.1 rain attenuation (dB) exceeded for p % of an average year on an Earth-space path.
 * el: elevation (degrees), hs: station altitude (km), lat: latitude (degrees), hR: rain height (km).
 */
export function rainSlant(f, el, hs, lat, hR, R001, p, tau) {
  if (R001 === 0 || hR - hs <= 0) return 0; // No rain on the path.
  const sinEl = Math.sin(el * RAD);
  const Ls =
    el >= 5
      ? (hR - hs) / sinEl
      : (2 * (hR - hs)) / (Math.sqrt(sinEl ** 2 + (2 * (hR - hs)) / EFFECTIVE_EARTH_RADIUS) + sinEl);
  const Lg = Math.abs(Ls * Math.cos(el * RAD));
  const { k, alpha } = rainCoefficients(f, el, tau);
  const gamma = k * R001 ** alpha;
  const r001 = 1 / (1 + 0.78 * Math.sqrt((Lg * gamma) / f) - 0.38 * (1 - Math.exp(-2 * Lg)));
  const zeta = Math.atan2(hR - hs, Lg * r001) / RAD;
  const Lr = zeta > el ? (Lg * r001) / Math.cos(el * RAD) : (hR - hs) / sinEl;
  const chi = Math.abs(lat) < 36 ? 36 - Math.abs(lat) : 0;
  const v001 =
    1 / (1 + Math.sqrt(sinEl) * ((31 * (1 - Math.exp(-(el / (1 + chi)))) * Math.sqrt(Lr * gamma)) / f ** 2 - 0.45));
  const A001 = gamma * Lr * v001;
  let beta = 0;
  if (p < 1 && Math.abs(lat) < 36) {
    beta = el > 25 ? -0.005 * (Math.abs(lat) - 36) : -0.005 * (Math.abs(lat) - 36) + 1.8 - 4.25 * sinEl;
  }
  return A001 * (p / 0.01) ** -(0.655 + 0.033 * Math.log(p) - 0.045 * Math.log(A001) - beta * (1 - p) * sinEl);
}

/** Linear interpolation in log(p) over a table [p…] → [value…], clamped to the table's ends. */
export function interpolateLogP(ps, values, p) {
  if (p <= ps[0]) return values[0];
  if (p >= ps[ps.length - 1]) return values[values.length - 1];
  const i = ps.findIndex((x) => x > p) - 1;
  const w = (Math.log(p) - Math.log(ps[i])) / (Math.log(ps[i + 1]) - Math.log(ps[i]));
  return values[i] + (values[i + 1] - values[i]) * w;
}

/**
 * Complex permittivity ε′ − jε″ of liquid water (double-Debye model, ITU-R P.840 Eqs. 4–11), for f in
 * GHz and the water temperature in °C.
 */
export function waterPermittivity(f, tempC) {
  const theta = 300 / (tempC + 273.15);
  const e0 = 77.66 + 103.3 * (theta - 1);
  const e1 = 0.0671 * e0;
  const e2 = 3.52;
  const fp = 20.2 - 146 * (theta - 1) + 316 * (theta - 1) ** 2;
  const fs = 39.8 * fp;
  return {
    re: (e0 - e1) / (1 + (f / fp) ** 2) + (e1 - e2) / (1 + (f / fs) ** 2) + e2,
    im: (f * (e0 - e1)) / (fp * (1 + (f / fp) ** 2)) + (f * (e1 - e2)) / (fs * (1 + (f / fs) ** 2)),
  };
}

/** P.840 cloud liquid water specific attenuation coefficient K_l, (dB/km)/(g/m³). */
export function cloudCoefficient(f, tempC) {
  const { re, im } = waterPermittivity(f, tempC);
  const eta = (2 + re) / im;
  return (0.819 * f) / (im * (1 + eta ** 2));
}

/**
 * P.840 cloud attenuation (dB) on an Earth-space path: L K_l(f, 0 °C) / sin θ, with L the reduced
 * columnar liquid water content (kg/m²) exceeded for the time percentage of interest.
 */
export function cloudAttenuation(f, el, L) {
  return (L * cloudCoefficient(f, 0)) / Math.sin(el * RAD);
}

/**
 * P.618-13 §2.4.1 tropospheric scintillation fade depth (dB) exceeded for p % of the time (0.01–50 %),
 * for an antenna of diameter D (m) and efficiency eta; nWet is the wet term of the radio refractivity
 * (P.453). D = 0 means no aperture averaging.
 */
export function tropoScintillation(f, el, p, D, eta, nWet) {
  const sigmaRef = 3.6e-3 + 1e-4 * nWet;
  const sinEl = Math.sin(el * RAD);
  const L = (2 * 1000) / (Math.sqrt(sinEl ** 2 + 2.35e-4) + sinEl); // m, turbulence height 1000 m
  const x = (1.22 * (Math.sqrt(eta) * D) ** 2 * f) / L;
  const g =
    x >= 7 ? 0 : Math.sqrt(3.86 * (x ** 2 + 1) ** (11 / 12) * Math.sin((11 / 6) * Math.atan2(1, x)) - 7.08 * x ** (5 / 6));
  const sigma = (sigmaRef * f ** (7 / 12) * g) / sinEl ** 1.2;
  const lp = Math.log10(p);
  const a = -0.061 * lp ** 3 + 0.072 * lp ** 2 - 1.71 * lp + 3;
  return a * sigma;
}

/** ln Γ(x) for x > 0 (Lanczos approximation, g = 7). */
function logGamma(x) {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularized lower incomplete gamma P(a, x), by series below a + 1 and a continued fraction above. */
export function gammaP(a, x) {
  if (x <= 0) return 0;
  const front = Math.exp(-x + a * Math.log(x) - logGamma(a));
  if (x < a + 1) {
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 500; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-15) break;
    }
    return front * sum;
  }
  // Lentz's continued fraction for Q(a, x).
  let b = x + 1 - a;
  let c = 1e300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-15) break;
  }
  return 1 - front * h;
}

/**
 * P.531 ionospheric scintillation from an S4 index measured or modelled at fRef (GHz): S4 scales as
 * f^−1.5 (weak and moderate scintillation); the intensity follows a Nakagami distribution with
 * m from Eq. 10, which applies from S4 = 0.1; below that m = 1/S4², the exact relation for a gamma-
 * distributed intensity (Eq. 10 levels off near 400 and would overstate weak scintillation). fade is the depth (dB below the mean) exceeded for the fraction q of the event time
 * (Eq. 11), and pfluc the peak-to-peak fluctuation (Eq. 8).
 */
export function ionoScintillation(f, s4Ref, fRef, q) {
  const s4 = s4Ref * (f / fRef) ** -1.5;
  if (s4 === 0) return { s4, m: Infinity, fade: 0, pfluc: 0 };
  const m = s4 < 0.1 ? 1 / s4 ** 2 : Math.exp(5.69 * Math.exp(-3.055 * s4) + 0.292 * Math.exp(0.344 * s4));
  // Solve P(m, m I) = q for the normalized intensity I by bisection in log I.
  let lo = -60;
  let hi = 0; // ln I; the mean intensity is 1
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (gammaP(m, m * Math.exp(mid)) < q) lo = mid;
    else hi = mid;
  }
  const fade = (-10 * ((lo + hi) / 2)) / Math.LN10;
  return { s4, m, fade, pfluc: 27.5 * Math.min(s4, 1) ** 1.26 };
}

/** Height of the absorbing D region (km) used to map the elevation to the zenith angle in the ionosphere. */
export const ABSORPTION_HEIGHT = 90;
const EARTH_RADIUS = 6371; // km

/**
 * P.531 §6 ionospheric absorption (dB): scales as sec(i)/f² above 30 MHz, from the one-way vertical
 * absorption a30 (dB) at 30 MHz (typically 0.2–0.5 dB at middle latitudes). i is the zenith angle at
 * the absorbing layer.
 */
export function ionoAbsorption(f, el, a30) {
  const sinI = (EARTH_RADIUS * Math.cos(el * RAD)) / (EARTH_RADIUS + ABSORPTION_HEIGHT);
  return (a30 * (0.03 / f) ** 2) / Math.sqrt(1 - sinI ** 2);
}

/** Dynamic viscosity of water (Pa·s), Vogel equation: 2.414e-5 · 10^(247.8 / (T − 140)), T in K. */
export function waterViscosity(tempC) {
  return 2.414e-5 * 10 ** (247.8 / (tempC + 273.15 - 140));
}

/**
 * Steady rain-fed water film thickness (m) on a spherical radome of radius r (m) in laminar flow:
 * h = (3 ν R r / 2g)^(1/3), uniform over the upper hemisphere (Gibble), from the mass balance
 * q = R r sin φ / 2 and the film flux q = g sin φ h³ / 3ν. R is the rain rate in mm/h.
 */
export function radomeFilmThickness(rainRate, radius, tempC) {
  const nu = waterViscosity(tempC) / 1000; // kinematic viscosity, m²/s (density 1000 kg/m³)
  const R = rainRate / 1000 / 3600; // m/s
  return ((3 * nu * R * radius) / (2 * 9.81)) ** (1 / 3);
}

/**
 * Transmission loss (dB) at normal incidence through a uniform water layer of thickness t (m), from the
 * exact slab formula T = (1 − Γ²) e^(−jδ) / (1 − Γ² e^(−2jδ)), Γ = (1 − n)/(1 + n), δ = k₀ n t, with the
 * radome itself treated as transparent.
 */
export function waterFilmLoss(f, t, tempC) {
  const { re, im } = waterPermittivity(f, tempC);
  // n = √(ε′ − jε″) = n′ − jn″ with n″ > 0.
  const mod = Math.hypot(re, im);
  const n = { re: Math.sqrt((mod + re) / 2), im: -Math.sqrt((mod - re) / 2) };
  const mul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
  const div = (a, b) => {
    const d = b.re ** 2 + b.im ** 2;
    return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
  };
  const expj = (z) => ({ re: Math.exp(z.re) * Math.cos(z.im), im: Math.exp(z.re) * Math.sin(z.im) }); // e^z
  const gamma = div({ re: 1 - n.re, im: -n.im }, { re: 1 + n.re, im: n.im });
  const g2 = mul(gamma, gamma);
  const k0t = ((2 * Math.PI * f * 1e9) / 299792458) * t;
  const jd = { re: k0t * n.im, im: -k0t * n.re }; // −jδ = −j k₀ t n
  const num = mul({ re: 1 - g2.re, im: -g2.im }, expj(jd));
  const den = { re: 1 - mul(g2, expj({ re: 2 * jd.re, im: 2 * jd.im })).re, im: -mul(g2, expj({ re: 2 * jd.re, im: 2 * jd.im })).im };
  const T = div(num, den);
  return -20 * Math.log10(Math.hypot(T.re, T.im)) || 0; // || 0 turns −0 into 0
}

/**
 * Gas plus rain attenuation for the link-budget estimator. o: {
 *   path: 'terrestrial' | 'slant', fMHz, distanceKm (terrestrial), rainRate (R0.01, mm/h),
 *   percent (% of time), polarization, tempC, pressure (hPa), waterVapour (g/m³),
 *   elevation, stationAltitude (km), latitude, rainHeight (km) (slant only) }.
 * Returns { gas, oxygen, water, rain, total, notes } in dB, or { error }.
 */
export function estimateAtmosphere(o) {
  const f = o.fMHz / 1000;
  const slant = o.path === 'slant';
  const problem = validate(o, slant);
  if (problem) return { error: t(problem) };
  if (f < 1) {
    return {
      gas: 0,
      oxygen: 0,
      water: 0,
      rain: 0,
      total: 0,
      notes: [t('Below 1 GHz the ITU-R gas and rain models do not apply; both losses are negligible there, so 0 dB is used.')],
    };
  }
  const notes = [];
  if (f > 350) notes.push(t('Above 350 GHz the gas estimate is outside the recommended range.'));
  if (slant && f > 55) notes.push(t('P.618 rain prediction is validated up to 55 GHz.'));
  const maxPercent = slant ? 5 : 1;
  if (o.percent < 0.001 || o.percent > maxPercent) {
    notes.push(t('The rain model is defined for 0.001 % to {max} % of the time.', { max: maxPercent }));
  }

  const T = o.tempC + 273.15;
  const gamma = gasSpecificAttenuation(f, o.pressure, T, o.waterVapour);
  let oxygen;
  let water;
  if (slant) {
    const h = gasEquivalentHeights(f, o.pressure, T, o.waterVapour);
    oxygen = (gamma.oxygen * h.oxygen) / Math.sin(o.elevation * RAD);
    water = (gamma.water * h.water) / Math.sin(o.elevation * RAD);
  } else {
    oxygen = gamma.oxygen * o.distanceKm;
    water = gamma.water * o.distanceKm;
  }
  const tau = POLARIZATION_TILT[o.polarization];
  let rain;
  if (slant) {
    rain = rainSlant(f, o.elevation, o.stationAltitude, o.latitude, o.rainHeight, o.rainRate, o.percent, tau);
  } else {
    const terrestrial = rainTerrestrial(f, o.distanceKm, o.rainRate, o.percent, tau);
    rain = terrestrial.attenuation;
    if (!terrestrial.reductionDefined) {
      notes.push(
        t('The P.530 path-reduction factor is undefined for this long path at this frequency and rain rate; the full path length was used.'),
      );
    }
  }
  if (![oxygen, water, rain].every((x) => Number.isFinite(x) && x >= 0)) {
    return { error: t('The estimate is outside the range of the ITU-R models for these inputs.') };
  }
  return { gas: oxygen + water, oxygen, water, rain, total: oxygen + water + rain, notes };
}

function validate(o, slant) {
  const checks = [
    [o.fMHz > 0, 'Enter a valid frequency in the Path section first.'],
    [slant || o.distanceKm > 0, 'Enter a valid distance in the Path section first.'],
    [o.rainRate >= 0, 'Enter a rain rate of 0 mm/h or more (0 for clear sky).'],
    [o.percent > 0, 'Enter a positive percentage of time.'],
    [o.polarization in POLARIZATION_TILT, 'Choose a polarization.'],
    [o.tempC > -100 && o.tempC < 60, 'Enter a surface temperature between −100 and 60 °C.'],
    [o.pressure > 0, 'Enter a positive air pressure.'],
    [o.waterVapour >= 0, 'Enter a water vapour density of 0 g/m³ or more.'],
  ];
  if (slant) {
    checks.push(
      [o.elevation >= 5 && o.elevation <= 90, 'Enter an elevation angle between 5° and 90°.'],
      [Number.isFinite(o.stationAltitude), 'Enter the station altitude.'],
      [Math.abs(o.latitude) <= 90, 'Enter a latitude between −90° and 90°.'],
      [Number.isFinite(o.rainHeight), 'Enter the rain height (km).'],
    );
  }
  return checks.find(([ok]) => !ok)?.[1] ?? null;
}
