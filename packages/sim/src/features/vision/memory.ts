import { arr, int, validate } from "@open-neo-rts/content";
import { addString, addU32, type Hasher } from "@open-neo-rts/deterministic";
import { hasGrant, type Scope } from "../../commands";
import { type Kernel, register } from "../../kernel";
import type { MatchSetup } from "../../match";
import { strictObject } from "../../snapshots/schema";
import { ConstructionSite } from "../construction";
import { Health, OwnerForce, Template, Transform } from "../entities";

/** Authoritative IDs stay inside the host. Projectors allocate their own opaque ghost handles. */
export interface StructureMemory {
  entity: number;
  definition: number;
  force: number;
  x: number;
  y: number;
  facing: number;
  health: number;
  site: number;
  seen: number;
}
export interface VisibilityMemoryState {
  format: 1;
  groups: { id: number; records: StructureMemory[] }[];
}
const kind = (id: string) => id.split(":")[0]?.split(".").at(-1);

/** Force-owned observations survive projector recreation. Hidden World state never edits memory. */
export class VisibilityMemory {
  private readonly groups = new Map<
    number,
    { force: number; records: Map<number, StructureMemory> }
  >();

  constructor(
    private readonly kernel: Kernel,
    private readonly setup: MatchSetup,
  ) {
    for (const force of [...setup.forces].sort((a, b) => a.index - b.index)) {
      const group = kernel.vision?.groupForForce(force.index);
      if (group !== undefined && !this.groups.has(group))
        this.groups.set(group, { force: force.index, records: new Map() });
    }
  }

  forcesForSeat(seat: number, tick = this.kernel.tick): number[] {
    if (!this.setup.seats.includes(seat)) return [];
    return this.setup.forces
      .map((force) => force.index)
      .filter((force) =>
        this.setup.grants.some(
          (grant) =>
            grant.seat === seat &&
            grant.force === force &&
            grant.scopes.length > 0 &&
            grant.grantedAtTick <= tick &&
            (grant.revokedAtTick === undefined || tick < grant.revokedAtTick) &&
            (grant.expiresAtTick === undefined || tick < grant.expiresAtTick),
        ),
      )
      .sort((a, b) => a - b);
  }

  groupsForSeat(seat: number, tick = this.kernel.tick): { group: number; force: number }[] {
    const groups = new Map<number, number>();
    for (const force of this.forcesForSeat(seat, tick)) {
      const group = this.kernel.vision?.groupForForce(force);
      if (group !== undefined) groups.set(group, force);
    }
    return [...groups].sort(([a], [b]) => a - b).map(([group, force]) => ({ group, force }));
  }

  permits(seat: number, force: number, scope: Scope, tick = this.kernel.tick): boolean {
    return this.setup.seats.includes(seat) && hasGrant(this.setup.grants, seat, force, scope, tick);
  }

  canSeeEntity(seat: number, entity: number, tick = this.kernel.tick): boolean {
    const { world } = this.kernel;
    if (!world.isAlive(entity) || !world.has(entity, OwnerForce)) return false;
    return (
      this.forcesForSeat(seat, tick).includes(world.get(entity, OwnerForce, "force")) ||
      this.groupsForSeat(seat, tick).some(({ force }) =>
        this.kernel.vision?.canSeeEntity(force, entity),
      )
    );
  }

  canSeeCell(seat: number, x: number, y: number, tick = this.kernel.tick): boolean {
    return this.groupsForSeat(seat, tick).some(({ force }) =>
      this.kernel.vision?.canSeeCell(force, x, y),
    );
  }

  recordsForSeat(
    seat: number,
    tick = this.kernel.tick,
  ): { group: number; record: StructureMemory }[] {
    const records = new Map<number, { group: number; record: StructureMemory }>();
    for (const { group } of this.groupsForSeat(seat, tick))
      for (const record of this.groups.get(group)?.records.values() ?? []) {
        const previous = records.get(record.entity);
        if (!previous || previous.record.seen < record.seen)
          records.set(record.entity, { group, record: { ...record } });
      }
    return [...records.values()].sort(
      (a, b) => a.group - b.group || a.record.entity - b.record.entity,
    );
  }

  update(): void {
    const { world, vision } = this.kernel;
    if (!vision) return;
    const structures = world
      .query(Template, Transform, OwnerForce, Health)
      .filter(
        (id) =>
          kind(this.setup.definitions[world.get(id, Template, "definition")]?.id ?? "") ===
            "structure" && world.get(id, Health, "current") > 0,
      );
    for (const [group, memory] of this.groups) {
      const observed = new Set<number>();
      for (const entity of structures) {
        if (!vision.canSeeEntity(memory.force, entity)) continue;
        observed.add(entity);
        const force = world.get(entity, OwnerForce, "force");
        if (vision.groupForForce(force) === group) {
          memory.records.delete(entity);
          continue;
        }
        memory.records.set(entity, {
          entity,
          definition: world.get(entity, Template, "definition"),
          force,
          x: world.get(entity, Transform, "x"),
          y: world.get(entity, Transform, "y"),
          facing: world.get(entity, Transform, "facing"),
          health: world.get(entity, Health, "current"),
          site: world.has(entity, ConstructionSite) ? 1 : 0,
          seen: this.kernel.tick,
        });
      }
      for (const [entity, record] of memory.records) {
        if (observed.has(entity)) continue;
        const definition = this.setup.definitions[record.definition];
        const [w = 1, h = 1] = definition?.footprint ?? [];
        const turned = (((record.facing >>> 14) + 3) & 1) !== 0;
        let reobserved = false;
        for (let y = 0; y < (turned ? w : h); y++)
          for (let x = 0; x < (turned ? h : w); x++)
            if (
              vision.canSeeCell(
                memory.force,
                Math.floor(record.x / 1024) + x,
                Math.floor(record.y / 1024) + y,
              )
            )
              reobserved = true;
        if (reobserved) memory.records.delete(entity);
      }
    }
  }

  serialize(): VisibilityMemoryState {
    return {
      format: 1,
      groups: [...this.groups].map(([id, group]) => ({
        id,
        records: [...group.records.values()]
          .sort((a, b) => a.entity - b.entity)
          .map((record) => ({ ...record })),
      })),
    };
  }

  /** Same-match memory restore only; outer save identity and World restore are separate contracts. */
  load(value: unknown): void {
    const u32 = () => int(0, 0xffffffff);
    const schema = strictObject({
      format: int(1, 1),
      groups: arr(
        strictObject({
          id: int(0, 0x7fffffff),
          records: arr(
            strictObject({
              entity: int(1, 0xfffffffe),
              definition: int(0, this.setup.definitions.length - 1),
              force: int(0, 0x7fffffff),
              x: int(0, (this.kernel.map?.terrain.width ?? 0) * 1024 - 1),
              y: int(0, (this.kernel.map?.terrain.height ?? 0) * 1024 - 1),
              facing: int(0, 0xffff),
              health: u32(),
              site: int(0, 1),
              seen: int(0, this.kernel.tick),
            }),
          ),
        }),
        this.groups.size,
        this.groups.size,
      ),
    });
    if (validate(schema, value).length) throw new Error("Invalid visibility memory");
    const state = value as VisibilityMemoryState;
    const groups = [...this.groups.keys()];
    for (const [i, group] of state.groups.entries()) {
      if (group.id !== groups[i]) throw new Error("Invalid visibility memory group");
      let previous = 0;
      for (const record of group.records) {
        if (
          record.entity <= previous ||
          kind(this.setup.definitions[record.definition]?.id ?? "") !== "structure" ||
          !this.setup.forces.some((force) => force.index === record.force) ||
          record.health === 0 ||
          record.x % 1024 ||
          record.y % 1024 ||
          record.facing % 0x4000
        )
          throw new Error("Invalid visibility memory record");
        previous = record.entity;
      }
    }
    for (const group of state.groups) {
      const target = this.groups.get(group.id);
      if (!target) throw new Error("Invalid visibility memory group");
      target.records.clear();
      for (const record of group.records) target.records.set(record.entity, { ...record });
    }
  }

  hashInto(hasher: Hasher): void {
    addString(hasher, "visibility-memory:1");
    addU32(hasher, this.groups.size);
    for (const [group, memory] of this.groups) {
      addU32(hasher, group);
      addU32(hasher, memory.records.size);
      for (const record of [...memory.records.values()].sort((a, b) => a.entity - b.entity))
        for (const value of [
          record.entity,
          record.definition,
          record.force,
          record.x,
          record.y,
          record.facing,
          record.health,
          record.site,
          record.seen,
        ])
          addU32(hasher, value);
    }
  }
}

export function initializeVisibilityMemory(kernel: Kernel, setup: MatchSetup): void {
  if (kernel.visibility) throw new Error("Visibility memory is already initialized");
  const visibility = new VisibilityMemory(kernel, setup);
  kernel.visibility = visibility;
  register(kernel, { systems: { destruction: [() => visibility.update()] } });
  visibility.update();
}
