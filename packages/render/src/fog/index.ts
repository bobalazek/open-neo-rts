import {
  type Material,
  type MaterialDefines,
  MaterialPluginBase,
  type Observer,
  PBRMaterial,
  RawTexture,
  type Scene,
  ShaderLanguage,
  StandardMaterial,
  Texture,
  type UniformBuffer,
} from "@babylonjs/core";
import type { SeatSnapshot } from "@open-neo-rts/sim";
import { CELL_SIZE } from "../terrain/mesh";

interface FogState {
  texture?: RawTexture;
  width: number;
  height: number;
}

/** World-space sampling works on terrain, water and original model materials, including instances. */
class FogMaterial extends MaterialPluginBase {
  state?: FogState;
  private readonly pbr: boolean;

  constructor(material: Material) {
    super(material, "SeatFog", 200, { SEAT_FOG: false }, true, true);
    this.pbr = material instanceof PBRMaterial;
    this.doNotSerialize = true;
  }
  override getClassName() {
    return "SeatFogMaterial";
  }
  override isCompatible() {
    return true;
  }
  override prepareDefines(defines: MaterialDefines) {
    (defines as MaterialDefines & { SEAT_FOG: boolean }).SEAT_FOG = !!this.state?.texture;
  }
  override getSamplers(samplers: string[]) {
    samplers.push("seatFogSampler");
  }
  override getUniforms(language = ShaderLanguage.GLSL) {
    return {
      ubo: [{ name: "seatFogSize", size: 2, type: "vec2" }],
      fragment: language === ShaderLanguage.GLSL ? "uniform vec2 seatFogSize;" : "",
    };
  }
  override bindForSubMesh(buffer: UniformBuffer) {
    if (!this.state?.texture) return;
    buffer.updateFloat2("seatFogSize", this.state.width, this.state.height);
    buffer.setTexture("seatFogSampler", this.state.texture);
  }
  override getCustomCode(type: string, language = ShaderLanguage.GLSL) {
    if (type !== "fragment") return null;
    const color = this.pbr ? "finalColor" : "color";
    if (language === ShaderLanguage.WGSL)
      return {
        CUSTOM_FRAGMENT_DEFINITIONS: `#ifdef SEAT_FOG
        var seatFogSampler: texture_2d<f32>;
        var seatFogSamplerSampler: sampler;
        #endif`,
        CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `#ifdef SEAT_FOG
        let fogCell = fragmentInputs.vPositionW.xz / ${CELL_SIZE}.0;
        let fogUV = fogCell / uniforms.seatFogSize;
        let fogCentre = (floor(fogCell) + vec2f(0.5)) / uniforms.seatFogSize;
        let fogInside = all(fogCell >= vec2f(0.0)) && all(fogCell < uniforms.seatFogSize);
        let fogKnown = textureSample(seatFogSampler, seatFogSamplerSampler, fogCentre).r;
        let fogSight = textureSample(seatFogSampler, seatFogSamplerSampler, fogUV).g;
        if (!fogInside || fogKnown < 0.5) { ${color} = vec4f(0.025, 0.035, 0.045, 1.0); }
        else { ${color} = vec4f(${color}.rgb * mix(0.35, 1.0, fogSight), ${color}.a); }
        #endif`,
      };
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: "#ifdef SEAT_FOG\nuniform sampler2D seatFogSampler;\n#endif",
      CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `#ifdef SEAT_FOG
        vec2 fogCell = vPositionW.xz / ${CELL_SIZE}.0;
        vec2 fogUV = fogCell / seatFogSize;
        vec2 fogCentre = (floor(fogCell) + vec2(0.5)) / seatFogSize;
        bool fogInside = all(greaterThanEqual(fogCell, vec2(0.0))) && all(lessThan(fogCell, seatFogSize));
        float fogKnown = texture2D(seatFogSampler, fogCentre).r;
        float fogSight = texture2D(seatFogSampler, fogUV).g;
        if (!fogInside || fogKnown < 0.5) { ${color} = vec4(0.025, 0.035, 0.045, 1.0); }
        else { ${color}.rgb *= mix(0.35, 1.0, fogSight); }
        #endif`,
    };
  }
}

/** One owner per scene. Source grids are copied; no simulation or hidden entity data is needed. */
export function createFogPresentation(scene: Scene, width: number, height: number) {
  if (![width, height].every((value) => Number.isInteger(value) && value > 0 && value <= 512))
    throw new RangeError("Invalid fog dimensions");
  const state: FogState = { width, height };
  const plugins = new Set<FogMaterial>();
  const hooks = new Map<Material, Observer<Material>>();
  let groups: string | undefined;
  let disposed = false;
  const attach = (material: Material) => {
    if (!(material instanceof StandardMaterial || material instanceof PBRMaterial)) return;
    const plugin =
      material.pluginManager?.getPlugin<FogMaterial>("SeatFog") ?? new FogMaterial(material);
    if (plugins.has(plugin)) return;
    if (plugin.state && plugin.state !== state) throw new Error("Scene already has a fog owner");
    plugin.state = state;
    plugin.markAllDefinesAsDirty();
    plugins.add(plugin);
    hooks.set(
      material,
      material.onDisposeObservable.addOnce(() => {
        plugins.delete(plugin);
        hooks.delete(material);
      }),
    );
  };
  for (const material of scene.materials) attach(material);
  const observer = scene.onNewMaterialAddedObservable.add(attach);
  function reset() {
    state.texture?.dispose();
    state.texture = undefined;
    groups = undefined;
    for (const plugin of plugins) plugin.markAllDefinesAsDirty();
  }
  return {
    accept(snapshot: Pick<SeatSnapshot, "mode" | "fog">) {
      if (disposed) throw new Error("Fog presentation is disposed");
      if (snapshot.mode === "debug-no-fog") {
        if (state.texture) reset();
        return;
      }
      const grids = snapshot.fog ?? [];
      let previous = -1;
      for (const grid of grids) {
        if (
          grid.width !== width ||
          grid.height !== height ||
          grid.cells.length !== width * height ||
          !Number.isInteger(grid.group) ||
          grid.group < 0 ||
          grid.group <= previous ||
          !grid.cells.every((cell) => cell === 0 || cell === 1 || cell === 2)
        )
          throw new Error("Invalid projected fog grid");
        previous = grid.group;
      }
      const key = grids.map((grid) => grid.group).join(",");
      const pixels = new Uint8Array(width * height * 4);
      for (let i = 0; i < width * height; i++) {
        let cell = 0;
        for (const grid of grids) cell = Math.max(cell, grid.cells[i] ?? 0);
        pixels[i * 4] = cell > 0 ? 255 : 0;
        pixels[i * 4 + 1] = cell === 2 ? 255 : 0;
        pixels[i * 4 + 3] = 255;
      }
      if (groups !== key || !state.texture) {
        reset();
        state.texture = RawTexture.CreateRGBATexture(
          pixels,
          width,
          height,
          scene,
          false,
          false,
          Texture.BILINEAR_SAMPLINGMODE,
        );
        state.texture.name = "seat fog";
        state.texture.wrapU = state.texture.wrapV = Texture.CLAMP_ADDRESSMODE;
        groups = key;
        for (const plugin of plugins) plugin.markAllDefinesAsDirty();
      } else state.texture.update(pixels);
    },
    reset,
    dispose() {
      if (disposed) return;
      reset();
      disposed = true;
      observer.remove();
      for (const hook of hooks.values()) hook.remove();
      hooks.clear();
      for (const plugin of plugins)
        if (plugin.state === state) {
          plugin.state = undefined;
          plugin.markAllDefinesAsDirty();
        }
      plugins.clear();
    },
  };
}
