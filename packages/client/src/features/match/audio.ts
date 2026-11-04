import { CELL_SIZE, type createAudioMixer, eventVisible } from "@open-neo-rts/render";
import type { PresentedEntity, SeatSnapshot } from "@open-neo-rts/sim";

/** Only permitted snapshots and data-authored presentation references reach the mixer. */
export function createMatchAudio(
  mixer: Pick<ReturnType<typeof createAudioMixer>, "scope">,
  sounds: ReadonlyMap<string, Readonly<Record<string, string>>>,
) {
  const scope = mixer.scope();
  let tick = -1,
    prior = new Map<string, PresentedEntity>(),
    impacts = new Map<string, string>(),
    group: string | undefined;
  return {
    accept(snapshot: SeatSnapshot, active: boolean) {
      const nextGroup = `${snapshot.mode}:${snapshot.fog?.map((grid) => grid.group).join(",") ?? ""}`;
      if (snapshot.tick < tick || (group !== undefined && nextGroup !== group)) {
        scope.stop();
        tick = -1;
        prior.clear();
        impacts.clear();
      }
      group = nextGroup;
      if (!active) impacts.clear();
      scope.retain(
        (position) =>
          active &&
          (!position ||
            eventVisible(
              snapshot,
              (position.x * 1024) / CELL_SIZE,
              (position.z * 1024) / CELL_SIZE,
            )),
      );
      if (snapshot.tick <= tick) return;
      const initialized = tick >= 0;
      tick = snapshot.tick;
      const current = new Map(snapshot.entities.map((entity) => [entity.handle, entity]));
      const flying = new Map<string, string>();
      if (active && initialized)
        for (const event of snapshot.combatEvents ?? []) {
          if (!eventVisible(snapshot, event.x, event.y)) continue;
          let source: string | undefined;
          if (event.type === "launch" || event.type === "death") {
            const entity = event.entity && (current.get(event.entity) ?? prior.get(event.entity));
            const clips = entity ? sounds.get(entity.definition) : undefined;
            source = clips?.[event.type === "launch" ? "fire" : "death"];
            if (event.type === "launch" && event.handle && clips?.impact) {
              impacts.set(event.handle, clips.impact);
              flying.set(event.handle, clips.impact);
            }
          } else if (event.type === "flight" && event.handle) {
            const impact = impacts.get(event.handle);
            if (impact) flying.set(event.handle, impact);
          } else if (event.type === "impact" && event.handle) {
            source = impacts.get(event.handle);
            impacts.delete(event.handle);
            flying.delete(event.handle);
          }
          if (source)
            void scope
              .play(source, {
                bus: "effects",
                priority: event.type === "launch" ? 0 : 1,
                position: {
                  x: (event.x * CELL_SIZE) / 1024,
                  y: 0,
                  z: (event.y * CELL_SIZE) / 1024,
                },
              })
              .catch(() => {});
        }
      // A missing round is unknown; never carry its sound identity through hidden space.
      impacts = flying;
      prior = new Map(snapshot.entities.map((entity) => [entity.handle, { ...entity }]));
    },
    dispose: scope.dispose,
  };
}
