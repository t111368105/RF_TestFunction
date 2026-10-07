// Terrain and obstacle loss models, following ITU-R Recommendations:
//   P.526-16 (single knife-edge diffraction), P.833-10 (vegetation), P.2109-2 (building entry),
//   P.2108-1 (clutter) and P.530-19 (multipath fading on terrestrial paths, with P.841 for the
//   conversion from the average worst month to the average year).
// Frequencies are in GHz unless named fMHz, distances in km and heights in m.

const C = 299792458;
const EARTH_RADIUS = 6371; // km

/** Inverse of the standard normal distribution function (Acklam's rational approximation). */
export function normalInverse(p) {
  if (!(p > 0 && p < 1)) return NaN;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const tail = (q) =>
    (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  if (p < 0.02425) return tail(Math.sqrt(-2 * Math.log(p)));
  if (p > 1 - 0.02425) return -tail(Math.sqrt(-2 * Math.log(1 - p)));
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Q⁻¹(x), the inverse complementary normal distribution function. */
const qInverse = (x) => -normalInverse(x);

// ---------------------------------------------------------------- Diffraction (P.526)

/** Radius (m) of the first Fresnel ellipsoid at d1 and d2 km from the ends. */
export function fresnelRadius(f, d1, d2) {
  const lambda = C / (f * 1e9);
  return Math.sqrt((lambda * d1 * d2 * 1000) / (d1 + d2));
}

/** Knife-edge loss J(ν) in dB, P.526 eq. (31); 0 for ν ≤ −0.78. */
export function knifeEdgeLoss(nu) {
  if (!(nu > -0.78)) return 0;
  return 6.9 + 20 * Math.log10(Math.sqrt((nu - 0.1) ** 2 + 1) + nu - 0.1);
}

/** Height (m) the Earth's bulge adds at d1 and d2 km from the ends, for an effective-radius factor k. */
export function earthBulge(d1, d2, k) {
  return (d1 * d2 * 1000) / (2 * k * EARTH_RADIUS);
}

/**
 * A single obstacle h m above the straight line between the ends (negative below it), d1 and d2 km
 * from them: { nu, radius, loss }, P.526 eq. (26).
 */
export function knifeEdge(f, d1, d2, h) {
  const radius = fresnelRadius(f, d1, d2);
  const nu = (Math.SQRT2 * h) / radius;
  return { nu, radius, loss: knifeEdgeLoss(nu) };
}

// ---------------------------------------------------------------- Vegetation (P.833)

// P.833-10 Table 1: mixed coniferous-deciduous woodland, one terminal in it.
// [f MHz, specific attenuation γ dB/m, maximum attenuation Am dB]
const WOODLAND = [
  [105.9, 0.04, 9.4],
  [466.475, 0.12, 18.0],
  [949.0, 0.17, 26.5],
  [1852.2, 0.3, 29.0],
  [2117.5, 0.34, 34.1],
];
export const WOODLAND_RANGE = [WOODLAND[0][0], WOODLAND[WOODLAND.length - 1][0]];

/** γ and Am from P.833 Table 1, interpolated in log f and held at the ends of its range. */
export function woodlandParameters(fMHz) {
  const x = Math.log(Math.min(Math.max(fMHz, WOODLAND_RANGE[0]), WOODLAND_RANGE[1]));
  for (let i = 1; i < WOODLAND.length; i++) {
    const [f0, g0, a0] = WOODLAND[i - 1];
    const [f1, g1, a1] = WOODLAND[i];
    if (x <= Math.log(f1)) {
      const w = (x - Math.log(f0)) / (Math.log(f1) - Math.log(f0));
      return { gamma: g0 + w * (g1 - g0), am: a0 + w * (a1 - a0) };
    }
  }
  const [, gamma, am] = WOODLAND[WOODLAND.length - 1];
  return { gamma, am };
}

/** Terrestrial path with one terminal depth m inside woodland, P.833 eq. (1). */
export function woodlandLoss(depth, gamma, am) {
  return am * (1 - Math.exp((-depth * gamma) / am));
}

/** Slant path through depth m of trees at elevation el°, P.833 eq. (4) (pine woodland, Austria). */
export function slantVegetationLoss(fMHz, depth, el) {
  return 0.25 * fMHz ** 0.39 * depth ** 0.25 * el ** 0.05;
}

// ---------------------------------------------------------------- Building entry (P.2109)

// P.2109-2 Table 1: [r, s, t, u, v, w, x, y, z].
const BUILDINGS = {
  traditional: [12.64, 3.72, 0.96, 9.6, 2.0, 9.1, -3.0, 4.5, -2.0],
  efficient: [28.19, -3.0, 8.48, 13.5, 3.8, 27.8, -2.9, 9.4, -2.1],
};

/** Building entry loss (dB) not exceeded with probability P (0–1), elevation el° at the façade. */
export function buildingEntryLoss(f, P, el, type) {
  const [r, s, t, u, v, w, x, y, z] = BUILDINGS[type];
  const lf = Math.log10(f);
  const mu1 = r + s * lf + t * lf * lf + 0.212 * Math.abs(el);
  const mu2 = w + x * lf;
  const sigma1 = u + v * lf;
  const sigma2 = y + z * lf;
  const n = normalInverse(P);
  const A = n * sigma1 + mu1;
  const B = n * sigma2 + mu2;
  return 10 * Math.log10(10 ** (0.1 * A) + 10 ** (0.1 * B) + 10 ** (0.1 * -3.0));
}

// ---------------------------------------------------------------- Clutter (P.2108)

function terrestrialClutterAt(f, d, p) {
  const ll = -2 * Math.log10(10 ** (-5 * Math.log10(f) - 12.5) + 10 ** -16.5);
  const ls = 32.98 + 23.9 * Math.log10(d) + 3 * Math.log10(f);
  const wl = 10 ** (-0.2 * ll);
  const ws = 10 ** (-0.2 * ls);
  const sigma = Math.sqrt((16 * wl + 36 * ws) / (wl + ws));
  return -5 * Math.log10(wl + ws) - sigma * qInverse(p / 100);
}

/** Clutter loss (dB) at one end of a terrestrial path not exceeded at p % of locations, P.2108 § 3.2. */
export function terrestrialClutterLoss(f, d, p) {
  return Math.min(terrestrialClutterAt(f, d, p), terrestrialClutterAt(f, 2, p));
}

/** Clutter loss (dB) at the ground end of an Earth–space path, P.2108 § 3.3 eq. (7). */
export function slantClutterLoss(f, el, p) {
  const k1 = 93 * f ** 0.175;
  const a1 = 0.05;
  const angle = a1 * (1 - el / 90) + (Math.PI * el) / 180;
  const base = -k1 * Math.log(1 - p / 100) / Math.tan(angle);
  return base ** ((0.5 * (90 - el)) / 90) - 1 - 0.6 * qInverse(p / 100);
}

// ---------------------------------------------------------------- Multipath (P.530)

/**
 * Multipath occurrence factor p0 (%) for the average worst month, P.530-19 eqs. (5), (6), (8), (9)
 * and (11). he and hr are the antenna altitudes and ht the mean terrain altitude (m above sea level).
 */
export function multipathOccurrence({ f, d, he, hr, ht, logK, dN75 }) {
  const ep = Math.abs(hr - he) / d;
  const hc = (hr + he) / 2 - d ** 2 / 102 - ht;
  const hL = Math.min(he, hr);
  const vsrLimit = (dN75 * d ** 1.5 * f ** 0.5) / 24730;
  const vsr = Math.min((dN75 / 50) ** 1.8 * Math.exp(-hc / (2.5 * Math.sqrt(d))), vsrLimit);
  const exponent = -0.376 * Math.tanh((hc - 147) / 125) - 0.334 * ep ** 0.39 - 0.00027 * hL + 17.85 * vsr;
  return { p0: 10 ** logK * d ** 3.51 * (f * f + 13) ** 0.447 * 10 ** exponent, ep, hc };
}

/** Percentage of the average worst month that a fade of A dB is exceeded, P.530-19 § 2.3.2. */
export function multipathExceedance(p0, A) {
  const at = 25 + 1.2 * Math.log10(p0);
  if (A >= at) return p0 * 10 ** (-A / 10);
  const pt = Math.min(p0 * 10 ** (-at / 10), 99.9999);
  const qa1 = (-20 * Math.log10(-Math.log((100 - pt) / 100))) / at;
  const qt = (qa1 - 2) / ((1 + 0.3 * 10 ** (-at / 20)) * 10 ** (-0.016 * at)) - 4.3 * (10 ** (-at / 20) + at / 800);
  const qa = 2 + (1 + 0.3 * 10 ** (-A / 20)) * 10 ** (-0.016 * A) * (qt + 4.3 * (10 ** (-A / 20) + A / 800));
  return 100 * (1 - Math.exp(-(10 ** ((-qa * A) / 20))));
}

/** Fade depth (dB) exceeded for pw % of the average worst month: the inverse of multipathExceedance. */
export function multipathFade(p0, pw) {
  if (!(pw < multipathExceedance(p0, 0))) return 0;
  let lo = 0;
  let hi = 1;
  while (multipathExceedance(p0, hi) > pw) hi *= 2;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (multipathExceedance(p0, mid) > pw) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Average worst month percentage for an annual percentage p, P.841 with the multipath parameters
 * of P.530 (Q1 = 2.85, β = 0.13): pw = Q p with Q = Q1 p^−β, at most 12, held constant above 3 %.
 */
export function worstMonthPercent(p) {
  const q = Math.min(2.85 * Math.min(p, 3) ** -0.13, 12);
  return q * p;
}
