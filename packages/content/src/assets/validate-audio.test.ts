import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { validateAudioContainer } from "./validate-audio";

const core = resolve(import.meta.dir, "../../../../content/core");

test("shared audio framing accepts offset views and enforces effect/music channels", async () => {
  const effect = new Uint8Array(
    await Bun.file(
      resolve(core, "factions/eastern-collective/units/dragon-tank/dragon-tank.fire.ogg"),
    ).arrayBuffer(),
  );
  const padded = new Uint8Array(effect.length + 31);
  padded.set(effect, 17);
  const view = padded.subarray(17, effect.length + 17);
  expect(validateAudioContainer(view, true)).toEqual([]);
  expect(validateAudioContainer(view, false, true)).toEqual(["music tracks must be stereo"]);
  const music = new Uint8Array(
    await Bun.file(resolve(core, "music/command-board.ogg")).arrayBuffer(),
  );
  expect(validateAudioContainer(music, false, true)).toEqual([]);
  expect(validateAudioContainer(music, true)).toEqual([
    "unit, structure and prop sound effects must be mono",
  ]);
  view[view.length - 1]! ^= 1;
  expect(validateAudioContainer(view, true)).toEqual(["Ogg page checksum mismatch"]);
  expect(effect.at(-1)).not.toBe(view.at(-1));
  expect(validateAudioContainer(view.subarray(0, view.length - 10), true)[0]).toContain(
    "truncated",
  );
});
