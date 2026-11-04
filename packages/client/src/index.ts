// Game client: screens, HUD, input, camera, single-player sim worker, editors. apps/web and the desktop shell only mount it.

export async function startClient(canvas: HTMLCanvasElement) {
  if (location.pathname === "/tools/content") {
    const { startContentTools } = await import("./features/content-editor");
    return startContentTools(canvas);
  }
  if (
    (location.pathname === "/debug" && new URLSearchParams(location.search).has("terrain")) ||
    (location.pathname === "/" && new URLSearchParams(location.search).has("map"))
  ) {
    const { startTerrainView } = await import("./features/debug/terrain");
    return startTerrainView(canvas);
  }
  if (location.pathname === "/debug" && new URLSearchParams(location.search).has("fog")) {
    const { startFogFixture } = await import("./features/match/fog-fixture");
    return startFogFixture(canvas);
  }
  if (location.pathname === "/debug" && new URLSearchParams(location.search).has("models")) {
    const { startModelCheck } = await import("./features/debug");
    return startModelCheck(canvas);
  }
  if (location.pathname === "/debug") {
    const { startDebugSession } = await import("./features/debug/session");
    return startDebugSession(canvas);
  }
  const { startApp } = await import("./app");
  return startApp(canvas);
}

export { createMatchPresentation } from "./features/match";
export type { OfflineSetup, OfflineState } from "./worker";
export { createOfflineMatch } from "./worker";
