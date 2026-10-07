// SVG chart of receiver input power versus distance on a logarithmic distance axis.

import { budget, powerAt } from './calculations.mjs';
import { fmt } from './ui.mjs';

const LEFT = 70;
const RIGHT = 890;
const BOTTOM = 270;
const HEIGHT = 230;
const SAMPLES = 80;

/** Returns the chart markup and its log10(km) range for the distance slider. */
export function distanceChart(v) {
  const r = budget(v);
  const center = Math.log10(v[1]);
  const target = r.maxDistance ? Math.log10(r.maxDistance) : center;
  const lo = Math.max(-150, Math.min(center - 1, target - 0.2));
  const hi = Math.min(150, Math.max(center + 1, target + 0.2));

  const points = Array.from({ length: SAMPLES + 1 }, (_, i) => {
    const log = lo + ((hi - lo) * i) / SAMPLES;
    return [log, powerAt(v, 10 ** log)];
  });
  const sensitivity = v[8];
  const required = v[8] + v[9];
  const ys = [...points.map((p) => p[1]), sensitivity, required];
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
    '<svg viewBox="0 0 930 330" role="img" aria-label="Received power versus distance, distance on a logarithmic scale">' +
    '<title>Received power decreases with distance</title>';
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
    '<text x="70" y="22">Receiver input (dBm)</text>' +
    '<text x="480" y="325" text-anchor="middle">Distance (km, log scale)</text></svg>';

  return { svg, lo, hi, center, maxDistance: r.maxDistance };
}
