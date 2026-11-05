import {
  type AbstractMesh,
  Color3,
  MeshBuilder,
  Quaternion,
  RotationGizmo,
  type Scene,
  StandardMaterial,
  UtilityLayerRenderer,
  Vector3,
} from "@babylonjs/core";
import type { loadModel } from "./model";

type Model = Awaited<ReturnType<typeof loadModel>>;
export interface ModelPreviewAssets {
  weapons?: readonly { socket?: string }[];
  wreck?: Uint8Array;
  parts?: readonly string[];
  materials?: Readonly<Record<string, string>>;
}

/** Isolated authoring effects; never emit commands or change gameplay values. */
export function createModelActions(
  scene: Scene,
  live: Model,
  wreck?: Model,
  weapons?: ModelPreviewAssets["weapons"],
  partNames?: readonly string[],
) {
  const parts = live.nodes
    .filter((node) =>
      partNames
        ? partNames.includes(node.name)
        : /^(hull|turret|barrel|rotor|legs)(_[0-9]+)?$/.test(node.name),
    )
    .map((node) => ({
      node,
      rotation: node.rotation.clone(),
      quaternion: node.rotationQuaternion?.clone(),
      rest: node.rotationQuaternion?.clone() ?? Quaternion.FromEulerVector(node.rotation),
      angles: [0, 0, 0],
    }));
  const restoreParts = () => {
    for (const part of parts) {
      part.node.rotation.copyFrom(part.rotation);
      part.node.rotationQuaternion = part.quaternion?.clone() ?? null;
    }
  };
  let partGizmo: RotationGizmo | undefined;
  let partLayer: UtilityLayerRenderer | undefined;
  let selectedPart: (typeof parts)[number] | undefined;
  let partChanged: (() => void) | undefined;
  const hidePartGizmo = () => {
    selectedPart = undefined;
    if (partGizmo) partGizmo.attachedNode = null;
  };
  const poseParts = () => {
    if (state !== "live") return;
    for (const part of parts)
      if (part.angles.some((angle) => angle !== 0))
        part.node.rotationQuaternion = part.rest.multiply(
          Quaternion.FromEulerAngles(
            (part.angles[0]! * Math.PI) / 180,
            (part.angles[1]! * Math.PI) / 180,
            (part.angles[2]! * Math.PI) / 180,
          ),
        );
  };
  const enable = (model: Model | undefined, enabled: boolean) => {
    if (!model) return;
    for (const node of model.nodes)
      if (!model.nodes.some((parent) => parent === node.parent)) node.setEnabled(enabled);
  };
  enable(live, true);
  enable(wreck, false);
  const wreckPose = (wreck?.nodes ?? []).flatMap((node) => {
    if (!["turret", "barrel"].includes(node.name)) return [];
    const source = live.nodes.find((source) => source.name === node.name);
    if (!source) return [];
    return [
      {
        node,
        source,
        rotation: node.rotation.clone(),
        quaternion: node.rotationQuaternion?.clone(),
        liveRotation:
          source.rotationQuaternion?.clone() ??
          Quaternion.FromEulerAngles(source.rotation.x, source.rotation.y, source.rotation.z),
      },
    ];
  });
  const sockets = [...new Set(weapons?.map((weapon) => weapon.socket ?? "socket_muzzle"))];
  const muzzles = live.nodes.filter((node) =>
    weapons
      ? sockets.some((socket) => node.name === socket || node.name.startsWith(`${socket}_`))
      : node.name.startsWith("socket_muzzle"),
  );
  const bounds = scene.getWorldExtends((mesh) => live.meshes.includes(mesh));
  const size = Math.max(0.1, bounds.max.subtract(bounds.min).length());
  let effects: AbstractMesh[] = [];
  let fragments: { mesh: AbstractMesh; origin: Vector3; velocity: Vector3; scale: Vector3 }[] = [];
  let material: StandardMaterial | undefined;
  let firing = -1,
    elapsed = 0,
    state: "live" | "death" | "debris" | "wreck" = "live";
  const posing = scene.onAfterAnimationsObservable.add(poseParts);
  const clear = () => {
    for (const mesh of effects) mesh.dispose(false, mesh.name === "preview tracer");
    effects = [];
    for (const { mesh } of fragments) mesh.dispose();
    fragments = [];
    firing = -1;
  };
  const showWreck = () => {
    enable(live, false);
    enable(wreck, true);
    state = "wreck";
  };
  function scatter() {
    // Bound the preview to 32 visible authored pieces; their geometry/materials stay original.
    const pieces = live.meshes
      .filter((mesh) => mesh.getTotalVertices() > 0 && mesh.isEnabled() && mesh.isVisible)
      .slice(0, 32);
    fragments = pieces.flatMap((mesh, index) => {
      const clone = mesh.clone(`preview debris ${index}`, null, true);
      if (!clone) return [];
      clone.rotationQuaternion = Quaternion.Identity();
      mesh
        .computeWorldMatrix(true)
        .decompose(clone.scaling, clone.rotationQuaternion, clone.position);
      clone.isVisible = true;
      clone.isPickable = false;
      return [
        {
          mesh: clone,
          origin: clone.position.clone(),
          scale: clone.scaling.clone(),
          velocity: new Vector3(
            Math.sin(index * 2.4) * size * 0.7,
            size * (0.8 + (index % 3) * 0.15),
            Math.cos(index * 2.4) * size * 0.7,
          ),
        },
      ];
    });
    enable(live, false);
    state = "debris";
    elapsed = 0;
  }
  return {
    parts: parts.map((part) => part.node.name),
    selectPart(name: string | undefined, changed?: () => void) {
      const part = state === "live" && parts.find((part) => part.node.name === name);
      partChanged = changed;
      if (!part) {
        hidePartGizmo();
        return;
      }
      if (!partGizmo) {
        partLayer = new UtilityLayerRenderer(scene);
        partGizmo = new RotationGizmo(partLayer);
        partGizmo.onDragStartObservable.add(() => {
          clear();
          live.play("");
          restoreParts();
          poseParts();
        });
        partGizmo.onDragObservable.add(() => {
          if (!selectedPart) return;
          const rotation =
            selectedPart.node.rotationQuaternion ??
            Quaternion.FromEulerVector(selectedPart.node.rotation);
          const angles = selectedPart.rest
            .conjugate()
            .multiply(rotation)
            .normalize()
            .toEulerAngles();
          selectedPart.angles = angles.asArray().map((angle) => (angle * 180) / Math.PI);
          restoreParts();
          poseParts();
          partChanged?.();
        });
      }
      selectedPart = part;
      if (partGizmo.attachedNode !== part.node) partGizmo.attachedNode = part.node;
    },
    partAngles(name: string) {
      return [...(parts.find((part) => part.node.name === name)?.angles ?? [0, 0, 0])];
    },
    posePart(name: string, axis: number, degrees: number) {
      const part = parts.find((part) => part.node.name === name);
      if (
        !part ||
        !Number.isInteger(axis) ||
        axis < 0 ||
        axis > 2 ||
        !Number.isFinite(degrees) ||
        Math.abs(degrees) > 180
      )
        throw new RangeError("Invalid preview part rotation");
      if (state !== "live") return false;
      clear();
      live.play("");
      restoreParts();
      part.angles[axis] = degrees;
      poseParts();
      return true;
    },
    get canFire() {
      return state === "live" && muzzles.length > 0;
    },
    get canDestroy() {
      return state === "live";
    },
    fire() {
      if (state !== "live" || !muzzles.length) return false;
      clear();
      const clip = ["fire_recoil", "attack"].find((name) => live.clips.includes(name));
      live.play(clip ?? "");
      poseParts();
      if (!material) {
        material = new StandardMaterial("preview muzzle", scene);
        material.emissiveColor = material.diffuseColor = Color3.FromHexString("#ffba52");
        material.disableLighting = true;
      }
      for (const muzzle of muzzles) {
        const matrix = muzzle.computeWorldMatrix(true);
        const start = Vector3.TransformCoordinates(Vector3.Zero(), matrix);
        const direction = Vector3.TransformNormal(new Vector3(0, 0, 1), matrix).normalize();
        const flash = MeshBuilder.CreateBox("preview muzzle flash", { size: size / 25 }, scene);
        flash.position.copyFrom(start);
        flash.material = material;
        flash.isPickable = false;
        // Fixed-length direction aid, not a claim about the weapon's gameplay range.
        const tracer = MeshBuilder.CreateLines(
          "preview tracer",
          {
            points: [start, start.add(direction.scale(size))],
          },
          scene,
        );
        tracer.color = material.emissiveColor;
        tracer.isPickable = false;
        effects.push(flash, tracer);
      }
      firing = 0;
      return true;
    },
    destroy() {
      if (state !== "live") return;
      hidePartGizmo();
      clear();
      for (const pose of wreckPose) {
        const source = pose.source;
        const current =
          source.rotationQuaternion ??
          Quaternion.FromEulerAngles(source.rotation.x, source.rotation.y, source.rotation.z);
        // Carry aiming relative to rest, preserving the wreck's authored tilt and geometry.
        pose.node.rotationQuaternion = current
          .multiply(pose.liveRotation.conjugate())
          .multiply(
            pose.quaternion ??
              Quaternion.FromEulerAngles(pose.rotation.x, pose.rotation.y, pose.rotation.z),
          );
      }
      elapsed = 0;
      if (live.clips.includes("death")) {
        restoreParts();
        live.play("death");
        state = "death";
      } else scatter();
    },
    reset() {
      hidePartGizmo();
      clear();
      restoreParts();
      for (const part of parts) part.angles.fill(0);
      enable(wreck, false);
      for (const pose of wreckPose) {
        pose.node.rotation.copyFrom(pose.rotation);
        pose.node.rotationQuaternion = pose.quaternion?.clone() ?? null;
      }
      enable(live, true);
      live.play("");
      state = "live";
    },
    update(deltaMs: number) {
      if (firing >= 0) {
        firing += deltaMs;
        if (firing >= 180) clear();
      }
      elapsed += deltaMs;
      if (state === "death" && elapsed >= live.duration("death")) showWreck();
      if (state !== "debris") return;
      const t = elapsed / 1000;
      for (const { mesh, origin, velocity, scale } of fragments) {
        mesh.position.copyFrom(origin.add(velocity.scale(t)));
        mesh.position.y -= size * 1.5 * t * t;
        mesh.scaling.copyFrom(scale.scale(Math.max(0, 1 - t / 0.75)));
        mesh.rotationQuaternion?.multiplyInPlace(
          Quaternion.FromEulerAngles(deltaMs / 800, 0, deltaMs / 1200),
        );
      }
      if (elapsed >= 750) {
        clear();
        showWreck();
      }
    },
    setTeamColor(hex: string) {
      live.setTeamColor(hex);
      wreck?.setTeamColor(hex);
    },
    dispose() {
      partGizmo?.dispose();
      partLayer?.dispose();
      scene.onAfterAnimationsObservable.remove(posing);
      clear();
      material?.dispose();
    },
  };
}
