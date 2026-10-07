// SVG chart of receiver input power versus distance on a logarithmic distance axis.

import { budget, powerAt, fittedPower } from './calculations.mjs';
import { fmt } from './ui.mjs';
import { t } from './i18n.mjs';

const LEFT = 70;
const RIGHT = 890;
const BOTTOM = 270;
const HEIGHT = 230;
const SAMPLES = 80;

/**
 * Returns the chart markup and its log10(km) range for the distance slider. measured holds
 * measurement points [km, dBm] and an optional log-distance fit, both drawn when present.
 */
export function distanceChart(v, measured = { points: [], fit: null }) {
  const r = budget(v);
  const center = Math.log10(v[1]);
  const target = r.maxDistance ? Math.log10(r.maxDistance) : center;
  const logs = measured.points.map(([d]) => Math.log10(d));
  const lo = Math.max(-150, Math.min(center - 1, target - 0.2, ...logs.map((l) => l - 0.1)));
  const hi = Math.min(150, Math.max(center + 1, target + 0.2, ...logs.map((l) => l + 0.1)));

  const points = Array.from({ length: SAMPLES + 1 }, (_, i) => {
    const log = lo + ((hi - lo) * i) / SAMPLES;
    return [log, powerAt(v, 10 ** log)];
  });
  const sensitivity = v[8];
  const required = v[8] + v[9];
  const ys = [...points.map((p) => p[1]), sensitivity, required, ...measured.points.map(([, p]) => p)];
  let ymin = Math.min(...ys);
  let ymax = Math.max(...ys);
  const pad = Math.max(5, (ymax - ymin) * 0.1);
  ymin -= pad;
  ymax += pad;

  const x = (l) => LEFT + ((l - lo) / (hi - lo)) * (RIGHT - LEFT);
  const y = (p) => BOTTOM - ((p - ymin) / (ymax - ymin)) * HEIGHT;
  const hline = (p, color, dash) =>
    `<line x1="${LEFT}" x2="${RIGHT}" y1="${y(p)}" y2="${y(p)}" stroke="var(--${color})" stroke-dasharray="${dash}"/>`;

  let svg =
    `<svg viewBox="0 0 930 330" role="img" aria-label="${t('Received power versus distance, distance on a logarithmic scale')}">` +
    `<title>${t('Received power decreases with distance')}</title>`;

  // Shade distances under the far-field limit, where the free-space model does not apply.
  const nearEnd = Math.min(Math.log10(r.farFieldMin), hi);
  if (nearEnd > lo) {
    svg +=
      `<rect class="near-field" x="${LEFT}" y="${BOTTOM - HEIGHT}" width="${x(nearEnd) - LEFT}" height="${HEIGHT}"/>` +
      `<text x="${LEFT + 6}" y="${BOTTOM - HEIGHT + 16}">${t('Near field')}</text>`;
  }
  for (let i = 0; i < 5; i++) {
    const p = ymin + ((ymax - ymin) * i) / 4;
    const l = lo + ((hi - lo) * i) / 4;
    svg +=
      `<line class="grid" x1="${LEFT}" x2="${RIGHT}" y1="${y(p)}" y2="${y(p)}"/>` +
      `<text x="60" y="${y(p) + 5}" text-anchor="end">${fmt(p, 0)}</text>` +
      `<text x="${x(l)}" y="295" text-anchor="middle">${fmt(10 ** l, 3)}</text>`;
  }
  svg +=
    hline(sensitivity, 'orange', '5 5') +
    hline(required, 'green', '9 5') +
    `<polyline points="${points.map((p) => `${x(p[0])},${y(p[1])}`).join(' ')}" fill="none" stroke="var(--blue)" stroke-width="3"/>` +
    measuredSvg(measured, v[1], lo, hi, x, y) +
    marker(center, t('Link distance'), 32) +
    (r.maxDistance && Math.log10(r.maxDistance) <= hi ? marker(Math.log10(r.maxDistance), t('Max distance'), 48) : '') +
    // Moved by cursorAt() as the distance slider changes.
    `<g id="chart-cursor"><line x1="0" x2="0" y1="${BOTTOM - HEIGHT}" y2="${BOTTOM}"/><circle r="6"/></g>` +
    `<text x="70" y="22">${t('Receiver input (dBm)')}</text>` +
    `<text x="480" y="325" text-anchor="middle">${t('Distance (km, log scale)')}</text></svg>`;

  return {
    svg,
    lo,
    hi,
    center,
    maxDistance: r.maxDistance,
    /** SVG position of the predicted curve at log10(distance km). */
    cursorAt: (log) => ({ x: x(log), y: y(powerAt(v, 10 ** log)) }),
  };

  function marker(log, label, labelY) {
    const px = x(log);
    const nearRight = px > RIGHT - 110;
    return (
      `<line class="marker" x1="${px}" x2="${px}" y1="${BOTTOM - HEIGHT}" y2="${BOTTOM}"/>` +
      `<text class="marker-label" x="${nearRight ? px - 4 : px + 4}" y="${BOTTOM - HEIGHT + labelY}" ` +
      `text-anchor="${nearRight ? 'end' : 'start'}">${label}</text>`
    );
  }
}

/** Measured points and the fitted line; the line is clipped to the plot so a steep fit cannot overflow. */
function measuredSvg({ points, fit }, d0, lo, hi, x, y) {
  let svg = '';
  if (fit) {
    svg +=
      `<clipPath id="plot-area"><rect x="${LEFT}" y="${BOTTOM - HEIGHT}" width="${RIGHT - LEFT}" height="${HEIGHT}"/></clipPath>` +
      `<line clip-path="url(#plot-area)" x1="${x(lo)}" y1="${y(fittedPower(fit, d0, 10 ** lo))}" ` +
      `x2="${x(hi)}" y2="${y(fittedPower(fit, d0, 10 ** hi))}" stroke="var(--violet)" stroke-width="2" stroke-dasharray="7 4"/>`;
  }
  for (const [d, p] of points) {
    svg += `<circle cx="${x(Math.log10(d))}" cy="${y(p)}" r="5" fill="var(--violet)" stroke="var(--surface)" stroke-width="1.5"/>`;
  }
  return svg;
}
