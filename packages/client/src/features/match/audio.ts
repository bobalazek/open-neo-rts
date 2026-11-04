import { CELL_SIZE, type createAudioMixer, eventVisible } from "@open-neo-rts/render";
import type { PresentedEntity, SeatSnapshot } from "@open-neo-rts/sim";

type AudioScope = ReturnType<ReturnType<typeof createAudioMixer>["scope"]>;
interface WorkCue {
  kind: "build" | "harvest" | "unload";
  source: string;
  progress: number;
  interval: number;
  x: number;
  y: number;
}

/** Only permitted snapshots and data-authored presentation references reach the mixer. */
export function createMatchAudio(
  mixer: Pick<ReturnType<typeof createAudioMixer>, "scope">,
  sounds: ReadonlyMap<string, Readonly<Record<string, string>>>,
) {
  const scope = mixer.scope();
  const work = new Map<string, { cue: WorkCue; scope: AudioScope; played: number }>();
  function stopWork() {
    for (const job of work.values()) job.scope.dispose();
    work.clear();
  }
  function play(owner: AudioScope, source: string, x: number, y: number, priority = 0) {
    void owner
      .play(source, {
        bus: "effects",
        priority,
        position: { x: (x * CELL_SIZE) / 1024, y: 0, z: (y * CELL_SIZE) / 1024 },
      })
      .catch(() => {});
  }
  let tick = -1,
    prior = new Map<string, PresentedEntity>(),
    impacts = new Map<string, string>(),
    group: string | undefined;
  return {
    accept(snapshot: SeatSnapshot, active: boolean) {
      const nextGroup = `${snapshot.mode}:${snapshot.fog?.map((grid) => grid.group).join(",") ?? ""}`;
      if (snapshot.tick < tick || (group !== undefined && nextGroup !== group)) {
        scope.stop();
        stopWork();
        tick = -1;
        prior.clear();
        impacts.clear();
      }
      group = nextGroup;
      if (!active) impacts.clear();
      const fresh = snapshot.tick > tick;
      const initialized = tick >= 0;
      const current = new Map(snapshot.entities.map((entity) => [entity.handle, entity]));
      const jobs = new Map<string, WorkCue>();
      if (active)
        for (const entity of snapshot.entities) {
          if (entity.disabled || !eventVisible(snapshot, entity.x, entity.y)) continue;
          const clips = sounds.get(entity.definition);
          const kind = entity.workAnimation;
          if (kind && clips?.[kind]) {
            const before = prior.get(entity.handle);
            const progress = kind === "unload" ? (entity.workProgressTicks ?? 0) : snapshot.tick;
            if (
              kind === "unload" &&
              before?.workAnimation === "unload" &&
              progress <= (before.workProgressTicks ?? 0) &&
              fresh
            )
              continue;
            jobs.set(entity.handle, {
              kind,
              source: clips[kind]!,
              progress,
              interval: kind === "unload" ? 10 : 20,
              x: entity.x,
              y: entity.y,
            });
          }
          const order = entity.constructionOrder;
          const target =
            entity.buildTarget ?? (order?.state === "working" ? order.site : undefined);
          const site = target ? current.get(target) : undefined;
          const progress = site?.construction;
          if (
            !clips?.build ||
            !site?.constructionSite ||
            !(entity.buildTarget || progress?.buildersWorking) ||
            !eventVisible(snapshot, site.x, site.y) ||
            jobs.has(site.handle)
          )
            continue;
          const before = prior.get(site.handle)?.construction;
          const completed = progress
            ? progress.completedTicks * 4 + progress.quarter
            : snapshot.tick * 4;
          if (
            fresh &&
            progress &&
            before &&
            completed <= before.completedTicks * 4 + before.quarter
          )
            continue;
          jobs.set(site.handle, {
            kind: "build",
            source: clips.build,
            progress: completed,
            interval: 48,
            x: site.x,
            y: site.y,
          });
        }
      if (active && initialized && fresh) {
        const completed = new Set<string>();
        for (const builder of prior.values()) {
          const handle = builder.buildTarget ?? builder.constructionOrder?.site;
          if (!handle || completed.has(handle)) continue;
          const before = prior.get(handle),
            after = current.get(handle);
          const source = sounds.get(builder.definition)?.build_complete;
          if (
            source &&
            before?.constructionSite &&
            after &&
            !after.constructionSite &&
            after.definition === before.definition &&
            after.force === before.force &&
            eventVisible(snapshot, after.x, after.y)
          ) {
            play(scope, source, after.x, after.y, 1);
            completed.add(handle);
          }
        }
      }
      for (const [handle, job] of work) {
        const next = jobs.get(handle);
        if (
          !next ||
          next.kind !== job.cue.kind ||
          next.source !== job.cue.source ||
          next.progress < job.cue.progress
        ) {
          job.scope.dispose();
          work.delete(handle);
        } else
          job.scope.retain(
            (position) =>
              !position ||
              eventVisible(
                snapshot,
                (position.x * 1024) / CELL_SIZE,
                (position.z * 1024) / CELL_SIZE,
              ),
          );
      }
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
      if (!fresh) {
        for (const handle of prior.keys()) {
          const entity = current.get(handle);
          if (!entity || !eventVisible(snapshot, entity.x, entity.y)) prior.delete(handle);
          else if (prior.get(handle)?.buildTarget !== entity.buildTarget) {
            const { buildTarget: _buildTarget, ...retained } = prior.get(handle)!;
            prior.set(handle, retained);
          }
        }
        return;
      }
      tick = snapshot.tick;
      if (active && initialized)
        for (const [handle, cue] of jobs) {
          let job = work.get(handle);
          if (!job) {
            job = { cue, scope: mixer.scope(), played: cue.progress - cue.interval };
            work.set(handle, job);
          }
          job.cue = cue;
          if (cue.progress - job.played >= cue.interval) {
            play(job.scope, cue.source, cue.x, cue.y);
            job.played = cue.progress;
          }
        }
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
          if (source) play(scope, source, event.x, event.y, event.type === "launch" ? 0 : 1);
        }
      // A missing round is unknown; never carry its sound identity through hidden space.
      impacts = flying;
      prior = new Map(
        snapshot.entities
          .filter((entity) => eventVisible(snapshot, entity.x, entity.y))
          .map((entity) => [
            entity.handle,
            {
              ...entity,
              ...(entity.construction && { construction: { ...entity.construction } }),
              ...(entity.constructionOrder && {
                constructionOrder: { ...entity.constructionOrder },
              }),
            },
          ]),
      );
    },
    dispose() {
      stopWork();
      scope.dispose();
    },
  };
}
