// Analysis curves for a calculated link: link margin versus elevation over a satellite pass, and
// versus the percentage of time, which gives the availability. Each point recalculates the
// estimated loss items under their fields with the changed geometry or percentage; losses entered
// by hand stay as they are.

import { budget, number } from './calculations.mjs';
import { slantRange, crossing, ranges } from './satellite.mjs';
import { reestimate, atPercent } from './estimator.mjs';
import { lineChart, moveCursor } from './line-chart.mjs';
import { linkOptions } from './report.mjs';
import { $, fmt, table } from './ui.mjs';
import { t } from './i18n.mjs';

const MIN_ELEVATION = 5; // The ITU-R slant-path rain model starts at 5°.
// Items whose value depends on the percentage of time.
const TIME_ITEMS = ['atmospheric', 'cloud', 'tropo-scintillation', 'radome', 'multipath'];
const MINUTES_PER_YEAR = 525960;

/** Link margin with the estimated items recalculated by change(inputs) and the distance set to km. */
function marginWith(s, change, km = s.values[1]) {
  const items = s.atmosphereEstimate?.items ?? {};
  const now = reestimate(s.atmosphereEstimate, change);
  let delta = 0;
  for (const [key, r] of Object.entries(items)) {
    if (now[key] === null) return NaN;
    delta += now[key] - Number(r.value);
  }
  const v = [...s.values];
  v[1] = km;
  v[10] += delta;
  return budget(v, linkOptions(s)).margin;
}

// ---------------------------------------------------------------- Margin versus elevation

let passCursor = null;

export function showPass(s) {
  const box = $('pass-chart');
  const orbit = s.orbit;
  $('pass-body').hidden = !orbit;
  $('pass-missing').hidden = !!orbit;
  if (!orbit) return;
  const els = Array.from({ length: 90 - MIN_ELEVATION + 1 }, (_, i) => MIN_ELEVATION + i);
  const curve = els.map((el) => {
    const km = slantRange(orbit.altitude, el, orbit.stationKm);
    const margin = marginWith(s, (i) => ({ ...i, distanceKm: km, elevation: i.path === 'slant' ? el : i.elevation }), km);
    return [el, margin, km];
  });
  const required = s.values[9];
  const chart = lineChart({
    points: curve.map(([el, m]) => [el, m]),
    label: t('Link margin versus elevation over a satellite pass'),
    xLabel: t('Elevation (°)'),
    yLabel: t('Link margin (dB)'),
    lines: [
      { y: 0, color: 'orange', dash: '5 5' },
      { y: required, color: 'green', dash: '9 5' },
    ],
    markers: [{ x: orbit.elevation, label: t('Design elevation') }],
    xTicks: [5, 15, 30, 45, 60, 75, 90],
    xTick: (x) => fmt(x, 3) + '°',
  });
  box.innerHTML = chart.svg;
  passCursor = { chart, curve, orbit };

  const margins = curve.map(([, m]) => m);
  // The margin need not grow all the way to 90°, so list every range of elevations that reaches the level.
  const meetsFrom = (level) => {
    const found = ranges(els, margins, level);
    if (!found.length) return t('at no elevation');
    return found
      .map(([from, to]) => t('{from}° to {to}°', { from: fmt(from, 3), to: fmt(to, 3) }))
      .join(t(', '));
  };
  $('pass-results').innerHTML = table(
    [t('Item'), t('Result')],
    [
      [t('Above receiver sensitivity'), meetsFrom(0)],
      [t('Meets the required margin'), meetsFrom(required)],
      [t('Margin at 90° (overhead)'), `${fmt(margins[margins.length - 1])} dB`],
    ],
  );
  const slider = $('pass-slider');
  slider.min = MIN_ELEVATION;
  slider.max = 90;
  slider.value = Math.min(90, Math.max(MIN_ELEVATION, orbit.elevation));
  inspectPass();
}

function inspectPass() {
  if (!passCursor) return;
  const el = number($('pass-slider').value);
  const { chart, orbit } = passCursor;
  const at = chart.cursorAt(el);
  moveCursor($('pass-chart'), at);
  $('pass-readout').textContent = t('Elevation {elevation}° → distance {distance} km, link margin {margin} dB', {
    elevation: fmt(el, 3),
    distance: fmt(slantRange(orbit.altitude, el, orbit.stationKm), 5),
    margin: fmt(at.value),
  });
}

// ---------------------------------------------------------------- Margin versus time (availability)

let availabilityCursor = null;
const P_MIN = 0.001;
const P_MAX = 5;

/** Outage time per year for p % of the time. */
function outage(p) {
  const minutes = (p / 100) * MINUTES_PER_YEAR;
  return minutes < 120 ? t('{minutes} min a year', { minutes: fmt(minutes, 1) }) : t('{hours} h a year', { hours: fmt(minutes / 60, 1) });
}

export function showAvailability(s) {
  const items = s.atmosphereEstimate?.items ?? {};
  const timed = TIME_ITEMS.filter((key) => items[key] && !items[key].none);
  $('availability-body').hidden = !timed.length;
  $('availability-missing').hidden = !!timed.length;
  if (!timed.length) return;
  const ps = Array.from({ length: 61 }, (_, i) => 10 ** (Math.log10(P_MIN) + ((Math.log10(P_MAX) - Math.log10(P_MIN)) * i) / 60));
  const margins = ps.map((p) => marginWith(s, (i) => atPercent(i, p)));
  const design = items[timed[0]].inputs.percent;
  const required = s.values[9];
  const chart = lineChart({
    points: ps.map((p, i) => [p, margins[i]]),
    log: true,
    label: t('Link margin versus the percentage of time it is not reached'),
    xLabel: t('Percentage of the year the loss is exceeded (%, log scale)'),
    yLabel: t('Link margin (dB)'),
    lines: [
      { y: 0, color: 'orange', dash: '5 5' },
      { y: required, color: 'green', dash: '9 5' },
    ],
    markers: design >= P_MIN && design <= P_MAX ? [{ x: design, label: t('Design percentage') }] : [],
    xTicks: [0.001, 0.01, 0.1, 1, 5],
    xTick: (x) => fmt(x, 3) + ' %',
  });
  $('availability-chart').innerHTML = chart.svg;
  availabilityCursor = chart;

  // Margins grow with the percentage: rarer, deeper fades sit at the small percentages.
  const availability = (level) => {
    if (margins[0] >= level) return t('{availability} % or better', { availability: fmt(100 - P_MIN, 3) });
    if (!(margins[margins.length - 1] >= level)) return t('below {availability} %', { availability: fmt(100 - P_MAX, 4) });
    const p = 10 ** crossing(ps.map(Math.log10), margins, level);
    return t('{availability} % (outage {outage})', { availability: fmt(100 - p, 4), outage: outage(p) });
  };
  $('availability-results').innerHTML = table(
    [t('Item'), t('Result')],
    [
      [t('Above receiver sensitivity'), availability(0)],
      [t('With the required margin'), availability(required)],
    ],
  );
  const slider = $('availability-slider');
  slider.min = Math.log10(P_MIN);
  slider.max = Math.log10(P_MAX);
  slider.value = Math.log10(Math.min(P_MAX, Math.max(P_MIN, design)));
  inspectAvailability();
}

function inspectAvailability() {
  if (!availabilityCursor) return;
  const p = 10 ** number($('availability-slider').value);
  const at = availabilityCursor.cursorAt(p);
  moveCursor($('availability-chart'), at);
  $('availability-readout').textContent = t('Exceeded {percent} % of the time ({outage}) → link margin {margin} dB', {
    percent: fmt(p, 3),
    outage: outage(p),
    margin: fmt(at.value),
  });
}

export function initPass() {
  $('pass-slider').oninput = inspectPass;
  $('availability-slider').oninput = inspectAvailability;
}
