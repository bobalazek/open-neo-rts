// Game client: screens, HUD, input, camera, single-player sim worker, editors. apps/web and the desktop shell only mount it.

export async function startClient(canvas: HTMLCanvasElement) {
  if (location.pathname === "/debug" && new URLSearchParams(location.search).has("models")) {
    const { startModelCheck } = await import("./features/debug");
    return startModelCheck(canvas);
  }
  if (location.pathname === "/debug") {
    const { startDebugSession } = await import("./features/debug/session");
    return startDebugSession(canvas);
  }
  const { startTerrainView } = await import("./features/debug/terrain");
  return startTerrainView(canvas);
}

export type { OfflineSetup, OfflineState } from "./worker";
export { createOfflineMatch } from "./worker";
