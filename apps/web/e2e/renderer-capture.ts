import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import {
  type DebugSessionExport,
  isDebugSessionExport,
  type OfflineState,
  type WorkerReply,
} from "../../../packages/client/src/worker/protocol";
import type { createRenderer } from "../../../packages/render/src";
import { parseScenario } from "../../../packages/sim/src/snapshots";
import catalog from "../catalog-plugin";
import {
  type CaptureSamples,
  originalSceneCommands,
  summarizeCapture,
} from "./renderer-capture-results";
import { desktopLockState, mainDisplayState } from "./renderer-desktop";

const root = resolve(import.meta.dir, "../../..");
type Surface = Pick<Awaited<ReturnType<typeof createRenderer>>, "engine" | "scene" | "camera"> & {
  read(): { frameMs: number; drawCalls: number; completedAt: number };
};
interface Probe {
  state?: OfflineState;
  worker?: Worker;
  exported?: DebugSessionExport;
  records: CaptureSamples["workers"];
  focusLosses: number[];
  adapters: { vendor: string; architecture: string; description: string; fallback: unknown }[];
}

function desktop() {
  // shortcut: qualification uses macOS lock/display probes; add equivalent checks before accepting another OS.
  if (process.platform !== "darwin")
    return { locked: null, mainAwake: null, hardware: {}, displays: [] };
  const registry = execFileSync("/usr/sbin/ioreg", ["-a", "-n", "Root", "-d", "1"]);
  const locked = desktopLockState(
    JSON.parse(
      execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", "--", "-"], {
        input: registry,
        encoding: "utf8",
      }),
    ),
  );
  const nativeDisplay = mainDisplayState();
  const raw = JSON.parse(
    execFileSync(
      "/usr/sbin/system_profiler",
      ["SPHardwareDataType", "SPDisplaysDataType", "-json"],
      { encoding: "utf8" },
    ),
  ) as {
    SPHardwareDataType?: Record<string, unknown>[];
    SPDisplaysDataType?: { spdisplays_ndrvs?: Record<string, unknown>[] }[];
  };
  const h = raw.SPHardwareDataType?.[0] ?? {};
  const displays = (raw.SPDisplaysDataType ?? [])
    .flatMap((g) => g.spdisplays_ndrvs ?? [])
    .map((d) => ({
      name: d._name,
      main: d.spdisplays_main === "spdisplays_yes",
      asleep: d.spdisplays_asleep,
      resolution: d.spdisplays_resolution,
    }));
  return {
    locked,
    mainAwake: nativeDisplay.active && !nativeDisplay.asleep,
    nativeDisplay,
    hardware: { model: h.machine_model, chip: h.chip_type, memory: h.physical_memory },
    displays,
  };
}

function sourceRevision() {
  execFileSync("git", ["diff", "--quiet", "HEAD"], { cwd: root });
  const untracked = execFileSync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "--", "apps", "packages", "content"],
    { cwd: root, encoding: "utf8" },
  );
  if (untracked.trim()) throw new Error("Commit or isolate untracked source before capture");
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
}

async function capture(diagnostic: boolean) {
  const revision = sourceRevision();
  let before = desktop();
  if (!diagnostic && before.locked !== false)
    throw new Error("Desktop is locked or unverified; unlock it before hardware capture");
  const power = !diagnostic
    ? Bun.spawn(["/usr/bin/caffeinate", "-d", "-u", "-t", "180"], {
        stdout: "ignore",
        stderr: "ignore",
      })
    : undefined;
  const directory = resolve(root, "test-results", "renderer-capture", String(Date.now()));
  let server: ReturnType<typeof Bun.serve> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  try {
    if (power) {
      await Bun.sleep(250);
      before = desktop();
      if (!before.mainAwake) throw new Error("Main display is not verified awake");
    }
    await mkdir(directory, { recursive: true });
    const source = resolve(root, "packages/render/src/scene/performance.ts");
    const original = await Bun.file(source).text(),
      anchor = "  return {\n    read() {";
    if (original.split(anchor).length !== 2)
      throw new Error("Counter exposure anchor is not unique");
    const exposure =
      '  Reflect.set(globalThis,"rendererCaptureSurface",{scene,engine:scene.getEngine(),camera:scene.activeCamera,read:()=>({frameMs,drawCalls,completedAt:previous})});\n';
    const builds = await Promise.all([
      Bun.build({
        entrypoints: [resolve(root, "apps/web/index.html")],
        outdir: directory,
        target: "browser",
        minify: true,
        plugins: [
          catalog,
          {
            name: "capture-read-only-counters",
            setup(build) {
              build.onLoad({ filter: /packages\/render\/src\/scene\/performance\.ts$/ }, () => ({
                contents: original.replace(anchor, exposure + anchor),
                loader: "ts",
                resolveDir: resolve(root, "packages/render/src/scene"),
              }));
            },
          },
        ],
      }),
      Bun.build({
        entrypoints: [resolve(root, "packages/client/src/worker/entry.ts")],
        outdir: directory,
        target: "browser",
        minify: true,
        naming: "sim-worker.js",
      }),
    ]);
    for (const build of builds)
      if (!build.success) throw new AggregateError(build.logs, "Capture build failed");
    if (sourceRevision() !== revision) throw new Error("Source changed during the build");
    const sha = (bytes: Uint8Array) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    const browserBuild = builds[0];
    if (!browserBuild) throw new Error("Missing browser build");
    const assets = await Promise.all(
      browserBuild.outputs
        .filter((a) => /\.(glb|r8)$/.test(a.path))
        .map(async (a) => ({
          file: a.path.slice(directory.length + 1),
          sha256: sha(new Uint8Array(await a.arrayBuffer())),
        })),
    );
    const manifest = {
      revision,
      bun: Bun.version,
      build: "production/minified with one read-only counter exposure",
      exposure,
      counterSourceSha256: sha(new TextEncoder().encode(original)),
      workerSha256: sha(await Bun.file(resolve(directory, "sim-worker.js")).bytes()),
      assets,
      camera: {
        radius: 380,
        beta: 0.7,
        alpha: Math.PI / 2,
        target: [128, 0, 128],
        meaning: "benchmark-only framing; ordinary controls stop at110",
      },
      viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
      warmupMs: 10000,
      nominalSampleMs: 30000,
    };
    await Bun.write(resolve(directory, "manifest.json"), JSON.stringify(manifest, null, 2));
    server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        let pathname: string;
        try {
          pathname = decodeURIComponent(new URL(request.url).pathname);
        } catch {
          return new Response(null, { status: 400 });
        }
        const path = resolve(
          directory,
          pathname === "/" || pathname === "/debug" ? "index.html" : `.${pathname}`,
        );
        if (!path.startsWith(`${directory}/`)) return new Response(null, { status: 400 });
        const file = Bun.file(path);
        return (await file.exists()) ? new Response(file) : new Response(null, { status: 404 });
      },
    });
    browser = await chromium.launch({
      channel: "chrome",
      headless: diagnostic,
      args: ["--window-position=0,0"],
    });
    watchdog = setTimeout(() => {
      void browser?.close().catch(() => {});
    }, 180000);
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      const probe: Probe = { records: [], focusLosses: [], adapters: [] };
      Reflect.set(window, "rendererCaptureProbe", probe);
      addEventListener("blur", () => probe.focusLosses.push(performance.now()));
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) probe.focusLosses.push(performance.now());
      });
      const Original = window.Worker;
      window.Worker = class extends Original {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          if (!new URL(String(url), location.href).pathname.endsWith("/sim-worker.js")) return;
          probe.worker = this;
          this.addEventListener("message", ({ data }: { data: WorkerReply }) => {
            if (data.id === 2147483647) probe.exported = data.result as DebugSessionExport;
            const state = data.state;
            if (!state) return;
            if (probe.state?.snapshot.tick !== state.snapshot.tick)
              probe.records.push({
                at: performance.now(),
                tick: state.snapshot.tick,
                tickMs: state.tickMs ?? Number.NaN,
                count: state.snapshot.entities.length,
                orders: state.snapshot.entities.filter((e) => e.order?.type === "move").length,
                paused: state.paused,
                speed: state.speed,
              });
            probe.state = state;
          });
        }
      };
      if (navigator.gpu) {
        const request = navigator.gpu.requestAdapter.bind(navigator.gpu);
        navigator.gpu.requestAdapter = async (options) => {
          const adapter = await request(options);
          if (adapter)
            probe.adapters.push({
              vendor: adapter.info.vendor,
              architecture: adapter.info.architecture,
              description: adapter.info.description,
              fallback:
                Reflect.get(adapter.info, "isFallbackAdapter") ??
                Reflect.get(adapter, "isFallbackAdapter") ??
                null,
            });
          return adapter;
        };
      }
    });
    await page.goto(`${server.url}debug?scene=terrain-200`);
    await page.bringToFront();
    await page
      .getByLabel("Model status", { exact: true })
      .filter({ hasText: "Models ready · 200" })
      .waitFor({ timeout: 60000 });
    await page.getByLabel("Map action", { exact: true }).selectOption("select");
    const framingAt = await page.evaluate(() => {
      const c = Reflect.get(window, "rendererCaptureSurface") as Surface;
      const canvas = document.querySelector("canvas");
      if (!canvas) throw new Error("Missing canvas");
      Object.assign(canvas.style, {
        position: "fixed",
        inset: "0",
        width: "1280px",
        height: "720px",
        zIndex: "0",
      });
      const panel = document.querySelector(".model-check") as HTMLElement;
      Object.assign(panel.style, { position: "fixed", opacity: "0", pointerEvents: "none" });
      c.scene.onBeforeRenderObservable.add(() => {
        c.camera.target.set(128, 0, 128);
        c.camera.alpha = Math.PI / 2;
        c.camera.beta = 0.7;
        c.camera.radius = 380;
        c.camera.getViewMatrix(true);
        c.scene.updateTransformMatrix(true);
      });
      c.engine.resize();
      return performance.now();
    });
    await page.waitForFunction(
      (at) => {
        const c = Reflect.get(window, "rendererCaptureSurface") as Surface;
        return c.scene.isReady() && c.read().completedAt > at;
      },
      framingAt,
      { timeout: 60000 },
    );
    await page.mouse.move(640, 360);
    await page.screenshot({ path: resolve(directory, "initial.png") });
    await page
      .getByRole("button", { name: "Run", exact: true })
      .evaluate((b: HTMLButtonElement) => b.click());
    await page.waitForFunction(
      () => (Reflect.get(window, "rendererCaptureProbe") as Probe).state?.paused === false,
    );
    const data = await page.evaluate(async () => {
      const c = Reflect.get(window, "rendererCaptureSurface") as Surface,
        p = Reflect.get(window, "rendererCaptureProbe") as Probe;
      const now = performance.now(),
        nominalEnd = now + 40000;
      const samples: CaptureSamples = {
        begin: 0,
        nominalEnd,
        firstTick: 0,
        lastTick: 0,
        first: [],
        last: [],
        frames: [],
        workers: [],
        frustums: [],
        focusLosses: [],
      };
      const state = () => {
        if (!p.state) throw new Error("Missing worker state");
        return p.state;
      };
      const poses = (s: OfflineState) =>
        s.snapshot.entities.map(({ handle, x, y }) => ({ handle, x, y }));
      const quality = () => {
        const sun = c.scene.getLightByName("sun"),
          g = sun?.getShadowGenerator() as {
            getShadowMap(): { getSize(): { width: number; height: number } };
            bias: number;
            normalBias: number;
          } | null;
        return {
          map: g?.getShadowMap().getSize(),
          bias: g?.bias,
          normalBias: g?.normalBias,
          webgpu: c.engine.isWebGPU,
          width: c.engine.getRenderWidth(),
          height: c.engine.getRenderHeight(),
        };
      };
      const firstQuality = quality();
      let lastFrustum = 0;
      let lastState = state();
      const observer = c.scene.onAfterRenderObservable.add(() => {
        const counters = c.read(),
          at = counters.completedAt;
        if (at < now + 10000 || at > nominalEnd) return;
        if (!samples.begin) {
          samples.begin = at;
          samples.firstTick = state().snapshot.tick;
          samples.first = poses(state());
          return;
        }
        lastState = state();
        samples.lastTick = lastState.snapshot.tick;
        samples.frames.push({
          at,
          frameMs: counters.frameMs,
          drawCalls: counters.drawCalls,
          tick: samples.lastTick,
          focused: document.hasFocus() && !document.hidden,
        });
        if (at - lastFrustum < 1000) return;
        lastFrustum = at;
        const roots = c.scene.transformNodes.filter((n) => n.name.startsWith("entity ")),
          matrix = c.scene.getTransformMatrix();
        const a = matrix.getRow(0),
          b = matrix.getRow(1),
          cRow = matrix.getRow(2),
          d = matrix.getRow(3);
        if (!a || !b || !cRow || !d) throw new Error("Missing projection rows");
        let contained = 0,
          parts = 0,
          maxClipXY = 0;
        for (const root of roots) {
          const meshes = root
            .getChildMeshes()
            .filter((m) => m.isVisible && m.isEnabled() && m.getTotalVertices() > 0);
          let inside = meshes.length > 0;
          parts += meshes.length;
          for (const mesh of meshes)
            for (const v of mesh.getBoundingInfo().boundingBox.vectorsWorld) {
              const w = v.x * a.w + v.y * b.w + v.z * cRow.w + d.w,
                x = (v.x * a.x + v.y * b.x + v.z * cRow.x + d.x) / w,
                y = (v.x * a.y + v.y * b.y + v.z * cRow.y + d.y) / w,
                z = (v.x * a.z + v.y * b.z + v.z * cRow.z + d.z) / w;
              maxClipXY = Math.max(maxClipXY, Math.abs(x), Math.abs(y));
              if (
                !(
                  w > 0 &&
                  Number.isFinite(z) &&
                  Math.abs(x) <= 1.000001 &&
                  Math.abs(y) <= 1.000001 &&
                  z >= (c.engine.isNDCHalfZRange ? -0.000001 : -1.000001) &&
                  z <= 1.000001
                )
              )
                inside = false;
            }
          if (inside) contained++;
        }
        samples.frustums.push({ at, roots: roots.length, contained, parts, maxClipXY });
      });
      await new Promise((done) => setTimeout(done, 40000));
      c.scene.onAfterRenderObservable.remove(observer);
      samples.last = poses(lastState);
      samples.workers = p.records;
      samples.focusLosses = p.focusLosses;
      return { samples, firstQuality, lastQuality: quality(), adapters: p.adapters };
    });
    await page
      .getByRole("button", { name: "Pause", exact: true })
      .evaluate((b: HTMLButtonElement) => b.click());
    await page.waitForFunction(
      () => (Reflect.get(window, "rendererCaptureProbe") as Probe).state?.paused === true,
    );
    await page.screenshot({ path: resolve(directory, "post-sample-paused.png") });
    await page.evaluate(() => {
      const p = Reflect.get(window, "rendererCaptureProbe") as Probe;
      p.worker?.postMessage({ id: 2147483647, type: "export-session" });
    });
    await page.waitForFunction(
      () => (Reflect.get(window, "rendererCaptureProbe") as Probe).exported !== undefined,
    );
    const exported = await page.evaluate(
      () => (Reflect.get(window, "rendererCaptureProbe") as Probe).exported,
    );
    if (!isDebugSessionExport(exported)) throw new Error("Invalid canonical session export");
    const scenario = parseScenario(exported.scenario);
    await Bun.write(resolve(directory, "session.json"), JSON.stringify(exported));
    await Bun.write(resolve(directory, "raw.json"), JSON.stringify(data));
    const after = desktop(),
      summary = summarizeCapture(data.samples),
      reasons = [...summary.reasons];
    if (diagnostic) reasons.push("Diagnostic mode is never hardware acceptance");
    if (summary.window.durationMs < 29000)
      reasons.push("Measured window was shorter than 29 seconds");
    if (before.locked !== false || after.locked !== false || !before.mainAwake || !after.mainAwake)
      reasons.push("Desktop/display conditions were not qualified");
    for (const q of [data.firstQuality, data.lastQuality])
      if (
        q.map?.width !== 1024 ||
        q.map.height !== 1024 ||
        q.bias !== 0.004 ||
        q.normalBias !== 0.08 ||
        q.width !== 1280 ||
        q.height !== 720 ||
        !q.webgpu
      )
        reasons.push("Runtime Medium/render-buffer/backend signature changed");
    if (
      !data.adapters.length ||
      data.adapters.some(
        (a) =>
          a.fallback !== false ||
          /software|swiftshader|llvmpipe|lavapipe/i.test(
            `${a.vendor} ${a.architecture} ${a.description}`,
          ),
      )
    )
      reasons.push("Hardware adapter was not verified");
    const originalScene =
      scenario.setup.seed === 1 &&
      scenario.setup.map.id === "core.map:training-grounds" &&
      scenario.setup.map.terrain.width === 128 &&
      scenario.setup.map.terrain.height === 128 &&
      originalSceneCommands(scenario.commands);
    if (!originalScene) reasons.push("Original map, seed, spawn or move command changed");
    if (errors.length) reasons.push("Page errors occurred");
    const report = {
      ...manifest,
      diagnostic,
      eligibleWorkload: reasons.length === 0,
      reasons,
      summary,
      raw: data,
      browser: browser.version(),
      before,
      after,
      desktopObservation:
        "OS lock/display probes before and after only; no continuous OS-state proof. Browser focus/visibility events cover the measurement window; their relation to OS lock is unverified.",
      errors,
      targets: { renderFps: 60, workerHz: 20 },
      acceptance: "Measurements only; no automated phase-exit or GPU/presentation-time claim",
    };
    await Bun.write(resolve(directory, "report.json"), JSON.stringify(report));
    console.log(
      JSON.stringify({
        directory,
        diagnostic,
        eligibleWorkload: report.eligibleWorkload,
        reasons,
        frame: summary.frame,
        workerStep: summary.workerStep,
        workerHz: summary.workerHz,
        displaced: summary.displaced,
      }),
    );
    if (!diagnostic && !report.eligibleWorkload)
      throw new Error("Capture is not eligible hardware evidence; see report.json");
  } catch (error) {
    await Bun.write(resolve(directory, "failure.txt"), String(error)).catch(() => {});
    throw error;
  } finally {
    clearTimeout(watchdog);
    try {
      await browser?.close();
    } finally {
      server?.stop(true);
      power?.kill();
    }
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--diagnostic"))
    throw new Error("Usage: bun run capture:renderer [--diagnostic]");
  await capture(args[0] === "--diagnostic");
}
