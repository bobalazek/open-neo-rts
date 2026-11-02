/// <reference path="../../../packages/client/src/assets.d.ts" />
import { content } from "virtual:normal-catalog";
import { createMatchHud } from "../../../packages/client/src/features/match/hud";
import { createOfflineMatch, type OfflineState } from "../../../packages/client/src/worker";
import type { MatchSetup } from "../../../packages/sim/src";

/** Real catalog and worker; only the starting kit is expanded for this bounded UI fixture. */
export async function start(setup: MatchSetup) {
  if (!content.catalog) throw new Error(content.error ?? "Missing actual catalog");
  const canvas = document.querySelector<HTMLCanvasElement>("canvas");
  if (!canvas) throw new Error("Missing canvas");
  const abort = new AbortController();
  let state: OfflineState | undefined,
    selection: string[] = [];
  const errors: string[] = [];
  const match = createOfflineMatch(
    (next) => {
      state = next;
      hud.update(next);
    },
    (error) => errors.push(error.message),
  );
  const command = async (type: string, payload: unknown) => {
    const result = match.command(type, payload);
    await match.step();
    return result;
  };
  const hud = createMatchHud(
    canvas,
    document.body,
    {
      catalog: content.catalog.definitions.map((gameplay) => ({
        gameplay,
        name: gameplay.id.endsWith("/dragon-tank")
          ? "Dragon Tank"
          : gameplay.id.endsWith("/metamorphic-apc")
            ? "Metamorphic APC"
            : gameplay.id,
        description: "",
      })),
      roster: new Set(content.catalog.definitions.map((definition) => definition.id)),
      resources: setup.map.resources ?? [],
      force: 0,
      populationCap: 200,
      selection: () => selection,
      select: (handles) => {
        selection = [...handles];
        hud.update();
      },
      pick: () => null,
      pickCell: () => null,
      command,
      preview: () => {},
      paused: () => false,
      fail: (error) => errors.push(String(error)),
    },
    abort.signal,
  );
  await match.init({ setup, seat: 1, mode: "controlled" });
  return {
    state: () => state,
    errors: () => errors,
    command,
    select(ids: string[]) {
      selection =
        state?.snapshot.entities
          .filter((entity) => entity.force === 0 && ids.includes(entity.definition))
          .map((entity) => entity.handle) ?? [];
      hud.update();
    },
    async step(ticks: number) {
      for (let i = 0; i < ticks; i++) await match.step();
    },
    record: () => match.exportMatchRecord(),
    dispose() {
      abort.abort();
      match.dispose();
    },
  };
}
