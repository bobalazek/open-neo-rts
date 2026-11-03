import {
  type AbstractEngine,
  type AbstractMesh,
  type AssetContainer,
  Color3,
  type Material,
  MaterialPluginBase,
  Mesh,
  MeshBuilder,
  type Scene,
  ShaderLanguage,
  StandardMaterial,
  type SubMesh,
  type UniformBuffer,
  Vector2,
} from "@babylonjs/core";
import { CELL_SIZE } from "../terrain";

const LAYER_HEIGHT = 0.25;

/** Per-instance cutoff leaves original model geometry and shared team materials intact. */
class ConstructionMaterial extends MaterialPluginBase {
  constructor(material: Material) {
    super(material, "ConstructionAssembly", 150, {}, true, false);
    this.doNotSerialize = true;
    this.registerForExtraEvents = true;
    this._enable(true);
  }
  override getClassName() {
    return "ConstructionAssemblyMaterial";
  }
  override isCompatible() {
    return true;
  }
  override getAttributes(attributes: string[]) {
    attributes.push("instanceAssembly");
  }
  override getUniforms(language = ShaderLanguage.GLSL) {
    return {
      ubo: [{ name: "assemblyCutoff", size: 2, type: "vec2" }],
      vertex: language === ShaderLanguage.GLSL ? "uniform vec2 assemblyCutoff;" : "",
    };
  }
  override hardBindForSubMesh(
    buffer: UniformBuffer,
    _scene: Scene,
    _engine: AbstractEngine,
    subMesh: SubMesh,
  ) {
    const plane = subMesh.getRenderingMesh().instancedBuffers?.instanceAssembly;
    buffer.updateFloat2(
      "assemblyCutoff",
      plane instanceof Vector2 ? plane.x : 0,
      plane instanceof Vector2 ? plane.y : 0,
    );
  }
  override getCustomCode(type: string, language = ShaderLanguage.GLSL): Record<string, string> {
    if (language === ShaderLanguage.WGSL)
      return type === "vertex"
        ? {
            CUSTOM_VERTEX_DEFINITIONS: `#ifdef INSTANCES
          attribute instanceAssembly: vec2f;
          #endif
          varying vAssembly: vec2f;`,
            CUSTOM_VERTEX_MAIN_END: `#ifdef INSTANCES
          vertexOutputs.vAssembly = input.instanceAssembly;
          #else
          vertexOutputs.vAssembly = uniforms.assemblyCutoff;
          #endif`,
          }
        : {
            CUSTOM_FRAGMENT_DEFINITIONS: "varying vAssembly: vec2f;",
            CUSTOM_FRAGMENT_MAIN_BEGIN:
              "if (fragmentInputs.vAssembly.y > 0.5 && fragmentInputs.vPositionW.y > fragmentInputs.vAssembly.x) { discard; }",
          };
    return type === "vertex"
      ? {
          CUSTOM_VERTEX_DEFINITIONS: `#ifdef INSTANCES
        attribute vec2 instanceAssembly;
        #endif
        varying vec2 vAssembly;`,
          CUSTOM_VERTEX_MAIN_END: `#ifdef INSTANCES
        vAssembly = instanceAssembly;
        #else
        vAssembly = assemblyCutoff;
        #endif`,
        }
      : {
          CUSTOM_FRAGMENT_DEFINITIONS: "varying vec2 vAssembly;",
          CUSTOM_FRAGMENT_MAIN_BEGIN:
            "if (vAssembly.y > 0.5 && vPositionW.y > vAssembly.x) discard;",
        };
  }
}

export function prepareConstruction(model: AssetContainer): void {
  for (const material of model.materials)
    if (!material.pluginManager?.getPlugin("ConstructionAssembly"))
      new ConstructionMaterial(material);
  for (const mesh of model.meshes)
    if (mesh instanceof Mesh && mesh.getTotalVertices()) {
      mesh.registerInstancedBuffer("instanceAssembly", 2);
      mesh.instancedBuffers.instanceAssembly = new Vector2(0, 0);
    }
}

/** Each instance must own the value object as well as the GPU slot. */
export function initializeConstruction(meshes: readonly AbstractMesh[]): void {
  for (const mesh of meshes) {
    if (!mesh.getTotalVertices()) continue;
    if (mesh instanceof Mesh) mesh.registerInstancedBuffer("instanceAssembly", 2);
    mesh.instancedBuffers ??= {};
    mesh.instancedBuffers.instanceAssembly = new Vector2(0, 0);
  }
}

export function setConstructionStage(
  meshes: readonly AbstractMesh[],
  ground: number,
  height: number,
  stage?: number,
): void {
  // First-pass brick sources use 0.25 m layers; completion reveals the final partial layer too.
  const layers = Math.floor((height * (stage ?? 100)) / 100 / LAYER_HEIGHT);
  const cutoff = ground + layers * LAYER_HEIGHT;
  for (const mesh of meshes) {
    const plane = mesh.instancedBuffers?.instanceAssembly;
    if (plane instanceof Vector2)
      plane.set(cutoff - 0.001, stage === undefined || stage === 100 ? 0 : 1);
  }
}

/** Visible construction envelope also keeps a zero-progress site selectable. */
export function createConstructionScaffold(
  scene: Scene,
  footprint: readonly [number, number],
  height: number,
  ghost: boolean,
): Mesh {
  const scaffold = MeshBuilder.CreateBox(
    "construction scaffold",
    {
      width: footprint[0] * CELL_SIZE + 0.2,
      depth: footprint[1] * CELL_SIZE + 0.2,
      height,
    },
    scene,
  );
  const material = new StandardMaterial("construction scaffold", scene);
  material.emissiveColor = Color3.FromHexString(ghost ? "#888888" : "#e6b957");
  material.disableLighting = true;
  material.wireframe = true;
  material.backFaceCulling = false;
  scaffold.material = material;
  scaffold.position.y = height / 2 + 0.03;
  scaffold.isPickable = !ghost;
  scaffold.onDisposeObservable.addOnce(() => material.dispose());
  return scaffold;
}
