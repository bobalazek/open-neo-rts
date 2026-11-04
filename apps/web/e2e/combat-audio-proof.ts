/// <reference path="../../../packages/client/src/assets.d.ts" />

import { builtins } from "virtual:debug-builtins";
import { createMatchAudio } from "../../../packages/client/src/features/match/audio";
import { createOfflineMatch, type OfflineState } from "../../../packages/client/src/worker";
import { AudioEngineV2 } from "../../../packages/render/node_modules/@babylonjs/core/index.js";
import { createAudioMixer } from "../../../packages/render/src/effects/audio";
import type { MatchSetup } from "../../../packages/sim/src";

/** Actual catalog URLs, normal worker events and decoded Babylon output; no app-only test hooks. */
export function mount(setup: MatchSetup) {
  const button = document.createElement("button");
  button.textContent = "Start combat audio";
  document.body.append(button);
  button.onclick = async () => {
    const mixer = createAudioMixer();
    await mixer.unlock();
    const played: string[] = [];
    const audio = createMatchAudio(
      {
        scope() {
          const scope = mixer.scope();
          return {
            ...scope,
            async play(source, options) {
              const result = await scope.play(source, options);
              if (result && typeof source === "string") played.push(source);
              return result;
            },
          };
        },
      },
      new Map(
        builtins.map((entry) => [`core.${(entry.raw as { id: string }).id}`, entry.sounds ?? {}]),
      ),
    );
    let state: OfflineState | undefined;
    const match = createOfflineMatch((next) => {
      state = next;
      audio.accept(next.snapshot, true);
    });
    await match.init({ setup, seat: 1, mode: "controlled" });
    Reflect.set(window, "combatAudio", {
      played,
      project: (snapshot: OfflineState["snapshot"]) => audio.accept(snapshot, true),
      state: () => state,
      async step() {
        await match.step();
      },
      async command(type: string, payload: unknown) {
        const pending = match.command(type, payload);
        await match.step();
        return pending;
      },
      engine: AudioEngineV2.Instances.at(-1),
      dispose() {
        match.dispose();
        audio.dispose();
        mixer.dispose();
      },
    });
    button.textContent = "Combat audio ready";
  };
}
