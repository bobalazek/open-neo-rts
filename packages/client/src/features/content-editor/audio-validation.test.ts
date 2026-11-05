import { expect, test } from "bun:test";
import { checkEditorAudio } from "./audio-validation";

test("offline audio checks preserve export bytes, reject silent/unsafe samples and report decoder failures", async () => {
  const original = Reflect.get(globalThis, "OfflineAudioContext");
  let samples = new Float32Array([0.2, -0.5]),
    fail = false;
  Reflect.set(
    globalThis,
    "OfflineAudioContext",
    class {
      async decodeAudioData(bytes: ArrayBuffer) {
        structuredClone(bytes, { transfer: [bytes] });
        if (fail) throw new Error("unsupported codec");
        return { length: samples.length, numberOfChannels: 1, getChannelData: () => samples };
      }
    },
  );
  try {
    const bytes = new Uint8Array([3, 4, 5]);
    expect(await checkEditorAudio(bytes)).toEqual([]);
    expect(bytes).toEqual(new Uint8Array([3, 4, 5]));
    samples = new Float32Array([0, 0]);
    expect((await checkEditorAudio(bytes)).join()).toContain("silent");
    samples = new Float32Array([0.95]);
    expect((await checkEditorAudio(bytes)).join()).toContain("sample peak");
    samples = new Float32Array([Number.NaN]);
    expect((await checkEditorAudio(bytes)).join()).toContain("non-finite");
    fail = true;
    expect((await checkEditorAudio(bytes)).join()).toContain(
      "audio decoding failed: unsupported codec",
    );
  } finally {
    if (original === undefined) Reflect.deleteProperty(globalThis, "OfflineAudioContext");
    else Reflect.set(globalThis, "OfflineAudioContext", original);
  }
});
