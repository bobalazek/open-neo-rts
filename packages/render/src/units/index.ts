// glTF presentation assets and team materials. Map instancing and projection transforms follow in phase 1b.

import {
  Color3,
  LoadAssetContainerAsync,
  type Material,
  PBRMaterial,
  type Scene,
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
        material.albedoColor = color.toLinearSpace();
        break;
      case "team_dark":
        material.albedoColor = color.scale(0.55).toLinearSpace();
        break;
      case "team_light":
        material.albedoColor = Color3.Lerp(color, Color3.White(), 0.4).toLinearSpace();
        break;
      case "team_emissive":
        material.albedoColor = color.toLinearSpace();
        material.emissiveColor = color.toLinearSpace();
        break;
    }
  }
}

/** Loads a presentation asset without ever touching simulation state. */
export async function loadModel(scene: Scene, bytes: Uint8Array) {
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
  container.addAllToScene();
  const rest = [...container.transformNodes, ...container.meshes].map((node) => ({
    node,
    position: node.position.clone(),
    rotation: node.rotation.clone(),
    rotationQuaternion: node.rotationQuaternion?.clone(),
    scaling: node.scaling.clone(),
  }));
  const morphRest = container.morphTargetManagers.flatMap((manager) =>
    Array.from({ length: manager.numTargets }, (_, index) => {
      const target = manager.getTarget(index);
      return { target, influence: target.influence };
    }),
  );
  return {
    meshes: container.meshes,
    clips: container.animationGroups.map((group) => group.name),
    setTeamColor: (hex: string) => setTeamColor(container.materials, hex),
    play(name: string): void {
      const group = container.animationGroups.find((g) => g.name === name);
      if (name && !group) throw new RangeError(`No animation "${name}"`);
      for (const animation of container.animationGroups) {
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
      for (const skeleton of container.skeletons) skeleton.returnToRest();
      group?.start(["idle", "move", "active"].includes(name));
    },
    dispose: () => container.dispose(),
  };
}
