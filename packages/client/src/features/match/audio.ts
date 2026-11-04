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
    group: string | undefined;
  return {
    accept(snapshot: SeatSnapshot, active: boolean) {
      const nextGroup = `${snapshot.mode}:${snapshot.fog?.map((grid) => grid.group).join(",") ?? ""}`;
      if (snapshot.tick < tick || (group !== undefined && nextGroup !== group)) {
        scope.stop();
        tick = -1;
        prior.clear();
      }
      group = nextGroup;
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
      if (active && initialized)
        for (const event of snapshot.combatEvents ?? []) {
          if (
            (event.type !== "launch" && event.type !== "death") ||
            !event.entity ||
            !eventVisible(snapshot, event.x, event.y)
          )
            continue;
          const entity = current.get(event.entity) ?? prior.get(event.entity);
          const source =
            entity && sounds.get(entity.definition)?.[event.type === "launch" ? "fire" : "death"];
          if (source)
            void scope
              .play(source, {
                bus: "effects",
                priority: event.type === "death" ? 1 : 0,
                position: {
                  x: (event.x * CELL_SIZE) / 1024,
                  y: 0,
                  z: (event.y * CELL_SIZE) / 1024,
                },
              })
              .catch(() => {});
        }
      prior = new Map(snapshot.entities.map((entity) => [entity.handle, { ...entity }]));
    },
    dispose: scope.dispose,
  };
}
