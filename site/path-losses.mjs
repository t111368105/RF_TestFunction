// Itemized additional path losses, shared by the form, saved plans and the report. Their sum is link
// value 10 (additional path losses).

import { number } from './calculations.mjs';
import { t } from './i18n.mjs';

export const LOSS_GROUPS = [
  {
    id: 'alignment',
    title: 'Antenna alignment',
    items: [
      ['polarization', 'Polarization mismatch'],
      ['pointing', 'Pointing'],
    ],
  },
  {
    id: 'atmosphere',
    title: 'Atmosphere and ionosphere',
    items: [
      ['atmospheric', 'Atmospheric and rain'],
      ['cloud', 'Cloud and fog'],
      ['tropo-scintillation', 'Tropospheric scintillation'],
      ['iono-scintillation', 'Ionospheric scintillation'],
      ['iono-absorption', 'Ionospheric absorption'],
      ['radome', 'Wet radome or antenna'],
    ],
  },
  {
    id: 'terrain',
    title: 'Terrain and obstacles',
    items: [
      ['vegetation', 'Vegetation'],
      ['building', 'Building entry'],
      ['clutter', 'Clutter'],
      ['diffraction', 'Diffraction and obstruction'],
      ['multipath', 'Multipath'],
    ],
  },
  { id: 'other', title: 'Other', items: [['other', 'Any other loss']] },
];

/** Every item as { key, id (form element), label, group }. */
export const LOSS_ITEMS = LOSS_GROUPS.flatMap((g) =>
  g.items.map(([key, label]) => ({ key, id: 'loss-' + key, label: t(label), group: g.id })),
);

/**
 * A plan's loss items as { key: value string }. Earlier versions stored a list of four items
 * (polarization, pointing, atmospheric, other), and the first ones only the total, kept as "other".
 */
export function lossItemsOf(p) {
  let items = p.lossItems;
  if (Array.isArray(items)) {
    const [polarization, pointing, atmospheric, other] = items;
    items = { polarization, pointing, atmospheric, other };
  } else if (!items || typeof items !== 'object') {
    items = { other: String(p.values[10]) };
  }
  return Object.fromEntries(LOSS_ITEMS.map(({ key }) => [key, typeof items[key] === 'string' ? items[key] : '0']));
}

/** "Label value" for the non-zero items, for the report and input snapshot. */
export function lossItemsSummary(items) {
  const parts = LOSS_ITEMS.filter(({ key }) => items[key].trim() !== '' && number(items[key]) !== 0).map(
    ({ key, label }) => `${label} ${items[key]}`,
  );
  return parts.length ? parts.join(', ') : t('None');
}
