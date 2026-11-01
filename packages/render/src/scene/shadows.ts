import {
  type AbstractMesh,
  Color3,
  InstancedMesh,
  MeshBuilder,
  type Scene,
  type ShadowGenerator,
  StandardMaterial,
  type TransformNode,
} from "@babylonjs/core";

// Explicit registration keeps water, selection rings and hidden GLB templates out of shadow maps.
const scenes = new WeakMap<Scene, ReturnType<typeof createRegistry>>();
function createRegistry() {
  return {
    casters: new Set<AbstractMesh>(),
    models: new Map<TransformNode, AbstractMesh | undefined>(),
    generator: undefined as ShadowGenerator | undefined,
    low: false,
    material: undefined as StandardMaterial | undefined,
  };
}
function registry(scene: Scene) {
  let value = scenes.get(scene);
  if (!value) {
    value = createRegistry();
    scenes.set(scene, value);
  }
  return value;
}

export function registerShadowCaster(mesh: AbstractMesh): void {
  const state = registry(mesh.getScene());
  if (!mesh.getTotalVertices() || state.casters.has(mesh)) return;
  // Receiving is a shared source-mesh property in Babylon's hardware instance path.
  (mesh instanceof InstancedMesh ? mesh.sourceMesh : mesh).receiveShadows = true;
  state.casters.add(mesh);
  state.generator?.addShadowCaster(mesh, false);
  mesh.onDisposeObservable.addOnce(() => {
    state.casters.delete(mesh);
    state.generator?.removeShadowCaster(mesh, false);
  });
}

/** Register visible instances, never their hidden source mesh: Babylon batches their shared parts. */
export function registerModelShadows(root: TransformNode): void {
  const scene = root.getScene();
  const state = registry(scene);
  const meshes = root.getChildMeshes().filter((mesh) => mesh.getTotalVertices());
  for (const mesh of meshes) registerShadowCaster(mesh);
  if (!meshes.length) return;
  state.models.set(root, undefined);
  root.onDisposeObservable.addOnce(() => {
    state.models.delete(root);
    if (!state.models.size) {
      state.material?.dispose();
      state.material = undefined;
    }
  });
  if (state.low) createBlob(root);
}

function createBlob(root: TransformNode): void {
  const scene = root.getScene();
  const state = registry(scene);
  if (!state.material) {
    state.material = new StandardMaterial("blob shadows", scene);
    state.material.diffuseColor = Color3.Black();
    state.material.emissiveColor = Color3.Black();
    state.material.disableLighting = true;
    state.material.alpha = 0.2;
    state.material.backFaceCulling = false;
  }
  root.computeWorldMatrix(true);
  const bounds = root.getHierarchyBoundingVectors(true);
  const blob = MeshBuilder.CreateDisc("blob shadow", { radius: 1, tessellation: 16 }, scene);
  blob.material = state.material;
  blob.isPickable = false;
  blob.rotation.x = Math.PI / 2;
  blob.parent = root;
  blob.position.y = 0.025;
  blob.scaling.set(
    Math.max(0.25, (bounds.max.x - bounds.min.x) / 2),
    Math.max(0.25, (bounds.max.z - bounds.min.z) / 2),
    1,
  );
  state.models.set(root, blob);
}

export function setSceneShadows(
  scene: Scene,
  generator: ShadowGenerator | undefined,
  low: boolean,
): void {
  const state = registry(scene);
  state.generator = generator;
  state.low = low;
  for (const mesh of state.casters) generator?.addShadowCaster(mesh, false);
  for (const [root, blob] of state.models) {
    blob?.dispose();
    state.models.set(root, undefined);
    if (low) createBlob(root);
  }
  if (!low) {
    state.material?.dispose();
    state.material = undefined;
  }
}
