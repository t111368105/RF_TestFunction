// DVB-S2 page: the transmit and receive chain for the selected mode, drawn from dvbs2.mjs.

import {
  MODCODS,
  NLDPC,
  BITS_PER_SYMBOL,
  BBHEADER_BITS,
  TS_PACKET_BITS,
  SLOT,
  PILOT_BLOCK,
  SOF_BITS,
  frameInfo,
  interleaver,
  constellation,
  ringRadii,
  bbScramblingSequence,
  plsCode,
  plHeaderSymbols,
  rrc,
  usableModcods,
  rcPulse,
  srrcPulse,
  sofCorrelation,
  bitLlrs,
  gallagerLdpc,
  minSumDecode,
  syncd,
} from './dvbs2.mjs';
import { currentCn0 } from './budget.mjs';
import { random, gaussian, decide } from './signals.mjs';
import { plot, ticks, showOutputs } from './learn.mjs';
import { number } from './calculations.mjs';
import { $, fmt, esc, table, read, write } from './ui.mjs';
import { t } from './i18n.mjs';

const STORAGE_KEY = 'rf.dvbs2';
const COLORS = { QPSK: 'blue', '8PSK': 'green', '16APSK': 'orange', '32APSK': 'violet' };

/** The settings at the top of the page. */
function settings() {
  const modcod = MODCODS.find((m) => m.name === $('s2-modcod').value) ?? MODCODS[0];
  const frame = $('s2-frame').value;
  const pilots = $('s2-pilots').checked;
  const rs = number($('s2-rs').value) * 1e6;
  const alpha = number($('s2-rolloff').value);
  return { modcod, frame, pilots, rs, alpha, info: frameInfo(modcod, frame, pilots) };
}

const rate = (bits) => {
  if (!Number.isFinite(bits)) return '—';
  if (bits >= 1e9) return `${fmt(bits / 1e9, 3)} Gbit/s`;
  if (bits >= 1e6) return `${fmt(bits / 1e6, 3)} Mbit/s`;
  return `${fmt(bits / 1e3, 3)} kbit/s`;
};

// ---------------------------------------------------------------- shared drawings

/**
 * A horizontal bar split into segments [label, size, color], drawn in proportion but with a minimum
 * width so short fields stay visible. A label that does not fit inside its segment goes above it;
 * each segment's size goes below, kept inside the drawing.
 */
function frameBar(segments, unit, label) {
  const width = 640;
  const L = 10;
  const R = width - 10;
  const total = segments.reduce((s, [, size]) => s + size, 0);
  const shares = segments.map(([, size]) => Math.max(0.12, size / total));
  const scale = (R - L) / shares.reduce((a, b) => a + b, 0);
  const clamp = (x) => Math.min(R - 50, Math.max(L + 50, x));
  let x = L;
  let svg = `<svg class="compact wide" viewBox="0 0 ${width} 112" role="img" aria-label="${esc(label)}">`;
  segments.forEach(([name, size, color], k) => {
    const w = shares[k] * scale;
    const fits = w - 12 >= name.length * 7.5;
    svg +=
      `<rect x="${x}" y="24" width="${w - 2}" height="40" rx="4" fill="var(--${color})" opacity=".8"/>` +
      (fits
        ? `<text x="${x + w / 2}" y="49" text-anchor="middle" class="bar-label">${esc(name)}</text>`
        : `<text x="${clamp(x + w / 2)}" y="16" text-anchor="middle" class="bar-label">${esc(name)}</text>`) +
      `<text x="${clamp(x + w / 2)}" y="84" text-anchor="middle">${fmt(size, 0)} ${unit}</text>`;
    x += w;
  });
  return svg + `<text x="${R}" y="106" text-anchor="end">${esc(t('Total {total} {unit}', { total: fmt(total, 0), unit }))}</text></svg>`;
}

/** Constellation points with optional labels and rings, and optional received points. */
function constellationSvg(points, { label, received = [], rings = [], labels = true, size = 400, cells = [] }) {
  const lim = 1.45;
  const pad = 30;
  const span = size - 2 * pad;
  const px = (v) => pad + ((v + lim) / (2 * lim)) * span;
  const py = (v) => pad + ((lim - v) / (2 * lim)) * span;
  let svg =
    `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label)}">` +
    `<line class="axis" x1="${pad}" x2="${size - pad}" y1="${py(0)}" y2="${py(0)}"/>` +
    `<line class="axis" x1="${px(0)}" x2="${px(0)}" y1="${pad}" y2="${size - pad}"/>` +
    `<text x="${size - pad}" y="${py(0) - 6}" text-anchor="end">I</text><text x="${px(0) + 6}" y="${pad + 10}">Q</text>`;
  // Background squares {i, q, d (side), color, opacity}, e.g. an LLR map, drawn under everything else.
  const cellSvg = cells
    .map((c) => {
      const side = (c.d / (2 * lim)) * span;
      return `<rect x="${(px(c.i) - side / 2).toFixed(1)}" y="${(py(c.q) - side / 2).toFixed(1)}" width="${side.toFixed(1)}" height="${side.toFixed(1)}" fill="var(--${c.color})" opacity="${c.opacity.toFixed(2)}" shape-rendering="crispEdges"/>`;
    })
    .join('');
  svg = svg.replace('<line class="axis"', cellSvg + '<line class="axis"');
  for (const r of rings) {
    svg += `<circle cx="${px(0)}" cy="${py(0)}" r="${(r / (2 * lim)) * span}" fill="none" stroke="var(--muted)" stroke-dasharray="3 4" opacity=".6"/>`;
  }
  for (const p of received) {
    svg += `<circle cx="${px(p.i)}" cy="${py(p.q)}" r="1.8" fill="var(--${p.error ? 'orange' : 'blue'})" opacity="${p.error ? 0.9 : 0.4}"/>`;
  }
  const font = points.length > 16 ? 9 : 11;
  for (const p of points) {
    svg += `<circle cx="${px(p.i)}" cy="${py(p.q)}" r="5" fill="var(--ink)"/>`;
    if (labels && p.bits) {
      svg += `<text class="point-label" x="${px(p.i)}" y="${py(p.q) - 8}" text-anchor="middle" font-size="${font}">${p.bits}</text>`;
    }
  }
  return svg + '</svg>';
}

// ---------------------------------------------------------------- settings and diagram

function drawSummary(s) {
  if (!s.info) {
    $('s2-summary').innerHTML = `<p class="error">${t('Code rate 9/10 has no short FECFRAME; choose the normal frame or another rate.')}</p>`;
    return;
  }
  const { info } = s;
  const ebn0 = s.modcod.esn0 - 10 * Math.log10(info.efficiency);
  $('s2-summary').innerHTML = table(
    [t('Quantity'), t('Value')],
    [
      [t('Useful bits per frame (K_bch − 80)'), fmt(info.kbch - BBHEADER_BITS, 0)],
      [t('PLFRAME length'), `${fmt(info.plSymbols, 0)} ${t('symbols')}`],
      [t('Spectral efficiency η'), `${fmt(info.efficiency, 4)} bit/symbol`],
      [t('Useful bit rate'), Number.isFinite(s.rs) && s.rs > 0 ? rate(info.efficiency * s.rs) : t('Enter a symbol rate')],
      [t('Occupied bandwidth'), Number.isFinite(s.rs) && s.rs > 0 ? `${fmt((s.rs * (1 + s.alpha)) / 1e6, 4)} MHz` : '—'],
      [t('Required Es/N₀ (table 13)'), `${fmt(s.modcod.esn0, 2)} dB${s.frame === 'short' ? ' ' + t('(+0.2 to 0.3 dB for short frames)') : ''}`],
      [t('Required Eb/N₀'), `${fmt(ebn0, 2)} dB`],
    ],
  );
}

const TX_BLOCKS = [
  ['s2-tx1', 'Mode', 'adaptation'],
  ['s2-tx2', 'Stream', 'adaptation'],
  ['s2-tx3', 'FEC', 'BCH + LDPC'],
  ['s2-tx4', 'Bit', 'interleaver'],
  ['s2-tx5', 'Constellation', 'mapping'],
  ['s2-tx6', 'PL', 'framing'],
  ['s2-tx7', 'SRRC filter', 'and modulator'],
];
const RX_BLOCKS = [
  ['s2-rx6', 'Stream', 'recovery'],
  ['s2-rx5', 'LDPC + BCH', 'decoding'],
  ['s2-rx4', 'Soft', 'demapping'],
  ['s2-rx3', 'Carrier', 'recovery'],
  ['s2-rx2', 'Timing and', 'frame sync'],
  ['s2-rx1', 'Front end and', 'matched filter'],
];

function drawDiagram() {
  const width = 900;
  const height = 250;
  // The receiver row runs right to left, from the front end to the stream output.
  const row = (blocks, y, color, leftward = false) => {
    const gap = 14;
    const w = (width - 20 - gap * (TX_BLOCKS.length - 1)) / TX_BLOCKS.length;
    const offset = (TX_BLOCKS.length - blocks.length) * (w + gap);
    return blocks
      .map(([id, a, b], k) => {
        const x = 10 + offset + k * (w + gap);
        const arrow =
          k < blocks.length - 1
            ? `<line x1="${leftward ? x + w + gap : x + w}" x2="${leftward ? x + w : x + w + gap}" y1="${y + 28}" y2="${y + 28}" ` +
              'stroke="var(--muted)" marker-end="url(#s2-arrow)"/>'
            : '';
        return (
          `<a href="#${id}"><rect x="${x}" y="${y}" width="${w}" height="56" rx="8" fill="var(--${color})" fill-opacity=".14" stroke="var(--${color})"/>` +
          `<text x="${x + w / 2}" y="${y + 24}" text-anchor="middle" class="bar-label">${esc(t(a))}</text>` +
          `<text x="${x + w / 2}" y="${y + 41}" text-anchor="middle" class="bar-label">${esc(t(b))}</text></a>` +
          arrow
        );
      })
      .join('');
  };
  $('s2-diagram').innerHTML =
    `<svg class="compact wide" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(t('DVB-S2 transmitter and receiver block diagram'))}">` +
    '<defs><marker id="s2-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
    '<path d="M0,0 L10,5 L0,10 z" fill="var(--muted)"/></marker></defs>' +
    `<text x="10" y="18">${esc(t('Transmitter: transport stream in'))}</text>` +
    row(TX_BLOCKS, 28, 'blue') +
    `<line x1="${width - 20}" x2="${width - 20}" y1="88" y2="160" stroke="var(--muted)" stroke-dasharray="5 4" marker-end="url(#s2-arrow)"/>` +
    `<text x="${width - 28}" y="128" text-anchor="end">${esc(t('Satellite channel: path loss, noise, Doppler, phase noise'))}</text>` +
    row(RX_BLOCKS, 166, 'green', true) +
    `<text x="10" y="242">${esc(t('Receiver: transport stream out'))}</text></svg>`;
}

// ---------------------------------------------------------------- transmitter

function drawTx(s) {
  if (!s.info) {
    for (const id of ['s2-bbframe', 's2-fecframe', 's2-fec-table', 's2-interleaver', 's2-plframe', 's2-plframe-table']) $(id).innerHTML = '';
    return;
  }
  const { info, modcod } = s;
  const dfl = info.kbch - BBHEADER_BITS;
  $('s2-bbframe').innerHTML = frameBar(
    [
      ['BBHEADER', BBHEADER_BITS, 'orange'],
      ['DATA FIELD', dfl, 'blue'],
    ],
    'bits',
    t('BBFRAME structure'),
  );
  $('s2-bbframe-note').textContent = t(
    'The DATA FIELD holds {packets} transport stream packets of 188 bytes; packets continue into the next frame, and SYNCD marks where the first whole one starts.',
    { packets: fmt(dfl / TS_PACKET_BITS, 2) },
  );

  $('s2-fecframe').innerHTML = frameBar(
    [
      ['BBFRAME', info.kbch, 'blue'],
      ['BCHFEC', info.nbch - info.kbch, 'orange'],
      ['LDPCFEC', info.nldpc - info.nbch, 'violet'],
    ],
    'bits',
    t('FECFRAME structure'),
  );
  $('s2-fec-table').innerHTML = table(
    [t('Quantity'), t('Value')],
    [
      [t('BCH: K_bch → N_bch'), `${fmt(info.kbch, 0)} → ${fmt(info.nbch, 0)}`],
      [t('BCH: corrects up to t errors'), String(info.t)],
      [t('LDPC: k_ldpc → n_ldpc'), `${fmt(info.nbch, 0)} → ${fmt(info.nldpc, 0)} (${modcod.rate})`],
      [t('LDPC accumulator step q'), String(info.q)],
      [t('Overall code rate K_bch / n_ldpc'), fmt(info.codeRate, 4)],
    ],
  );

  const il = interleaver(modcod.mod, s.frame, modcod.rate);
  if (!il) {
    $('s2-interleaver').innerHTML = '';
    $('s2-interleaver-note').textContent = t('QPSK is not interleaved: its two bits are equally reliable.');
  } else {
    // A small interleaver of the same shape: C columns of 4 rows, written down the columns.
    const rows = 4;
    const cols = il.columns;
    const cell = 46;
    const w = cols * cell + 220;
    let svg =
      `<svg class="compact" viewBox="0 0 ${w} ${rows * cell + 50}" style="max-width: ${w * 1.4}px" role="img" ` +
      `aria-label="${esc(t('Block interleaver, written by columns and read by rows'))}">`;
    for (let c = 0; c < cols; c++) {
      svg += `<text x="${30 + c * cell + cell / 2}" y="16" text-anchor="middle">${esc(t('col {n}', { n: c + 1 }))}</text>`;
      for (let r = 0; r < rows; r++) {
        const k = c * rows + r;
        svg +=
          `<rect x="${30 + c * cell}" y="${24 + r * cell}" width="${cell - 4}" height="${cell - 4}" rx="4" fill="var(--blue)" opacity="${0.15 + 0.6 * (c / cols)}"/>` +
          `<text x="${30 + c * cell + cell / 2 - 2}" y="${24 + r * cell + cell / 2 + 3}" text-anchor="middle">${k}</text>`;
      }
    }
    for (let r = 0; r < rows; r++) {
      const order = Array.from({ length: cols }, (_, c) => c * rows + r);
      const bits = (il.reversed ? order.reverse() : order).join(', ');
      svg += `<text x="${40 + cols * cell}" y="${24 + r * cell + cell / 2 + 3}">${esc(t('symbol {n}: bits {bits}', { n: r + 1, bits }))}</text>`;
    }
    $('s2-interleaver').innerHTML = svg + '</svg>';
    $('s2-interleaver-note').textContent =
      t('Shown with 4 rows; the real interleaver for {mod} has {columns} columns of {rows} rows, so each symbol takes bits {rows} positions apart.', {
        mod: modcod.mod,
        columns: cols,
        rows: fmt(il.rows, 0),
      }) + (il.reversed ? ' ' + t('For 8PSK 3/5 each row is read from the last column, so the first bit of the frame is sent third (figure 8 of the standard).') : '');
  }

  const radii = ringRadii(modcod.mod, modcod.rate);
  $('s2-constellation').innerHTML = constellationSvg(constellation(modcod.mod, modcod.rate), {
    label: t('{name} constellation', { name: modcod.name }),
    rings: radii.length > 1 ? radii : [],
  });
  $('s2-map-readout').innerHTML = table(
    [t('Quantity'), t('Value')],
    [
      [t('Bits per symbol'), String(BITS_PER_SYMBOL[modcod.mod])],
      [t('Points'), String(2 ** BITS_PER_SYMBOL[modcod.mod])],
      [t('Ring radii (unit energy)'), radii.map((r) => fmt(r, 4)).join(', ')],
      ...(radii.length > 1 ? [[t('Ring ratios to the inner ring'), radii.slice(1).map((r) => fmt(r / radii[0], 3)).join(', ')]] : []),
    ],
  );

  const segments = [
    ['PLHEADER', SLOT, 'orange'],
    [t('{n} slots of data', { n: info.slots }), SLOT * info.slots, 'blue'],
  ];
  if (info.pilotBlocks) segments.push([t('{n} pilot blocks', { n: info.pilotBlocks }), PILOT_BLOCK * info.pilotBlocks, 'green']);
  $('s2-plframe').innerHTML = frameBar(segments, t('symbols'), t('PLFRAME structure'));
  const duration = Number.isFinite(s.rs) && s.rs > 0 ? `${fmt((info.plSymbols / s.rs) * 1e3, 4)} ms` : '—';
  $('s2-plframe-table').innerHTML = table(
    [t('Quantity'), t('Value')],
    [
      [t('MODCOD number (table 12)'), `${modcod.code}`],
      [t('TYPE bits (short frame, pilots)'), `${s.frame === 'short' ? 1 : 0}${s.pilots ? 1 : 0}`],
      [t('Slots S'), String(info.slots)],
      [t('PLFRAME length'), `${fmt(info.plSymbols, 0)} ${t('symbols')}`],
      [t('Framing efficiency'), `${fmt(100 * info.plEfficiency, 2)} %`],
      [t('Frame duration'), duration],
    ],
  );

  const pls = plsCode(modcod.code, s.frame === 'short', s.pilots);
  const group = (bits) => bits.join('').match(/.{1,8}/g).join(' ');
  $('s2-plheader-bits').innerHTML =
    `<p><strong>SOF</strong> (0x18D2E82)<br>${group(SOF_BITS)}</p>` +
    `<p><strong>PLS</strong> (${t('MODCOD {code}, TYPE {type}', { code: modcod.code, type: `${s.frame === 'short' ? 1 : 0}${s.pilots ? 1 : 0}` })})<br>${group(pls)}</p>`;
  $('s2-plheader').innerHTML = constellationSvg(plHeaderSymbols([...SOF_BITS, ...pls]), {
    label: t('π/2-BPSK symbols of the PLHEADER'),
    labels: false,
    size: 300,
  });
}

function drawPrbs() {
  const input = ($('s2-prbs-in').value.match(/[01]/g) ?? []).slice(0, 64).map(Number);
  const prbs = bbScramblingSequence(input.length);
  const out = input.map((b, k) => b ^ prbs[k]);
  const group = (bits) => (bits.length ? bits.join('').match(/.{1,8}/g).join(' ') : '—');
  $('s2-prbs-out').innerHTML =
    `<p>${esc(t('Input'))}<br>${group(input)}</p>` +
    `<p>${esc(t('PRBS'))}<br>${group(prbs)}</p>` +
    `<p>${esc(t('Scrambled (input XOR PRBS)'))}<br>${group(out)}</p>`;
}

function drawSpectrum(s) {
  const alphas = [0.35, 0.25, 0.2];
  const points = (alpha) => Array.from({ length: 241 }, (_, k) => {
    const f = -1 + k / 120; // in units of Rs
    return [f, rrc(f, 1, alpha) ** 2];
  });
  $('s2-spectrum').innerHTML = plot({
    label: t('Power spectrum of the SRRC-shaped signal'),
    x: [-1, 1],
    y: [0, 1.1],
    xTicks: ticks(-1, 1, 0.25),
    yTicks: [0, 0.5, 1],
    xLabel: t('Frequency offset from the carrier (× Rs)'),
    yLabel: t('Relative power'),
    series: alphas.map((a) => ({ points: points(a), color: a === s.alpha ? 'blue' : 'muted', width: a === s.alpha ? 3 : 1.4, opacity: a === s.alpha ? 1 : 0.6 })),
  });
  const ok = Number.isFinite(s.rs) && s.rs > 0;
  $('s2-spectrum-readout').innerHTML = table(
    [t('Quantity'), t('Value')],
    [
      [t('Occupied bandwidth Rs(1 + α)'), ok ? `${fmt((s.rs * (1 + s.alpha)) / 1e6, 4)} MHz` : '—'],
      [t('−3 dB bandwidth (= Rs)'), ok ? `${fmt(s.rs / 1e6, 4)} MHz` : '—'],
      [t('Useful bits per hertz'), s.info ? `${fmt(s.info.efficiency / (1 + s.alpha), 4)} bit/s/Hz` : '—'],
    ],
  );
}

// ---------------------------------------------------------------- receiver

function drawCarrier(s) {
  const points = constellation(s.modcod.mod, s.modcod.rate);
  const m = BITS_PER_SYMBOL[s.modcod.mod];
  const esn0 = 10 ** (Number($('s2-esn0').value) / 10);
  const sigma = Math.sqrt(1 / (2 * esn0));
  const phase = (Number($('s2-phase').value) * Math.PI) / 180;
  const rand = random(5);
  const noisy = (p) => {
    const [i, q] = [p.i + sigma * gaussian(rand), p.q + sigma * gaussian(rand)];
    return { i: i * Math.cos(phase) - q * Math.sin(phase), q: i * Math.sin(phase) + q * Math.cos(phase) };
  };
  // Estimate the phase from one pilot block: 36 known symbols (1 + j)/√2.
  const pilot = { i: Math.SQRT1_2, q: Math.SQRT1_2 };
  let re = 0;
  let im = 0;
  for (let k = 0; k < PILOT_BLOCK; k++) {
    const r = noisy(pilot);
    re += r.i * pilot.i + r.q * pilot.q;
    im += r.q * pilot.i - r.i * pilot.q;
  }
  const estimate = Math.atan2(im, re);
  const correct = $('s2-correct').checked;
  const undo = correct ? -estimate : 0;
  const received = [];
  let errors = 0;
  for (let n = 0; n < 600; n++) {
    const sent = points[Math.floor(rand() * points.length)];
    const r = noisy(sent);
    const c = { i: r.i * Math.cos(undo) - r.q * Math.sin(undo), q: r.i * Math.sin(undo) + r.q * Math.cos(undo) };
    const error = decide(points, c.i, c.q) !== sent;
    if (error) errors++;
    received.push({ ...c, error });
  }
  $('s2-rx-constellation').innerHTML = constellationSvg(points, {
    label: t('Received {name} symbols', { name: s.modcod.name }),
    received,
    labels: false,
  });
  const deg = (r) => `${fmt((r * 180) / Math.PI, 2)}°`;
  $('s2-rx-readout').innerHTML = table(
    [t('Quantity'), t('Value')],
    [
      [t('Phase estimated from 36 pilots'), deg(estimate)],
      [t('Residual phase error'), deg(phase + undo)],
      [t('Symbol error rate (600 symbols)'), errors === 0 ? '0' : (errors / 600).toExponential(2)],
      [t('Required Es/N₀ for this MODCOD'), `${fmt(s.modcod.esn0, 2)} dB`],
      [t('Bits per symbol'), String(m)],
    ],
  );
}

// ---------------------------------------------------------------- MODCODs

function drawModcods(s) {
  const available = number($('s2-link-esn0').value);
  const margin = number($('s2-margin').value) || 0;
  const frame = s.info ? s.frame : 'normal';
  const info = (m) => frameInfo(m, frame, s.pilots);
  const usable = Number.isFinite(available) ? usableModcods(available, margin).filter(info) : [];
  const best = usable[usable.length - 1];
  const groups = Object.keys(COLORS).map((mod) => ({
    points: MODCODS.filter((m) => m.mod === mod && info(m)).map((m) => [m.esn0, info(m).efficiency]),
    color: COLORS[mod],
    r: 5,
  }));
  if (best) groups.push({ points: [[best.esn0, info(best).efficiency]], color: 'ink', r: 8 });
  const shannon = Array.from({ length: 101 }, (_, k) => {
    const x = -4 + (k * 22) / 100;
    return [x, Math.log2(1 + 10 ** (x / 10))];
  });
  const series = [{ points: shannon, color: 'muted', width: 2, dash: '6 5' }];
  if (Number.isFinite(available)) {
    series.push({ points: [[available - margin, 0], [available - margin, 6]], color: 'orange', width: 2, dash: '4 4' });
  }
  $('s2-modcod-chart').innerHTML =
    plot({
      label: t('Spectral efficiency of each MODCOD against its required Es/N₀, with the Shannon limit'),
      x: [-4, 18],
      y: [0, 5.5],
      xTicks: ticks(-4, 18, 2),
      yTicks: [0, 1, 2, 3, 4, 5],
      xLabel: t('Required Es/N₀ (dB)'),
      yLabel: t('Efficiency (bit/symbol)'),
      xFormat: (v) => fmt(v, 0),
      yFormat: (v) => fmt(v, 0),
      series,
      dots: groups,
    }) +
    `<p class="legend">${Object.entries(COLORS)
      .map(([mod, c]) => `<span style="color: var(--${c})">● ${mod}</span>`)
      .join('')}<span>╌ ${esc(t('Shannon limit'))}</span><span style="color: var(--orange)">┆ ${esc(t('Available Es/N₀ − margin'))}</span></p>`;
  const ok = Number.isFinite(s.rs) && s.rs > 0;
  $('s2-acm').innerHTML = best
    ? table(
        [t('Quantity'), t('Value')],
        [
          [t('Most efficient usable MODCOD'), best.name],
          [t('Its required Es/N₀'), `${fmt(best.esn0, 2)} dB`],
          [t('Spectral efficiency η'), `${fmt(info(best).efficiency, 4)} bit/symbol`],
          [t('Useful bit rate'), ok ? rate(info(best).efficiency * s.rs) : '—'],
        ],
      )
    : Number.isFinite(available)
      ? `<p class="error">${t('No MODCOD works at this Es/N₀ and margin; the lowest needs {value} dB.', { value: fmt(MODCODS[0].esn0 + margin, 2) })}</p>`
      : `<p class="hint">${t('Enter the available Es/N₀ to pick a MODCOD.')}</p>`;
  $('s2-modcod-table').innerHTML = table(
    [t('MODCOD'), t('Efficiency η (bit/symbol)'), t('Required Es/N₀ (dB)'), t('Required Eb/N₀ (dB)'), t('Useful bit rate'), t('Usable')],
    MODCODS.filter(info).map((m) => {
      const eta = info(m).efficiency;
      return [
        m === best ? `${m.name} ★` : m.name,
        fmt(eta, 4),
        fmt(m.esn0, 2),
        fmt(m.esn0 - 10 * Math.log10(eta), 2),
        ok ? rate(eta * s.rs) : '—',
        usable.includes(m) ? '✓' : '',
      ];
    }),
  );
}

// ---------------------------------------------------------------- receiver figures

function drawPulses(s) {
  const peak = srrcPulse(0, s.alpha);
  const at = (f) => Array.from({ length: 401 }, (_, k) => {
    const x = -5 + k / 40;
    return [x, f(x)];
  });
  $('s2-pulses').innerHTML =
    plot({
      label: t('SRRC pulse and raised cosine after the matched filter'),
      x: [-5, 5],
      y: [-0.3, 1.1],
      xTicks: ticks(-5, 5, 1),
      yTicks: [0, 0.5, 1],
      xLabel: t('Time (symbol periods T)'),
      yLabel: t('Amplitude (normalized)'),
      xFormat: (v) => fmt(v, 0),
      series: [
        { points: at((x) => srrcPulse(x, s.alpha) / peak), color: 'violet', width: 2, dash: '6 4' },
        { points: at((x) => rcPulse(x, s.alpha)), color: 'blue', width: 3 },
      ],
      dots: [{ points: ticks(-5, 5, 1).map((x) => [x, rcPulse(x, s.alpha)]), color: 'orange', r: 4 }],
    }) +
    `<p class="legend"><span style="color: var(--violet)">╌ ${esc(t('SRRC (transmitter alone)'))}</span><span style="color: var(--blue)">— ${esc(t('Raised cosine (after the matched filter)'))}</span><span style="color: var(--orange)">● ${esc(t('Symbol instants'))}</span></p>`;
}

const EYE_SYMBOLS = (() => {
  const rand = random(11);
  return Array.from({ length: 160 }, () => (rand() < 0.5 ? -1 : 1));
})();

function drawEye(s) {
  const tau = Number($('s2-timing').value);
  const y = (x) => {
    let sum = 0;
    for (let k = Math.max(0, Math.floor(x) - 10); k <= Math.min(EYE_SYMBOLS.length - 1, Math.ceil(x) + 10); k++) sum += EYE_SYMBOLS[k] * rcPulse(x - k, s.alpha);
    return sum;
  };
  const series = [];
  let opening = Infinity;
  let gardner = 0;
  let count = 0;
  for (let k = 12; k < EYE_SYMBOLS.length - 12; k++) {
    series.push({ points: Array.from({ length: 41 }, (_, j) => [-1 + j / 20, y(k - 1 + j / 20)]), color: 'blue', width: 1, opacity: 0.25 });
    opening = Math.min(opening, EYE_SYMBOLS[k] * y(k + tau));
    gardner += y(k - 0.5 + tau) * (y(k + tau) - y(k - 1 + tau));
    count++;
  }
  gardner /= count;
  series.push({ points: [[tau, -1.8], [tau, 1.8]], color: 'orange', width: 2, dash: '5 4' });
  $('s2-eye').innerHTML = plot({
    label: t('Eye diagram of the matched filter output'),
    x: [-1, 1],
    y: [-1.8, 1.8],
    xTicks: ticks(-1, 1, 0.5),
    yTicks: [-1, 0, 1],
    xLabel: t('Time from the ideal sampling instant (T)'),
    yLabel: t('I amplitude'),
    xFormat: (v) => fmt(v, 1),
    yFormat: (v) => fmt(v, 0),
    series,
  });
  $('s2-eye-readout').innerHTML = table(
    [t('Quantity'), t('Value')],
    [
      [t('Worst-case eye opening'), opening > 0 ? `${fmt(100 * opening, 1)} %` : t('Closed')],
      [t('Gardner error (average)'), fmt(gardner, 3)],
      [t('Correction'), Math.abs(gardner) < 0.01 ? t('None: sampling at the eye centre') : gardner > 0 ? t('Sample earlier') : t('Sample later')],
    ],
  );
}

const SOF_START = 120;

function drawSof() {
  const esn0 = 10 ** (Number($('s2-sof-esn0').value) / 10);
  const df = Number($('s2-sof-df').value) / 100; // cycles per symbol
  const sigma = Math.sqrt(1 / (2 * esn0));
  const rand = random(23);
  const header = plHeaderSymbols([...SOF_BITS, ...plsCode(14)]);
  const qpsk = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
  const r = Array.from({ length: 300 }, (_, n) => {
    const h = header[n - SOF_START];
    const s = h ?? (() => {
      const a = qpsk[Math.floor(rand() * 4)];
      return { i: Math.cos(a), q: Math.sin(a) };
    })();
    const phi = 2 * Math.PI * df * n + 0.6;
    const [i, q] = [s.i * Math.cos(phi) - s.q * Math.sin(phi), s.i * Math.sin(phi) + s.q * Math.cos(phi)];
    return { i: i + sigma * gaussian(rand), q: q + sigma * gaussian(rand) };
  });
  const corr = sofCorrelation(r);
  const peak = (key) => corr.reduce((best, c, n) => (c[key] > corr[best][key] ? n : best), 0);
  const [pc, pd] = [peak('coherent'), peak('differential')];
  $('s2-sof').innerHTML =
    plot({
      label: t('SOF correlation along the received stream'),
      x: [0, corr.length - 1],
      y: [0, 1.2],
      xTicks: ticks(0, 275, 25),
      yTicks: [0, 0.5, 1],
      xLabel: t('Candidate frame start n (symbols)'),
      yLabel: t('Normalized correlation'),
      xFormat: (v) => fmt(v, 0),
      series: [
        { points: corr.map((c, n) => [n, c.coherent]), color: 'violet', width: 1.4, opacity: 0.8 },
        { points: corr.map((c, n) => [n, c.differential]), color: 'blue', width: 2 },
      ],
      dots: [{ points: [[SOF_START, corr[SOF_START].differential]], color: 'orange', r: 5 }],
    }) +
    `<p class="legend"><span style="color: var(--violet)">— ${esc(t('Coherent correlation'))}</span><span style="color: var(--blue)">— ${esc(t('Differential correlation'))}</span><span style="color: var(--orange)">● ${esc(t('True frame start'))}</span></p>`;
  const found = (n) => (n === SOF_START ? `${n} ✓` : t('{n} ✗ (wrong)', { n }));
  $('s2-sof-readout').innerHTML = table(
    [t('Quantity'), t('Value')],
    [
      [t('Phase turn over the 26-symbol SOF'), `${fmt(360 * df * 26, 0)}°`],
      [t('Peak of the coherent correlation'), found(pc)],
      [t('Peak of the differential correlation'), found(pd)],
    ],
  );
}

function drawLlr(s) {
  const points = constellation(s.modcod.mod, s.modcod.rate);
  const m = points[0].bits.length;
  const select = $('s2-llr-bit');
  const keep = Math.min(Number(select.value) || 0, m - 1);
  select.innerHTML = Array.from({ length: m }, (_, k) => `<option value="${k}">${esc(t(k === 0 ? 'Bit {n} (leftmost)' : 'Bit {n}', { n: k + 1 }))}</option>`).join('');
  select.value = String(keep);
  const bit = Number(select.value);
  const n0 = 1 / 10 ** (Number($('s2-llr-esn0').value) / 10);
  const steps = 44;
  const lim = 1.4;
  const d = (2 * lim) / steps;
  const cells = [];
  for (let a = 0; a < steps; a++) {
    for (let b = 0; b < steps; b++) {
      const i = -lim + (a + 0.5) * d;
      const q = -lim + (b + 0.5) * d;
      const l = bitLlrs(points, i, q, n0)[bit];
      cells.push({ i, q, d, color: l >= 0 ? 'blue' : 'orange', opacity: 0.08 + 0.62 * Math.min(1, Math.abs(l) / 12) });
    }
  }
  $('s2-llr-map').innerHTML = constellationSvg(points, { label: t('LLR map of the chosen bit'), cells });
  // A sample point halfway between two neighbours whose chosen bit differs, and one on a symbol.
  const p0 = points.find((p) => p.bits[bit] === '0');
  const p1 = points
    .filter((p) => p.bits[bit] === '1')
    .reduce((best, p) => (Math.hypot(p.i - p0.i, p.q - p0.q) < Math.hypot(best.i - p0.i, best.q - p0.q) ? p : best));
  const mid = { i: (p0.i + p1.i) / 2, q: (p0.q + p1.q) / 2 };
  const near = { i: 0.75 * p0.i + 0.25 * p1.i, q: 0.75 * p0.q + 0.25 * p1.q };
  const llr = (p, maxLog) => {
    const v = bitLlrs(points, p.i, p.q, n0, maxLog)[bit];
    return fmt(Math.abs(v) < 5e-3 ? 0 : v, 2);
  };
  $('s2-llr-readout').innerHTML = table(
    [t('Received point'), t('LLR'), t('Max-log')],
    [
      [t('On {bits}', { bits: p0.bits }), llr(p0, false), llr(p0, true)],
      [t('A quarter of the way to {bits}', { bits: p1.bits }), llr(near, false), llr(near, true)],
      [t('Halfway to {bits}', { bits: p1.bits }), llr(mid, false), llr(mid, true)],
    ],
  );
}

function drawTanner() {
  const code = gallagerLdpc(12, 2, 4, 3);
  const width = 640;
  const L = 130;
  const bx = (v) => L + (v * (width - L - 20)) / 11;
  const cx = (c) => L + ((c + 0.5) * (width - L - 20)) / code.checks.length - 10;
  let svg = `<svg class="compact wide" viewBox="0 0 ${width} 190" role="img" aria-label="${esc(t('Tanner graph of a small LDPC code'))}">`;
  code.checks.forEach((row, c) => row.forEach((v) => (svg += `<line x1="${bx(v)}" y1="44" x2="${cx(c)}" y2="140" stroke="var(--muted)" opacity=".7"/>`)));
  for (let v = 0; v < 12; v++) svg += `<circle cx="${bx(v)}" cy="40" r="11" fill="var(--blue)"/><text x="${bx(v)}" y="18" text-anchor="middle">${v + 1}</text>`;
  code.checks.forEach((_, c) => {
    svg += `<rect x="${cx(c) - 11}" y="134" width="22" height="22" rx="3" fill="var(--orange)"/><text x="${cx(c)}" y="176" text-anchor="middle">c${c + 1}</text>`;
  });
  $('s2-tanner').innerHTML =
    svg +
    `<text x="10" y="45" class="bar-label">${esc(t('Bit nodes'))}</text><text x="10" y="150" class="bar-label">${esc(t('Check nodes'))}</text></svg>`;
}

const LDPC_CODE = gallagerLdpc(480, 3, 6, 7);
const LDPC_FRAMES = 40;

function drawLdpc() {
  const ebn0 = 10 ** (Number($('s2-ldpc-ebn0').value) / 10);
  const sigma2 = 1 / (2 * 0.5 * ebn0); // BPSK, rate 1/2, unit amplitude
  const rand = random(31);
  const runs = [];
  let channelErrors = 0;
  for (let f = 0; f < LDPC_FRAMES; f++) {
    // The all-zero codeword (+1 in BPSK): any codeword of a linear code decodes the same way.
    const llr = Array.from({ length: LDPC_CODE.n }, () => (2 * (1 + Math.sqrt(sigma2) * gaussian(rand))) / sigma2);
    const run = minSumDecode(LDPC_CODE, llr, 30);
    channelErrors += run.history[0].errors;
    runs.push(run.history);
  }
  const bits = LDPC_FRAMES * LDPC_CODE.n;
  const residual = runs.reduce((a, h) => a + h[h.length - 1].errors, 0);
  const corrected = runs.filter((h) => h[h.length - 1].unsatisfied === 0 && h[h.length - 1].errors === 0).length;
  const iterations = runs.reduce((a, h) => a + h.length - 1, 0) / LDPC_FRAMES;
  const top = Math.max(10, ...runs.map((h) => h[0].errors));
  $('s2-ldpc').innerHTML = plot({
    label: t('Bit errors of each codeword after each decoder iteration'),
    x: [0, 30],
    y: [0, top * 1.05],
    xTicks: ticks(0, 30, 5),
    yTicks: ticks(0, top, Math.max(5, Math.ceil(top / 50) * 10)),
    xLabel: t('Iteration'),
    yLabel: t('Bit errors in the codeword'),
    xFormat: (v) => fmt(v, 0),
    yFormat: (v) => fmt(v, 0),
    series: runs.map((h) => ({
      points: h.map((x, k) => [k, x.errors]),
      color: h[h.length - 1].errors === 0 ? 'blue' : 'orange',
      width: 1.4,
      opacity: 0.55,
    })),
  }) +
    `<p class="legend"><span style="color: var(--blue)">— ${esc(t('Corrected'))}</span><span style="color: var(--orange)">— ${esc(t('Errors remain after 30 iterations'))}</span></p>`;
  $('s2-ldpc-readout').innerHTML = table(
    [t('Quantity'), t('Value')],
    [
      [t('Bit error rate before decoding'), (channelErrors / bits).toExponential(2)],
      [t('Bit error rate after decoding'), residual === 0 ? '0' : (residual / bits).toExponential(2)],
      [t('Codewords fully corrected'), `${corrected} / ${LDPC_FRAMES}`],
      [t('Average iterations'), fmt(iterations, 1)],
    ],
  );
}

function drawStream(s) {
  if (!s.info) {
    $('s2-stream').innerHTML = '';
    return;
  }
  const dfl = s.info.kbch - BBHEADER_BITS;
  const width = 640;
  const L = 150;
  const R = width - 10;
  const x = (bits) => L + (bits / dfl) * (R - L);
  let svg = `<svg class="compact wide" viewBox="0 0 ${width} 182" role="img" aria-label="${esc(t('Packet boundaries in consecutive DATA FIELDs'))}">`;
  for (let j = 0; j < 3; j++) {
    const y = 12 + j * 52;
    const first = syncd(j, dfl);
    svg +=
      `<text x="10" y="${y + 17}" class="bar-label">${esc(t('BBFRAME {n}', { n: j + 1 }))}</text>` +
      `<text x="10" y="${y + 35}">SYNCD = ${fmt(first, 0)}</text>` +
      `<rect x="${L}" y="${y}" width="${R - L}" height="36" rx="3" fill="var(--blue)" opacity=".35"/>`;
    if (first > 0) svg += `<rect x="${L}" y="${y}" width="${x(first) - L}" height="36" rx="3" fill="var(--orange)" opacity=".8"/>`;
    for (let b = first; b < dfl; b += TS_PACKET_BITS) svg += `<line x1="${x(b)}" x2="${x(b)}" y1="${y - 3}" y2="${y + 39}" stroke="var(--ink)" stroke-width="2"/>`;
  }
  $('s2-stream').innerHTML =
    svg +
    `<text x="${R}" y="176" text-anchor="end">${esc(t('DATA FIELD = {dfl} bits; packet = 1504 bits; | = CRC-8 at a packet start', { dfl: fmt(dfl, 0) }))}</text></svg>`;
}

function fillFromBudget() {
  const s = settings();
  const cn0 = currentCn0();
  const note = $('s2-from-budget-note');
  if (cn0 === null) {
    note.textContent = t('Calculate a link budget first (Link Budget tab).');
    return;
  }
  if (!(Number.isFinite(s.rs) && s.rs > 0)) {
    note.textContent = t('Enter a symbol rate');
    return;
  }
  const esn0 = cn0 - 10 * Math.log10(s.rs);
  $('s2-link-esn0').value = esn0.toFixed(2);
  note.textContent = t('Es/N₀ = C/N₀ {cn0} dB-Hz − 10 log₁₀ Rs ({rs} Msym/s) = {esn0} dB', {
    cn0: fmt(cn0, 2),
    rs: fmt(s.rs / 1e6, 4),
    esn0: fmt(esn0, 2),
  });
  $('s2-link-esn0').dispatchEvent(new Event('input', { bubbles: true }));
}

// ---------------------------------------------------------------- wiring

// The figures that each section's own controls change; the settings at the top change them all.
const LOCAL = {
  's2-prbs-in': [drawPrbs],
  's2-timing': [drawEye],
  's2-sof-esn0': [drawSof],
  's2-sof-df': [drawSof],
  's2-esn0': [drawCarrier],
  's2-phase': [drawCarrier],
  's2-correct': [drawCarrier],
  's2-llr-bit': [drawLlr],
  's2-llr-esn0': [drawLlr],
  's2-ldpc-ebn0': [drawLdpc],
  's2-link-esn0': [drawModcods],
  's2-margin': [drawModcods],
};

function update(id) {
  const s = settings();
  if (LOCAL[id]) {
    for (const draw of LOCAL[id]) draw(s);
  } else {
    // 9/10 has no short frame (table 5b).
    for (const option of $('s2-modcod').options) option.disabled = s.frame === 'short' && option.value.endsWith('9/10');
    for (const draw of [drawSummary, drawTx, drawPrbs, drawSpectrum, drawPulses, drawEye, drawSof, drawCarrier, drawLlr, drawLdpc, drawStream, drawModcods]) draw(s);
  }
  showOutputs($('dvbs2'));
}

export function initDvbs2() {
  $('s2-modcod').innerHTML = MODCODS.map((m) => `<option value="${m.name}">${m.name}</option>`).join('');
  $('s2-modcod').value = '8PSK 3/4';
  const ids = [
    's2-modcod', 's2-frame', 's2-rolloff', 's2-rs', 's2-pilots', 's2-prbs-in', 's2-timing', 's2-sof-esn0', 's2-sof-df',
    's2-esn0', 's2-phase', 's2-correct', 's2-llr-bit', 's2-llr-esn0', 's2-ldpc-ebn0', 's2-link-esn0', 's2-margin',
  ];
  // Up to five bit options, so a saved choice survives until drawLlr labels them for the MODCOD.
  $('s2-llr-bit').innerHTML = [0, 1, 2, 3, 4].map((k) => `<option value="${k}"></option>`).join('');
  const saved = read(STORAGE_KEY, {});
  for (const id of ids) {
    if (saved[id] === undefined) continue;
    if ($(id).type === 'checkbox') $(id).checked = !!saved[id];
    else $(id).value = saved[id];
  }
  const persist = () => write(STORAGE_KEY, Object.fromEntries(ids.map((id) => [id, $(id).type === 'checkbox' ? $(id).checked : $(id).value])));
  drawDiagram();
  drawTanner();
  $('s2-from-budget').addEventListener('click', fillFromBudget);
  for (const type of ['input', 'change']) {
    $('dvbs2').addEventListener(type, (event) => {
      update(event.target.id);
      persist();
    });
  }
  update();
}
