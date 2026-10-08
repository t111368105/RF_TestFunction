// Learn page: interactive demonstrations of communication basics. The text and formulas are static
// in index.html; this module wires the controls and draws the charts.

import {
  amplitudeSpectrum,
  aliasFrequency,
  carsonBandwidth,
  SCHEMES,
  constellation,
  bitsToSymbols,
  minimumDistance,
  simulate,
  theoreticalBer,
  random,
  gaussian,
} from './signals.mjs';
import { $, fmt, esc, table, read, write } from './ui.mjs';
import { t } from './i18n.mjs';

const C = 299792458;
const STORAGE_KEY = 'rf.learn';

// ---------------------------------------------------------------- drawing

const PAD = { left: 52, right: 14, top: 14, bottom: 38 };

/**
 * An SVG plot. series: [{ points, color, width, dash, opacity }] lines; stems: [{ points, color }]
 * vertical bars from y = 0; dots: [{ points, color, r }]. x and y are [min, max].
 */
function plot({ label, width = 640, height = 250, x, y, xTicks, yTicks, xLabel, yLabel, series = [], stems = [], dots = [], xFormat = (v) => fmt(v, 3), yFormat = (v) => fmt(v, 2) }) {
  const L = PAD.left;
  const R = width - PAD.right;
  const T = PAD.top;
  const B = height - PAD.bottom;
  const px = (v) => L + ((v - x[0]) / (x[1] - x[0])) * (R - L);
  const py = (v) => B - ((v - y[0]) / (y[1] - y[0])) * (B - T);
  const clip = `learn-clip-${++plots}`;
  let svg =
    `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">` +
    `<clipPath id="${clip}"><rect x="${L}" y="${T}" width="${R - L}" height="${B - T}"/></clipPath>`;
  for (const v of yTicks) {
    svg += `<line class="grid" x1="${L}" x2="${R}" y1="${py(v)}" y2="${py(v)}"/><text x="${L - 6}" y="${py(v) + 4}" text-anchor="end">${yFormat(v)}</text>`;
  }
  for (const v of xTicks) {
    svg += `<line class="grid" x1="${px(v)}" x2="${px(v)}" y1="${T}" y2="${B}"/><text x="${px(v)}" y="${B + 16}" text-anchor="middle">${xFormat(v)}</text>`;
  }
  if (y[0] < 0 && y[1] > 0) svg += `<line class="axis" x1="${L}" x2="${R}" y1="${py(0)}" y2="${py(0)}"/>`;
  svg += `<g clip-path="url(#${clip})">`;
  for (const s of stems) {
    for (const [a, b] of s.points) {
      svg += `<line x1="${px(a)}" x2="${px(a)}" y1="${py(0)}" y2="${py(b)}" stroke="var(--${s.color})" stroke-width="3"/>`;
    }
  }
  for (const s of series) {
    svg +=
      `<polyline points="${s.points.map(([a, b]) => `${px(a).toFixed(1)},${py(b).toFixed(1)}`).join(' ')}" fill="none" ` +
      `stroke="var(--${s.color})" stroke-width="${s.width ?? 2}" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''} opacity="${s.opacity ?? 1}"/>`;
  }
  for (const d of dots) {
    for (const [a, b] of d.points) svg += `<circle cx="${px(a)}" cy="${py(b)}" r="${d.r ?? 4}" fill="var(--${d.color})"/>`;
  }
  svg +=
    '</g>' +
    `<text x="${(L + R) / 2}" y="${height - 4}" text-anchor="middle">${esc(xLabel)}</text>` +
    `<text x="${L}" y="${T - 2}" class="axis-label">${esc(yLabel)}</text></svg>`;
  return svg;
}
let plots = 0;

/** Evenly spaced ticks from a to b in steps of step. */
const ticks = (a, b, step) => Array.from({ length: Math.floor((b - a) / step + 1e-9) + 1 }, (_, i) => a + i * step);

const value = (id) => Number($(id).value);

/** Shows each range input's value in its <output>, with the unit in data-unit. */
function showOutputs(root) {
  for (const input of root.querySelectorAll('input[type=range]')) {
    const out = $(input.id + '-out');
    if (out) out.textContent = `${fmt(Number(input.value), 3)}${input.dataset.unit ? ' ' + input.dataset.unit : ''}`;
  }
}

// ---------------------------------------------------------------- 1. frequency and waveform

const RF_EXAMPLES = [
  [1e6, 'AM broadcast'],
  [100e6, 'FM broadcast'],
  [1575.42e6, 'GPS L1'],
  [2.4e9, 'Wi-Fi'],
  [5.8e9, 'Wi-Fi'],
  [28e9, '5G mmWave'],
  [60e9, 'WiGig'],
];

function frequencyLabel(f) {
  if (f >= 1e9) return `${fmt(f / 1e9, 4)} GHz`;
  if (f >= 1e6) return `${fmt(f / 1e6, 4)} MHz`;
  return `${fmt(f / 1e3, 4)} kHz`;
}

function lengthLabel(m) {
  if (m >= 1) return `${fmt(m, 3)} m`;
  if (m >= 0.01) return `${fmt(m * 100, 3)} cm`;
  return `${fmt(m * 1000, 3)} mm`;
}

function drawWave() {
  const f = value('wave-f');
  const a = value('wave-a');
  const phase = (value('wave-phase') * Math.PI) / 180;
  const n = 1200;
  const points = Array.from({ length: n + 1 }, (_, i) => {
    const time = i / n;
    return [time, a * Math.sin(2 * Math.PI * f * time + phase)];
  });
  const series = [{ points, color: 'blue', width: 2.5 }];
  if ($('wave-ref').checked) {
    series.unshift({ points: points.map(([time]) => [time, Math.sin(2 * Math.PI * time)]), color: 'muted', width: 1.5, dash: '6 5' });
  }
  $('wave-chart').innerHTML = plot({
    label: t('A sine wave over one second'),
    x: [0, 1],
    y: [-1.15, 1.15],
    xTicks: ticks(0, 1, 0.2),
    yTicks: [-1, -0.5, 0, 0.5, 1],
    xLabel: t('Time (s)'),
    yLabel: t('Amplitude'),
    series,
  });
  const rf = Number($('wave-rf').value);
  const lambda = C / rf;
  $('wave-readout').innerHTML = table(
    [t('Quantity'), t('Value')],
    [
      [t('Period T = 1/f'), `${fmt(1 / f, 4)} s`],
      [t('Cycles in one second'), fmt(f, 3)],
      [t('Wavelength of {frequency}', { frequency: frequencyLabel(rf) }), lengthLabel(lambda)],
      [t('Half-wave dipole length (λ/2)'), lengthLabel(lambda / 2)],
    ],
  );
}

// ---------------------------------------------------------------- 2. time and frequency domains

const FOURIER_N = 1024; // Samples over one second: spectrum bins 1 Hz apart.

function fourierSignal() {
  const square = $('fourier-mode').value === 'square';
  const noise = value('fourier-noise');
  const rand = random(7);
  const components = square
    ? Array.from({ length: value('sq-n') }, (_, k) => [(2 * k + 1) * value('sq-f0'), 4 / (Math.PI * (2 * k + 1))])
    : [1, 2, 3].map((k) => [value(`fourier-f${k}`), value(`fourier-a${k}`)]);
  const samples = Array.from({ length: FOURIER_N }, (_, i) => {
    const time = i / FOURIER_N;
    let s = 0;
    for (const [f, a] of components) s += a * Math.sin(2 * Math.PI * f * time);
    return s + noise * gaussian(rand);
  });
  return { samples, components };
}

function drawFourier() {
  const square = $('fourier-mode').value === 'square';
  $('fourier-sum').hidden = square;
  $('fourier-square').hidden = !square;
  const { samples } = fourierSignal();
  const top = Math.max(1.2, ...samples.map(Math.abs)) * 1.05;
  $('fourier-time').innerHTML = plot({
    label: t('The signal in the time domain'),
    x: [0, 1],
    y: [-top, top],
    xTicks: ticks(0, 1, 0.2),
    yTicks: [-1, 0, 1],
    xLabel: t('Time (s)'),
    yLabel: t('Amplitude'),
    series: [{ points: samples.map((s, i) => [i / FOURIER_N, s]), color: 'blue', width: 1.8 }],
  });
  const spectrum = amplitudeSpectrum(samples, 1, 60);
  $('fourier-freq').innerHTML = plot({
    label: t('The same signal in the frequency domain'),
    x: [0, 60],
    y: [0, Math.max(1.3, ...spectrum.map(([, a]) => a)) * 1.05],
    xTicks: ticks(0, 60, 10),
    yTicks: [0, 0.5, 1],
    xLabel: t('Frequency (Hz)'),
    yLabel: t('Amplitude'),
    stems: [{ points: spectrum, color: 'orange' }],
  });
  const peaks = spectrum.filter(([f, a]) => f > 0 && a > 0.08).map(([f]) => `${fmt(f, 0)} Hz`);
  $('fourier-readout').textContent = peaks.length
    ? t('Spectral lines at: {list}', { list: peaks.join(', ') })
    : t('No clear spectral line: only noise.');
}

// ---------------------------------------------------------------- 3. sampling and aliasing

function drawSampling() {
  const f = value('samp-f');
  const fs = value('samp-fs');
  const alias = aliasFrequency(f, fs);
  const n = 1000;
  const wave = Array.from({ length: n + 1 }, (_, i) => [i / n, Math.sin((2 * Math.PI * f * i) / n)]);
  const seen = Array.from({ length: n + 1 }, (_, i) => [i / n, Math.sin((2 * Math.PI * alias * i) / n)]);
  const samples = ticks(0, 1, 1 / fs).map((time) => [time, Math.sin(2 * Math.PI * f * time)]);
  const aliased = Math.abs(alias) < f - 1e-9;
  $('samp-chart').innerHTML = plot({
    label: t('A sine wave, its samples and the wave the samples describe'),
    x: [0, 1],
    y: [-1.2, 1.2],
    xTicks: ticks(0, 1, 0.2),
    yTicks: [-1, 0, 1],
    xLabel: t('Time (s)'),
    yLabel: t('Amplitude'),
    series: [
      { points: wave, color: 'blue', width: 1.5, opacity: 0.55 },
      ...(aliased ? [{ points: seen, color: 'orange', width: 2.5, dash: '7 5' }] : []),
    ],
    dots: [{ points: samples, color: aliased ? 'orange' : 'green', r: 4.5 }],
  });
  $('samp-readout').innerHTML =
    table(
      [t('Quantity'), t('Value')],
      [
        [t('Nyquist frequency fs/2'), `${fmt(fs / 2, 3)} Hz`],
        [t('Samples per cycle'), fmt(fs / f, 3)],
        [t('Frequency the samples show'), `${fmt(Math.abs(alias), 3)} Hz`],
      ],
    ) +
    `<p class="status ${aliased ? 'warn' : ''}">${
      aliased
        ? t('Aliasing: {f} Hz is above fs/2 = {nyquist} Hz, so the samples look like {alias} Hz.', {
            f: fmt(f, 3),
            nyquist: fmt(fs / 2, 3),
            alias: fmt(Math.abs(alias), 3),
          })
        : t('No aliasing: the sampling rate is more than twice the signal frequency.')
    }</p>`;
}

// ---------------------------------------------------------------- 4. analog modulation

const MOD_N = 2048; // Samples over one second.

function drawModulation() {
  const fm = $('mod-type').value === 'fm';
  $('mod-am-index').hidden = fm;
  $('mod-fm-index').hidden = !fm;
  const fc = value('mod-fc');
  const fmsg = value('mod-fm');
  const m = value('mod-m');
  const beta = value('mod-beta');
  const message = (time) => Math.cos(2 * Math.PI * fmsg * time);
  const signal = Array.from({ length: MOD_N }, (_, i) => {
    const time = i / MOD_N;
    return fm
      ? Math.cos(2 * Math.PI * fc * time + beta * Math.sin(2 * Math.PI * fmsg * time))
      : (1 + m * message(time)) * Math.cos(2 * Math.PI * fc * time);
  });
  const top = fm ? 1.3 : Math.max(1.3, 1 + m) * 1.08;
  // The first half second, where the cycles are wide enough to see; the spectrum uses the whole second.
  const shown = signal.slice(0, MOD_N / 2);
  const series = [{ points: shown.map((s, i) => [i / MOD_N, s]), color: 'blue', width: 1.4 }];
  if (fm) {
    series.push({ points: shown.map((_, i) => [i / MOD_N, 1.15 * message(i / MOD_N)]), color: 'orange', width: 2, dash: '7 5' });
  } else {
    const envelope = shown.map((_, i) => [i / MOD_N, 1 + m * message(i / MOD_N)]);
    series.push({ points: envelope, color: 'orange', width: 2, dash: '7 5' });
    series.push({ points: envelope.map(([a, b]) => [a, -b]), color: 'orange', width: 2, dash: '7 5' });
  }
  $('mod-time').innerHTML = plot({
    label: t('The modulated signal in the time domain'),
    x: [0, 0.5],
    y: [-top, top],
    xTicks: ticks(0, 0.5, 0.1),
    yTicks: [-1, 0, 1],
    xLabel: t('Time (s)'),
    yLabel: t('Amplitude'),
    series,
  });
  const spectrum = amplitudeSpectrum(signal, 1, 100);
  $('mod-freq').innerHTML = plot({
    label: t('The spectrum of the modulated signal'),
    x: [0, 100],
    y: [0, 1.1],
    xTicks: ticks(0, 100, 10),
    yTicks: [0, 0.5, 1],
    xLabel: t('Frequency (Hz)'),
    yLabel: t('Amplitude'),
    stems: [{ points: spectrum, color: 'orange' }],
  });
  const rows = fm
    ? [
        [t('Modulation index β'), fmt(beta, 3)],
        [t('Bandwidth (Carson’s rule)'), `${fmt(carsonBandwidth(beta, fmsg), 3)} Hz`],
      ]
    : [
        [t('Modulation index m'), fmt(m, 3)],
        [t('Bandwidth'), `${fmt(2 * fmsg, 3)} Hz`],
        [t('Power in the sidebands'), `${fmt((100 * m * m) / (2 + m * m), 3)} %`],
      ];
  $('mod-readout').innerHTML =
    table([t('Quantity'), t('Value')], rows) +
    (!fm && m > 1
      ? `<p class="status warn">${t('Overmodulation: m > 1 makes the envelope cross zero, so a simple envelope detector distorts the message.')}</p>`
      : '');
}

// ---------------------------------------------------------------- 5. constellations and bits

function randomBits(n) {
  const rand = random(Date.now() & 0xffff);
  return Array.from({ length: n }, () => (rand() < 0.5 ? '0' : '1')).join('');
}

function drawConstellation() {
  const scheme = $('const-scheme').value;
  const points = constellation(scheme);
  const k = Math.log2(points.length);
  const symbols = bitsToSymbols($('const-bits').value, scheme);
  const ebn0 = value('const-ebn0');
  const noisy = $('const-noise').checked;
  const sim = simulate(scheme, ebn0, 600, 3);
  const lim = scheme === 'bpsk' ? 1.8 : 1.6;
  const size = 420;
  const L = 40;
  const span = size - 2 * L;
  const px = (v) => L + ((v + lim) / (2 * lim)) * span;
  const py = (v) => L + ((lim - v) / (2 * lim)) * span;
  const used = new Map();
  symbols.forEach((s, n) => {
    if (!used.has(s.bits)) used.set(s.bits, []);
    used.get(s.bits).push(n + 1);
  });
  let svg =
    `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(t('Constellation diagram'))}">` +
    `<line class="axis" x1="${L}" x2="${size - L}" y1="${py(0)}" y2="${py(0)}"/>` +
    `<line class="axis" x1="${px(0)}" x2="${px(0)}" y1="${L}" y2="${size - L}"/>` +
    `<text x="${size - L}" y="${py(0) - 6}" text-anchor="end">I</text><text x="${px(0) + 6}" y="${L + 10}">Q</text>`;
  if (noisy) {
    for (const r of sim.received) {
      if (Math.abs(r.i) > lim || Math.abs(r.q) > lim) continue;
      svg += `<circle cx="${px(r.i)}" cy="${py(r.q)}" r="1.8" fill="var(--${r.error ? 'orange' : 'blue'})" opacity="${r.error ? 0.9 : 0.35}"/>`;
    }
  }
  // 64QAM has too many points to label them all: it labels the ones the entered bits use, and every
  // point shows its bits as a tooltip.
  const dense = points.length > 16;
  for (const p of points) {
    const hit = used.has(p.bits);
    svg +=
      `<circle cx="${px(p.i)}" cy="${py(p.q)}" r="${hit ? 7 : dense ? 4 : 5}" fill="var(--${hit ? 'green' : 'ink'})" ` +
      `${hit ? 'stroke="var(--surface)" stroke-width="2"' : ''}><title>${p.bits}</title></circle>` +
      (!dense || hit
        ? `<text class="point-label" x="${px(p.i)}" y="${py(p.q) - 10}" text-anchor="middle" font-size="${dense ? 11 : 12}">${p.bits}</text>`
        : '');
  }
  svg += '</svg>';
  $('const-chart').innerHTML = svg;

  // I and Q over time for the entered bits: one rectangular pulse per symbol.
  const shown = symbols.slice(0, 16);
  const step = (get) => shown.flatMap((s, n) => [[n, get(s.point)], [n + 1, get(s.point)]]);
  $('const-iq').innerHTML = shown.length
    ? plot({
        label: t('I and Q of each symbol over time'),
        height: 220,
        x: [0, Math.max(1, shown.length)],
        y: [-1.6, 1.6],
        xTicks: ticks(0, Math.max(1, shown.length), shown.length > 8 ? 2 : 1),
        yTicks: [-1, 0, 1],
        xLabel: t('Symbol'),
        yLabel: t('Level'),
        xFormat: (v) => fmt(v, 0),
        series: [
          { points: step((p) => p.i), color: 'blue', width: 2.5 },
          { points: step((p) => p.q), color: 'orange', width: 2.5, dash: '7 4' },
        ],
      })
    : '';
  $('const-symbols').innerHTML = shown.length
    ? table(
        [t('Symbol'), t('Bits'), 'I', 'Q'],
        shown.map((s, n) => [String(n + 1), s.bits + (s.padded ? ' *' : ''), fmt(s.point.i, 3), fmt(s.point.q, 3)]),
      ) +
      (symbols.length > shown.length ? `<p class="hint">${t('Showing the first {n} symbols.', { n: shown.length })}</p>` : '') +
      (symbols.some((s) => s.padded) ? `<p class="hint">${t('* The last group was padded with zeros.')}</p>` : '')
    : `<p class="hint">${t('Enter bits (0 and 1) to see the symbols.')}</p>`;
  const theory = theoreticalBer(scheme, ebn0);
  $('const-readout').innerHTML = table(
    [t('Quantity'), t('Value')],
    [
      [t('Bits per symbol k = log₂ M'), String(k)],
      [t('Symbols for the entered bits'), String(symbols.length)],
      [t('Minimum distance between points'), fmt(minimumDistance(points), 3)],
      [t('Bit error rate, simulated (600 symbols)'), sim.ber === 0 ? '0' : sim.ber.toExponential(2)],
      [t('Bit error rate, theory'), theory < 1e-12 ? '< 1e-12' : theory.toExponential(2)],
    ],
  );
}

// ---------------------------------------------------------------- wiring

const DEMOS = [
  ['learn-wave', drawWave],
  ['learn-fourier', drawFourier],
  ['learn-sampling', drawSampling],
  ['learn-modulation', drawModulation],
  ['learn-constellation', drawConstellation],
];

export function initLearn() {
  $('wave-rf').innerHTML = RF_EXAMPLES.map(([f, name]) => `<option value="${f}">${esc(t(name))} (${frequencyLabel(f)})</option>`).join('');
  $('const-scheme').innerHTML = Object.entries(SCHEMES)
    .map(([key, s]) => `<option value="${key}">${s.name}</option>`)
    .join('');
  const controls = [...document.querySelectorAll('#learn input, #learn select, #learn textarea')].filter((el) => el.id);
  const saved = read(STORAGE_KEY, {});
  for (const el of controls) {
    const v = saved[el.id];
    if (v === undefined) continue;
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v;
  }
  const persist = () => write(STORAGE_KEY, Object.fromEntries(controls.map((el) => [el.id, el.type === 'checkbox' ? el.checked : el.value])));
  for (const [id, draw] of DEMOS) {
    const root = $(id);
    const update = () => {
      showOutputs(root);
      draw();
      persist();
    };
    root.addEventListener('input', update);
    root.addEventListener('change', update);
    showOutputs(root);
    draw();
  }
  $('const-random').onclick = () => {
    const k = Math.log2(SCHEMES[$('const-scheme').value].M);
    $('const-bits').value = randomBits(8 * k);
    $('const-bits').dispatchEvent(new Event('input', { bubbles: true }));
  };
}
