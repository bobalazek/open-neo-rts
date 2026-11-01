// Self-contained glTF assets shared by the preview and entity presentation paths.

import {
  type AnimationGroup,
  Color3,
  LoadAssetContainerAsync,
  type Material,
  type MorphTargetManager,
  PBRMaterial,
  type Scene,
  type Skeleton,
  type TransformNode,
} from "@babylonjs/core";
import { registerBuiltInLoaders } from "@babylonjs/loaders/dynamic";

registerBuiltInLoaders();

/** Changes only the standard team slots; each loaded model owns its materials. */
export function setTeamColor(materials: readonly Material[], hex: string): void {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new RangeError("Team colour must be #RRGGBB");
  const color = Color3.FromHexString(hex);
  for (const material of materials) {
    if (!(material instanceof PBRMaterial)) continue;
    switch (material.name) {
      case "team":
        material.albedoColor = color.toLinearSpace(true);
        break;
      case "team_dark":
        material.albedoColor = color.scale(0.55).toLinearSpace(true);
        break;
      case "team_light":
        material.albedoColor = Color3.Lerp(color, Color3.White(), 0.4).toLinearSpace(true);
        break;
      case "team_emissive":
        material.albedoColor = color.toLinearSpace(true);
        material.emissiveColor = color.toLinearSpace(true);
        break;
    }
  }
}

/** Loads a presentation asset without ever touching simulation state. */
export async function loadModelContainer(scene: Scene, bytes: Uint8Array) {
  const container = await LoadAssetContainerAsync(bytes, scene, {
    pluginExtension: ".glb",
    pluginOptions: {
      gltf: {
        animationStartMode: 0,
        preprocessUrlAsync: async (url: string) => {
          if (!/^data:/i.test(url)) throw new Error("Model check requires a self-contained GLB");
          return url;
        },
      },
    },
  });
  if (!container.meshes.some((mesh) => mesh.getTotalVertices() > 0)) {
    container.dispose();
    throw new Error("Model has no mesh geometry");
  }
  return container;
}

export async function loadModel(scene: Scene, bytes: Uint8Array) {
  const container = await loadModelContainer(scene, bytes);
  container.addAllToScene();
  return {
    meshes: container.meshes,
    ...createModelPlayback(
      [...container.transformNodes, ...container.meshes],
      container.animationGroups,
      container.skeletons,
      container.morphTargetManagers,
    ),
    setTeamColor: (hex: string) => setTeamColor(container.materials, hex),
    dispose: () => container.dispose(),
  };
}

export function createModelPlayback(
  nodes: readonly TransformNode[],
  groups: readonly AnimationGroup[],
  skeletons: readonly Skeleton[],
  morphManagers: readonly MorphTargetManager[],
) {
  const rest = nodes.map((node) => ({
    node,
    position: node.position.clone(),
    rotation: node.rotation.clone(),
    rotationQuaternion: node.rotationQuaternion?.clone(),
    scaling: node.scaling.clone(),
  }));
  const morphRest = morphManagers.flatMap((manager) =>
    Array.from({ length: manager.numTargets }, (_, index) => {
      const target = manager.getTarget(index);
      return { target, influence: target.influence };
    }),
  );
  return {
    clips: groups.map((group) => group.name),
    setRate(rate: number) {
      for (const group of groups) group.speedRatio = rate;
    },
    play(name: string): void {
      const group = groups.find((g) => g.name === name);
      if (name && !group) throw new RangeError(`No animation "${name}"`);
      for (const animation of groups) {
        animation.stop();
      }
      for (const pose of rest) {
        pose.node.position.copyFrom(pose.position);
        pose.node.rotation.copyFrom(pose.rotation);
        pose.node.scaling.copyFrom(pose.scaling);
        if (pose.rotationQuaternion)
          pose.node.rotationQuaternion?.copyFrom(pose.rotationQuaternion);
      }
      for (const pose of morphRest) pose.target.influence = pose.influence;
      for (const skeleton of skeletons) skeleton.returnToRest();
      group?.start(["idle", "move", "active"].includes(name));
    },
  };
}
