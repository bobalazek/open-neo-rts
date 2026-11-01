/** A presentation clock in simulation milliseconds; only acknowledged controls change its rate. */
export function createPresentationClock() {
  let realAt = 0;
  let visualAt = 0;
  let rate = 0;
  return {
    now(realMs: number) {
      return visualAt + Math.max(0, realMs - realAt) * rate;
    },
    update(realMs: number, paused: boolean, speed: number) {
      visualAt += Math.max(0, realMs - realAt) * rate;
      realAt = realMs;
      rate = paused ? 0 : speed;
    },
  };
}
