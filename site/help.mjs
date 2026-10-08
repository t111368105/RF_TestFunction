// Help under each field of the Path section: what the value is, where to find it and what to enter
// when it is unknown. Keyed by the field's element id.

import { t } from './i18n.mjs';

const HELP = {
  // Link
  v0: 'Carrier frequency of the link, from the radio or the frequency plan; choose GHz or MHz on the right.',
  v1: 'Straight-line distance between the two antennas. For a satellite, the slant range at the elevation you design for; directly overhead, the orbit altitude. Unknown: measure it on a map, or use the slant range calculator below.',
  'orbit-altitude': 'Height of the satellite above sea level: about 400 to 600 km for low Earth orbit (the ISS is at about 420 km), 20 200 km for GPS and 35 786 km for geostationary satellites. From the satellite operator or its orbital elements.',
  'slant-elevation': 'Angle of the satellite above the horizon at the ground station. 90° overhead gives the shortest distance; for the worst case, use the minimum operating elevation, often 10°. Also sets the elevation under the shared conditions.',

  // Additional path losses
  'loss-polarization': 'Loss when the two antennas’ polarizations do not match. Same polarization at both ends: 0. Linear to circular: 3 dB. Unknown, or a rotating satellite with linear antennas: 3 dB. Or use the calculator below.',
  'loss-pointing': 'Loss when the antennas are not aimed exactly at each other. Wide-beam antennas, or gains already read in the direction of the other end: 0. Unknown, for a tracking dish: about 1 dB, or use the calculator below.',
  'loss-atmospheric': 'Absorption by oxygen, water vapour and rain. Below about 3 GHz it is usually under 0.1 dB. Unknown: use the estimator below with the Taipei defaults.',
  'loss-cloud': 'Absorption by cloud and fog droplets. Negligible below about 10 GHz: 0. Above that, use the estimator below (satellite links).',
  'loss-tropo-scintillation': 'Fast fading from turbulence in the lower atmosphere. Usually covered by the required margin: 0. Negligible below 4 GHz at high elevations.',
  'loss-iono-scintillation': 'Fast fading from irregularities in the ionosphere, strongest after sunset near the equator and in Taiwan. Usually covered by the required margin: 0. Estimating it needs a measured or modelled S4.',
  'loss-iono-absorption': 'Absorption in the ionosphere, which matters at HF and VHF. Negligible above about 1 GHz: 0.',
  'loss-radome': 'Water on a radome or antenna surface in rain. No radome, or below 10 GHz: 0. Otherwise use the estimator below.',
  'loss-vegetation': 'Trees or foliage in the path. Clear line of sight: 0. Through trees it can be several dB to over 20 dB, depending on depth and frequency; use the estimator below.',
  'loss-building': 'Loss into a building when one antenna is indoors. Both antennas outdoors: 0. Indoors: typically 10 to 30 dB, depending on walls and glass; use the estimator below.',
  'loss-clutter': 'Extra loss from buildings and trees around a low antenna in towns. Antennas above the rooftops or in open areas: 0. Otherwise use the estimator below.',
  'loss-diffraction': 'Hills or buildings partly blocking the path. Clear line of sight with the first Fresnel zone free: 0. Otherwise use the estimator below.',
  'loss-multipath': 'Fading from atmospheric layers and ground reflections on long terrestrial links. Usually covered by the required margin: 0. To size the margin, use the estimator below.',
  'loss-other': 'Any other loss between the antennas that is not listed above, for example: body loss for a handheld device (3 to 8 dB), entry into a vehicle without a roof antenna (5 to 15 dB), blockage by a small satellite’s own body or panels, or Faraday rotation of a linear polarization below about 10 GHz (up to 3 dB or more; already included if the polarization calculator uses an unknown angle). Not here: connector and cable losses (TX and RX cable loss), implementation loss (data rate section), or interference and sky noise (antenna noise temperature). Unknown: 0.',

  // Shared conditions for the estimates
  'atmo-path': 'Terrestrial for ground-to-ground links; Earth–space for satellite links.',
  'atmo-percent': 'How often each loss may be exceeded. 0.01 % (about 53 minutes a year) for high availability; 1 % for links that can tolerate outages. Unknown: 0.01.',
  'atmo-temp': 'Average surface temperature at the station. Unknown: keep the Taipei value, or 15 °C elsewhere.',
  'atmo-pressure': 'Surface air pressure. Unknown: 1013.25 hPa, sea level.',
  'atmo-water': 'Surface water vapour density, higher in humid places. Unknown: keep the Taipei value, or 7.5 g/m³ (global reference) elsewhere.',
  'atmo-elevation': 'Angle of the satellite above the horizon. 90° directly overhead, matching the shortest distance; for the worst case, the minimum operating elevation, often 10°.',
  'atmo-altitude-m': 'Height of the ground station above sea level, including the building. Unknown: 0.',
  'atmo-latitude': 'Latitude of the ground station, used by the rain model. Unknown: keep the Taipei value.',

  // Gas and rain
  'atmo-rain': 'Rain rate exceeded for 0.01 % of the year at the site (ITU-R P.837 map). 0 for clear sky. Unknown: keep the Taipei value.',
  'atmo-polarization': 'Polarization of the radio wave along the path, which is the same for the satellite and the ground station in a matched link; if they differ, use the transmitting antenna’s. Linear antennas: horizontal or vertical as mounted; vertical for a ground link with whip antennas. Unknown: circular.',
  'atmo-rain-height': 'Height of the top of the rain layer (ITU-R P.839 map). Unknown: keep the Taipei value; it is about 5 km in the tropics and subtropics.',
  // Clouds
  'atmo-cloud': 'Liquid water in clouds exceeded for the time percentage (ITU-R P.840 map); follows the time percentage. Unknown: keep the Taipei value.',
  // Tropospheric scintillation
  'atmo-nwet': 'Humidity term of the radio refractivity (ITU-R P.453 map). Unknown: keep the Taipei value.',
  'atmo-dish': 'Diameter of the ground station antenna; larger antennas average out part of the scintillation. Unknown, or a small antenna: leave blank, which gives the largest value.',
  'atmo-efficiency': 'Antenna aperture efficiency, from the datasheet. Unknown: 0.5.',
  // Ionospheric scintillation
  'atmo-s4-preset': 'Typical values when no measurement is available; it fills S4. There is no ITU-R map for S4: it changes with local time, season and solar activity. For a worst case at night, choose Strong.',
  'atmo-s4': 'Scintillation strength, from a GNSS scintillation monitor or the ITU-R GISM model: below 0.3 is weak, above 0.6 strong. Unknown: pick a typical value above, or leave blank (not estimated) and cover it with the required margin.',
  'atmo-s4-frequency': 'Frequency at which S4 was measured. Values from GPS receivers: 1.5 GHz.',
  'atmo-event-percent': 'Share of a scintillation event during which the fade may be exceeded. Unknown: 1.',
  // Ionospheric absorption
  'atmo-absorption': 'One-way absorption straight up at 30 MHz. Unknown: 0.5 dB, the upper end of the typical 0.2 to 0.5 dB.',
  // Wet radome
  'atmo-radome': 'Radius of a spherical radome around the antenna. No radome: leave blank.',
  'atmo-radome-rain': 'Rain rate on the radome; follows the time percentage. Unknown: keep the Taipei value.',

  // Polarization mismatch calculator
  'pol-tx-type': 'From the antenna datasheet. Unknown: circular for satellite antennas; linear for dipoles, monopoles and Yagis.',
  'pol-rx-type': 'From the antenna datasheet. Unknown: circular for satellite antennas; linear for dipoles, monopoles and Yagis.',
  'pol-tx-ar': 'Axial ratio from the datasheet; 0 dB is ideal circular, typical antennas 1 to 3 dB. Unknown: 3 dB for a conservative result.',
  'pol-rx-ar': 'Axial ratio from the datasheet; 0 dB is ideal circular, typical antennas 1 to 3 dB. Unknown: 3 dB for a conservative result.',
  'pol-mode': 'Known: antennas with a fixed orientation. Unknown angle: average for a rotating linear antenna, worst case for a guaranteed design.',
  'pol-angle': 'Angle between the two linear polarizations; 0 when they are aligned.',
  // Pointing loss calculator
  'point-tx-error': 'How far the antenna points away from the other end: the tracking or attitude accuracy. No error: leave blank.',
  'point-rx-error': 'How far the antenna points away from the other end: the tracking or attitude accuracy. No error: leave blank.',
  'point-tx-bw': 'Half-power (3 dB) beamwidth from the datasheet, the full width.',
  'point-rx-bw': 'Half-power (3 dB) beamwidth from the datasheet, the full width.',
  'point-tx-dish': 'Dish diameter, when the beamwidth is unknown; the beamwidth is then about 70 λ / D.',
  'point-rx-dish': 'Dish diameter, when the beamwidth is unknown; the beamwidth is then about 70 λ / D.',
  // Terrain conditions shared by the diffraction and multipath estimates
  'terr-tx-alt': 'Height of the TX antenna above sea level: the ground altitude plus the mast or building. Read the ground altitude from a topographic map. Needed for diffraction and multipath on terrestrial paths.',
  'terr-rx-alt': 'Height of the RX antenna above sea level: the ground altitude plus the mast or building. Read the ground altitude from a topographic map. Needed for diffraction and multipath on terrestrial paths.',
  // Vegetation
  'veg-depth': 'Length of the path that runs through trees. Terrestrial: how far the antenna inside the woodland is from its edge. Earth–space: the distance through the canopy towards the satellite. No trees: leave blank.',
  'veg-gamma': 'Loss per metre of trees, from local measurements. Unknown: leave blank to use P.833 Table 1 (mixed forest, 106 to 2118 MHz).',
  'veg-max': 'Upper limit of the woodland loss, reached when the signal goes over the trees instead of through them. Unknown: leave blank to use P.833 Table 1.',
  // Building entry
  'building-type': 'Thermally efficient buildings have metallised glass, foil-backed panels or insulated walls, and much higher loss. Unknown, or ordinary concrete with plain glass: traditional.',
  'building-prob': 'Share of locations inside the building where the loss is not exceeded. 50 %: a typical location. For a design that covers most of the building, use 90 % or more. Unknown: 50.',
  // Clutter
  'clutter-ends': 'Whether one or both antennas are low among buildings or trees. Both ends needs a path of at least 1 km. Unknown: one end.',
  'clutter-prob': 'Share of locations where the clutter loss is not exceeded. 50 %: a typical location; 90 % for a conservative design. Unknown: 50.',
  // Diffraction
  'diff-obstacle': 'Height of the top of the highest hill or building between the antennas, above sea level, from a topographic map. Nothing in the way: leave blank.',
  'diff-distance': 'Distance from the TX antenna to that obstacle, along the path.',
  'diff-k': 'Effective Earth radius factor, which accounts for the bending of the radio path. Unknown: 1.333 (4/3, standard atmosphere); 0.67 for a worst case on clearance.',
  'diff-height': 'Height of the top of the obstacle above the ground antenna, for example a nearby building or ridge in the direction of the satellite. Nothing in the way: leave blank.',
  'diff-range': 'Horizontal distance from the ground antenna to that obstacle.',
  // Multipath
  'mp-terrain': 'Average ground altitude along the path, excluding trees, from a topographic map. Unknown: the average of the two antenna sites’ ground altitudes.',
  'mp-logk': 'How prone the region is to multipath fading, from the ITU-R P.530 map. Unknown: keep the Taipei value.',
  'mp-dn75': 'Refractivity change over the lowest 75 m of the atmosphere, from the ITU-R P.530 map. Unknown: keep the Taipei value.',
  // Sky noise estimator (Noise and SNR)
  'sky-atten': 'Atmospheric attenuation on the path at the same time percentage, excluding scintillation: the Atmospheric and rain loss plus the Cloud and fog loss. The button takes them from the calculation.',
  'sky-tmr': 'Effective temperature of the atmosphere that emits the noise. Unknown: 275 K (ITU-R P.618).',
  'sky-ground': 'Noise from the warm ground picked up through the sidelobes and spillover. Unknown: 0 for a high-gain dish at high elevation; 10 to 50 K for a small or wide-beam antenna, or at low elevation.',
};

/** Adds each field's help under it. Run once the generated fields exist. */
export function attachHelp() {
  for (const [id, text] of Object.entries(HELP)) {
    const label = document.getElementById(id)?.closest('label');
    if (!label || label.querySelector('.field-help')) continue;
    label.insertAdjacentHTML('beforeend', `<small class="field-help">${t(text)}</small>`);
  }
}
