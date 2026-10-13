// The link at another distance, elevation or time percentage. The estimated loss items are worked
// out again for the change, and loss values typed by hand stay as they are. The maximum distance, the
// distance chart, the measurements and the pass and availability curves all use this, so losses that
// grow with distance, such as rain on a terrestrial path, are counted wherever the link is moved.

import { budget } from './calculations.mjs';
import { reestimate } from './estimator.mjs';

/** budget() options for a snapshot or plan. */
const options = (s) => ({ ampFirst: s.ampPosition === 'before' });

/**
 * A snapshot's or plan's link values with the distance set to km and every estimated loss item
 * recalculated with change(inputs). An item that cannot be estimated for the change keeps its value;
 * with strict, the result is null instead.
 */
export function valuesAt(s, change, km = s.values[1], { strict = false } = {}) {
  const items = s.atmosphereEstimate?.items ?? {};
  const now = Object.keys(items).length ? reestimate(s.atmosphereEstimate, change) : {};
  let delta = 0;
  for (const [key, r] of Object.entries(items)) {
    if (now[key] === null || now[key] === undefined) {
      if (strict) return null;
      continue;
    }
    delta += now[key] - Number(r.value);
  }
  const v = [...s.values];
  v[1] = km;
  v[10] += delta;
  return v;
}

/**
 * The link values to check for typos: the estimated loss items are left out of the additional path
 * losses, since a large estimate (heavy rain at 60 GHz, say) is a result, not a wrong entry.
 */
export function enteredValues(s) {
  const estimated = Object.values(s.atmosphereEstimate?.items ?? {}).reduce((sum, r) => sum + Number(r.value), 0);
  const v = [...s.values];
  v[10] = Math.max(0, v[10] - estimated);
  return v;
}

/** The link budget at km, with the estimated losses recalculated for that distance. */
export function linkAt(s, km) {
  return budget(valuesAt(s, (i) => ({ ...i, distanceKm: km }), km), options(s));
}

const MAX_LOG = 6; // 10⁶ km, beyond the Moon
const STEP = 0.05; // decades

const reached = new WeakMap(); // Results per snapshot or plan; the page shows each twice.

/**
 * The farthest distance (km) at which the link still meets the required margin, with the estimated
 * losses recalculated at each distance: found on a logarithmic grid from the far-field limit to
 * 10⁶ km, then refined by bisection. Null when the required margin is met nowhere in that range.
 */
export function maxDistance(s) {
  if (!reached.has(s)) reached.set(s, searchMaxDistance(s));
  return reached.get(s);
}

function searchMaxDistance(s) {
  const required = s.values[9];
  const meets = (log) => {
    try {
      return linkAt(s, 10 ** log).margin >= required;
    } catch {
      return false;
    }
  };
  const lo = Math.log10(budget(s.values, options(s)).farFieldMin);
  let found = null;
  for (let log = MAX_LOG; log >= lo; log -= STEP) {
    if (meets(log)) {
      found = log;
      break;
    }
  }
  if (found === null) return null;
  let a = found;
  let b = Math.min(MAX_LOG, found + STEP);
  if (a === b) return 10 ** a;
  for (let k = 0; k < 40; k++) {
    const mid = (a + b) / 2;
    if (meets(mid)) a = mid;
    else b = mid;
  }
  return 10 ** a;
}
