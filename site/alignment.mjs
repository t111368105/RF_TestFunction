// Antenna alignment losses: polarization mismatch and pointing error.

import { t } from './i18n.mjs';

const SPEED_OF_LIGHT = 299792458; // m/s

/** Polarization senses; circular ones take an axial ratio. */
export const POLARIZATIONS = {
  linear: t('Linear'),
  rhcp: t('Right-hand circular'),
  lhcp: t('Left-hand circular'),
};

/**
 * Polarization ellipse terms from the axial ratio r (voltage ratio, signed by sense: + right-hand,
 * − left-hand; linear is the limit r → ∞): e = (r² − 1)/(r² + 1), c = 2r/(r² + 1).
 */
function ellipse({ type, axialRatio = 0 }) {
  if (type === 'linear') return { e: 1, c: 0 };
  const r = 10 ** (axialRatio / 20) * (type === 'lhcp' ? -1 : 1);
  return { e: (r * r - 1) / (r * r + 1), c: (2 * r) / (r * r + 1) };
}

/**
 * Polarization mismatch loss (dB) between a transmit and a receive antenna, each
 * { type: 'linear' | 'rhcp' | 'lhcp', axialRatio (dB, circular only) }, using the polarization loss
 * factor PLF = ½ [1 + c_T c_R + e_T e_R cos 2ψ]. ψ is the angle between the polarization ellipses'
 * major axes. mode: 'angle' uses angle (degrees); 'average' averages the PLF over all angles;
 * 'worst' takes the least favourable angle. Returns Infinity when no power couples, null when invalid.
 */
export function polarizationLoss(tx, rx, mode, angle = 0) {
  for (const a of [tx, rx]) {
    if (!(a.type in POLARIZATIONS)) return null;
    if (a.type !== 'linear' && !(a.axialRatio >= 0)) return null;
  }
  if (mode === 'angle' && !Number.isFinite(angle)) return null;
  const t = ellipse(tx);
  const r = ellipse(rx);
  const cos2 = { angle: Math.cos((2 * angle * Math.PI) / 180), average: 0, worst: -1 }[mode];
  if (cos2 === undefined) return null;
  const plf = 0.5 * (1 + t.c * r.c + t.e * r.e * cos2);
  // Rounding can leave a tiny residue where the exact PLF is zero (orthogonal polarizations).
  return plf > 1e-12 ? -10 * Math.log10(plf) : Infinity;
}

/** Pointing loss (dB) of a main beam: 12 (θe / θ3dB)², both in degrees. Null when invalid. */
export function pointingLoss(error, beamwidth) {
  if (!(beamwidth > 0) || !(error >= 0)) return null;
  return 12 * (error / beamwidth) ** 2;
}

/** Approximate half-power beamwidth (degrees) of a parabolic dish: 70 λ / D. */
export function dishBeamwidth(fMHz, diameterM) {
  if (!(fMHz > 0) || !(diameterM > 0)) return null;
  return (70 * SPEED_OF_LIGHT) / (fMHz * 1e6) / diameterM;
}
