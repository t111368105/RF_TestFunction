// Calculators for the polarization mismatch and pointing path-loss items (see alignment.mjs).

import { number } from './calculations.mjs';
import { POLARIZATIONS, polarizationLoss, pointingLoss, dishBeamwidth } from './alignment.mjs';
import { $, fmt, read, write, field } from './ui.mjs';
import { t } from './i18n.mjs';

const STORAGE_KEY = 'rf.lossCalculators';
// The loss field each calculator fills.
export const LOSS_FIELDS = { polarization: 'loss-polarization', pointing: 'loss-pointing' };
const MODES = { angle: t('Known'), average: t('Unknown: average'), worst: t('Unknown: worst case') };
const SIDES = [
  ['tx', 'TX'],
  ['rx', 'RX'],
];

// Last filled calculation per field: { value, inputs }. Descriptions are built from the inputs when
// shown, so they follow the current language.
let records = { polarization: null, pointing: null };
let ids = [];

const ROUGH = t('An error beyond half the beamwidth leaves the main-beam approximation; check the antenna pattern.');

function select(id, label, options, selected) {
  const html = Object.entries(options)
    .map(([value, text]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${text}</option>`)
    .join('');
  return `<label for="${id}">${label}<select id="${id}">${html}</select></label>`;
}

const show = (id, visible) => ($(id).closest('label').hidden = !visible);

function updateVisibility() {
  for (const [side] of SIDES) show(`pol-${side}-ar`, $(`pol-${side}-type`).value !== 'linear');
  show('pol-angle', $('pol-mode').value === 'angle');
}

function persist() {
  write(STORAGE_KEY, { fields: Object.fromEntries(ids.map((id) => [id, $(id).value])), records });
}

function antenna(side) {
  return { type: $(`pol-${side}-type`).value, axialRatio: number($(`pol-${side}-ar`).value) };
}

function describeAntenna(a) {
  if (a.type === 'linear') return t('linear');
  return t('{sense} (axial ratio {ratio} dB)', { sense: a.type === 'lhcp' ? 'LHCP' : 'RHCP', ratio: fmt(a.axialRatio) });
}

function describePolarization({ tx, rx, mode, angle }) {
  const how =
    mode === 'angle'
      ? t('angle {angle}°', { angle: fmt(angle) })
      : mode === 'average'
        ? t('unknown angle, averaged')
        : t('unknown angle, worst case');
  return t('TX {tx}, RX {rx}, {how}', { tx: describeAntenna(tx), rx: describeAntenna(rx), how });
}

function describePointing({ sides }) {
  return sides
    .map(({ name, error, beamwidth, diameter, loss }) => {
      const source =
        diameter === undefined
          ? t('beamwidth {beamwidth}°', { beamwidth: fmt(beamwidth, 3) })
          : t('beamwidth {beamwidth}° from a {diameter} m dish', { beamwidth: fmt(beamwidth, 3), diameter: fmt(diameter, 3) });
      return t('{name} error {error}°, {source}: {loss} dB', { name, error: fmt(error, 3), source, loss: fmt(loss, 3) });
    })
    .join('; ');
}

/** Description of a filled calculation, e.g. for the report. */
export function describeLossCalc(kind, record) {
  // Records from before inputs were stored kept only a description.
  if (!record.inputs) return record.description ?? record.value;
  const text = kind === 'polarization' ? describePolarization(record.inputs) : describePointing(record.inputs);
  return `${text} → ${record.value} dB`;
}

function calculatePolarization() {
  const inputs = { tx: antenna('tx'), rx: antenna('rx'), mode: $('pol-mode').value, angle: number($('pol-angle').value) };
  const loss = polarizationLoss(inputs.tx, inputs.rx, inputs.mode, inputs.angle);
  if (loss === null) return { error: t('Enter non-negative axial ratios and, for a known angle, the angle in degrees.') };
  if (loss === Infinity) {
    return {
      error: t(
        'These polarizations are orthogonal, so in theory no power couples at all. Use a measured value, or choose the average for a rotating linear antenna.',
      ),
    };
  }
  return { loss, inputs };
}

function calculatePointing(fMHz) {
  const sides = [];
  let total = 0;
  let rough = false;
  for (const [side, name] of SIDES) {
    const errorText = $(`point-${side}-error`).value.trim();
    if (errorText === '') continue; // This antenna has no pointing error to account for.
    const error = number(errorText);
    let beamwidth = number($(`point-${side}-bw`).value);
    let diameter;
    if ($(`point-${side}-bw`).value.trim() === '') {
      diameter = number($(`point-${side}-dish`).value);
      beamwidth = dishBeamwidth(fMHz, diameter);
      if (beamwidth === null) {
        return {
          error: t('Enter the {name} beamwidth, or a dish diameter together with a valid frequency in the Path section.', {
            name,
          }),
        };
      }
    }
    const loss = pointingLoss(error, beamwidth);
    if (loss === null) return { error: t('Enter a non-negative {name} pointing error and a positive beamwidth.', { name }) };
    total += loss;
    rough ||= error > 0.5 * beamwidth;
    sides.push({ name, error, beamwidth, diameter, loss });
  }
  if (!sides.length) {
    // Say which beamwidths were read, so it is clear that only the errors are missing.
    const known = SIDES.flatMap(([side, name]) => {
      const typed = number($(`point-${side}-bw`).value);
      const beamwidth = typed > 0 ? typed : dishBeamwidth(fMHz, number($(`point-${side}-dish`).value));
      return beamwidth ? [`${name} ${fmt(beamwidth, 3)}°`] : [];
    });
    return {
      error:
        t(
          'Enter the pointing error (how far each antenna is off target, e.g. its tracking or attitude accuracy) for the TX or RX antenna, or both; the beamwidth alone does not give a loss.',
        ) +
        (known.length ? ' ' + t('Beamwidths read: {list}.', { list: known.join(', ') }) : '') +
        ' ' +
        t('With no pointing error the loss is 0 dB.'),
    };
  }
  return {
    loss: total,
    inputs: { sides },
    note: rough ? ROUGH : '',
  };
}

function run(kind, result, fill) {
  const out = $(`${kind}-calc-result`);
  if (result.error) {
    out.innerHTML = `<p class="error">${result.error}</p>`;
    return;
  }
  const value = String(Number(result.loss.toFixed(3)));
  records[kind] = { value, inputs: result.inputs };
  persist();
  fill(LOSS_FIELDS[kind], value);
  out.innerHTML =
    `<p>${t('{description}, filled in above.', { description: describeLossCalc(kind, records[kind]) })}</p>` +
    (result.note ? `<p class="hint">${result.note}</p>` : '');
}

/**
 * Recalculates a loss still in its field from the calculator's fields and the frequency fMHz, after
 * either changes. A hand-edited value, or fields that are invalid for now, leave it alone.
 */
function follow(kind, fMHz, fill) {
  const r = records[kind];
  if (!r || $(LOSS_FIELDS[kind]).value.trim() !== r.value) return;
  const result = kind === 'polarization' ? calculatePolarization() : calculatePointing(fMHz);
  if (!result.error) run(kind, result, fill);
}

/** Recalculates the pointing loss for a new frequency, which sets a dish's beamwidth. */
export function refreshLossCalcs(fMHz, fill) {
  follow('pointing', fMHz, fill);
}

/** The ids of the calculator fields. */
export const calculatorIds = () => [...ids];

/** After the fields were set from outside (Clear, Undo): shows them consistently and saves them. */
export function syncCalculators() {
  updateVisibility();
  persist();
}

/** The calculator records whose values are still in their loss fields, by kind, for a snapshot. */
export function currentLossCalcs() {
  return Object.fromEntries(
    Object.entries(records).map(([kind, r]) => [kind, r && $(LOSS_FIELDS[kind]).value.trim() === r.value ? r : null]),
  );
}

/** Restores the calculator records that a loaded plan was calculated with. */
export function restoreLossCalcs(calcs) {
  records = { polarization: calcs?.polarization ?? null, pointing: calcs?.pointing ?? null };
  persist();
}

/** link() returns { fMHz } from the form; fill(id, value) puts a value into a loss field. */
export function initLossCalculators({ link, fill }) {
  $('pol-calc-fields').insertAdjacentHTML(
    'beforeend',
    SIDES.map(
      ([side, name]) =>
        select(`pol-${side}-type`, t('{name} antenna polarization', { name }), POLARIZATIONS, 'rhcp') +
        field(`pol-${side}-ar`, t('{name} axial ratio', { name }), '0', 'dB', `placeholder="${t('e.g. {value}', { value: 1 })}"`),
    ).join('') +
      select('pol-mode', t('Angle between polarizations'), MODES, 'angle') +
      field('pol-angle', t('Angle ψ'), '0', '°', '', true),
  );
  $('point-calc-fields').insertAdjacentHTML(
    'beforeend',
    SIDES.map(
      ([side, name]) =>
        `<h5 class="span">${t('{name} antenna', { name })}</h5>` +
        field(`point-${side}-error`, t('Pointing error'), '', '°', `placeholder="${t('blank if none')}"`) +
        field(`point-${side}-bw`, t('3 dB beamwidth'), '', '°', `placeholder="${t('e.g. {value}', { value: 3 })}"`) +
        field(`point-${side}-dish`, t('or dish diameter'), '', 'm', `placeholder="${t('if beamwidth is blank')}"`),
    ).join(''),
  );
  ids = [...document.querySelectorAll('#pol-calc-fields [id], #point-calc-fields [id]')]
    .filter((el) => el.matches('input, select'))
    .map((el) => el.id);

  const saved = read(STORAGE_KEY, {});
  for (const [id, v] of Object.entries(saved.fields ?? {})) {
    if (ids.includes(id) && typeof v === 'string' && v.trim() !== '') $(id).value = v;
  }
  records = { polarization: saved.records?.polarization ?? null, pointing: saved.records?.pointing ?? null };
  updateVisibility();

  for (const id of ids) {
    const kind = id.startsWith('pol-') ? 'polarization' : 'pointing';
    $(id).addEventListener('input', () => {
      updateVisibility();
      persist();
      follow(kind, link().fMHz, fill);
    });
    $(id).addEventListener('change', () => {
      updateVisibility();
      persist();
    });
  }
  $('polarization-calc-run').onclick = () => run('polarization', calculatePolarization(), fill);
  $('pointing-calc-run').onclick = () => run('pointing', calculatePointing(link().fMHz), fill);
}
