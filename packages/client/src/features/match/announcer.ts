import type { createAudioMixer } from "@open-neo-rts/render";
import type { GameplayDefinition, PresentedEntity, SeatSnapshot } from "@open-neo-rts/sim";
import { type NoticeKind, noticePoint } from "./alerts";
import type { MapPoint } from "./minimap-model";

export interface AnnouncerLine {
  text: string;
  priority: number;
  cooldown: number;
  start: number;
  duration: number;
}
interface Announcement {
  key: string;
  kind: NoticeKind;
  line: AnnouncerLine;
  point?: MapPoint;
  received: number;
}

/** Client-only voice/subtitle owner. It sees the same copied observations as the HUD. */
export function createMatchAnnouncer(options: {
  force: number;
  definitions: ReadonlyMap<string, GameplayDefinition>;
  groups: (index: number) => readonly string[];
  source: string;
  lines: Readonly<Record<string, AnnouncerLine>>;
  mixer?: Pick<ReturnType<typeof createAudioMixer>, "scope">;
  subtitle: (text: string) => void;
  notice: (text: string, point: MapPoint, kind: NoticeKind) => void;
}) {
  const scope = options.mixer?.scope();
  const cooldowns = new Map<string, number>();
  let current: { item: Announcement; token: number; deadline: number } | undefined;
  let queue: Announcement[] = [];
  let prior = new Map<string, PresentedEntity>();
  let tick = -1,
    now = 0,
    token = 0,
    active = false,
    closed = false,
    ended = false;
  let brownout = false,
    base: MapPoint | undefined;
  function clear() {
    token++;
    scope?.stop();
    current = undefined;
    queue = [];
    options.subtitle("");
  }
  function finish(ticket: number) {
    if (closed || current?.token !== ticket) return;
    scope?.stop();
    current = undefined;
    options.subtitle("");
    pump();
  }
  function start(item: Announcement) {
    const ticket = ++token;
    current = {
      item,
      token: ticket,
      // A cold decode gets the same freshness window as a queued line.
      deadline: now + Math.max(scope ? 3000 : 1800, item.line.duration * 1000 + 250),
    };
    cooldowns.set(item.key, now);
    options.subtitle(item.line.text);
    if (item.point) options.notice(item.line.text, item.point, item.kind);
    void scope
      ?.play(options.source, {
        bus: "announcer",
        priority: item.line.priority,
        clip: { start: item.line.start, duration: item.line.duration },
        onEnded: () => finish(ticket),
      })
      .then((played) => {
        if (current?.token === ticket)
          current.deadline = now + Math.max(played ? 0 : 1800, item.line.duration * 1000 + 250);
      })
      .catch(() => {});
  }
  function pump() {
    queue = queue.filter((item) => now - item.received <= 3000);
    if (active && !current && queue[0]) start(queue.shift()!);
  }
  function say(id: string, point = base, key = id) {
    const line = options.lines[id];
    if (
      !line ||
      !active ||
      closed ||
      now - (cooldowns.get(key) ?? -Infinity) < line.cooldown * 1000 ||
      current?.item.key === key ||
      queue.some((item) => item.key === key)
    )
      return;
    const kind: NoticeKind =
      id.includes("attack") || id.startsWith("group-")
        ? "under-attack"
        : id === "construction-complete"
          ? "structure-ready"
          : id === "unit-ready"
            ? "unit-ready"
            : id.endsWith("lost")
              ? "lost"
              : "announcement";
    const item: Announcement = { key, kind, line, point, received: now };
    if (!current) start(item);
    else if (line.priority === 3 || line.priority > current.item.line.priority) {
      scope?.stop();
      queue = [];
      start(item);
    } else if (line.priority === current.item.line.priority && queue.length < 2) queue.push(item);
  }
  const point = (entity: PresentedEntity) =>
    noticePoint(entity, options.definitions.get(entity.definition));
  return {
    frame(time: number, enabled: boolean) {
      now = time;
      active = enabled && !closed;
      if (!active) {
        if (current || queue.length) clear();
        return;
      }
      if (current && now >= current.deadline) finish(current.token);
      pump();
    },
    accept(snapshot: SeatSnapshot, enabled: boolean, time: number) {
      now = time;
      if (closed) return;
      if (snapshot.tick < tick || snapshot.mode !== "controlled") {
        clear();
        prior.clear();
        cooldowns.clear();
        tick = -1;
        ended = false;
        brownout = false;
        base = undefined;
      }
      active = enabled && snapshot.mode === "controlled";
      if (!active && (current || queue.length)) clear();
      if (snapshot.mode !== "controlled") return;
      const fresh = snapshot.tick > tick,
        initialized = tick >= 0;
      const own = snapshot.entities.filter((entity) => entity.force === options.force);
      const buildings = own.filter(
        (entity) =>
          !entity.constructionSite &&
          options.definitions.get(entity.definition)?.kind === "structure",
      );
      const anchor =
        buildings.find(
          (entity) => options.definitions.get(entity.definition)?.role === "headquarters",
        ) ??
        buildings[0] ??
        own[0];
      if (anchor) base = point(anchor);
      const result = snapshot.victory?.result;
      if (result && active && !ended) {
        ended = true;
        const team = snapshot.victory?.forces.find((force) => force.force === options.force)?.team;
        say(result.winner === null ? "draw" : result.winner === team ? "victory" : "defeat");
      }
      if (fresh && initialized && active && !result) {
        const team = snapshot.victory?.forces.find((force) => force.force === options.force)?.team;
        for (const entity of snapshot.entities) {
          const before = prior.get(entity.handle),
            definition = options.definitions.get(entity.definition);
          if (!definition) continue;
          const location = point(entity);
          if (before && entity.health < before.health) {
            if (entity.force === options.force) {
              if (definition.kind === "structure") say("base-attack", location);
              else if (definition.role === "harvester") say("harvester-attack", location);
              else {
                const group = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].find((index) =>
                  options.groups(index).includes(entity.handle),
                );
                if (group !== undefined) say(`group-${group}`, location);
                else if (
                  !buildings.some((building) => {
                    const origin = point(building);
                    return (location.x - origin.x) ** 2 + (location.y - origin.y) ** 2 <= 36;
                  })
                )
                  say(
                    "unit-attack",
                    location,
                    `unit-attack:${Math.floor(location.x / 8)},${Math.floor(location.y / 8)}`,
                  );
              }
            } else if (
              definition.kind === "structure" &&
              team !== undefined &&
              snapshot.victory?.forces.some(
                (force) => force.force === entity.force && force.team === team,
              )
            )
              say("ally-attack", location);
          }
          if (entity.force !== options.force) continue;
          if (
            entity.health > 0 &&
            definition.kind === "structure" &&
            !entity.constructionSite &&
            before?.constructionSite
          )
            say("construction-complete", location, `construction-complete:${entity.handle}`);
          if (snapshot.productionExits?.includes(entity.handle)) say("unit-ready", location);
          for (const item of entity.production?.queue ?? []) {
            const previous = before?.production?.queue.find(
              (entry) => entry.handle === item.handle,
            );
            if (
              item.state !== previous?.state &&
              (item.state === "funds" || item.state === "population")
            )
              say(item.state, location);
          }
        }
        for (const event of snapshot.combatEvents ?? []) {
          const before = event.entity && prior.get(event.entity);
          if (event.type !== "death" || !before || before.force !== options.force) continue;
          say(
            options.definitions.get(before.definition)?.kind === "structure"
              ? "structure-lost"
              : "unit-lost",
            { x: event.x / 1024, y: event.y / 1024 },
          );
        }
        if (!brownout && snapshot.power?.find((power) => power.force === options.force)?.brownout)
          say("power");
      }
      if (fresh) {
        tick = snapshot.tick;
        brownout = !!snapshot.power?.find((power) => power.force === options.force)?.brownout;
        prior = new Map(
          snapshot.entities.map((entity) => [
            entity.handle,
            {
              ...entity,
              ...(entity.production && {
                production: {
                  ...entity.production,
                  queue: entity.production.queue.map((item) => ({ ...item })),
                },
              }),
            },
          ]),
        );
      }
    },
    dispose() {
      closed = true;
      clear();
      scope?.dispose();
      prior.clear();
      cooldowns.clear();
    },
  };
}
