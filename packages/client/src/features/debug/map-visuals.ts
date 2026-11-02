/// <reference path="../../assets.d.ts" />
import type { MapDecoration, StaticMapInstance } from "@open-neo-rts/render";
import arcticFrozenLog from "../../../../../content/core/props/arctic/frozen-log/prop.json";
import arcticIceShards from "../../../../../content/core/props/arctic/ice-shards/prop.json";
import arcticSnowBush from "../../../../../content/core/props/arctic/snow-bush/prop.json";
import arcticSnowBushModel from "../../../../../content/core/props/arctic/snow-bush/snow-bush.glb";
import arcticSnowyBoulder from "../../../../../content/core/props/arctic/snowy-boulder/prop.json";
import arcticSnowyConifer from "../../../../../content/core/props/arctic/snowy-conifer/prop.json";
import arcticSnowyDeadTree from "../../../../../content/core/props/arctic/snowy-dead-tree/prop.json";
import arcticSnowyOutcrop from "../../../../../content/core/props/arctic/snowy-outcrop/prop.json";
import commonBurnedOutTank from "../../../../../content/core/props/common/burned-out-tank/prop.json";
import commonCollapsedBuilding from "../../../../../content/core/props/common/collapsed-building/prop.json";
import commonOilDrums from "../../../../../content/core/props/common/oil-drums/prop.json";
import commonSandbagWall from "../../../../../content/core/props/common/sandbag-wall/prop.json";
import commonSupplyCrates from "../../../../../content/core/props/common/supply-crates/prop.json";
import commonTankTrap from "../../../../../content/core/props/common/tank-trap/prop.json";
import commonWallFragment from "../../../../../content/core/props/common/wall-fragment/prop.json";
import desertAcaciaTree from "../../../../../content/core/props/desert/acacia-tree/prop.json";
import desertAdobeRuin from "../../../../../content/core/props/desert/adobe-ruin/prop.json";
import desertCactus from "../../../../../content/core/props/desert/cactus/prop.json";
import desertDryShrubModel from "../../../../../content/core/props/desert/dry-shrub/dry-shrub.glb";
import desertDryShrub from "../../../../../content/core/props/desert/dry-shrub/prop.json";
import desertPalmTree from "../../../../../content/core/props/desert/palm-tree/prop.json";
import desertSandstoneBoulder from "../../../../../content/core/props/desert/sandstone-boulder/prop.json";
import desertSandstoneOutcrop from "../../../../../content/core/props/desert/sandstone-outcrop/prop.json";
import temperateBoulder from "../../../../../content/core/props/temperate/boulder/prop.json";
import temperateBroadleafTree from "../../../../../content/core/props/temperate/broadleaf-tree/prop.json";
import temperateBushModel from "../../../../../content/core/props/temperate/bush/bush.glb";
import temperateBush from "../../../../../content/core/props/temperate/bush/prop.json";
import temperateConiferTree from "../../../../../content/core/props/temperate/conifer-tree/prop.json";
import temperateDeadTree from "../../../../../content/core/props/temperate/dead-tree/prop.json";
import temperateReeds from "../../../../../content/core/props/temperate/reeds/prop.json";
import temperateReedsModel from "../../../../../content/core/props/temperate/reeds/reeds.glb";
import temperateRockOutcrop from "../../../../../content/core/props/temperate/rock-outcrop/prop.json";
import temperateWoodenFence from "../../../../../content/core/props/temperate/wooden-fence/prop.json";
import urbanBenchModel from "../../../../../content/core/props/urban/bench/bench.glb";
import urbanBench from "../../../../../content/core/props/urban/bench/prop.json";
import urbanChainLinkFence from "../../../../../content/core/props/urban/chain-link-fence/prop.json";
import urbanConcreteBarrier from "../../../../../content/core/props/urban/concrete-barrier/prop.json";
import urbanDumpster from "../../../../../content/core/props/urban/dumpster/prop.json";
import urbanParkTree from "../../../../../content/core/props/urban/park-tree/prop.json";
import urbanRubblePile from "../../../../../content/core/props/urban/rubble-pile/prop.json";
import urbanStreetlight from "../../../../../content/core/props/urban/streetlight/prop.json";
import urbanStreetlightModel from "../../../../../content/core/props/urban/streetlight/streetlight.glb";
import urbanWreckedCar from "../../../../../content/core/props/urban/wrecked-car/prop.json";
import materialnode from "../../../../../content/core/resources/material-node/material-node.glb";
import oilwell from "../../../../../content/core/resources/oil-well/oil-well.glb";
import orecell from "../../../../../content/core/resources/ore-cell/ore-cell.glb";

// shortcut: built-in original assets only, until phase-2 pack loading.
const props = [
  arcticFrozenLog,
  arcticIceShards,
  arcticSnowBush,
  arcticSnowyBoulder,
  arcticSnowyConifer,
  arcticSnowyDeadTree,
  arcticSnowyOutcrop,
  commonBurnedOutTank,
  commonCollapsedBuilding,
  commonOilDrums,
  commonSandbagWall,
  commonSupplyCrates,
  commonTankTrap,
  commonWallFragment,
  desertAcaciaTree,
  desertAdobeRuin,
  desertCactus,
  desertDryShrub,
  desertPalmTree,
  desertSandstoneBoulder,
  desertSandstoneOutcrop,
  temperateBoulder,
  temperateBroadleafTree,
  temperateBush,
  temperateConiferTree,
  temperateDeadTree,
  temperateReeds,
  temperateRockOutcrop,
  temperateWoodenFence,
  urbanBench,
  urbanChainLinkFence,
  urbanConcreteBarrier,
  urbanDumpster,
  urbanParkTree,
  urbanRubblePile,
  urbanStreetlight,
  urbanWreckedCar,
];
const models: Record<string, string> = {
  [`core.${arcticSnowBush.id}`]: arcticSnowBushModel,
  [`core.${desertDryShrub.id}`]: desertDryShrubModel,
  [`core.${temperateBush.id}`]: temperateBushModel,
  [`core.${temperateReeds.id}`]: temperateReedsModel,
  [`core.${urbanBench.id}`]: urbanBenchModel,
  [`core.${urbanStreetlight.id}`]: urbanStreetlightModel,
  "ore-cell": orecell,
  "material-node": materialnode,
  "oil-well": oilwell,
};

/** Keep original map-object references; gameplay props arrive through authoritative projection later. */
export function mapDecorations(objects: readonly MapDecoration[]): StaticMapInstance[] {
  return objects.flatMap((object) => {
    const prop = props.find(
      (prop) => prop.id === object.definition || `core.${prop.id}` === object.definition,
    );
    if (!prop && !/^(?:[a-z0-9-]+\.)?prop:/.test(object.definition)) return [];
    if (!prop) throw new Error(`Unknown map object definition: ${object.definition}`);
    if (prop.blocks !== "nothing") return [];
    return [{ ...object, footprint: prop.footprint }];
  });
}

export async function resolveMapModel(definition: string): Promise<Uint8Array> {
  const key = definition.startsWith("prop:") ? `core.${definition}` : definition;
  const url = Object.hasOwn(models, key) ? models[key] : undefined;
  if (!url) throw new Error(`No map model for ${definition}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Map model ${definition}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}
