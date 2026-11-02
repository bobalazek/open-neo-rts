import { expect, test } from "bun:test";
import { desktopLockState } from "./renderer-desktop";

test("only one completed console session can interpret an omitted lock flag as unlocked", () => {
  const session = { kCGSSessionOnConsoleKey: true, kCGSessionLoginDoneKey: true };
  expect(desktopLockState({ IOConsoleUsers: [session] })).toBe(false);
  expect(
    desktopLockState({ IOConsoleUsers: [{ ...session, CGSSessionScreenIsLocked: true }] }),
  ).toBe(true);
  expect(
    desktopLockState({ IOConsoleUsers: [{ ...session, CGSSessionScreenIsLocked: false }] }),
  ).toBe(false);
  expect(
    desktopLockState({ IOConsoleUsers: [{ ...session, CGSSessionScreenIsLocked: "unknown" }] }),
  ).toBeNull();
  expect(
    desktopLockState({ IOConsoleUsers: [{ ...session, kCGSessionLoginDoneKey: false }] }),
  ).toBeNull();
  expect(
    desktopLockState({ IOConsoleUsers: [{ ...session, kCGSSessionOnConsoleKey: false }] }),
  ).toBeNull();
  expect(desktopLockState({ IOConsoleUsers: [session, session] })).toBeNull();
  expect(desktopLockState({})).toBeNull();
});
