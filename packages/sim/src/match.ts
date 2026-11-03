import type { Issue } from "@open-neo-rts/content";
import type { Grant } from "./commands";
import { initializeUnitModes } from "./features/abilities";
import { initializeProductionSurges } from "./features/abilities/production-surge";
import { initializeVeterancy } from "./features/abilities/veterancy";
import { combatFeature } from "./features/combat";
import { initializeBurn } from "./features/combat/burn";
import { initializeDisable } from "./features/combat/disable";
import {
  constructionFeature,
  constructionWorkFeature,
  structureRepairFeature,
} from "./features/construction";
import { initializeBotSeats } from "./features/control/bots";
import {
  checkNormalMatchSetup,
  copyNormalMatchSetup,
  initializeNormalMatch,
  type NormalMatchSetup,
  normalMatchIdentity,
} from "./features/control/normal-match";
import {
  initializeExtraction,
  initializeForceBanks,
  initializeForcePower,
  initializeHarvesting,
  initializeOre,
} from "./features/economy";
import {
  checkDefinitions,
  type Definition,
  definitionSchema,
  entitiesFeature,
} from "./features/entities";
import { initializeTransports } from "./features/entities/transport";
import { copyWeapons } from "./features/entities/weapons";
import { movementFeature } from "./features/movement";
import { TerrainMovement } from "./features/movement/terrain-movement";
import { productionFeature } from "./features/production";
import { initializeProjectiles } from "./features/projectiles";
import { MatchRemains } from "./features/salvage";
import { salvageFeature } from "./features/salvage/work";
import { initializeStatistics, initializeVictory } from "./features/victory";
import { initializeVisibilityMemory, initializeVision } from "./features/vision";
import { createKernel, type Kernel, register } from "./kernel";
import { checkMatchMap, type MatchMap, matchMapSchema } from "./match-map";
import { initializeObservations } from "./projection/observations";

export {
  type MatchMap,
  type MatchResource,
  serializeMatchMap,
  toMatchResources,
} from "./match-map";

/** Bump whenever simulation outcomes change. */
export const SIM_VERSION = 51;

/** Map-aware setup; definitions are an ordered table addressed by their unique IDs. */
export interface MatchSetup {
  map: MatchMap;
  seed: number;
  debug: boolean;
  forces: readonly { index: number; faction: string }[];
  /** Player/bot seats; 0 is reserved for system commands. */
  seats: readonly number[];
  grants: readonly Grant[];
  definitions: readonly Definition[];
  /** Resolved first-playable initialization; omitted by debug previews. */
  normal?: NormalMatchSetup;
}

/** Validates/copies static map input, then registers features in their fixed order. */
export function createMatch(setup: MatchSetup): Kernel {
  const issues: Issue[] = [];
  for (const [i, definition] of setup.definitions.entries())
    definitionSchema.check(definition, `$.setup.definitions[${i}]`, issues);
  if (!issues.length) checkDefinitions(setup.definitions, issues);
  matchMapSchema.check(setup.map, "$.setup.map", issues);
  if (!issues.length) checkMatchMap(setup.map, setup.definitions, issues);
  if (issues.length)
    throw new Error(
      `Invalid match map:\n${issues.map(({ path, message }) => `${path}: ${message}`).join("\n")}`,
    );
  checkNormalMatchSetup(setup);
  setup = copyNormalMatchSetup(setup);
  const kernel = createKernel({ ...setup, setupIdentity: normalMatchIdentity(setup) });
  const definitions = setup.definitions.map((definition) =>
    Object.freeze({
      ...definition,
      ...(definition.weapons && { weapons: copyWeapons(definition.weapons) }),
      ...(definition.deployMode && {
        deployMode: Object.freeze({
          ...definition.deployMode,
          cost: Object.freeze({ ...definition.deployMode.cost }),
        }),
      }),
      ...(definition.resistPerMille && {
        resistPerMille: Object.freeze({ ...definition.resistPerMille }),
      }),
      ...(definition.powerAdjacency && {
        powerAdjacency: Object.freeze(
          definition.powerAdjacency.map((rule) =>
            Object.freeze({ ...rule, tags: Object.freeze([...rule.tags]) }),
          ),
        ),
      }),
      ...(definition.productionReward && {
        productionReward: Object.freeze({ ...definition.productionReward }),
      }),
      ...(definition.productionSurge && {
        productionSurge: Object.freeze({
          ...definition.productionSurge,
          cost: Object.freeze({ ...definition.productionSurge.cost }),
        }),
      }),
      ...(definition.footprint && {
        footprint: Object.freeze([...definition.footprint]) as readonly [number, number],
      }),
      ...(definition.cells && { cells: Object.freeze([...definition.cells]) }),
      ...(definition.nodeKinds && { nodeKinds: Object.freeze([...definition.nodeKinds]) }),
      ...(definition.extraction && {
        extraction: Object.freeze(
          Object.fromEntries(
            Object.entries(definition.extraction).map(([kind, output]) => [
              kind,
              Object.freeze({ ...output }),
            ]),
          ),
        ),
      }),
      ...(definition.domains && { domains: Object.freeze([...definition.domains]) }),
      ...(definition.requires && { requires: Object.freeze([...definition.requires]) }),
      ...(definition.builds && { builds: Object.freeze([...definition.builds]) }),
      ...(definition.tags && { tags: Object.freeze([...definition.tags]) }),
      ...(definition.repair && {
        repair: Object.freeze({
          ...definition.repair,
          targets: Object.freeze({
            ...definition.repair.targets,
            families: Object.freeze([...definition.repair.targets.families]),
            roles: Object.freeze([...definition.repair.targets.roles]),
            tags: Object.freeze([...definition.repair.targets.tags]),
          }),
        }),
      }),
      ...(definition.produces && { produces: Object.freeze([...definition.produces]) }),
      ...(definition.spawnsWith && { spawnsWith: Object.freeze([...definition.spawnsWith]) }),
      ...(definition.exits && {
        exits: Object.freeze(
          definition.exits.map((exit) =>
            Object.freeze({
              side: exit.side,
              cell: Object.freeze([...exit.cell]) as readonly [number, number],
            }),
          ),
        ),
      }),
      ...(definition.construction && {
        construction: Object.freeze({
          cost: Object.freeze({ ...definition.construction.cost }),
          buildTicks: definition.construction.buildTicks,
        }),
      }),
    }),
  );
  register(
    kernel,
    entitiesFeature(
      definitions,
      setup.forces.map((force) => force.index),
    ),
  );
  kernel.movement = new TerrainMovement(
    kernel,
    definitions,
    setup.forces.map((f) => f.index),
  );
  register(kernel, movementFeature({ ...setup, definitions }));
  if (setup.normal) initializeDisable(kernel, definitions);
  if (setup.normal) initializeForcePower(kernel, setup.forces, setup.grants, definitions);
  initializeNormalMatch(kernel, { ...setup, definitions });
  if (setup.normal) initializeUnitModes(kernel, { ...setup, definitions });
  if (setup.normal) initializeTransports(kernel, { ...setup, definitions });
  if (setup.normal) initializeForceBanks(kernel, setup.normal.forces, setup.grants);
  if (setup.normal) initializeProductionSurges(kernel, { ...setup, definitions });
  initializeStatistics(kernel, setup);
  if (setup.normal) initializeExtraction(kernel, definitions);
  if (setup.normal) initializeOre(kernel);
  if (setup.normal) register(kernel, constructionFeature({ ...setup, definitions }));
  if (setup.normal) register(kernel, constructionWorkFeature({ ...setup, definitions }));
  if (setup.normal) register(kernel, structureRepairFeature({ ...setup, definitions }));
  if (setup.normal) register(kernel, combatFeature({ ...setup, definitions }));
  if (setup.normal) kernel.remains = new MatchRemains(kernel, definitions);
  if (setup.normal) register(kernel, salvageFeature({ ...setup, definitions }));
  if (setup.normal) initializeProjectiles(kernel, { ...setup, definitions });
  if (setup.normal) initializeBurn(kernel, definitions);
  if (setup.normal && setup.normal.settings.veterancy !== false)
    initializeVeterancy(kernel, definitions);
  if (setup.normal) register(kernel, productionFeature({ ...setup, definitions }));
  if (setup.normal) initializeHarvesting(kernel, { definitions, grants: setup.grants });
  if (setup.normal) initializeVision(kernel, { ...setup, definitions });
  if (setup.normal) initializeVisibilityMemory(kernel, { ...setup, definitions });
  initializeVictory(kernel, { ...setup, definitions });
  initializeObservations(kernel, { ...setup, definitions });
  initializeBotSeats(kernel, { ...setup, definitions });
  return kernel;
}
