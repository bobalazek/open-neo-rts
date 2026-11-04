import { expect, test } from "bun:test";
import type { AudioPlayOptions } from "@open-neo-rts/render";
import { createMusicPlayer } from "./music";

function fixture() {
  const calls: { source: string; options: AudioPlayOptions }[] = [];
  const state = { enabled: false, stopped: 0, disposed: false, fail: false };
  const scope = {
    async play(source: string | AudioBuffer, options: AudioPlayOptions) {
      calls.push({ source: String(source), options });
      if (state.fail) throw new Error("decode failed");
      return true;
    },
    stop() {
      state.stopped++;
    },
    dispose() {
      state.disposed = true;
    },
    move() {
      return true;
    },
    retain() {},
  };
  const player = createMusicPlayer(
    { scope: () => scope, canPlay: () => state.enabled },
    { menu: ["menu"], match: ["one", "two", "three"] },
  );
  return { state, calls, player };
}
const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

test("music waits for activation, consumes a shuffle bag without adjacent repeats and keeps a live context", async () => {
  const { player, state, calls } = fixture();
  player.set("match");
  await settle();
  expect(calls).toHaveLength(0);
  state.enabled = true;
  player.refresh();
  await settle();
  player.set("match");
  await settle();
  expect(calls).toHaveLength(1);
  for (let i = 0; i < 8; i++) {
    calls.at(-1)!.options.onEnded!();
    await settle();
  }
  expect(new Set(calls.slice(0, 3).map((call) => call.source)).size).toBe(3);
  expect(calls.every((call, i) => i === 0 || calls[i - 1]!.source !== call.source)).toBe(true);
  player.dispose();
  expect(state.disposed).toBe(true);
});

test("mute, context changes and disposal revoke old completion callbacks without queuing a stale playlist", async () => {
  const { player, state, calls } = fixture();
  state.enabled = true;
  player.set("menu");
  await settle();
  const old = calls[0]!;
  state.enabled = false;
  player.refresh();
  old.options.onEnded!();
  await settle();
  expect(calls).toHaveLength(1);
  state.enabled = true;
  player.refresh();
  await settle();
  expect(calls).toHaveLength(2);
  player.set("match");
  await settle();
  const count = calls.length;
  old.options.onEnded!();
  await settle();
  expect(calls).toHaveLength(count);
  player.set(undefined);
  calls.at(-1)!.options.onEnded!();
  await settle();
  expect(calls).toHaveLength(count);
  player.dispose();
  player.refresh();
  player.set("menu");
  await settle();
  expect(calls).toHaveLength(count);
});

test("decode failures try each remaining track once and stop rather than spinning", async () => {
  const { player, state, calls } = fixture();
  state.enabled = state.fail = true;
  player.set("match");
  await settle();
  await settle();
  expect(calls).toHaveLength(3);
  expect(new Set(calls.map((call) => call.source)).size).toBe(3);
  player.refresh();
  await settle();
  expect(calls).toHaveLength(3);
  state.fail = false;
  player.set("menu");
  await settle();
  expect(calls.at(-1)?.source).toBe("menu");
  player.dispose();
});
