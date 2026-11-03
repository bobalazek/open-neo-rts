// Disposable original-code cube effects. Only permitted projected events can create them.
import {
  Color3,
  DynamicTexture,
  type InstancedMesh,
  Mesh,
  MeshBuilder,
  type Scene,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";
import type { TerrainGrid } from "@open-neo-rts/content";
import type { PresentedCombatEvent, SeatSnapshot } from "@open-neo-rts/sim";
import { CELL_SIZE, terrainHeight } from "../terrain";
import { createGroundFirePresentation } from "./ground-fire";

export const MAX_COMBAT_EFFECTS = 512;
interface Effect {
  mesh: InstancedMesh;
  position: Vector3;
  previous: Vector3;
  elapsed: number;
  duration: number;
  kind: "round" | "impact" | "damage" | "death";
  tick: number;
  handle?: string;
  label?: Mesh;
}
/** Fog changes can revoke a previously disclosed location before a cosmetic effect expires. */
export function eventVisible(snapshot: SeatSnapshot, x: number, y: number): boolean {
  if (snapshot.mode === "debug-no-fog" || !snapshot.fog?.length) return true;
  const cx = Math.floor(x / 1024),
    cy = Math.floor(y / 1024);
  return snapshot.fog.some(
    (grid) =>
      cx >= 0 &&
      cy >= 0 &&
      cx < grid.width &&
      cy < grid.height &&
      grid.cells[cy * grid.width + cx] === 2,
  );
}

export function createCombatEffects(scene: Scene, terrain: TerrainGrid) {
  const groundFire = createGroundFirePresentation(scene, terrain);
  const effects = new Set<Effect>();
  const rounds = new Map<string, Effect>();
  let template: Mesh | undefined;
  let material: StandardMaterial | undefined;
  let snapshot: SeatSnapshot | undefined;
  let tick = -1,
    frameAt = 0,
    receivedAt = 0,
    interval = 50,
    rate = 1,
    disposed = false;
  const point = (x: number, y: number) =>
    new Vector3(
      (x * CELL_SIZE) / 1024,
      terrainHeight(terrain, x / 1024, y / 1024) + 0.6,
      (y * CELL_SIZE) / 1024,
    );
  function remove(effect: Effect) {
    effect.mesh.dispose();
    effect.label?.dispose(false, true);
    effects.delete(effect);
    if (effect.handle && rounds.get(effect.handle) === effect) rounds.delete(effect.handle);
  }
  function add(event: PresentedCombatEvent, kind: Effect["kind"]): Effect | undefined {
    if (effects.size >= MAX_COMBAT_EFFECTS) return;
    if (!template) {
      template = MeshBuilder.CreateBox("combat cube template", { size: 1 }, scene);
      material = new StandardMaterial("combat glow", scene);
      material.emissiveColor = Color3.FromHexString("#ffba52");
      material.diffuseColor = material.emissiveColor;
      material.disableLighting = true;
      template.material = material;
      template.isVisible = template.isPickable = false;
    }
    const mesh = template.createInstance(`combat ${kind}`);
    mesh.isVisible = true;
    mesh.isPickable = false;
    const position = point(event.x, event.y);
    const effect: Effect = {
      mesh,
      position,
      previous: position.clone(),
      elapsed: 0,
      duration: kind === "round" ? 150 : kind === "death" ? 600 : kind === "damage" ? 300 : 180,
      kind,
      tick,
    };
    if (kind === "damage" && event.amount !== undefined && typeof document !== "undefined") {
      const label = MeshBuilder.CreatePlane(
        "projected damage label",
        { width: 1.2, height: 0.6 },
        scene,
      );
      const texture = new DynamicTexture(
        "projected damage",
        { width: 128, height: 64 },
        scene,
        false,
      );
      texture.hasAlpha = true;
      texture.drawText(
        `−${event.amount}`,
        null,
        46,
        "bold 40px sans-serif",
        "#ffe9b7",
        "transparent",
        true,
      );
      const text = new StandardMaterial("projected damage label", scene);
      text.diffuseTexture = texture;
      text.useAlphaFromDiffuseTexture = true;
      text.emissiveColor = Color3.White();
      text.disableLighting = true;
      text.backFaceCulling = false;
      label.material = text;
      label.billboardMode = Mesh.BILLBOARDMODE_ALL;
      label.isPickable = false;
      effect.label = label;
    }
    effects.add(effect);
    return effect;
  }
  function continuous(a: Vector3, b: Vector3): boolean {
    const current = snapshot;
    if (!current) return false;
    if (current.mode === "debug-no-fog" || !current.fog?.length) return true;
    // Event positions convert by powers of two; these are the original integer subcells.
    const ax = (a.x * 1024) / CELL_SIZE,
      ay = (a.z * 1024) / CELL_SIZE;
    const bx = (b.x * 1024) / CELL_SIZE,
      by = (b.z * 1024) / CELL_SIZE;
    const visible = (x: number, y: number) => eventVisible(current, x * 1024 + 512, y * 1024 + 512);
    const endpoint = (x: number, y: number) => {
      const cx = Math.floor(x / 1024),
        cy = Math.floor(y / 1024);
      return (
        visible(cx, cy) &&
        (x % 1024 !== 0 || visible(cx - 1, cy)) &&
        (y % 1024 !== 0 || visible(cx, cy - 1)) &&
        (x % 1024 !== 0 || y % 1024 !== 0 || visible(cx - 1, cy - 1))
      );
    };
    if (!endpoint(ax, ay) || !endpoint(bx, by)) return false;
    let x = Math.floor(ax / 1024),
      y = Math.floor(ay / 1024);
    const endX = Math.floor(bx / 1024),
      endY = Math.floor(by / 1024);
    const dx = bx - ax,
      dy = by - ay,
      width = Math.abs(dx),
      height = Math.abs(dy);
    const sx = Math.sign(dx),
      sy = Math.sign(dy);
    let nextX = sx > 0 ? (x + 1) * 1024 - ax : ax - x * 1024;
    let nextY = sy > 0 ? (y + 1) * 1024 - ay : ay - y * 1024;
    // Closed-cell supercover: exact corners and segments on grid edges touch both sides.
    const touched = (cx: number, cy: number) =>
      visible(cx, cy) &&
      (dx !== 0 || ax % 1024 !== 0 || visible(cx - 1, cy)) &&
      (dy !== 0 || ay % 1024 !== 0 || visible(cx, cy - 1));
    for (let crossing = 0; crossing <= terrain.width + terrain.height; crossing++) {
      if (!touched(x, y)) return false;
      if (x === endX && y === endY) return true;
      const comparison = width === 0 ? 1 : height === 0 ? -1 : nextX * height - nextY * width;
      if (comparison === 0) {
        if (!touched(x + sx, y) || !touched(x, y + sy)) return false;
        x += sx;
        y += sy;
        nextX += 1024;
        nextY += 1024;
      } else if (comparison < 0) {
        x += sx;
        nextX += 1024;
      } else {
        y += sy;
        nextY += 1024;
      }
    }
    return false;
  }

  function render(nowMs: number) {
    if (disposed) return;
    const delta = rate ? Math.max(0, nowMs - frameAt) : 0;
    frameAt = nowMs;
    groundFire.render(delta);
    for (const effect of effects) {
      effect.elapsed += delta;
      if (effect.elapsed >= effect.duration) {
        remove(effect);
        continue;
      }
      const progress = effect.elapsed / effect.duration;
      const alpha = rate ? Math.max(0, Math.min(1, (nowMs - receivedAt) / interval)) : 1;
      effect.mesh.position.copyFrom(
        Vector3.Lerp(effect.previous, effect.position, effect.kind === "round" ? alpha : 1),
      );
      if (effect.kind === "round") effect.mesh.scaling.setAll(0.15);
      else {
        const size = effect.kind === "death" ? 0.6 : effect.kind === "damage" ? 0.25 : 0.35;
        effect.mesh.scaling.setAll(size * (1 - progress));
        effect.mesh.rotation.y = progress * 2;
        effect.mesh.position.y += effect.kind === "damage" ? progress : progress * 0.3;
        if (effect.label) {
          effect.label.position.copyFrom(effect.mesh.position);
          effect.label.position.y += 1.8;
        }
      }
    }
  }
  return {
    accept(next: SeatSnapshot, nowMs: number) {
      if (disposed || next.tick <= tick) return;
      render(nowMs);
      interval = tick < 0 ? 50 : (next.tick - tick) * 50;
      tick = next.tick;
      groundFire.accept(next);
      receivedAt = nowMs;
      // Retain only copied public fog cells, never a mutable caller-owned snapshot.
      snapshot = {
        tick,
        mode: next.mode,
        entities: [],
        fog: next.fog?.map((grid) => ({ ...grid, cells: grid.cells.slice() })),
      };
      for (const effect of effects)
        if (
          !eventVisible(
            snapshot,
            (effect.position.x * 1024) / CELL_SIZE,
            (effect.position.z * 1024) / CELL_SIZE,
          )
        )
          remove(effect);
      const active = new Set<string>();
      for (const event of next.combatEvents ?? []) {
        if (!eventVisible(next, event.x, event.y)) continue;
        if (event.type === "launch" || event.type === "flight") {
          if (event.projectile === "instant" || event.projectile === "beam" || !event.handle) {
            if (event.type === "launch") add(event, "impact");
            continue;
          }
          const previous = rounds.get(event.handle);
          const effect = previous ?? add(event, "round");
          if (!effect) continue;
          const position = point(event.x, event.y);
          effect.previous =
            previous && effect.tick === tick - 1 && continuous(effect.position, position)
              ? effect.position.clone()
              : position.clone();
          effect.position = position;
          effect.elapsed = 0;
          effect.tick = tick;
          effect.handle = event.handle;
          rounds.set(event.handle, effect);
          active.add(event.handle);
        } else if (event.type === "impact") {
          const round = event.handle && rounds.get(event.handle);
          if (round) remove(round);
          add(event, "impact");
        } else if (event.type === "damage" && (event.amount ?? 0) > 0) add(event, "damage");
        else if (event.type === "death") add(event, "death");
      }
      // An absent pN is unknown, not an invitation to extrapolate through hidden space.
      for (const [handle, effect] of rounds) if (!active.has(handle)) remove(effect);
      render(nowMs);
    },
    render,
    setPlaybackRate(value: number) {
      if (!Number.isFinite(value) || value < 0) throw new RangeError("Invalid playback rate");
      rate = value;
    },
    dispose() {
      disposed = true;
      groundFire.dispose();
      for (const effect of effects) remove(effect);
      template?.dispose();
      material?.dispose();
      snapshot = undefined;
    },
  };
}
