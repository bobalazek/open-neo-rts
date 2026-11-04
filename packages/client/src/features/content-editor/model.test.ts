import { expect, test } from "bun:test";
import { modelRequirements, parseGlb, validateModel } from "@open-neo-rts/content";
import { inspectModel, installedModel, MODEL_FILE_LIMIT } from "./model";

test("model inspection uses authored CLI requirements and preserves actual asset inventory", async () => {
  const folder = new URL(
    "../../../../../content/core/factions/eastern-collective/units/dragon-tank/",
    import.meta.url,
  );
  const raw = await Bun.file(new URL("unit.json", folder)).json();
  const bytes = new Uint8Array(await Bun.file(new URL("dragon-tank.glb", folder)).arrayBuffer());
  const report = inspectModel(bytes, "unit", raw);
  expect(report.issues).toEqual(
    validateModel(parseGlb(bytes), "unit", modelRequirements(raw, raw.presentation, "unit")),
  );
  expect(report.clips).toContain("idle");
  expect(report.clips).toContain("move");
  expect(report.clips).toContain("attack");
  expect(report.sockets).toContain("socket_muzzle_0");
  expect(report.materials).toContain("team");
  const required = structuredClone(raw);
  required.presentation.sockets.push("socket_missing");
  expect(
    inspectModel(bytes, "unit", required).issues.some(
      (issue) => issue.level === "error" && issue.message.includes("socket_missing"),
    ),
  ).toBe(true);
});

test("model links are installed-only and local model files have a real size/format boundary", () => {
  const entries = [{ id: "core.unit:fixture/tank", model: "/tank.glb" }];
  expect(installedModel(entries, entries[0]!.id)).toBe(entries[0]!.id);
  expect(installedModel(entries, "/tank.glb")).toBe(entries[0]!.id);
  expect(() => installedModel(entries, "https://other.invalid/tank.glb")).toThrow("Unknown");
  expect(() => inspectModel(new Uint8Array(5), "unit")).toThrow();
  expect(() => inspectModel(new Uint8Array(MODEL_FILE_LIMIT + 1), "unit")).toThrow("16 MiB");
});
