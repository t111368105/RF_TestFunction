// A small SVG line chart for the analysis curves (margin versus elevation or time percentage), drawn
// like the distance chart in chart.mjs.

import { fmt } from './ui.mjs';

const LEFT = 70;
const RIGHT = 890;
const BOTTOM = 270;
const HEIGHT = 230;
// The plot shows at most this far below the lowest reference line, so a few very deep values (such
// as heavy rain at the lowest elevations) do not flatten the rest of the curve.
const BELOW_LINES = 30;
let charts = 0; // Numbers each chart's clip path, so several charts on a page do not share one.

/** A round step (1, 2 or 5 × 10ⁿ) giving about four intervals over span. */
function niceStep(span) {
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw);
}

/**
 * points: [[x, y]] with x on a linear or log10 axis (log: true takes x as the value, not its log);
 * xTicks: the x values to label; lines: [{ y, color, dash }] horizontal references;
 * markers: [{ x, label }]. Returns the markup and cursorAt(x), the SVG position of the curve at x
 * (held inside the plot) and its value, for a cursor group with class chart-cursor.
 */
export function lineChart({ points, log = false, label, xLabel, yLabel, xTicks, lines = [], markers = [], xTick = (x) => fmt(x, 3) }) {
  const pos = (x) => (log ? Math.log10(x) : x);
  const finite = points.filter(([, y]) => Number.isFinite(y));
  const lo = pos(points[0][0]);
  const hi = pos(points[points.length - 1][0]);
  const lineYs = lines.map((l) => l.y);
  const ys = [...finite.map(([, y]) => y), ...lineYs];
  let ymin = Math.min(...ys);
  let ymax = Math.max(...ys);
  if (lineYs.length) ymin = Math.max(ymin, Math.min(...lineYs) - BELOW_LINES);
  const pad = Math.max(3, (ymax - ymin) * 0.1);
  ymin -= pad;
  ymax += pad;
  const step = niceStep(ymax - ymin);

  const x = (v) => LEFT + ((pos(v) - lo) / (hi - lo)) * (RIGHT - LEFT);
  const y = (v) => BOTTOM - ((v - ymin) / (ymax - ymin)) * HEIGHT;
  const clampY = (v) => Math.min(BOTTOM, Math.max(BOTTOM - HEIGHT, y(v)));
  const clip = `line-chart-clip-${++charts}`;

  let svg =
    `<svg viewBox="0 0 930 330" role="img" aria-label="${label}">` +
    `<clipPath id="${clip}"><rect x="${LEFT}" y="${BOTTOM - HEIGHT}" width="${RIGHT - LEFT}" height="${HEIGHT}"/></clipPath>`;
  for (let v = Math.ceil(ymin / step) * step; v <= ymax; v += step) {
    svg +=
      `<line class="grid" x1="${LEFT}" x2="${RIGHT}" y1="${y(v)}" y2="${y(v)}"/>` +
      `<text x="60" y="${y(v) + 5}" text-anchor="end">${fmt(v, 3)}</text>`;
  }
  const ticks = xTicks ?? Array.from({ length: 5 }, (_, i) => (log ? 10 ** (lo + ((hi - lo) * i) / 4) : lo + ((hi - lo) * i) / 4));
  for (const tick of ticks) svg += `<text x="${x(tick)}" y="295" text-anchor="middle">${xTick(tick)}</text>`;
  for (const l of lines) {
    svg += `<line x1="${LEFT}" x2="${RIGHT}" y1="${y(l.y)}" y2="${y(l.y)}" stroke="var(--${l.color})" stroke-dasharray="${l.dash}"/>`;
  }
  svg +=
    `<polyline clip-path="url(#${clip})" points="${finite.map(([a, b]) => `${x(a)},${y(b)}`).join(' ')}" ` +
    'fill="none" stroke="var(--blue)" stroke-width="3"/>';
  markers.forEach((m, i) => {
    const px = x(m.x);
    const nearRight = px > RIGHT - 110;
    svg +=
      `<line class="marker" x1="${px}" x2="${px}" y1="${BOTTOM - HEIGHT}" y2="${BOTTOM}"/>` +
      `<text class="marker-label" x="${nearRight ? px - 4 : px + 4}" y="${BOTTOM - HEIGHT + 14 + 16 * i}" ` +
      `text-anchor="${nearRight ? 'end' : 'start'}">${m.label}</text>`;
  });
  svg +=
    `<g class="chart-cursor"><line x1="0" x2="0" y1="${BOTTOM - HEIGHT}" y2="${BOTTOM}"/><circle r="6"/></g>` +
    `<text x="70" y="22">${yLabel}</text>` +
    `<text x="480" y="325" text-anchor="middle">${xLabel}</text></svg>`;

  // The curve between samples, for the cursor.
  const at = (v) => {
    for (let i = 1; i < finite.length; i++) {
      const [x0, y0] = finite[i - 1];
      const [x1, y1] = finite[i];
      if (pos(v) <= pos(x1)) return y0 + ((pos(v) - pos(x0)) / (pos(x1) - pos(x0))) * (y1 - y0);
    }
    return finite[finite.length - 1]?.[1] ?? NaN;
  };
  return { svg, cursorAt: (v) => ({ x: x(v), y: clampY(at(v)), value: at(v) }) };
}

/** Moves a chart's cursor group to { x, y }. */
export function moveCursor(container, { x, y }) {
  const cursor = container.querySelector('.chart-cursor');
  if (!cursor || !Number.isFinite(y)) return;
  cursor.querySelector('line').setAttribute('x1', x);
  cursor.querySelector('line').setAttribute('x2', x);
  cursor.querySelector('circle').setAttribute('cx', x);
  cursor.querySelector('circle').setAttribute('cy', y);
}
