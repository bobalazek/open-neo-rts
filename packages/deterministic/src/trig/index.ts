// Lookup-table sin/cos and integer CORDIC atan2 in binary angle units: 65,536 per turn, wrapping with `& 0xffff`.

import { ATAN_STEPS, SIN_DELTAS } from "./table";

const QUARTER = 0x4000;

/** sin(i) * 2^14 for 0 <= i <= a quarter turn, decoded once from the committed table. */
const SIN_QUARTER = new Uint16Array(QUARTER + 1);
let entry = 0;
for (const digit of SIN_DELTAS.join("")) {
  SIN_QUARTER[entry + 1] = (SIN_QUARTER[entry] ?? 0) + Number(digit);
  entry++;
}

/** sin of any integer angle, scaled by 2^14: an integer in [-16384, 16384]. */
export function sin(angle: number): number {
  const a = angle & 0xffff;
  const i = a & (QUARTER - 1);
  const value = SIN_QUARTER[a & QUARTER ? QUARTER - i : i] ?? 0;
  return a & 0x8000 ? 0 - value : value; // not -value, which makes -0
}

/** cos of any integer angle, scaled by 2^14: an integer in [-16384, 16384]. */
export function cos(angle: number): number {
  return sin((angle & 0xffff) + QUARTER);
}

/** Largest |x| or |y| for atan2: inputs scale up to [2^27, 2^28) and CORDIC grows them about 2.33x, staying in int32. */
const ATAN2_LIMIT = 2 ** 28 - 1;

/**
 * Angle of the vector (x, y) in [0, 65536): 0 along +x, a quarter turn along +y; atan2(0, 0) is 0.
 * Within 1 unit of the true angle, and exact for the 8 compass directions.
 */
export function atan2(y: number, x: number): number {
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    Math.abs(x) > ATAN2_LIMIT ||
    Math.abs(y) > ATAN2_LIMIT
  )
    throw new RangeError(`atan2 takes integers within ±${ATAN2_LIMIT}, got (${y}, ${x})`);
  // Fold into the first octant (0 <= minor <= major), unfold at the end.
  const steep = Math.abs(y) > Math.abs(x);
  const major = steep ? Math.abs(y) : Math.abs(x);
  const minor = steep ? Math.abs(x) : Math.abs(y);
  if (major === 0) return 0;
  // Scale so major is in [2^27, 2^28): the shifts below then drop only negligible low bits.
  const shift = Math.clz32(major) - 4;
  let cx = major << shift;
  let cy = minor << shift;
  let z = 0; // accumulated angle, 1/256 units
  // Rotate (cx, cy) onto the x-axis; stop early once cy is exactly 0, where z is already exact.
  for (let i = 0; i < ATAN_STEPS.length && cy !== 0; i++) {
    const dx = cx >> i;
    const step = ATAN_STEPS[i] ?? 0;
    if (cy > 0) {
      cx += cy >> i;
      cy -= dx;
      z += step;
    } else {
      cx -= cy >> i;
      cy += dx;
      z -= step;
    }
  }
  let angle = (z + 128) >> 8;
  if (steep) angle = QUARTER - angle;
  if (x < 0) angle = 0x8000 - angle;
  if (y < 0) angle = -angle;
  return angle & 0xffff;
}
