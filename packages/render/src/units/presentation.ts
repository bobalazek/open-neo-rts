import { type AssetContainer, Mesh, type Scene, TransformNode } from "@babylonjs/core";
import type { DOMAINS, TerrainGrid } from "@open-neo-rts/content";
import type { PresentedEntity, SeatSnapshot } from "@open-neo-rts/sim";
import { CELL_SIZE, terrainHeight, waterHeight } from "../terrain";
import { createModelPlayback, loadModelContainer, setTeamColor } from "./model";

type Pose = Pick<PresentedEntity, "x" | "y" | "facing">;
type Instance = ReturnType<AssetContainer["instantiateModelsToScene"]>;
interface Entity {
  definition: string;
  force: number;
  previous: Pose;
  current: Pose;
  moving: boolean;
  root?: TransformNode;
  instance?: Instance;
  playback?: ReturnType<typeof createModelPlayback>;
  clip?: string;
  loading?: Promise<void>;
}
interface Template {
  force: number;
  movementDomain: (typeof DOMAINS)[number] | null;
  footprint?: readonly [number, number];
  visibility: Map<string, boolean>;
  model?: AssetContainer;
  loading: Promise<AssetContainer | undefined>;
}

const keyFor = (definition: string, force: number) => JSON.stringify([definition, force]);
const poseOf = ({ x, y, facing }: Pose): Pose => ({ x, y, facing });

/** A presentation-only owner. Call accept on copied worker snapshots, render with the same monotonic clock. */
export function createEntityPresentation(
  scene: Scene,
  terrain: TerrainGrid,
  resolveModel: (definition: string) => Promise<{
    bytes: Uint8Array;
    movementDomain: (typeof DOMAINS)[number] | null;
    footprint?: readonly [number, number];
  }>,
) {
  const entities = new Map<string, Entity>();
  const templates = new Map<string, Template>();
  const colors = new Map<number, string>();
  let tick: number | undefined;
  let receivedAt = 0;
  let duration = 50;
  let frameAt = 0;
  let disposed = false;

  function remove(entity: Entity) {
    const morphs = entity.root
      ?.getChildMeshes()
      .flatMap((mesh) => (mesh.morphTargetManager ? [mesh.morphTargetManager] : []));
    entity.instance?.dispose();
    for (const morph of new Set(morphs)) morph.dispose();
    entity.root?.dispose();
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
          const { bytes, movementDomain, footprint } = await resolveModel(definition);
          // A removed entity or disposed layer must not start another import.
          if (disposed || templates.get(key) !== template) return undefined;
          const model = await loadModelContainer(scene, bytes);
          if (disposed || templates.get(key) !== template) {
            model.dispose();
            return undefined;
          }
          try {
            const color = colors.get(force);
            if (color) setTeamColor(model.materials, color);
            model.addAllToScene();
            for (const mesh of model.meshes) {
              template.visibility.set(mesh.name, mesh.isVisible);
              mesh.isVisible = false;
            }
            template.movementDomain = movementDomain;
            template.footprint = footprint;
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
    frameAt = nowMs;
    const alpha = Math.max(0, Math.min(1, (nowMs - receivedAt) / duration));
    for (const entity of entities.values()) {
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
        x += (turned ? depth : width) / 2;
        y += (turned ? width : depth) / 2;
      }
      const height =
        template?.movementDomain === "naval"
          ? waterHeight(terrain, x, y)
          : terrainHeight(terrain, x, y);
      entity.root.position.set(x * CELL_SIZE, height, y * CELL_SIZE);
      // Sim 0 faces +x; authored glTF fronts face +Z, with +y on the map becoming +z.
      entity.root.rotation.y = Math.PI / 2 - ((a.facing + turn * alpha) * Math.PI * 2) / 65536;
      const clip =
        entity.moving && entity.playback.clips.includes("move")
          ? "move"
          : entity.playback.clips.includes("idle")
            ? "idle"
            : "";
      if (clip !== entity.clip) {
        entity.playback.play(clip);
        entity.clip = clip;
      }
    }
  }

  return {
    async accept(snapshot: SeatSnapshot, nowMs: number): Promise<void> {
      if (disposed) throw new Error("Entity presentation is disposed");
      if (tick !== undefined && snapshot.tick <= tick) return;
      duration = tick === undefined ? 50 : (snapshot.tick - tick) * 50;
      tick = snapshot.tick;
      receivedAt = nowMs;
      frameAt = nowMs;
      const visible = new Set(snapshot.entities.map((entity) => entity.handle));
      for (const [handle, entity] of entities) {
        if (!visible.has(handle)) {
          remove(entity);
          entities.delete(handle);
        }
      }
      const pending: Promise<void>[] = [];
      const used = new Set<string>();
      for (const projected of snapshot.entities) {
        const { handle, definition, force } = projected;
        let entity = entities.get(handle);
        if (entity && (entity.definition !== definition || entity.force !== force)) {
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
          };
          entities.set(handle, entity);
        } else {
          entity.previous = entity.current;
          entity.current = poseOf(projected);
          entity.moving =
            entity.previous.x !== entity.current.x || entity.previous.y !== entity.current.y;
        }
        used.add(keyFor(definition, force));
        if (!entity.root && !entity.loading) {
          const current = entity;
          const template = templateFor(definition, force);
          current.loading = template.loading
            .then((model) => {
              if (!model || disposed || entities.get(handle) !== current) return;
              const instance = model.instantiateModelsToScene((name) => name, false, {
                // Morph weights need their own manager; rigid parts use hardware instances.
                doNotInstantiate: (node) => node instanceof Mesh && !!node.morphTargetManager,
              });
              current.instance = instance;
              current.root = new TransformNode(`entity ${handle}`, scene);
              for (const root of instance.rootNodes) root.parent = current.root;
              const nodes = current.root
                .getDescendants()
                .filter((node) => node instanceof TransformNode);
              const meshes = current.root.getChildMeshes();
              for (const mesh of meshes)
                mesh.isVisible = template.visibility.get(mesh.name) ?? true;
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
      for (const [key, template] of templates) {
        if (!used.has(key)) {
          template.model?.dispose();
          templates.delete(key);
        }
      }
      render(nowMs);
      await Promise.all(pending);
    },
    render,
    setForceColor(force: number, hex: string) {
      setTeamColor([], hex);
      colors.set(force, hex);
      for (const template of templates.values()) {
        if (template.force === force && template.model) setTeamColor(template.model.materials, hex);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entity of entities.values()) remove(entity);
      entities.clear();
      for (const template of templates.values()) template.model?.dispose();
      templates.clear();
    },
  };
}
