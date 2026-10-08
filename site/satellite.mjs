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
