import {
  type AbstractEngine,
  ArcRotateCamera,
  Engine,
  HemisphericLight,
  MeshBuilder,
  Scene,
  Vector3,
  WebGPUEngine,
} from "@babylonjs/core";

// ponytail: imports the whole of @babylonjs/core; switch to deep imports if bundle size matters.
async function createEngine(canvas: HTMLCanvasElement): Promise<AbstractEngine> {
  if (await WebGPUEngine.IsSupportedAsync) {
    const engine = new WebGPUEngine(canvas, { antialias: true });
    await engine.initAsync();
    return engine;
  }
  return new Engine(canvas, true);
}

export async function createRenderer(canvas: HTMLCanvasElement) {
  const engine = await createEngine(canvas);
  const scene = new Scene(engine);

  const camera = new ArcRotateCamera(
    "camera",
    -Math.PI / 2,
    Math.PI / 3.5,
    40,
    Vector3.Zero(),
    scene,
  );
  camera.attachControl(canvas, true);
  new HemisphericLight("light", new Vector3(0.3, 1, 0.2), scene);
  MeshBuilder.CreateGround("ground", { width: 64, height: 64 }, scene);
  MeshBuilder.CreateBox("unit", { size: 1 }, scene).position.y = 0.5;

  engine.runRenderLoop(() => scene.render());
  addEventListener("resize", () => engine.resize());
  return { engine, scene };
}
