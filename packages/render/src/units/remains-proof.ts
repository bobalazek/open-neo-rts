// Isolated presentation proof, never bundled into the application.
import { InstancedMesh, Matrix, Mesh, Vector3 } from "@babylonjs/core";
import type { TerrainGrid } from "@open-neo-rts/content";
import type { MatchSetup, SeatSnapshot } from "@open-neo-rts/sim";
import reactor from "../../../../content/core/factions/eastern-collective/structures/industrial-reactor/structure.json";
import { createMatchPresentation } from "../../../client/src/features/match";
import { createRenderer } from "..";

export async function start(canvas: HTMLCanvasElement, source: MatchSetup["map"]["terrain"]) {
  const terrain: TerrainGrid = {
    width: source.width,
    height: source.height,
    level: Uint8Array.from(source.level),
    ramp: Uint8Array.from(source.ramp),
    water: Uint8Array.from(source.water),
    surface: Uint8Array.from(source.surface),
    biome: Uint8Array.from(source.biome),
  };
  const renderer = await createRenderer(canvas, { terrain, quality: "low" });
  const presentation = createMatchPresentation(
    renderer.scene,
    terrain,
    async (definition, variant) => {
      if (variant !== "wreck") throw new Error("This proof only presents actual remains");
      const rubble = definition.endsWith("/industrial-reactor");
      const response = await fetch(
        rubble ? "/industrial-reactor.rubble.glb" : "/supply-truck.wreck.glb",
      );
      if (!response.ok) throw new Error("Original remains model missing");
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        movementDomain: rubble ? null : "wheeled",
        ...(rubble && { footprint: reactor.footprint as [number, number] }),
      };
    },
  );
  presentation.setForceColor(1, "#3c93d9");
  renderer.camera.setTarget(new Vector3(60, 0.5, 41));
  let radius = 21;
  renderer.scene.onBeforeRenderObservable.add(() => {
    renderer.camera.radius = radius;
    renderer.camera.beta = 0.85;
  });
  const render = (time: number) => {
    presentation.render(time);
    renderer.scene.render();
  };
  const roots = () =>
    renderer.scene.transformNodes.filter((node) => node.name.startsWith("remains "));
  return {
    async accept(snapshot: SeatSnapshot, time: number) {
      // Show only the actual projected remains; gameplay/layout/terrain were produced by the sim fixture.
      await presentation.accept(
        { ...snapshot, entities: [], ghosts: [], combatEvents: [], productionExits: [] },
        time,
      );
      const positions = roots().map((root) => root.position);
      if (positions.length) {
        const xs = positions.map((p) => p.x),
          zs = positions.map((p) => p.z);
        renderer.camera.setTarget(
          new Vector3(
            (Math.min(...xs) + Math.max(...xs)) / 2,
            positions[0]!.y + 0.5,
            (Math.min(...zs) + Math.max(...zs)) / 2,
          ),
        );
        radius = Math.max(
          18,
          Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) + 12,
        );
      }
      render(time);
      await renderer.scene.whenReadyAsync();
      await new Promise(requestAnimationFrame);
      render(time);
      await new Promise(requestAnimationFrame);
      render(time);
    },
    state() {
      return {
        backend: renderer.engine.isWebGPU ? "webgpu" : "webgl",
        roots: roots().map((root) => ({
          name: root.name,
          position: root.position.asArray(),
          facing: root.rotation.y,
        })),
        selected: presentation.selection(),
        meshes: roots().flatMap((root) =>
          root
            .getChildMeshes()
            .filter((m) => m.getTotalVertices() > 0)
            .map((mesh) => {
              const source =
                mesh instanceof InstancedMesh
                  ? mesh.sourceMesh
                  : mesh instanceof Mesh
                    ? mesh
                    : undefined;
              return {
                name: mesh.name,
                class: mesh.getClassName(),
                material: mesh.material?.name,
                vertexColors: source?.isVerticesDataPresent("color"),
                useVertexColors: source?.useVertexColors,
              };
            }),
        ),
      };
    },
    pick() {
      renderer.scene.render();
      const viewport = renderer.camera.viewport.toGlobal(canvas.clientWidth, canvas.clientHeight);
      return roots().map((root) => {
        const handle = root.name.slice(8);
        const points = root
          .getChildMeshes()
          .filter((mesh) => mesh.isVisible && mesh.getTotalVertices() > 0)
          .map((mesh) => {
            mesh.computeWorldMatrix(true);
            return mesh.getBoundingInfo().boundingBox.centerWorld;
          });
        const point = points
          .map((point) =>
            Vector3.Project(
              point,
              Matrix.IdentityReadOnly,
              renderer.scene.getTransformMatrix(),
              viewport,
            ),
          )
          .find((point) => presentation.pick(point.x, point.y) === handle);
        if (!point) throw new Error(`Cannot pick visible original remains ${handle}`);
        presentation.select([handle]);
        return {
          handle,
          picked: presentation.pick(point.x, point.y),
          selected: presentation.selection(),
        };
      });
    },
    dispose() {
      presentation.dispose();
      renderer.dispose();
    },
  };
}
