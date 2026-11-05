import { expect, test } from "bun:test";
import { createCameraRecording, parseReplayCameras, replayCameraPose } from "./cameras";

const pose = { x: 10, y: 0, z: 20, alpha: 3, beta: 0.8, radius: 60 };
test("recording keeps actual same-tick camera edits, observed timing and independent copies", () => {
  const recorder = createCameraRecording(1);
  recorder.capture(20, pose);
  recorder.capture(20, { ...pose, x: 12 });
  recorder.capture(21, { ...pose, x: 14 });
  recorder.capture(19, pose);
  const [track] = recorder.snapshot();
  expect(track!.samples.map(({ tick, x }) => [tick, x])).toEqual([
    [20, 12],
    [21, 14],
  ]);
  track!.samples[0]!.x = 999;
  expect(recorder.snapshot()[0]!.samples[0]!.x).toBe(12);
  expect(parseReplayCameras(recorder.snapshot(), 21, [1, 2])).toEqual(recorder.snapshot());
});
test("camera seeking interpolates position, tilt and zoom using the shortest rotation across wrap", () => {
  const track = {
    seat: 1,
    samples: [
      { tick: 20, ...pose },
      { tick: 40, ...pose, x: 30, alpha: -3, beta: 1, radius: 40 },
    ],
  };
  expect(replayCameraPose(track, 19)).toBeUndefined();
  expect(replayCameraPose(track, 20)).toEqual(pose);
  expect(replayCameraPose(track, 30)).toMatchObject({ x: 20, beta: 0.9, radius: 50 });
  expect(replayCameraPose(track, 30)!.alpha).toBeCloseTo(Math.PI);
  expect(replayCameraPose(track, 100)).toMatchObject({ x: 30, radius: 40 });
  expect(replayCameraPose(track, 20)).toEqual(pose);
});
test("import rejects unknown seats/fields, duplicate ticks, unsafe poses and oversized annotation batches", () => {
  const sample = { tick: 0, ...pose },
    track = { seat: 1, samples: [sample] };
  for (const value of [
    null,
    [],
    [{ ...track, seat: 9 }],
    [track, track],
    [{ ...track, samples: [] }],
    [{ ...track, extra: 1 }],
    [{ ...track, samples: [sample, sample] }],
    ...[
      { tick: -1 },
      { tick: 101 },
      { tick: 0.5 },
      { x: NaN },
      { z: Infinity },
      { y: 1000001 },
      { alpha: 4 },
      { beta: 0 },
      { radius: 0 },
      { radius: 111 },
      { extra: true },
    ].map((change) => [{ ...track, samples: [{ ...sample, ...change }] }]),
    [{ ...track, samples: Array(144002).fill(sample) }],
  ])
    expect(() => parseReplayCameras(value, 100, [1, 2])).toThrow();
  expect(parseReplayCameras([track], 100, [1, 2])).toEqual([track]);
});
