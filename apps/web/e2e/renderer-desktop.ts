import { dlopen } from "bun:ffi";

/** macOS omits the lock flag when unlocked; only a completed on-console session may imply false. */
export function desktopLockState(value: unknown): boolean | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !("IOConsoleUsers" in value) ||
    !Array.isArray(value.IOConsoleUsers)
  )
    return null;
  const sessions = value.IOConsoleUsers.filter(
    (s: unknown): s is Record<string, unknown> =>
      typeof s === "object" &&
      s !== null &&
      "kCGSSessionOnConsoleKey" in s &&
      s.kCGSSessionOnConsoleKey === true,
  );
  const session = sessions.length === 1 ? sessions[0] : undefined;
  if (session?.kCGSessionLoginDoneKey !== true) return null;
  const locked = session.CGSSessionScreenIsLocked;
  return locked === undefined ? false : typeof locked === "boolean" ? locked : null;
}

/** Native booleans avoid inferring awake state from omitted system_profiler fields. */
export function mainDisplayState() {
  const cg = dlopen("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics", {
    CGMainDisplayID: { args: [], returns: "u32" },
    CGDisplayIsActive: { args: ["u32"], returns: "u32" },
    CGDisplayIsAsleep: { args: ["u32"], returns: "u32" },
  });
  try {
    const display = cg.symbols.CGMainDisplayID();
    return {
      active: cg.symbols.CGDisplayIsActive(display) === 1,
      asleep: cg.symbols.CGDisplayIsAsleep(display) === 1,
    };
  } finally {
    cg.close();
  }
}
