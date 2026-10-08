// Estimators for the atmosphere, ionosphere and radome path-loss items, one under each field, using
// the models in atmosphere.mjs. Conditions that several of them need are shared in one block.

import { number } from './calculations.mjs';
import {
  estimateAtmosphere,
  interpolateLogP,
  cloudAttenuation,
  tropoScintillation,
  ionoScintillation,
  ionoAbsorption,
  radomeFilmThickness,
  waterFilmLoss,
  pathRise,
  insideAtmosphere,
  INSIDE_ATMOSPHERE,
} from './atmosphere.mjs';
import {
  knifeEdge,
  earthBulge,
  woodlandParameters,
  woodlandLoss,
  slantVegetationLoss,
  WOODLAND_RANGE,
  buildingEntryLoss,
  terrestrialClutterLoss,
  slantClutterLoss,
  multipathOccurrence,
  multipathFade,
  worstMonthPercent,
} from './terrain.mjs';
import { $, fmt, read, write, field, resetControls } from './ui.mjs';
import { LOSS_ITEMS } from './path-losses.mjs';
import { t } from './i18n.mjs';

// ITU-R reference values for Taipei (25.04° N, 121.53° E), the default site, read from the ITU-R
// digital maps with ITU-Rpy: rain rate from P.837-7, rain height from P.839-4, mean surface
// temperature from P.1510-1, median surface water vapour density from P.836-6, altitude from P.1511-2,
// wet refractivity from P.453-14 and reduced cloud liquid water from P.840-7; the geoclimatic factor
// and dN75 come from the P.530-19 maps (LogK.csv, dN75.csv), interpolated bilinearly. They are shown
// in orange while unchanged.
const TAIPEI = {
  'atmo-rain': '86.9',
  'atmo-temp': '20.9',
  'atmo-water': '17.2',
  'atmo-altitude-m': '14',
  'atmo-latitude': '25.04',
  'atmo-rain-height': '4.67',
  'atmo-nwet': '98.6',
  'mp-logk': '-5.24',
  'mp-dn75': '11.6',
};
// Taipei values that depend on the time percentage: [p %] → value.
const TAIPEI_CLOUD = {
  ps: [0.1, 0.2, 0.3, 0.5, 1, 2, 3, 5, 10, 20, 30, 50, 60, 70, 80, 90, 95, 99],
  values: [
    4.2036, 4.0356, 3.8961, 3.7567, 3.5084, 3.1286, 2.8488, 2.3837, 1.624, 0.8083, 0.4194, 0.1025, 0.0386, 0.0085,
    0.0001, 0, 0, 0,
  ], // kg/m², P.840-7 L_red
};
const TAIPEI_RAIN = {
  ps: [0.001, 0.002, 0.003, 0.005, 0.01, 0.02, 0.03, 0.05, 0.1, 0.2, 0.3, 0.5, 1, 2, 3, 5],
  values: [
    200.597, 158.214, 136.982, 113.541, 86.926, 65.488, 54.999, 43.671, 31.224, 21.613, 17.1, 12.412, 7.557, 4.121,
    2.647, 1.25,
  ], // mm/h, P.837-7 R_p
};
const PERCENT_DEPENDENT = {
  'atmo-cloud': (p) => String(Number(interpolateLogP(TAIPEI_CLOUD.ps, TAIPEI_CLOUD.values, p).toFixed(3))),
  'atmo-radome-rain': (p) => String(Number(interpolateLogP(TAIPEI_RAIN.ps, TAIPEI_RAIN.values, p).toFixed(1))),
};

// Fields: [id, label, default, unit, extra, path, signed]; path is true for Earth–space paths only and
// 'terrestrial' for terrestrial paths only.
const COMMON = [
  ['atmo-percent', 'Time percentage exceeded', '0.01', '%', ''],
  ['atmo-temp', 'Surface temperature', TAIPEI['atmo-temp'], '°C', '', false, true],
  ['atmo-pressure', 'Air pressure', '1013.25', 'hPa', ''],
  ['atmo-water', 'Water vapour density', TAIPEI['atmo-water'], 'g/m³', ''],
  // 90° (overhead) matches the shortest link distance; use the minimum operating elevation for worst case.
  ['atmo-elevation', 'Elevation angle', '90', '°', 'placeholder="90"', true],
  ['atmo-altitude-m', 'Station altitude', TAIPEI['atmo-altitude-m'], 'm', '', true, true],
  ['atmo-latitude', 'Station latitude', TAIPEI['atmo-latitude'], '°', '', true, true],
  ['terr-tx-alt', 'TX antenna altitude', '', 'm', `placeholder="${t('above sea level')}"`, 'terrestrial', true],
  ['terr-rx-alt', 'RX antenna altitude', '', 'm', `placeholder="${t('above sea level')}"`, 'terrestrial', true],
];
// Each loss item's own fields; items marked slantOnly apply to Earth-space paths only.
const ITEMS = {
  atmospheric: {
    fields: [
      ['atmo-rain', 'Rain rate R₀.₀₁', TAIPEI['atmo-rain'], 'mm/h', `placeholder="${t('0 for clear sky')}"`],
      ['atmo-rain-height', 'Rain height', TAIPEI['atmo-rain-height'], 'km', '', true],
    ],
  },
  cloud: { slantOnly: true, fields: [['atmo-cloud', 'Cloud liquid water L', '', 'kg/m²', '']] },
  'tropo-scintillation': {
    slantOnly: true,
    fields: [
      ['atmo-nwet', 'Wet refractivity N_wet', TAIPEI['atmo-nwet'], '', ''],
      ['atmo-dish', 'Antenna diameter', '', 'm', `placeholder="${t('blank: no aperture averaging')}"`],
      ['atmo-efficiency', 'Antenna efficiency', '0.5', '', ''],
    ],
  },
  'iono-scintillation': {
    slantOnly: true,
    fields: [
      ['atmo-s4', 'Scintillation index S4', '', '', `placeholder="${t('e.g. {value}', { value: 0.3 })}"`],
      ['atmo-s4-frequency', 'S4 measured at', '1.5', 'GHz', ''],
      ['atmo-event-percent', 'Time percentage of the scintillation event', '1', '%', ''],
    ],
  },
  'iono-absorption': { slantOnly: true, fields: [['atmo-absorption', 'Vertical absorption at 30 MHz', '0.5', 'dB', '']] },
  radome: {
    fields: [
      ['atmo-radome', 'Radome radius', '', 'm', `placeholder="${t('e.g. {value}', { value: 1.5 })}"`],
      ['atmo-radome-rain', 'Rain rate on the radome', '', 'mm/h', ''],
    ],
  },
  vegetation: {
    fields: [
      ['veg-depth', 'Vegetation depth', '', 'm', `placeholder="${t('blank: no vegetation')}"`],
      ['veg-gamma', 'Specific attenuation γ', '', 'dB/m', `placeholder="${t('blank: P.833 Table 1')}"`, 'terrestrial'],
      ['veg-max', 'Maximum attenuation A_m', '', 'dB', `placeholder="${t('blank: P.833 Table 1')}"`, 'terrestrial'],
    ],
  },
  building: {
    selects: [['building-type', 'Building type', { traditional: 'Traditional', efficient: 'Thermally efficient' }]],
    fields: [['building-prob', 'Locations where the loss is not exceeded', '50', '%', '']],
  },
  clutter: {
    selects: [['clutter-ends', 'Ends in clutter', { one: 'One end', both: 'Both ends' }, 'terrestrial']],
    fields: [['clutter-prob', 'Locations where the loss is not exceeded', '50', '%', '']],
  },
  diffraction: {
    fields: [
      ['diff-obstacle', 'Obstacle top altitude', '', 'm', `placeholder="${t('blank: no obstacle')}"`, 'terrestrial', true],
      ['diff-distance', 'Obstacle distance from the TX', '', 'km', `placeholder="${t('e.g. {value}', { value: 3 })}"`, 'terrestrial'],
      ['diff-k', 'Effective Earth radius factor k', '1.333', '', '', 'terrestrial'],
      ['diff-height', 'Obstacle height above the antenna', '', 'm', `placeholder="${t('blank: no obstacle')}"`, true, true],
      ['diff-range', 'Obstacle distance from the antenna', '', 'm', `placeholder="${t('e.g. {value}', { value: 50 })}"`, true],
    ],
  },
  multipath: {
    fields: [
      ['mp-terrain', 'Mean terrain altitude', '', 'm', `placeholder="${t('e.g. {value}', { value: 20 })}"`, 'terrestrial', true],
      ['mp-logk', 'Geoclimatic factor log₁₀ K', TAIPEI['mp-logk'], '', '', 'terrestrial', true],
      ['mp-dn75', 'Refractivity gradient dN75', TAIPEI['mp-dn75'], '', '', 'terrestrial'],
    ],
  },
};
// Typical S4 at 1.5 GHz in Taiwan, under the northern crest of the equatorial anomaly: empirical
// ranges, not ITU-R reference values, so they are not marked as site values.
const S4_PRESETS = [
  ['', 'None: daytime, or not estimated (blank)'],
  ['0.1', 'Weak: night, low solar activity (0.1)'],
  ['0.3', 'Moderate: typical after sunset (0.3)'],
  ['0.8', 'Strong: after sunset, equinox, solar maximum (0.8)'],
];

const FIELDS = [...COMMON, ...Object.values(ITEMS).flatMap((item) => item.fields)];
// Stored separately from the earlier estimators, whose fields and defaults differed.
const STORAGE_KEY = 'rf.atmosphere.v3';
const ITEM_SELECTS = Object.values(ITEMS).flatMap((item) => item.selects ?? []);
const SELECTS = ['atmo-path', 'atmo-polarization', ...ITEM_SELECTS.map(([id]) => id)];
const ids = [...SELECTS, ...FIELDS.map(([id]) => id)];

// The last calculation filled into each loss field: { item key: { value, inputs, ...details } }.
let records = {};
let percentShown = 0.01; // The time percentage the percent-dependent Taipei values were filled for.

const POLARIZATION_NAMES = { circular: t('circular'), horizontal: t('horizontal'), vertical: t('vertical') };
const labelOf = (key) => LOSS_ITEMS.find((item) => item.key === key)?.label ?? key;

/**
 * An estimate as { items: { key: { value, inputs, ... } } }. Earlier versions kept one estimate for
 * all items ({ inputs, results }) or only the atmospheric and rain result ({ value, gas, rain, inputs }).
 */
function normalize(e) {
  if (!e) return null;
  if (e.items) return e;
  if (e.results) {
    return { items: Object.fromEntries(Object.entries(e.results).map(([key, r]) => [key, { ...r, inputs: e.inputs }])) };
  }
  return { items: { atmospheric: { value: e.value, total: e.total, gas: e.gas, rain: e.rain, inputs: e.inputs } } };
}

/** How one item's value was obtained. */
function describeItem(key, r) {
  const i = r.inputs;
  const f = fmt(i.fMHz / 1000, 6);
  if (DESCRIBE_TERRAIN[key]) return DESCRIBE_TERRAIN[key](i, r, f);
  if (key === 'atmospheric') {
    const where =
      i.path === 'slant'
        ? t('Earth–space, elevation {elevation}°, station altitude {altitude} m, latitude {latitude}°, rain height {height} km', {
            elevation: fmt(i.elevation),
            altitude: fmt(i.stationAltitude * 1000),
            latitude: fmt(i.latitude),
            height: fmt(i.rainHeight),
          })
        : t('terrestrial, {distance} km', { distance: fmt(i.distanceKm, 4) });
    return t(
      'ITU-R estimate {total} dB = gas {gas} dB (P.676-12) + rain {rain} dB ({model}, P.838-3); {frequency} GHz, {where}, R₀.₀₁ {rate} mm/h exceeded {percent} % of the time, {polarization} polarization, {temperature} °C, {pressure} hPa, {water} g/m³.',
      {
        total: fmt(r.total, 3),
        gas: fmt(r.gas, 3),
        rain: fmt(r.rain, 3),
        model: i.path === 'slant' ? 'P.618-13' : 'P.530-17',
        frequency: f,
        where,
        rate: fmt(i.rainRate),
        percent: fmt(i.percent, 4),
        polarization: POLARIZATION_NAMES[i.polarization] ?? i.polarization,
        temperature: fmt(i.tempC),
        pressure: fmt(i.pressure),
        water: fmt(i.waterVapour),
      },
    );
  }
  if (key === 'cloud') {
    return t('ITU-R P.840: L {L} kg/m² exceeded {percent} % of the time, {frequency} GHz, elevation {elevation}° → {value} dB.', {
      L: fmt(i.cloudWater, 4),
      percent: fmt(i.percent, 4),
      frequency: f,
      elevation: fmt(i.elevation),
      value: r.value,
    });
  }
  if (key === 'tropo-scintillation') {
    return t(
      'ITU-R P.618: N_wet {nwet}, {antenna}, exceeded {percent} % of the time, {frequency} GHz, elevation {elevation}° → {value} dB.',
      {
        nwet: fmt(i.nWet, 1),
        antenna: i.dish
          ? t('antenna {diameter} m, efficiency {efficiency}', { diameter: fmt(i.dish, 3), efficiency: fmt(i.efficiency, 3) })
          : t('no aperture averaging'),
        percent: fmt(i.percent, 4),
        frequency: f,
        elevation: fmt(i.elevation),
        value: r.value,
      },
    );
  }
  if (r.belowIonosphere) return t('The far end is below the ionosphere (about 60 km) → 0 dB.');
  if (key === 'iono-scintillation') {
    if (r.none) return t('S4 left blank: no ionospheric scintillation → 0 dB.');
    return t(
      'ITU-R P.531: S4 {s4ref} at {fref} GHz scales to {s4} at {frequency} GHz (Nakagami m {m}); fade exceeded for {q} % of the event time → {value} dB; peak-to-peak fluctuation {pfluc} dB.',
      {
        s4ref: fmt(i.s4, 3),
        fref: fmt(i.s4Frequency, 4),
        s4: fmt(r.s4, 3),
        frequency: f,
        m: fmt(r.m, 3),
        q: fmt(i.eventPercent, 4),
        value: r.value,
        pfluc: fmt(r.pfluc, 2),
      },
    );
  }
  if (key === 'iono-absorption') {
    return t('ITU-R P.531: {a30} dB at 30 MHz vertically, scaled by sec(i)/f² to {frequency} GHz at elevation {elevation}° → {value} dB.', {
      a30: fmt(i.absorption30, 3),
      frequency: f,
      elevation: fmt(i.elevation),
      value: r.value,
    });
  }
  if (r.none) return t('Radome radius left blank: no radome → 0 dB.');
  return t('Water film {thickness} mm on a {radius} m radome at {rate} mm/h and {temperature} °C, {frequency} GHz → {value} dB.', {
    thickness: fmt(r.thickness * 1000, 3),
    radius: fmt(i.radomeRadius, 3),
    rate: fmt(i.radomeRain, 4),
    temperature: fmt(i.tempC),
    frequency: f,
    value: r.value,
  });
}

/** How each estimated item was obtained, as [item label, description] rows for the report. */
export function describeEstimate(estimate) {
  return Object.entries(normalize(estimate).items).map(([key, r]) => [labelOf(key), describeItem(key, r)]);
}

function inputs(link) {
  const value = (id) => number($(id).value);
  const optional = (id) => ($(id).value.trim() === '' ? null : value(id));
  return {
    path: $('atmo-path').value,
    polarization: $('atmo-polarization').value,
    fMHz: link.fMHz,
    distanceKm: link.distanceKm,
    rainRate: value('atmo-rain'),
    percent: value('atmo-percent'),
    tempC: value('atmo-temp'),
    pressure: value('atmo-pressure'),
    waterVapour: value('atmo-water'),
    elevation: sharedElevation(),
    stationAltitude: value('atmo-altitude-m') / 1000, // The models take km.
    latitude: value('atmo-latitude'),
    rainHeight: value('atmo-rain-height'),
    cloudWater: value('atmo-cloud'),
    nWet: value('atmo-nwet'),
    dish: optional('atmo-dish'),
    efficiency: value('atmo-efficiency'),
    s4: optional('atmo-s4'),
    s4Frequency: value('atmo-s4-frequency'),
    eventPercent: value('atmo-event-percent'),
    absorption30: value('atmo-absorption'),
    radomeRadius: optional('atmo-radome'),
    radomeRain: value('atmo-radome-rain'),
    txAltitude: optional('terr-tx-alt'),
    rxAltitude: optional('terr-rx-alt'),
    vegetationDepth: optional('veg-depth'),
    vegetationGamma: optional('veg-gamma'),
    vegetationMax: optional('veg-max'),
    buildingType: $('building-type').value,
    buildingPercent: value('building-prob'),
    clutterEnds: $('clutter-ends').value,
    clutterPercent: value('clutter-prob'),
    obstacleAltitude: optional('diff-obstacle'),
    obstacleDistance: value('diff-distance'),
    kFactor: value('diff-k'),
    obstacleHeight: optional('diff-height'),
    obstacleRange: value('diff-range'),
    terrainAltitude: optional('mp-terrain'),
    logK: value('mp-logk'),
    dN75: value('mp-dn75'),
  };
}

const rounded = (x) => String(Number(x.toFixed(3)));
const IONOSPHERE_BASE = 60; // km

/** One item's estimate: { result: { value, ... }, notes } or { error }. */
function estimateItem(key, i) {
  if (!(i.fMHz > 0)) return { error: t('Enter a valid frequency in the Path section first.') };
  const f = i.fMHz / 1000;
  const notes = [];
  if (key === 'atmospheric') {
    const e = estimateAtmosphere(i);
    if (e.error) return { error: e.error };
    return { result: { value: rounded(e.total), total: e.total, gas: e.gas, rain: e.rain }, notes: e.notes };
  }
  if (key === 'radome') {
    // A blank radius is the documented way to say there is no radome.
    if (i.radomeRadius === null) return { result: { value: '0', none: true }, notes };
    if (!(i.radomeRadius > 0)) return { error: t('Enter a positive radome radius.') };
    if (!(i.radomeRain >= 0)) return { error: t('Enter a rain rate of 0 mm/h or more.') };
    if (!(i.tempC > -100 && i.tempC < 60)) return { error: t('Enter a surface temperature between −100 and 60 °C.') };
    const thickness = radomeFilmThickness(i.radomeRain, i.radomeRadius, i.tempC);
    return { result: { value: rounded(thickness > 0 ? waterFilmLoss(f, thickness, i.tempC) : 0), thickness }, notes };
  }
  if (TERRAIN[key]) return TERRAIN[key](f, i, notes);
  // The remaining items apply to Earth-space paths.
  if (i.path !== 'slant') return { error: t('Earth–space paths only: choose Earth–space under the shared conditions.') };
  if (!(i.elevation >= 5 && i.elevation <= 90)) return { error: t('Enter an elevation angle between 5° and 90°.') };
  // How high the far end is above the station: a short path stays inside the atmosphere.
  const rise = pathRise(i.distanceKm, i.elevation, i.stationAltitude);
  const inside = rise < INSIDE_ATMOSPHERE;
  if (key === 'cloud') {
    if (!(i.cloudWater >= 0)) return { error: t('Enter a cloud liquid water content of 0 kg/m² or more.') };
    if (i.percent < 0.1) notes.push(t('The cloud maps start at 0.1 % of the time; enter the cloud liquid water for this percentage yourself.'));
    // Liquid cloud water lies below the freezing level, taken as spread evenly up to the rain height.
    const share = Math.min(1, Math.max(0, rise / (i.rainHeight - i.stationAltitude)));
    if (inside) notes.push(insideAtmosphere(rise));
    return { result: { value: rounded(share * cloudAttenuation(f, i.elevation, i.cloudWater)) }, notes };
  }
  if (key === 'tropo-scintillation') {
    if (!(i.percent > 0)) return { error: t('Enter a positive percentage of time.') };
    if (!(i.nWet >= 0)) return { error: t('Enter a wet refractivity of 0 or more.') };
    if (i.dish !== null && !(i.dish > 0)) return { error: t('Enter a positive antenna diameter, or leave it blank.') };
    if (!(i.efficiency > 0 && i.efficiency <= 1)) return { error: t('Enter an antenna efficiency between 0 and 1.') };
    if (f < 4 || f > 20) notes.push(t('P.618 tropospheric scintillation is specified for 4 to 20 GHz; this is an extrapolation.'));
    if (i.percent < 0.01 || i.percent > 50) notes.push(t('P.618 tropospheric scintillation is specified for 0.01 % to 50 % of the time.'));
    if (inside) notes.push(insideAtmosphere(rise));
    const fade = tropoScintillation(f, i.elevation, i.percent, i.dish ?? 0, i.efficiency, i.nWet, i.distanceKm * 1000);
    return { result: { value: rounded(fade) }, notes };
  }
  // The ionosphere starts at about 60 km; a far end below it sees none of it.
  if ((key === 'iono-scintillation' || key === 'iono-absorption') && rise < IONOSPHERE_BASE) {
    return { result: { value: '0', belowIonosphere: true }, notes };
  }
  if (key === 'iono-scintillation') {
    // A blank S4 is the documented way to leave scintillation out.
    if (i.s4 === null) return { result: { value: '0', none: true }, notes };
    if (!(i.s4 >= 0) || !(i.s4Frequency > 0)) {
      return { error: t('Enter a non-negative S4 and a positive reference frequency.') };
    }
    if (!(i.eventPercent > 0 && i.eventPercent < 100)) {
      return { error: t('Enter a time percentage of the scintillation event between 0 and 100 %.') };
    }
    const s = ionoScintillation(f, i.s4, i.s4Frequency, i.eventPercent / 100);
    if (s.s4 > 0.6) notes.push(t('S4 above 0.6 is strong scintillation, where the f^−1.5 scaling and the fade estimate are less reliable.'));
    if (s.s4 > 0 && s.s4 < 0.1) notes.push(t('S4 below 0.1 is weak scintillation; m = 1/S4² is used, as the P.531 m formula applies from 0.1.'));
    return { result: { value: rounded(s.fade), s4: s.s4, m: s.m, pfluc: s.pfluc }, notes };
  }
  // iono-absorption
  if (!(i.absorption30 >= 0)) return { error: t('Enter a vertical absorption at 30 MHz of 0 dB or more.') };
  return { result: { value: rounded(ionoAbsorption(f, i.elevation, i.absorption30)) }, notes };
}

const none = (notes) => ({ result: { value: '0', none: true }, notes });

// Terrain and obstacle items: (f GHz, inputs, notes) → { result, notes } or { error }.
const TERRAIN = {
  vegetation(f, i, notes) {
    if (i.vegetationDepth === null) return none(notes); // A blank depth means no vegetation in the path.
    if (!(i.vegetationDepth >= 0)) return { error: t('Enter a vegetation depth of 0 m or more.') };
    const fMHz = f * 1000;
    if (i.path === 'slant') {
      if (!(i.elevation > 0 && i.elevation <= 90)) return { error: t('Enter an elevation angle between 0° and 90°.') };
      return { result: { value: rounded(slantVegetationLoss(fMHz, i.vegetationDepth, i.elevation)) }, notes };
    }
    const table = woodlandParameters(fMHz);
    const gamma = i.vegetationGamma ?? table.gamma;
    const am = i.vegetationMax ?? table.am;
    if (!(gamma >= 0 && am > 0)) {
      return { error: t('Enter a specific attenuation of 0 dB/m or more and a positive maximum attenuation.') };
    }
    if ((i.vegetationGamma === null || i.vegetationMax === null) && (fMHz < WOODLAND_RANGE[0] || fMHz > WOODLAND_RANGE[1])) {
      notes.push(
        t('P.833 Table 1 covers 106 to 2118 MHz; the values at its nearest end are used. Enter γ and A_m for this frequency if you have them.'),
      );
    }
    return { result: { value: rounded(woodlandLoss(i.vegetationDepth, gamma, am)), gamma, am }, notes };
  },
  building(f, i, notes) {
    if (!(i.buildingPercent > 0 && i.buildingPercent < 100)) return { error: t('Enter a percentage of locations between 0 and 100 %.') };
    if (f < 0.08 || f > 100) notes.push(t('P.2109 is specified for about 0.08 to 100 GHz; this is an extrapolation.'));
    const el = i.path === 'slant' ? i.elevation : 0;
    if (!(el >= 0 && el <= 90)) return { error: t('Enter an elevation angle between 0° and 90°.') };
    return { result: { value: rounded(buildingEntryLoss(f, i.buildingPercent / 100, el, i.buildingType)) }, notes };
  },
  clutter(f, i, notes) {
    if (!(i.clutterPercent > 0 && i.clutterPercent < 100)) return { error: t('Enter a percentage of locations between 0 and 100 %.') };
    if (i.path === 'slant') {
      if (!(i.elevation >= 0 && i.elevation <= 90)) return { error: t('Enter an elevation angle between 0° and 90°.') };
      if (f < 10 || f > 100) notes.push(t('The P.2108 Earth–space model is specified for 10 to 100 GHz; this is an extrapolation.'));
      return { result: { value: rounded(Math.max(slantClutterLoss(f, i.elevation, i.clutterPercent), 0)) }, notes };
    }
    const both = i.clutterEnds === 'both';
    if (!(i.distanceKm >= (both ? 1 : 0.25))) {
      return { error: both ? t('Clutter at both ends needs a path of at least 1 km.') : t('Clutter needs a path of at least 0.25 km.') };
    }
    if (f < 0.5 || f > 67) notes.push(t('The P.2108 terrestrial model is specified for 0.5 to 67 GHz; this is an extrapolation.'));
    const perEnd = Math.max(terrestrialClutterLoss(f, i.distanceKm, i.clutterPercent), 0);
    return { result: { value: rounded(perEnd * (both ? 2 : 1)) }, notes };
  },
  diffraction(f, i, notes) {
    let d1;
    let d2;
    let h;
    if (i.path === 'slant') {
      if (i.obstacleHeight === null) return none(notes); // A blank height means nothing in the way.
      if (!(i.obstacleRange > 0)) return { error: t('Enter a positive distance from the antenna to the obstacle.') };
      if (!(i.elevation >= 0 && i.elevation <= 90)) return { error: t('Enter an elevation angle between 0° and 90°.') };
      d1 = i.obstacleRange / 1000;
      d2 = i.distanceKm - d1;
      if (!(d2 > 0)) return { error: t('The obstacle must be closer than the link distance.') };
      h = i.obstacleHeight - i.obstacleRange * Math.tan((i.elevation * Math.PI) / 180);
    } else {
      if (i.obstacleAltitude === null) return none(notes);
      if (i.txAltitude === null || i.rxAltitude === null) {
        return { error: t('Enter the TX and RX antenna altitudes under the shared conditions.') };
      }
      d1 = i.obstacleDistance;
      d2 = i.distanceKm - d1;
      if (!(d1 > 0 && d2 > 0)) return { error: t('Enter an obstacle distance between 0 and the link distance.') };
      if (!(i.kFactor > 0)) return { error: t('Enter a positive effective Earth radius factor.') };
      const line = i.txAltitude + ((i.rxAltitude - i.txAltitude) * d1) / i.distanceKm;
      h = i.obstacleAltitude + earthBulge(d1, d2, i.kFactor) - line;
    }
    const e = knifeEdge(f, d1, d2, h);
    if (e.nu <= -0.78) notes.push(t('The obstacle leaves enough of the first Fresnel zone clear, so the loss is 0 dB.'));
    return { result: { value: rounded(e.loss), h, nu: e.nu, radius: e.radius }, notes };
  },
  multipath(f, i, notes) {
    if (i.path === 'slant') return { error: t('Terrestrial paths only: choose Terrestrial under the shared conditions.') };
    if (!(i.distanceKm > 0)) return { error: t('Enter a valid distance in the Path section first.') };
    // P.530: multipath fading only needs to be calculated for paths longer than 5 km.
    if (i.distanceKm < 5) return { result: { value: '0', short: true }, notes };
    if (i.txAltitude === null || i.rxAltitude === null) {
      return { error: t('Enter the TX and RX antenna altitudes under the shared conditions.') };
    }
    if (i.terrainAltitude === null) return { error: t('Enter the mean terrain altitude along the path.') };
    if (!(i.percent > 0 && i.percent < 50)) return { error: t('Enter a time percentage between 0 and 50 %.') };
    if (!(i.dN75 >= 0)) return { error: t('Enter a dN75 of 0 or more.') };
    const m = multipathOccurrence({
      f,
      d: i.distanceKm,
      he: i.txAltitude,
      hr: i.rxAltitude,
      ht: i.terrainAltitude,
      logK: i.logK,
      dN75: i.dN75,
    });
    const pw = worstMonthPercent(i.percent);
    if (f < 15 / i.distanceKm) {
      notes.push(t('Below about {min} GHz on this path, the P.530 method is outside its range.', { min: fmt(15 / i.distanceKm, 3) }));
    }
    if (i.percent > 3) notes.push(t('Above 3 % of the time, the worst-month conversion is approximate.'));
    if (i.distanceKm > 300 || m.p0 > 2000) notes.push(t('P.530 was derived from paths of 7.5 to 300 km; this result is outside that range.'));
    return { result: { value: rounded(multipathFade(m.p0, pw)), p0: m.p0, pw }, notes };
  },
};

const BUILDING_TYPES = { traditional: 'traditional', efficient: 'thermally efficient' };

// How each terrain item's value was obtained: (inputs, result, frequency text) → description.
const DESCRIBE_TERRAIN = {
  vegetation(i, r, f) {
    if (r.none) return t('Vegetation depth left blank: no vegetation → 0 dB.');
    if (i.path === 'slant') {
      return t('ITU-R P.833 (slant path): {depth} m of trees, {frequency} GHz, elevation {elevation}° → {value} dB.', {
        depth: fmt(i.vegetationDepth, 4),
        frequency: f,
        elevation: fmt(i.elevation),
        value: r.value,
      });
    }
    return t('ITU-R P.833 (terminal in woodland): {depth} m, γ {gamma} dB/m, A_m {am} dB, {frequency} GHz → {value} dB.', {
      depth: fmt(i.vegetationDepth, 4),
      gamma: fmt(r.gamma, 3),
      am: fmt(r.am, 3),
      frequency: f,
      value: r.value,
    });
  },
  building(i, r, f) {
    return t('ITU-R P.2109: {type} building, not exceeded at {percent} % of locations, {frequency} GHz, elevation {elevation}° → {value} dB.', {
      type: t(BUILDING_TYPES[i.buildingType] ?? i.buildingType),
      percent: fmt(i.buildingPercent, 4),
      frequency: f,
      elevation: fmt(i.path === 'slant' ? i.elevation : 0),
      value: r.value,
    });
  },
  clutter(i, r, f) {
    if (i.path === 'slant') {
      return t('ITU-R P.2108 (Earth–space): not exceeded at {percent} % of locations, {frequency} GHz, elevation {elevation}° → {value} dB.', {
        percent: fmt(i.clutterPercent, 4),
        frequency: f,
        elevation: fmt(i.elevation),
        value: r.value,
      });
    }
    return t('ITU-R P.2108 (terrestrial, {ends}): not exceeded at {percent} % of locations, {frequency} GHz, {distance} km → {value} dB.', {
      ends: i.clutterEnds === 'both' ? t('both ends') : t('one end'),
      percent: fmt(i.clutterPercent, 4),
      frequency: f,
      distance: fmt(i.distanceKm, 4),
      value: r.value,
    });
  },
  diffraction(i, r, f) {
    if (r.none) return t('Obstacle left blank: no obstruction → 0 dB.');
    return t(
      'ITU-R P.526 knife edge: obstacle {h} m {side} the line of sight, first Fresnel radius {radius} m, ν {nu}, {frequency} GHz → {value} dB.',
      {
        h: fmt(Math.abs(r.h), 3),
        side: r.h >= 0 ? t('above') : t('below'),
        radius: fmt(r.radius, 3),
        nu: fmt(r.nu, 3),
        frequency: f,
        value: r.value,
      },
    );
  },
  multipath(i, r, f) {
    if (r.short) return t('ITU-R P.530: no multipath fading is calculated on paths shorter than 5 km → 0 dB.');
    return t(
      'ITU-R P.530-19: log K {logk}, dN75 {dn75}, antennas at {he} m and {hr} m, terrain {ht} m, {distance} km, {frequency} GHz; p0 {p0} %; fade exceeded {percent} % of the year ({pw} % of the worst month) → {value} dB.',
      {
        logk: fmt(i.logK, 3),
        dn75: fmt(i.dN75, 3),
        he: fmt(i.txAltitude),
        hr: fmt(i.rxAltitude),
        ht: fmt(i.terrainAltitude),
        distance: fmt(i.distanceKm, 4),
        frequency: f,
        p0: fmt(r.p0, 3),
        percent: fmt(i.percent, 4),
        pw: fmt(r.pw, 3),
        value: r.value,
      },
    );
  },
};

// Items estimated on their own as soon as the link is known, unless the user typed a value. The
// others apply only in particular situations (indoors, among buildings, long terrestrial links), so
// they are calculated only on request.
const AUTOMATIC = [
  'atmospheric',
  'cloud',
  'tropo-scintillation',
  'iono-scintillation',
  'iono-absorption',
  'radome',
  'vegetation',
  'diffraction',
];
let manual = new Set(); // Items whose value the user typed, which estimates leave alone.
let filling = false; // Set while an estimate fills a field, to tell it from typing.

/** Puts an estimated value into its loss field without marking the item as typed. */
function put(fill, key, value) {
  filling = true;
  try {
    fill('loss-' + key, value);
  } finally {
    filling = false;
  }
}

function persist() {
  write(STORAGE_KEY, {
    fields: Object.fromEntries(ids.map((id) => [id, $(id).value])),
    records,
    percentShown,
    manual: [...manual],
  });
}

const taipeiValue = (id) => (PERCENT_DEPENDENT[id] ? PERCENT_DEPENDENT[id](percentShown) : TAIPEI[id]);

/** Marks the fields that still hold the Taipei reference values. */
function highlightSiteValues() {
  for (const id of [...Object.keys(TAIPEI), ...Object.keys(PERCENT_DEPENDENT)]) {
    $(id).classList.toggle('site-value', $(id).value.trim() === taipeiValue(id));
  }
}

/** Keeps the percentage-dependent Taipei values in step with the time percentage, unless edited. */
function followPercent() {
  const p = number($('atmo-percent').value);
  if (!(p > 0)) return;
  for (const [id, valueAt] of Object.entries(PERCENT_DEPENDENT)) {
    if ($(id).value.trim() === valueAt(percentShown)) $(id).value = valueAt(p);
  }
  percentShown = p;
}

function showPathFields() {
  const slant = $('atmo-path').value === 'slant';
  const hide = (path) => (path === true && !slant) || (path === 'terrestrial' && slant);
  for (const [id, , , , , path] of FIELDS) $(id).closest('label').hidden = hide(path);
  for (const [id, , , path] of ITEM_SELECTS) $(id).closest('label').hidden = hide(path);
}

/**
 * The calculations whose values are still in their loss fields; stale when the link frequency or
 * distance has changed since (the distance only matters on a terrestrial path).
 */
export function currentEstimate(fMHz, distanceKm) {
  const items = Object.fromEntries(Object.entries(records).filter(([key, r]) => $('loss-' + key).value.trim() === r.value));
  if (!Object.keys(items).length) return null;
  // Outdated when calculated with other inputs than the link and conditions now in the form.
  const now = inputs({ fMHz, distanceKm });
  const stale = Object.values(items).some((r) => !sameInputs(r.inputs, now));
  return { estimate: { items }, stale };
}

/** Restores the calculations that a loaded plan was calculated with. */
export function restoreEstimate(estimate, { keepOthers = false } = {}) {
  records = normalize(estimate)?.items ?? {};
  // A loaded plan keeps its own values: the items it did not calculate count as typed.
  if (keepOthers) manual = new Set(Object.keys(ITEMS).filter((key) => !records[key]));
  persist();
}

/** The items whose value the user typed, to restore after Undo. */
export const typedItems = () => [...manual];

/** Marks exactly these items as typed; none makes every automatic item estimate itself again. */
export function restoreTypedItems(keys = []) {
  manual = new Set(keys);
  persist();
}

function showResult(key, notes) {
  $(`calc-${key}-result`).innerHTML =
    `<p>${t('{description}, filled in above.', { description: describeItem(key, records[key]).replace(/[.。]$/, '') })}</p>` +
    notes.map((n) => `<p class="hint">${n}</p>`).join('');
}

const sameInputs = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Recalculates the values still in their loss fields with the current link and conditions, after any
 * of them changes, the path type included. Values edited by hand are left alone, and so are
 * calculations whose new inputs are invalid, such as while a number is being typed, or an item that
 * does not apply to the new path type: they stay marked as outdated, and the latter says why.
 */
export function refreshEstimates(link, fill) {
  const i = inputs(link);
  for (const key of Object.keys(ITEMS)) {
    const r = records[key];
    const field = $('loss-' + key).value.trim();
    const follows = !!r?.inputs && field === r.value; // A calculated value still in its field.
    const automatic = AUTOMATIC.includes(key) && !manual.has(key);
    if (!follows && !automatic) continue;
    if (follows && sameInputs(r.inputs, i)) continue;
    const e = estimateItem(key, i);
    if (e.error) {
      if (automatic && ITEMS[key].slantOnly && i.path !== 'slant') {
        // An Earth–space item on a terrestrial path does not apply: 0 dB.
        delete records[key];
        if (field !== '0') put(fill, key, '0');
        $(`calc-${key}-result`).innerHTML = `<p class="hint">${e.error}</p>`;
      } else if (r && r.inputs.path !== i.path) {
        $(`calc-${key}-result`).innerHTML = `<p class="error">${e.error}</p>`;
      }
      continue;
    }
    records[key] = { ...e.result, inputs: i };
    if (field !== e.result.value) put(fill, key, e.result.value);
    showResult(key, e.notes);
  }
  persist();
}

// The preset shows which typical value S4 holds, and Custom once it is edited to another value.
function showS4Preset() {
  const v = $('atmo-s4').value.trim();
  $('atmo-s4-preset').value = S4_PRESETS.some(([value]) => value === v) ? v : 'custom';
}

/** The ids of the shared conditions and estimator fields, and the time percentage they follow. */
export const conditionIds = () => [...ids];
export const percentState = () => percentShown;

/** Puts the shared conditions and every estimator field back to their defaults (Taipei values). */
export function resetConditions() {
  resetControls(ids);
  percentShown = 0.01;
  for (const [id, valueAt] of Object.entries(PERCENT_DEPENDENT)) $(id).value = valueAt(percentShown);
  syncConditions(percentShown);
}

/** After the fields were set from outside (Undo): shows them consistently and saves them. */
export function syncConditions(percent) {
  if (percent > 0) percentShown = percent;
  showPathFields();
  highlightSiteValues();
  showS4Preset();
  persist();
}

/** The shared elevation (°); a blank field means 90°, overhead. */
export function sharedElevation() {
  return $('atmo-elevation').value.trim() === '' ? 90 : number($('atmo-elevation').value);
}

/** Sets the shared conditions to an Earth–space path at elevation el°. */
export function setSlantElevation(el) {
  $('atmo-path').value = 'slant';
  $('atmo-elevation').value = String(el);
  showPathFields();
  highlightSiteValues();
  persist();
}

/**
 * Each item of a calculation recalculated with changed inputs: change(inputs) returns the new
 * inputs. Gives { key: dB }, with null where the new inputs are out of the model's range.
 */
export function reestimate(estimate, change) {
  const items = normalize(estimate)?.items ?? {};
  return Object.fromEntries(
    Object.entries(items).map(([key, r]) => {
      if (!r.inputs) return [key, null];
      const e = estimateItem(key, change(r.inputs));
      return [key, e.error ? null : Number(e.result.value)];
    }),
  );
}

/**
 * Inputs for another time percentage p. Cloud liquid water and the radome rain rate follow it when
 * they held the Taipei value for the original percentage, as the fields do.
 */
export function atPercent(i, p) {
  const follows = (id, value) => value === Number(PERCENT_DEPENDENT[id](i.percent));
  return {
    ...i,
    percent: p,
    cloudWater: follows('atmo-cloud', i.cloudWater) ? Number(PERCENT_DEPENDENT['atmo-cloud'](p)) : i.cloudWater,
    radomeRain: follows('atmo-radome-rain', i.radomeRain) ? Number(PERCENT_DEPENDENT['atmo-radome-rain'](p)) : i.radomeRain,
  };
}

/** Surface temperature (°C) under the shared conditions, or null. */
export function surfaceTemperature() {
  const v = number($('atmo-temp').value);
  return Number.isFinite(v) ? v : null;
}

/** Station altitude (km) under the shared conditions; 0 when blank or invalid. */
export function stationAltitude() {
  const v = number($('atmo-altitude-m').value) / 1000;
  return Number.isFinite(v) ? v : 0;
}

const fieldsHtml = (fields) => fields.map(([id, label, value, unit, extra, , signed]) => field(id, t(label), value, unit, extra, signed)).join('');

/** link() returns { fMHz, distanceKm } from the form; fill(id, value) puts a value into a loss field. */
export function initEstimator({ link, fill }) {
  $('atmo-common-fields').insertAdjacentHTML(
    'beforeend',
    `<label for="atmo-path">${t('Path')}<select id="atmo-path">` +
      `<option value="terrestrial">${t('Terrestrial (horizontal)')}</option>` +
      `<option value="slant">${t('Earth–space (satellite)')}</option></select></label>` +
      fieldsHtml(COMMON),
  );
  for (const [key, item] of Object.entries(ITEMS)) {
    const polarization =
      key === 'atmospheric'
        ? `<label for="atmo-polarization">${t('Polarization')}<select id="atmo-polarization">` +
          `<option value="circular">${t('Circular')}</option><option value="horizontal">${t('Horizontal')}</option>` +
          `<option value="vertical">${t('Vertical')}</option></select></label>`
        : '';
    const selects = (item.selects ?? [])
      .map(
        ([id, label, options]) =>
          `<label for="${id}">${t(label)}<select id="${id}">` +
          Object.entries(options).map(([value, text]) => `<option value="${value}">${t(text)}</option>`).join('') +
          '</select></label>',
      )
      .join('');
    $(`calc-${key}-fields`).insertAdjacentHTML(
      'beforeend',
      selects + fieldsHtml(item.fields.slice(0, 1)) + polarization + fieldsHtml(item.fields.slice(1)),
    );
  }
  $('calc-iono-scintillation-fields').insertAdjacentHTML(
    'afterbegin',
    `<label for="atmo-s4-preset">${t('Typical S4 for Taiwan')}<select id="atmo-s4-preset">` +
      `<option value="custom">${t('Custom')}</option>` +
      S4_PRESETS.map(([value, label]) => `<option value="${value}">${t(label)}</option>`).join('') +
      '</select></label>',
  );
  for (const [id, valueAt] of Object.entries(PERCENT_DEPENDENT)) $(id).value = valueAt(percentShown);

  const saved = read(STORAGE_KEY, {});
  // Blank saved values fall back to the defaults, so a field left empty earlier gets its default.
  for (const [id, v] of Object.entries(saved.fields ?? {})) {
    if (ids.includes(id) && typeof v === 'string' && v.trim() !== '') $(id).value = v;
  }
  if (saved.percentShown > 0) percentShown = saved.percentShown;
  records = saved.records ?? normalize(saved.last)?.items ?? {};
  manual = new Set(saved.manual ?? []);
  showPathFields();
  highlightSiteValues();

  for (const id of ids) {
    $(id).addEventListener('input', () => {
      if (id === 'atmo-percent') followPercent();
      highlightSiteValues();
      persist();
      refreshEstimates(link(), fill);
    });
  }
  showS4Preset();
  $('atmo-s4').addEventListener('input', showS4Preset);
  $('atmo-s4-preset').addEventListener('change', () => {
    if ($('atmo-s4-preset').value === 'custom') return;
    $('atmo-s4').value = $('atmo-s4-preset').value;
    $('atmo-s4').dispatchEvent(new Event('input'));
  });
  $('atmo-taipei').onclick = () => {
    for (const [id, value] of Object.entries(TAIPEI)) $(id).value = value;
    const p = number($('atmo-percent').value);
    if (p > 0) percentShown = p;
    for (const [id, valueAt] of Object.entries(PERCENT_DEPENDENT)) $(id).value = valueAt(percentShown);
    highlightSiteValues();
    persist();
    refreshEstimates(link(), fill);
  };
  // A blank elevation counts as 90°; leaving the field blank shows that value.
  $('atmo-elevation').addEventListener('change', () => {
    if ($('atmo-elevation').value.trim() !== '') return;
    $('atmo-elevation').value = '90';
    $('atmo-elevation').dispatchEvent(new Event('input', { bubbles: true }));
  });
  $('atmo-path').addEventListener('change', () => {
    showPathFields();
    persist();
  });
  for (const key of Object.keys(ITEMS)) {
    $(`calc-${key}-run`).onclick = () => {
      const out = $(`calc-${key}-result`);
      const i = inputs(link());
      const e = estimateItem(key, i);
      if (e.error) {
        out.innerHTML = `<p class="error">${e.error}</p>`;
        return;
      }
      records[key] = { ...e.result, inputs: i };
      manual.delete(key);
      persist();
      put(fill, key, e.result.value);
      showResult(key, e.notes);
    };
    // Typing in the loss field takes the value over from the estimate.
    $('loss-' + key).addEventListener('input', () => {
      if (filling) return;
      manual.add(key);
      persist();
    });
  }
}
