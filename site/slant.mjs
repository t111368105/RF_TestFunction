// Slant range calculator under the Distance field: from the satellite altitude and the elevation it
// fills the distance, and sets the shared conditions to an Earth–space path at that elevation so
// every estimate uses the same geometry.

import { number } from './calculations.mjs';
import { slantRange } from './satellite.mjs';
import { setSlantElevation, stationAltitude } from './estimator.mjs';
import { $, fmt, read, write, field } from './ui.mjs';
import { t } from './i18n.mjs';

const STORAGE_KEY = 'rf.slant';
const IDS = ['orbit-altitude', 'slant-elevation'];

// The last range filled into the distance: { km, altitude, elevation, stationKm }.
let record = null;

function persist() {
  write(STORAGE_KEY, { fields: Object.fromEntries(IDS.map((id) => [id, $(id).value])), record });
}

/** The orbit behind the link distance (km), while the distance still holds the calculated range. */
export function currentOrbit(distanceKm) {
  if (!record || !(Math.abs(distanceKm - record.km) <= 1e-6 * record.km)) return null;
  return { altitude: record.altitude, elevation: record.elevation, stationKm: record.stationKm };
}

/** fill(id, value) puts a value into a form field. */
export function initSlant({ fill }) {
  $('slant-calc-fields').insertAdjacentHTML(
    'beforeend',
    field('orbit-altitude', t('Satellite altitude'), '', 'km', `placeholder="${t('e.g. {value}', { value: 500 })}"`) +
      field('slant-elevation', t('Elevation angle'), '90', '°', ''),
  );
  const saved = read(STORAGE_KEY, {});
  for (const id of IDS) {
    const v = saved.fields?.[id];
    if (typeof v === 'string' && v.trim() !== '') $(id).value = v;
    $(id).addEventListener('input', persist);
  }
  record = saved.record ?? null;

  // A new elevation under the shared conditions moves the satellite along the same orbit.
  $('atmo-elevation').addEventListener('input', () => {
    const elevation = number($('atmo-elevation').value);
    if (!currentOrbit(number($('v1').value) * number($('distance-unit').value))) return;
    const km = slantRange(record.altitude, elevation, record.stationKm);
    if (km === null) return;
    record = { ...record, km, elevation };
    $('slant-elevation').value = String(elevation);
    persist();
    fill('v1', String(Number((km / number($('distance-unit').value)).toPrecision(7))));
  });

  $('slant-calc-run').onclick = () => {
    const out = $('slant-calc-result');
    const altitude = number($('orbit-altitude').value);
    const elevation = number($('slant-elevation').value);
    const stationKm = stationAltitude();
    const km = slantRange(altitude, elevation, stationKm);
    if (km === null) {
      out.innerHTML = `<p class="error">${t('Enter a satellite altitude above the station and an elevation between 0° and 90°.')}</p>`;
      return;
    }
    // The elevation goes to the shared conditions first, so the estimates refreshed by the new
    // distance already use it.
    setSlantElevation(elevation);
    record = { km, altitude, elevation, stationKm };
    persist();
    fill('v1', String(Number((km / number($('distance-unit').value)).toPrecision(7))));
    const at10 = slantRange(altitude, 10, stationKm);
    out.innerHTML =
      `<p>${t('Slant range {range} km at elevation {elevation}°, filled in above; the shared conditions now use an Earth–space path at this elevation.', {
        range: fmt(km, 6),
        elevation: fmt(elevation),
      })}</p>` +
      (elevation === 10 || elevation === 90
        ? ''
        : `<p class="hint">${t('For comparison: {overhead} km overhead, {low} km at 10° elevation.', {
            overhead: fmt(altitude - stationKm, 6),
            low: fmt(at10, 6),
          })}</p>`);
  };
}
