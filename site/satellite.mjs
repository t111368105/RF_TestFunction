// Satellite link geometry and sky noise.

const EARTH_RADIUS = 6371; // km

/**
 * Slant range (km) from a ground station stationKm above sea level to a satellite altitudeKm above
 * sea level, seen at elevation elevationDeg; null for impossible geometry.
 */
export function slantRange(altitudeKm, elevationDeg, stationKm = 0) {
  if (!(altitudeKm > stationKm) || !(elevationDeg >= 0 && elevationDeg <= 90)) return null;
  const rs = EARTH_RADIUS + stationKm;
  const r = EARTH_RADIUS + altitudeKm;
  const el = (elevationDeg * Math.PI) / 180;
  return Math.sqrt(r * r - (rs * Math.cos(el)) ** 2) - rs * Math.sin(el);
}

/** Atmospheric mean radiating temperature (K) from the surface temperature, ITU-R P.618 eq. (70). */
export const meanRadiatingTemperature = (tempC) => 37.34 + 0.81 * (tempC + 273.15);

/**
 * Sky noise temperature (K) seen by a ground station through an atmospheric attenuation of A dB
 * (excluding scintillation), ITU-R P.618 eq. (69).
 */
export function skyTemperature(A, tmr = 275) {
  const transmission = 10 ** (-A / 10);
  return tmr * (1 - transmission) + 2.7 * transmission;
}

/** ITU-R S.465-6 earth-station reference pattern (dBi) at φ° off boresight, 2 to 31 GHz, D/λ ≥ 50. */
export function s465Gain(phi) {
  return phi < 48 ? 32 - 25 * Math.log10(Math.max(phi, 1)) : -10;
}

/**
 * Share of the ITU-R S.465 pattern below the horizon for an antenna at elevation el°: (1/4π) ∫ G dΩ
 * over the ground, the weight the ground's brightness temperature gets in the antenna temperature
 * (ITU-R P.372 Part 3). The pattern is the envelope of the sidelobe peaks, so this is an upper bound.
 */
export function groundShare(el) {
  const rad = Math.PI / 180;
  const step = 0.25;
  const e = el * rad;
  let sum = 0;
  for (let b = -90 + step / 2; b < 0; b += step) {
    const cb = Math.cos(b * rad);
    const sb = Math.sin(b * rad);
    for (let a = step / 2; a < 180; a += step) {
      const cosPhi = Math.sin(e) * sb + Math.cos(e) * cb * Math.cos(a * rad);
      const phi = Math.acos(Math.min(1, Math.max(-1, cosPhi))) / rad;
      sum += 10 ** (s465Gain(phi) / 10) * cb;
    }
  }
  // Both sides of the boresight plane, each cell step² in solid angle.
  return (2 * sum * (step * rad) ** 2) / (4 * Math.PI);
}

/**
 * The first x at which ys reaches level, interpolating linearly between samples, scanning from the
 * start (rising) or the end (falling); null when it never does.
 */
export function crossing(xs, ys, level) {
  for (let i = 1; i < xs.length; i++) {
    const [y0, y1] = [ys[i - 1], ys[i]];
    if (!Number.isFinite(y0) || !Number.isFinite(y1)) continue;
    if ((y0 < level && y1 >= level) || (y0 >= level && y1 < level)) {
      return xs[i - 1] + ((level - y0) / (y1 - y0)) * (xs[i] - xs[i - 1]);
    }
  }
  return null;
}

/** The ranges [from, to] of xs where ys is at or above level, interpolating between samples. */
export function ranges(xs, ys, level) {
  const found = [];
  let start = ys[0] >= level ? xs[0] : null;
  for (let i = 1; i < xs.length; i++) {
    const [y0, y1] = [ys[i - 1], ys[i]];
    if (!Number.isFinite(y0) || !Number.isFinite(y1)) continue;
    const at = () => xs[i - 1] + ((level - y0) / (y1 - y0)) * (xs[i] - xs[i - 1]);
    if (y0 < level && y1 >= level) start = at();
    else if (y0 >= level && y1 < level && start !== null) {
      found.push([start, at()]);
      start = null;
    }
  }
  if (start !== null) found.push([start, xs[xs.length - 1]]);
  return found;
}
