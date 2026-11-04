/// <reference path="./gltf-validator.d.ts" />
import { parseGlb } from "./glb";
import {
  type ModelIssue,
  type ModelKind,
  type ModelRequirements,
  validateModel,
} from "./validate-model";

/** A separate entry point keeps the optional authoring validator out of simulation imports. */
export async function validateAssetGlb(
  bytes: Uint8Array,
  file: string,
  model?: { kind: ModelKind; requires: ModelRequirements },
): Promise<ModelIssue[]> {
  const issues: ModelIssue[] = [];
  try {
    const { validateBytes } = await import("gltf-validator");
    const report = await validateBytes(bytes, {
      uri: file,
      writeTimestamp: false,
      externalResourceFunction: async () => new Uint8Array(),
    });
    for (const issue of report.issues.messages)
      if (issue.severity === 0) issues.push({ level: "error", message: `glTF: ${issue.message}` });
  } catch (error) {
    issues.push({ level: "error", message: `glTF: ${String(error)}` });
  }
  try {
    const folders = file.split("/");
    const kind: ModelKind = /\.(wreck|rubble)\.glb$/.test(file)
      ? "wreck"
      : folders.includes("structures")
        ? "structure"
        : folders.includes("units")
          ? "unit"
          : "prop";
    issues.push(...validateModel(parseGlb(bytes), model?.kind ?? kind, model?.requires));
  } catch (error) {
    issues.push({
      level: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return issues;
}
