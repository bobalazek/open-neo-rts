import {
  type AbstractMesh,
  type AssetContainer,
  Color3,
  Matrix,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  type Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import type { DOMAINS, TerrainGrid } from "@open-neo-rts/content";
import type { PresentedEntity, SeatSnapshot } from "@open-neo-rts/sim";
import { eventVisible } from "../effects";
import { registerModelShadows } from "../scene/shadows";
import { createFoundation } from "../structures";
import {
  createConstructionScaffold,
  initializeConstruction,
  prepareConstruction,
  setConstructionStage,
} from "../structures/construction";
import { CELL_SIZE, terrainHeight, waterHeight } from "../terrain";
import { createModelLod } from "./lod";
import { createModelPlayback, loadModelContainer, setTeamColor } from "./model";
import { createStatusBars } from "./status";

type Pose = Pick<PresentedEntity, "x" | "y" | "facing">;
type Instance = ReturnType<AssetContainer["instantiateModelsToScene"]>;
interface Entity {
  definition: string;
  force: number;
  previous: Pose;
  current: Pose;
  moving: boolean;
  health: number;
  maxHealth: number;
  rank?: number;
  construction?: number;
  constructionStage?: number;
  scaffold?: Mesh;
  shadows?: boolean;
  working?: boolean;
  workClip?: string;
  workProgressTicks?: number;
  workElapsed?: number;
  attackElapsed?: number;
  deployed: boolean;
  deployElapsed?: number;
  deployHistory?: number[];
  doorElapsed?: number;
  doorHistory?: number[];
  deathElapsed?: number;
  height?: number;
  root?: TransformNode;
  instance?: Instance;
  playback?: ReturnType<typeof createModelPlayback>;
  lod?: ReturnType<typeof createModelLod>;
  clip?: string;
  loading?: Promise<void>;
  ring?: ReturnType<Mesh["createInstance"]>;
  foundation?: Mesh;
  foundationPose?: string;
}
interface Template {
  force: number;
  movementDomain: (typeof DOMAINS)[number] | null;
  footprint?: readonly [number, number];
  radiusSubcells?: number;
  foundation?: boolean;
  visibility: Map<string, boolean>;
  model?: AssetContainer;
  loading: Promise<AssetContainer | undefined>;
}

const keyFor = (definition: string, force: number) => JSON.stringify([definition, force]);
const poseOf = ({ x, y, facing }: Pose): Pose => ({ x, y, facing });

/** Continue opening, renew an open hold, or reverse the authored closing phase. */
function reopenDoor(elapsed: number, opening: number, closing: number): number {
  if (!opening || !closing) return 0;
  if (elapsed < opening) return elapsed;
  if (elapsed < opening * 2) return opening;
  if (elapsed < opening * 2 + closing) return opening * (1 - (elapsed - opening * 2) / closing);
  return 0;
}

/** A presentation-only owner. Call accept on copied worker snapshots, render with the same monotonic clock. */
export function createEntityPresentation(
  scene: Scene,
  terrain: TerrainGrid,
  resolveModel: (
    definition: string,
    variant: "model" | "wreck",
  ) => Promise<{
    bytes: Uint8Array;
    movementDomain: (typeof DOMAINS)[number] | null;
    footprint?: readonly [number, number];
    radiusSubcells?: number;
    foundation?: boolean;
  }>,
  options: { ghost?: boolean; remains?: boolean } = {},
) {
  const entities = new Map<string, Entity>();
  const dying = new Map<string, Entity>();
  const status = createStatusBars(scene);
  let latest: SeatSnapshot | undefined;
  const templates = new Map<string, Template>();
  const colors = new Map<number, string>();
  const meshHandles = new Map<AbstractMesh, string>();
  let selected = new Set<string>();
  let ringModel: Mesh | undefined;
  let ringMaterial: StandardMaterial | undefined;
  let tick: number | undefined;
  let receivedAt = 0;
  let duration = 50;
  let frameAt = 0;
  let disposed = false;
  let playbackRate = 1;
  let lodDistance = 96;
  let accepted = Promise.resolve();

  function remove(entity: Entity) {
    for (const mesh of entity.root?.getChildMeshes() ?? []) meshHandles.delete(mesh);
    entity.ring?.dispose();
    entity.foundation?.dispose();
    const morphs = entity.root
      ?.getChildMeshes()
      .flatMap((mesh) => (mesh.morphTargetManager ? [mesh.morphTargetManager] : []));
    entity.instance?.dispose();
    for (const morph of new Set(morphs)) morph.dispose();
    entity.root?.dispose();
  }

  function pruneTemplates() {
    const used = new Set(
      [...entities.values(), ...dying.values()].map((entity) =>
        keyFor(entity.definition, entity.force),
      ),
    );
    for (const [key, template] of templates)
      if (!used.has(key)) {
        template.model?.dispose();
        templates.delete(key);
      }
  }

  function templateFor(definition: string, force: number): Template {
    const key = keyFor(definition, force);
    const existing = templates.get(key);
    if (existing) return existing;
    const template: Template = {
      force,
      movementDomain: null,
      visibility: new Map(),
      loading: Promise.resolve()
        .then(async () => {
          const { bytes, movementDomain, footprint, radiusSubcells, foundation } =
            await resolveModel(definition, options.remains ? "wreck" : "model");
          // A removed entity or disposed layer must not start another import.
          if (disposed || templates.get(key) !== template) return undefined;
          const model = await loadModelContainer(scene, bytes);
          if (disposed || templates.get(key) !== template) {
            model.dispose();
            return undefined;
          }
          try {
            if (footprint && !options.remains) prepareConstruction(model);
            const color = colors.get(force);
            if (color && !options.ghost) setTeamColor(model.materials, color);
            if (options.ghost) {
              // Original brick GLBs use flat PBR colours; this template owns its materials.
              for (const material of model.materials)
                if (material instanceof PBRMaterial) {
                  const gray = Math.max(
                    0.45,
                    material.albedoColor.r * 0.2126 +
                      material.albedoColor.g * 0.7152 +
                      material.albedoColor.b * 0.0722,
                  );
                  material.albedoColor.set(gray, gray, gray);
                  material.emissiveColor.set(0, 0, 0);
                  material.metallic = 0;
                  material.roughness = 1;
                }
            }
            model.addAllToScene();
            // Capture before hiding parents: glTF visibility may be inherited by children.
            for (const mesh of model.meshes) template.visibility.set(mesh.name, mesh.isVisible);
            for (const mesh of model.meshes) mesh.isVisible = false;
            template.movementDomain = movementDomain;
            template.footprint = footprint;
            template.radiusSubcells = radiusSubcells;
            template.foundation = foundation;
            template.model = model;
            return model;
          } catch (error) {
            model.dispose();
            throw error;
          }
        })
        .catch((error: unknown) => {
          if (disposed || templates.get(key) !== template) return undefined;
          templates.delete(key);
          throw error;
        }),
    };
    templates.set(key, template);
    return template;
  }

  function render(nowMs: number) {
    if (disposed) return;
    const delta = playbackRate ? Math.max(0, nowMs - frameAt) : 0;
    frameAt = nowMs;
    for (const entity of entities.values()) {
      if (entity.attackElapsed !== undefined) entity.attackElapsed += delta;
      if (entity.working) entity.workElapsed = (entity.workElapsed ?? 0) + delta;
      if (entity.deployElapsed !== undefined) entity.deployElapsed += delta;
      if (entity.doorElapsed !== undefined) entity.doorElapsed += delta;
    }
    for (const [handle, entity] of dying) {
      entity.deathElapsed = (entity.deathElapsed ?? 0) + delta;
      if (
        !entity.playback ||
        entity.deathElapsed >= Math.min(3000, entity.playback.duration("death")) ||
        (latest && !eventVisible(latest, entity.current.x, entity.current.y))
      ) {
        remove(entity);
        dying.delete(handle);
        continue;
      }
      entity.playback.seek(entity.deathElapsed);
      sampleDeployment(entity);
      sampleDoor(entity);
    }
    pruneTemplates();
    const alpha =
      playbackRate === 0 || options.remains
        ? 1
        : Math.max(0, Math.min(1, (nowMs - receivedAt) / duration));
    for (const [handle, entity] of entities) {
      if (!entity.root || !entity.playback) continue;
      const a = entity.previous;
      const b = entity.current;
      let x = (a.x + (b.x - a.x) * alpha) / 1024;
      let y = (a.y + (b.y - a.y) * alpha) / 1024;
      const turn = ((b.facing - a.facing + 0x8000) & 0xffff) - 0x8000;
      const template = templates.get(keyFor(entity.definition, entity.force));
      if (template?.footprint) {
        const [width, depth] = template.footprint;
        const turned = (((b.facing >>> 14) + 3) & 1) !== 0;
        const pose = `${b.x},${b.y},${turned}`;
        if (
          template.foundation &&
          !options.ghost &&
          !options.remains &&
          entity.foundationPose !== pose
        ) {
          entity.foundation?.dispose();
          entity.foundation = createFoundation(
            scene,
            terrain,
            b.x / 1024,
            b.y / 1024,
            turned ? depth : width,
            turned ? width : depth,
          );
          entity.foundationPose = pose;
        }
        x += (turned ? depth : width) / 2;
        y += (turned ? width : depth) / 2;
      }
      let height = terrainHeight(terrain, x, y);
      const domain = template?.movementDomain;
      if (domain === "naval" || domain === "hover" || domain === "amphibious")
        height = Math.max(height, waterHeight(terrain, x, y));
      entity.root.position.set(x * CELL_SIZE, height, y * CELL_SIZE);
      if (template?.footprint && !options.remains) {
        setConstructionStage(
          entity.root.getChildMeshes(),
          height,
          entity.height ?? 0.5,
          entity.constructionStage,
        );
        if (entity.constructionStage !== undefined) {
          if (!entity.scaffold) {
            entity.scaffold = createConstructionScaffold(
              scene,
              template.footprint,
              entity.height ?? 0.5,
              !!options.ghost,
            );
            entity.scaffold.parent = entity.root;
            if (!options.ghost) meshHandles.set(entity.scaffold, handle);
          }
        } else {
          if (entity.scaffold) {
            meshHandles.delete(entity.scaffold);
            entity.scaffold.dispose();
            entity.scaffold = undefined;
          }
          // shortcut: partial structures cast no shadow; add clipped depth passes when construction shadows are implemented.
          if (!options.ghost && !entity.shadows) {
            registerModelShadows(entity.root);
            entity.shadows = true;
          }
        }
      } else if (!options.ghost && !entity.shadows) {
        registerModelShadows(entity.root);
        entity.shadows = true;
      }
      const camera = scene.activeCamera;
      entity.lod?.setDistant(
        !!camera &&
          Vector3.DistanceSquared(camera.globalPosition, entity.root.position) >=
            lodDistance * lodDistance,
      );
      if (!options.ghost && selected.has(handle)) {
        if (!ringModel) {
          ringModel = MeshBuilder.CreateTorus(
            "selection ring template",
            { diameter: 2, thickness: 0.14, tessellation: 32 },
            scene,
          );
          ringMaterial = new StandardMaterial("selection ring", scene);
          ringMaterial.emissiveColor = Color3.FromHexString("#f5cf60");
          ringMaterial.disableLighting = true;
          ringModel.material = ringMaterial;
          ringModel.isVisible = ringModel.isPickable = false;
        }
        if (!entity.ring) {
          entity.ring = ringModel.createInstance("selected entity");
          entity.ring.isVisible = true;
          entity.ring.isPickable = false;
        }
        const size = template?.footprint
          ? (Math.max(...template.footprint) * CELL_SIZE) / 2 + 0.2
          : ((template?.radiusSubcells ?? 666) * CELL_SIZE) / 1024 + 0.2;
        entity.ring.scaling.set(size, 1, size);
        entity.ring.position.set(x * CELL_SIZE, height + 0.08, y * CELL_SIZE);
      } else if (entity.ring) {
        entity.ring.dispose();
        entity.ring = undefined;
      }
      // Sim 0 faces +x; authored glTF fronts face +Z, with +y on the map becoming +z.
      entity.root.rotation.y = Math.PI / 2 - ((a.facing + turn * alpha) * Math.PI * 2) / 65536;
      let action = entity.playback.clips.includes("fire_recoil") ? "fire_recoil" : "attack";
      const attacking =
        entity.attackElapsed !== undefined &&
        entity.playback.clips.includes(action) &&
        entity.attackElapsed < entity.playback.duration(action);
      if (!attacking) entity.attackElapsed = undefined;
      if (!attacking) action = "";
      const work = entity.working
        ? (entity.workClip ?? (entity.playback.clips.includes("active") ? "active" : "attack"))
        : "";
      const clip =
        options.ghost || options.remains
          ? ""
          : attacking
            ? action
            : work && entity.playback.clips.includes(work)
              ? work
              : entity.moving && entity.playback.clips.includes("move")
                ? "move"
                : entity.playback.clips.includes("idle")
                  ? "idle"
                  : "";
      if (clip !== entity.clip) {
        entity.playback.play(clip);
        entity.clip = clip;
      }
      entity.playback.setRate(options.ghost || options.remains ? 0 : playbackRate);
      if (attacking) entity.playback.seek(entity.attackElapsed ?? 0);
      else if (work && clip === work) {
        // Unloading follows actual dock work, including suspension; other work loops.
        const length = entity.playback.duration(work);
        entity.playback.seek(
          entity.workProgressTicks !== undefined
            ? Math.min(length, entity.workProgressTicks * 50)
            : length
              ? (entity.workElapsed ?? 0) % length
              : 0,
        );
      }
      if (!options.remains) {
        sampleDeployment(entity);
        sampleDoor(entity);
      }
      const bar =
        !options.ghost &&
        !options.remains &&
        (selected.has(handle) ||
          !!entity.rank ||
          entity.health < entity.maxHealth ||
          entity.construction !== undefined);
      if (bar) {
        const anchor = entity.root.position.clone();
        anchor.y += (entity.height ?? 1.6) + 0.35;
        status.update(
          handle,
          anchor,
          entity.maxHealth > 0 ? entity.health / entity.maxHealth : 0,
          false,
          entity.rank,
        );
        if (entity.construction !== undefined) {
          anchor.y += 0.25;
          status.update(`construction:${handle}`, anchor, entity.construction, true);
        } else status.remove(`construction:${handle}`);
      } else {
        status.remove(handle);
        status.remove(`construction:${handle}`);
      }
    }
  }

  function sampleDeployment(entity: Entity) {
    if (!entity.playback) return;
    const length = entity.playback.duration("deploy");
    if (entity.deployHistory) {
      let elapsed = 0;
      for (const span of entity.deployHistory) elapsed = length - Math.min(length, elapsed + span);
      entity.deployElapsed = elapsed + (entity.deployElapsed ?? 0);
      entity.deployHistory = undefined;
    }
    const elapsed = Math.min(length, entity.deployElapsed ?? length);
    entity.playback.deploy(entity.deployed ? elapsed : length - elapsed);
  }

  function sampleDoor(entity: Entity) {
    const playback = entity.playback;
    if (!playback) return;
    const opening = playback.duration("open"),
      closing = playback.duration("close");
    if (!opening || !closing) {
      entity.doorElapsed = undefined;
      entity.doorHistory = undefined;
      return;
    }
    if (entity.doorHistory) {
      let elapsed = 0;
      for (const span of entity.doorHistory) elapsed = reopenDoor(elapsed + span, opening, closing);
      entity.doorElapsed = elapsed + (entity.doorElapsed ?? 0);
      entity.doorHistory = undefined;
    }
    const elapsed = entity.doorElapsed;
    if (elapsed === undefined || elapsed >= opening * 2 + closing) {
      entity.doorElapsed = undefined;
      playback.door("close", closing);
    } else if (elapsed < opening) playback.door("open", elapsed);
    else if (elapsed < opening * 2) playback.door("open", opening);
    else playback.door("close", elapsed - opening * 2);
  }

  function pickHit(x: number, y: number): { handle: string; distance: number } | null {
    // Asset readiness can precede the next scene frame; picking needs the latest posed hierarchy.
    for (const mesh of meshHandles.keys())
      if (mesh.isVisible && mesh.isEnabled()) mesh.computeWorldMatrix(true);
    const hits =
      scene.multiPick(
        x,
        y,
        (mesh) => meshHandles.has(mesh) && mesh.isVisible && mesh.isEnabled(),
      ) ?? [];
    hits.sort((a, b) => {
      const left = a.pickedMesh ? (meshHandles.get(a.pickedMesh) ?? "") : "";
      const right = b.pickedMesh ? (meshHandles.get(b.pickedMesh) ?? "") : "";
      return a.distance - b.distance || (left < right ? -1 : left > right ? 1 : 0);
    });
    const hit = hits[0],
      handle = hit?.pickedMesh ? meshHandles.get(hit.pickedMesh) : undefined;
    return handle && hit ? { handle, distance: hit.distance } : null;
  }

  return {
    async accept(snapshot: SeatSnapshot, nowMs: number): Promise<void> {
      if (disposed) throw new Error("Entity presentation is disposed");
      if (tick !== undefined && snapshot.tick <= tick) return accepted;
      render(nowMs);
      latest = {
        tick: snapshot.tick,
        mode: snapshot.mode,
        entities: [],
        fog: snapshot.fog?.map((grid) => ({ ...grid, cells: grid.cells.slice() })),
      };
      duration = tick === undefined ? 50 : (snapshot.tick - tick) * 50;
      tick = snapshot.tick;
      receivedAt = nowMs;
      frameAt = nowMs;
      const deaths = new Map(
        (snapshot.combatEvents ?? [])
          .filter((event) => event.type === "death" && event.entity)
          .map((event) => [event.entity, event]),
      );
      const projectedEntities = options.remains ? (snapshot.remains ?? []) : snapshot.entities;
      const visible = new Set(projectedEntities.map((entity) => entity.handle));
      for (const [handle, entity] of entities) {
        if (!visible.has(handle)) {
          status.remove(handle);
          status.remove(`construction:${handle}`);
          if (
            !options.ghost &&
            !options.remains &&
            deaths.has(handle) &&
            entity.root &&
            entity.playback?.clips.includes("death") &&
            dying.size < 128
          ) {
            const event = deaths.get(handle);
            if (event) {
              entity.current = { ...entity.current, x: event.x, y: event.y };
              entity.root.position.set(
                (event.x * CELL_SIZE) / 1024,
                terrainHeight(terrain, event.x / 1024, event.y / 1024),
                (event.y * CELL_SIZE) / 1024,
              );
            }
            entity.deathElapsed = 0;
            if (entity.scaffold) meshHandles.delete(entity.scaffold);
            entity.scaffold?.dispose();
            entity.scaffold = undefined;
            entity.attackElapsed = undefined;
            entity.playback.play("death");
            entity.playback.seek(0);
            sampleDeployment(entity);
            sampleDoor(entity);
            for (const mesh of entity.root.getChildMeshes()) {
              meshHandles.delete(mesh);
              mesh.isPickable = false;
            }
            entity.ring?.dispose();
            entity.ring = undefined;
            dying.set(handle, entity);
          } else remove(entity);
          entities.delete(handle);
        }
      }
      const pending: Promise<void>[] = [];
      for (const projected of projectedEntities) {
        const { handle, definition, force } = projected;
        const live = "health" in projected ? projected : undefined;
        let entity = entities.get(handle);
        if (entity && (entity.definition !== definition || entity.force !== force)) {
          status.remove(handle);
          status.remove(`construction:${handle}`);
          remove(entity);
          entities.delete(handle);
          entity = undefined;
        }
        if (!entity) {
          entity = {
            definition,
            force,
            previous: poseOf(projected),
            current: poseOf(projected),
            moving: false,
            health: live?.health ?? 0,
            maxHealth: live?.maxHealth ?? 0,
            deployed: live?.deploy?.active ?? false,
          };
          entities.set(handle, entity);
        } else {
          entity.previous = entity.current;
          entity.current = poseOf(projected);
          entity.moving =
            entity.previous.x !== entity.current.x || entity.previous.y !== entity.current.y;
        }
        entity.health = live?.health ?? 0;
        entity.maxHealth = live?.maxHealth ?? 0;
        entity.rank = live?.veterancy?.rank;
        const deployed = live?.deploy?.active ?? false;
        if (deployed !== entity.deployed) {
          if (entity.playback) {
            const length = entity.playback.duration("deploy");
            entity.deployElapsed = length - Math.min(length, entity.deployElapsed ?? length);
          } else {
            // The authored duration is unknown until import; retain time between observed toggles.
            entity.deployHistory ??= [];
            if (entity.deployElapsed !== undefined) entity.deployHistory.push(entity.deployElapsed);
            entity.deployElapsed = 0;
          }
          entity.deployed = deployed;
        }
        entity.constructionStage = live?.constructionSite
          ? (live.constructionStage ?? 0)
          : undefined;
        entity.construction = live?.construction
          ? (live.construction.completedTicks * 4 + live.construction.quarter) /
            Math.max(1, live.construction.totalTicks * 4)
          : entity.constructionStage === undefined
            ? undefined
            : entity.constructionStage / 100;
        const working =
          !!live &&
          !live.disabled &&
          (live.constructionOrder?.state === "working" ||
            live.repairOrder?.state === "working" ||
            live.salvageOrder?.state === "working" ||
            !!live.workAnimation);
        if (working !== entity.working || live?.workAnimation !== entity.workClip)
          entity.workElapsed = 0;
        entity.working = working;
        entity.workClip = live?.workAnimation;
        entity.workProgressTicks = live?.workProgressTicks;
        if (!options.ghost && !options.remains && snapshot.productionExits?.includes(handle)) {
          if (entity.playback)
            entity.doorElapsed = reopenDoor(
              entity.doorElapsed ?? Infinity,
              entity.playback.duration("open"),
              entity.playback.duration("close"),
            );
          else {
            entity.doorHistory ??= [];
            if (entity.doorElapsed !== undefined) entity.doorHistory.push(entity.doorElapsed);
            entity.doorElapsed = 0;
          }
        }
        if (
          !options.ghost &&
          !options.remains &&
          (snapshot.combatEvents ?? []).some(
            (event) => event.type === "launch" && event.entity === handle,
          )
        ) {
          entity.attackElapsed = 0;
          entity.clip = undefined;
        }
        if (!entity.root && !entity.loading) {
          const current = entity;
          const template = templateFor(definition, force);
          current.loading = template.loading
            .then((model) => {
              if (!model || disposed || entities.get(handle) !== current) return;
              const instance = model.instantiateModelsToScene((name) => name, false, {
                // Morph weights need their own manager; rigid parts use hardware instances.
                doNotInstantiate: (node) =>
                  node instanceof Mesh &&
                  (!!node.morphTargetManager ||
                    (!!template.footprint &&
                      !options.remains &&
                      !scene.getEngine().getCaps().instancedArrays)),
              });
              current.instance = instance;
              current.root = new TransformNode(
                `${options.remains ? "remains" : "entity"} ${handle}`,
                scene,
              );
              for (const root of instance.rootNodes) root.parent = current.root;
              const nodes = current.root
                .getDescendants()
                .filter((node) => node instanceof TransformNode);
              const meshes = current.root.getChildMeshes();
              if (template.footprint && !options.remains) initializeConstruction(meshes);
              for (const mesh of meshes) {
                mesh.isVisible = template.visibility.get(mesh.name) ?? true;
                if (options.ghost) mesh.isPickable = false;
                else meshHandles.set(mesh, handle);
              }
              current.height = Math.max(0.5, current.root.getHierarchyBoundingVectors().max.y);
              current.lod = createModelLod(nodes, meshes);
              current.playback = createModelPlayback(
                nodes,
                instance.animationGroups,
                instance.skeletons,
                [
                  ...new Set(
                    meshes.flatMap((mesh) =>
                      mesh.morphTargetManager ? [mesh.morphTargetManager] : [],
                    ),
                  ),
                ],
              );
              render(frameAt);
            })
            .finally(() => {
              current.loading = undefined;
            });
        }
        if (entity.loading) pending.push(entity.loading);
      }
      pruneTemplates();
      render(nowMs);
      accepted = Promise.all(pending).then(() => undefined);
      await accepted;
    },
    render,
    select(handles: readonly string[]) {
      selected = new Set(handles);
      render(frameAt);
    },
    /** Picking is confined to currently projected, rendered entity geometry. */
    pick(x: number, y: number): string | null {
      return pickHit(x, y)?.handle ?? null;
    },
    pickHit,
    meshes(handle: string) {
      return (
        entities
          .get(handle)
          ?.root?.getChildMeshes()
          .filter((mesh) => mesh.isVisible && mesh.isEnabled()) ?? []
      );
    },
    /** Screen-space centres from the same rendered poses used for rings and picking. */
    inRectangle(left: number, top: number, right: number, bottom: number): string[] {
      if (options.ghost || options.remains) return [];
      const camera = scene.activeCamera;
      const canvas = scene.getEngine().getRenderingCanvas();
      if (!camera || !canvas) return [];
      const viewport = camera.viewport.toGlobal(canvas.clientWidth, canvas.clientHeight);
      // Renderer viewports start at the bottom; projection and pointer boxes start at the top.
      viewport.y = canvas.clientHeight - viewport.y - viewport.height;
      const handles: string[] = [];
      for (const [handle, entity] of entities) {
        if (
          !entity.root
            ?.getChildMeshes()
            .some((mesh) => mesh.isVisible && mesh.isEnabled() && mesh.getTotalVertices() > 0)
        )
          continue;
        const point = Vector3.Project(
          entity.root.position,
          Matrix.IdentityReadOnly,
          scene.getTransformMatrix(),
          viewport,
        );
        if (
          point.z >= 0 &&
          point.z <= 1 &&
          point.x >= left &&
          point.x <= right &&
          point.y >= top &&
          point.y <= bottom
        )
          handles.push(handle);
      }
      return handles;
    },
    setPlaybackRate(rate: number) {
      if (!Number.isFinite(rate) || rate < 0) throw new RangeError("Invalid playback rate");
      playbackRate = rate;
      if (rate === 0) for (const entity of entities.values()) entity.previous = entity.current;
      render(frameAt);
    },
    /** Camera-to-entity distance in metres. Infinity keeps the authored near variants. */
    setLodDistance(metres: number) {
      if (!(metres > 0)) throw new RangeError("Invalid model LOD distance");
      lodDistance = metres;
      render(frameAt);
    },
    setForceColor(force: number, hex: string) {
      setTeamColor([], hex);
      if (options.ghost) return;
      colors.set(force, hex);
      for (const template of templates.values()) {
        if (template.force === force && template.model) setTeamColor(template.model.materials, hex);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entity of entities.values()) remove(entity);
      for (const entity of dying.values()) remove(entity);
      dying.clear();
      status.dispose();
      latest = undefined;
      entities.clear();
      meshHandles.clear();
      ringModel?.dispose();
      ringMaterial?.dispose();
      for (const template of templates.values()) template.model?.dispose();
      templates.clear();
    },
  };
}
