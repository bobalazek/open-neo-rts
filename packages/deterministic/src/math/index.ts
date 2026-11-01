// Integer helpers: divFloor, mulDiv, isqrt. Every input and result is a safe integer.
// ponytail: range asserts run in every build, not only test builds; gate them if profiling shows a cost.

function assertSafe(value: number, what: string): void {
  if (!Number.isSafeInteger(value))
    throw new RangeError(`${what} must be a safe integer, got ${value}`);
}

/** `a / b` rounded toward negative infinity. Exact for every safe integer, because |a| < 2^53. */
export function divFloor(a: number, b: number): number {
  assertSafe(a, "divFloor dividend");
  assertSafe(b, "divFloor divisor");
  if (b === 0) throw new RangeError("divFloor by zero");
  return Math.floor(a / b);
}

/** `a * b / c` rounded toward negative infinity: multiply first, divide once. `a * b` must stay below 2^53. */
export function mulDiv(a: number, b: number, c: number): number {
  assertSafe(a, "mulDiv a");
  assertSafe(b, "mulDiv b");
  assertSafe(a * b, "mulDiv a * b");
  return divFloor(a * b, c);
}

/** Largest integer r with r * r <= n, for 0 <= n < 2^53. */
export function isqrt(n: number): number {
  assertSafe(n, "isqrt input");
  if (n < 0) throw new RangeError(`isqrt of negative ${n}`);
  let r = Math.floor(Math.sqrt(n)); // correctly rounded by IEEE; off by at most one, fixed below
  while (r * r > n) r--;
  while ((r + 1) * (r + 1) <= n) r++;
  return r;
}
