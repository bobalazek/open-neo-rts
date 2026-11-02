// Human-equivalent observation/catalog contract and first Eastern Collective economy policy.
import { isqrt } from "@open-neo-rts/deterministic";
export interface PolicyDefinition {
  readonly id: string;
  readonly role?: string;
  readonly speed?: number;
  readonly footprint?: readonly [number, number];
  readonly builds?: readonly string[];
  readonly produces?: readonly string[];
  readonly requires?: readonly string[];
  readonly power?: number;
  readonly construction?: {
    readonly cost: Readonly<Partial<Record<string, number>>>;
    readonly buildTicks: number;
  } | null;
  readonly weapons?: readonly {
    readonly rangeSubcells: readonly [number, number];
    readonly targets: readonly string[];
  }[];
  readonly domain?: string;
}
export interface PolicyEntity {
  readonly handle: string;
  readonly force: number;
  readonly definition: string;
  readonly x: number;
  readonly y: number;
  readonly facing: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly constructionSite?: true;
  readonly construction?: { readonly completedTicks: number; readonly buildersWorking: number };
  readonly constructionOrder?: { readonly site: string; readonly state: string };
  readonly harvesting?: { readonly status: string; readonly cargo: number };
  readonly power?: { readonly enabled: boolean };
  readonly extraction?: { readonly status: string };
  readonly order: { readonly type: string; readonly x: number; readonly y: number } | null;
  readonly attackTarget?: string;
  readonly production?: {
    readonly slots: number;
    readonly queue: readonly {
      readonly definition: string;
      readonly handle: string;
      readonly state?: string;
    }[];
  };
}
export interface PolicyObservation {
  readonly tick: number;
  readonly entities: readonly PolicyEntity[];
  readonly banks?: readonly {
    readonly force: number;
    readonly resources: Readonly<Record<string, number>>;
  }[];
  readonly power?: readonly {
    readonly force: number;
    readonly used: number;
    readonly produced: number;
  }[];
  readonly constructionRequests?: readonly {
    readonly handle: string;
    readonly force: number;
    readonly status: string;
  }[];
  /** Discovered immutable node origins only; no hidden stock or ownership. */
  readonly resourceNodes?: readonly {
    readonly kind: "materials" | "oil";
    readonly x: number;
    readonly y: number;
  }[];
  readonly fog?: readonly {
    readonly width: number;
    readonly height: number;
    readonly cells: Uint8Array;
  }[];
  readonly ghosts?: readonly {
    readonly handle: string;
    readonly force: number;
    readonly x: number;
    readonly y: number;
  }[];
}
export type PolicyCommand =
  | {
      type: "economy.build";
      payload: {
        definition: string;
        force: number;
        builders: string[];
        x: number;
        y: number;
        facing: number;
      };
    }
  | { type: "economy.assistConstruction"; payload: { entity: string; builders: string[] } }
  | { type: "economy.cancelConstruction"; payload: { entity: string } }
  | { type: "economy.power"; payload: { entity: string; enabled: number } }
  | { type: "production.enqueue"; payload: { entity: string; definition: string } }
  | { type: "unit.harvest"; payload: { entities: string[] } }
  | { type: "unit.move" | "unit.attackMove"; payload: { entities: string[]; x: number; y: number } }
  | { type: "unit.attack"; payload: { entities: string[]; entity: string } };
export interface SkirmishMemory {
  stage: number;
  nextPlan: number;
  buildAfter: number;
  placement: number;
  scout: number;
  scoutWork: number;
  owned: string[];
  enemy: string | null;
  goal: { x: number; y: number; until: number; handle: string | null; health?: number } | null;
  avoid: { handle: string; until: number } | null;
  site: { handle: string; work: number; until: number } | null;
  orders: { handle: string; x: number; y: number; until: number; retreat: boolean }[];
}
export interface SkirmishPolicy {
  readonly force: number;
  readonly allies: readonly number[];
  readonly definitions: readonly PolicyDefinition[];
  readonly buildOrder: readonly string[];
  readonly builder: string;
  readonly truck: string;
  readonly soldier: string;
  readonly tank: string;
  readonly extractor: string;
}
export interface PlanningView {
  observation: PolicyObservation;
  policy: SkirmishPolicy;
  memory: SkirmishMemory;
  own: PolicyEntity[];
  definitions: ReadonlyMap<string, PolicyDefinition>;
}
export const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export const complete = (entity: PolicyEntity) => !entity.constructionSite && entity.health > 0;
export const affordable = (view: PlanningView, definition: PolicyDefinition, reserve = 0) => {
  const resources = view.observation.banks?.find(
    (bank) => bank.force === view.policy.force,
  )?.resources;
  return (
    !!definition.construction &&
    !!resources &&
    Object.entries(definition.construction.cost).every(
      ([id, cost]) => (resources[id] ?? 0) >= (cost ?? 0) + (id === "credits" ? reserve : 0),
    )
  );
};
export const prerequisites = (view: PlanningView, definition: PolicyDefinition) =>
  (definition.requires ?? []).every((id) =>
    view.own.some((entity) => entity.definition === id && complete(entity)),
  );
export const baseOf = (view: PlanningView) =>
  view.own.find(
    (entity) =>
      complete(entity) && view.definitions.get(entity.definition)?.role === "headquarters",
  ) ??
  view.own.find(
    (entity) => complete(entity) && view.definitions.get(entity.definition)?.footprint,
  ) ??
  view.own[0];
export const nextStructure = (view: PlanningView) => {
  const power = view.observation.power?.find((row) => row.force === view.policy.force);
  if (
    power &&
    power.produced < power.used + 20 &&
    !view.own.some(
      (entity) => entity.definition === view.policy.buildOrder[0] && entity.constructionSite,
    )
  )
    return view.policy.buildOrder[0];
  const missing = view.policy.buildOrder.find(
    (id) => !view.own.some((entity) => entity.definition === id),
  );
  if (missing) return missing;
  if (
    !view.own.some(
      (entity) =>
        entity.definition === view.policy.extractor && entity.extraction?.status !== "depleted",
    ) &&
    view.observation.resourceNodes?.some(
      (node) =>
        node.kind === "materials" &&
        !view.own.some(
          (entity) =>
            entity.definition === view.policy.extractor &&
            entity.x === node.x &&
            entity.y === node.y,
        ),
    )
  )
    return view.policy.extractor;
};
/** Fixed local candidate order; terrain/path legality is left to normal commands. */
export const BUILD_OFFSETS = Array.from({ length: 33 * 33 }, (_, index) => ({
  x: (index % 33) - 16,
  y: Math.floor(index / 33) - 16,
})).sort((a, b) => a.x * a.x + a.y * a.y - b.x * b.x - b.y * b.y || a.y - b.y || a.x - b.x);
export function economy(view: PlanningView): PolicyCommand | undefined {
  const { observation, own, memory } = view;
  const disabled = own.find((entity) => complete(entity) && entity.power?.enabled === false);
  if (disabled) return { type: "economy.power", payload: { entity: disabled.handle, enabled: 1 } };
  const idleTruck = own.find((entity) => entity.harvesting?.status === "idle");
  if (idleTruck) return { type: "unit.harvest", payload: { entities: [idleTruck.handle] } };
  const blockedProducer = own.find((entity) =>
    entity.production?.queue.some((item) => item.state === "exit"),
  );
  const base = baseOf(view),
    grid = observation.fog?.[0];
  if (blockedProducer && base && grid) {
    const blocker = own.find(
      (entity) =>
        !view.definitions.get(entity.definition)?.footprint &&
        !entity.order &&
        !entity.constructionOrder &&
        !entity.harvesting &&
        distance(entity, blockedProducer) < (6 * 1024) ** 2,
    );
    if (blocker)
      return {
        type: "unit.move",
        payload: {
          entities: [blocker.handle],
          x: Math.max(512, Math.min(grid.width * 1024 - 512, base.x - 3 * 1024)),
          y: Math.max(512, Math.min(grid.height * 1024 - 512, base.y + 6 * 1024)),
        },
      };
  }
  if (observation.tick < memory.buildAfter) return;
  const refused = observation.constructionRequests?.find(
    (request) => request.force === view.policy.force && request.status === "refused",
  );
  if (refused) {
    memory.buildAfter = observation.tick + 40;
    return { type: "economy.cancelConstruction", payload: { entity: refused.handle } };
  }
  const site = own.find((entity) => entity.constructionSite);
  if (!site) {
    memory.site = null;
    return;
  }
  const work = site.construction?.completedTicks ?? 0;
  if (memory.site?.handle !== site.handle || memory.site.work !== work) {
    const assigned = own.find((entity) => entity.constructionOrder?.site === site.handle);
    const travel = assigned
      ? Math.floor(
          (2 * isqrt(distance(assigned, site))) /
            Math.max(1, view.definitions.get(assigned.definition)?.speed ?? 1),
        )
      : 0;
    memory.site = { handle: site.handle, work, until: observation.tick + travel + 200 };
  }
  if (memory.site.until <= observation.tick) {
    memory.site = null;
    memory.buildAfter = observation.tick + 40;
    return { type: "economy.cancelConstruction", payload: { entity: site.handle } };
  }
  const builder = own.find(
    (entity) =>
      view.definitions.get(entity.definition)?.role === "builder" &&
      (!entity.constructionOrder || entity.constructionOrder.state === "blocked"),
  );
  if (builder && !site.construction?.buildersWorking) {
    memory.buildAfter = observation.tick + 40;
    return {
      type: "economy.assistConstruction",
      payload: { entity: site.handle, builders: [builder.handle] },
    };
  }
}
export function placement(view: PlanningView, candidate: number): PolicyCommand | null | undefined {
  const { memory, observation, policy, own } = view;
  if (
    observation.tick < memory.buildAfter ||
    own.some((entity) => entity.constructionSite) ||
    observation.constructionRequests?.some((request) => request.force === policy.force)
  )
    return null;
  const nodes =
    observation.resourceNodes?.filter(
      (node) =>
        node.kind === "materials" &&
        !own.some(
          (entity) =>
            entity.definition === policy.extractor && entity.x === node.x && entity.y === node.y,
        ),
    ) ?? [];
  const node = nodes[candidate % Math.max(1, nodes.length)];
  const id = nextStructure(view);
  const definition = id ? view.definitions.get(id) : undefined;
  if (!definition?.footprint || !affordable(view, definition) || !prerequisites(view, definition))
    return null;
  const builder = own.find(
    (entity) =>
      !entity.constructionOrder &&
      view.definitions.get(entity.definition)?.builds?.includes(definition.id),
  );
  const base = baseOf(view),
    grid = observation.fog?.[0];
  if (!builder || !base || !grid) return null;
  const offset = BUILD_OFFSETS[candidate % BUILD_OFFSETS.length];
  if (!offset) return;
  const x =
    definition.id === policy.extractor && node
      ? node.x
      : Math.floor(base.x / 1024) * 1024 + offset.x * 1024;
  const y =
    definition.id === policy.extractor && node
      ? node.y
      : Math.floor(base.y / 1024) * 1024 + offset.y * 1024;
  const [width, depth] = definition.footprint;
  if (
    x < 0 ||
    y < 0 ||
    x + width * 1024 > grid.width * 1024 ||
    y + depth * 1024 > grid.height * 1024
  )
    return;
  // Reserve discovered node footprints and approach lanes for their future extractor.
  if (
    definition.id !== policy.extractor &&
    observation.resourceNodes?.some(
      (node) =>
        x < node.x + 5 * 1024 &&
        x + (width + 3) * 1024 > node.x &&
        y < node.y + 5 * 1024 &&
        y + (depth + 3) * 1024 > node.y,
    )
  )
    return;
  for (let row = 0; row < depth; row++)
    for (let column = 0; column < width; column++)
      if (
        !observation.fog?.some(
          (fog) =>
            (fog.cells[(Math.floor(y / 1024) + row) * fog.width + Math.floor(x / 1024) + column] ??
              0) > 0,
        )
      )
        return;
  if (
    own.some((entity) => {
      const footprint = view.definitions.get(entity.definition)?.footprint;
      if (!footprint) return false;
      const turned = (Math.floor((entity.facing + 0x2000) / 0x4000) & 1) === 0;
      const w = (turned ? footprint[1] : footprint[0]) * 1024,
        d = (turned ? footprint[0] : footprint[1]) * 1024;
      return (
        x < entity.x + w + 3 * 1024 &&
        x + width * 1024 + 3 * 1024 > entity.x &&
        y < entity.y + d + 3 * 1024 &&
        y + depth * 1024 + 3 * 1024 > entity.y
      );
    })
  )
    return;
  memory.buildAfter = observation.tick + 40;
  return {
    type: "economy.build",
    payload: {
      definition: definition.id,
      force: policy.force,
      builders: [builder.handle],
      x,
      y,
      facing: 0x4000,
    },
  };
}
