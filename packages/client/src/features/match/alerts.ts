import type { GameplayDefinition, PresentedEntity, SeatSnapshot } from "@open-neo-rts/sim";
import { type MapPoint, minimapVision } from "./minimap-model";

export const PING_KINDS = ["attack", "defend", "on-my-way", "danger", "help"] as const;
export type PingKind = (typeof PING_KINDS)[number];
export type NoticeKind =
  | "under-attack"
  | "unit-ready"
  | "structure-ready"
  | "lost"
  | "announcement"
  | PingKind;
export interface MatchNotice extends MapPoint {
  id: number;
  tick: number;
  kind: NoticeKind;
  entity?: string;
  label?: string;
}

export function noticePoint(entity: PresentedEntity, definition?: GameplayDefinition): MapPoint {
  const [w = 0, h = 0] = definition?.kind === "structure" ? (definition.footprint ?? []) : [];
  const turned = (((entity.facing >>> 14) + 3) & 1) !== 0;
  return { x: entity.x / 1024 + (turned ? h : w) / 2, y: entity.y / 1024 + (turned ? w : h) / 2 };
}

/** Local presentation memory contains only the controlled seat's copied observations. */
export function createMatchNotices(
  force: number,
  definitions: ReadonlyMap<string, GameplayDefinition>,
  width: number,
  height: number,
) {
  let prior = new Map<string, PresentedEntity>(),
    tick = -1,
    sequence = 0,
    cursor = -1;
  let notices: MatchNotice[] = [];
  const legal = (point: MapPoint) =>
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= 0 &&
    point.y >= 0 &&
    point.x < width &&
    point.y < height;
  function add(kind: NoticeKind, point: MapPoint, entity?: string, label?: string) {
    if (!legal(point)) return false;
    // Coalesce repeated fire on one actor for five seconds; retain at most eight notices.
    if (
      entity &&
      notices.some((n) => n.entity === entity && n.kind === kind && tick - n.tick < 100)
    )
      return false;
    notices = [
      ...notices.slice(-7),
      { ...point, id: ++sequence, tick, kind, ...(entity && { entity }), ...(label && { label }) },
    ];
    cursor = -1;
    return true;
  }
  const point = (entity: PresentedEntity) => {
    return noticePoint(entity, definitions.get(entity.definition));
  };
  return {
    announce(label: string, point: MapPoint, kind: NoticeKind = "announcement") {
      if (tick < 0 || !label || !legal(point)) return false;
      const existing = notices.find(
        (entry) =>
          entry.kind === kind && !entry.label && entry.x === point.x && entry.y === point.y,
      );
      if (existing) notices = notices.filter((entry) => entry.id !== existing.id);
      return add(kind, point, existing?.entity, label);
    },
    update(snapshot: SeatSnapshot) {
      if (snapshot.mode !== "controlled") {
        prior.clear();
        notices = [];
        tick = -1;
        return;
      }
      if (snapshot.tick <= tick) return;
      const initialized = tick >= 0;
      tick = snapshot.tick;
      notices = notices.filter((notice) => tick - notice.tick < 400);
      const own = new Map(
        snapshot.entities.filter((e) => e.force === force).map((e) => [e.handle, { ...e }]),
      );
      for (const entity of own.values()) {
        const previous = prior.get(entity.handle);
        if (previous && entity.health < previous.health)
          add("under-attack", point(entity), entity.handle);
        const kind = definitions.get(entity.definition)?.kind;
        if (
          initialized &&
          entity.health > 0 &&
          kind === "structure" &&
          !entity.constructionSite &&
          previous?.constructionSite
        )
          add("structure-ready", point(entity), entity.handle);
        if (initialized && snapshot.productionExits?.includes(entity.handle))
          add("unit-ready", point(entity), entity.handle);
      }
      // Disappearance alone may mean a grant change, so only an actual permitted death is a loss.
      for (const event of snapshot.combatEvents ?? []) {
        if (event.type !== "death" || !event.entity || !prior.has(event.entity)) continue;
        add("lost", { x: event.x / 1024, y: event.y / 1024 }, event.entity);
      }
      prior = own;
    },
    ping(snapshot: SeatSnapshot, kind: PingKind, point: MapPoint) {
      if (snapshot.mode !== "controlled" || snapshot.tick !== tick || !legal(point)) return false;
      const vision = minimapVision(snapshot, width, height);
      if (!(vision[Math.floor(point.y) * width + Math.floor(point.x)] ?? 0)) return false;
      return add(kind, point);
    },
    entries: () => notices.slice().reverse(),
    next() {
      if (!notices.length) return undefined;
      cursor = (cursor + 1) % notices.length;
      return notices[notices.length - 1 - cursor];
    },
  };
}
