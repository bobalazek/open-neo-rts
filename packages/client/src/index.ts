// Game client: screens, HUD, input, camera, single-player sim worker, editors. apps/web and the desktop shell only mount it.

import { createRenderer } from "@open-neo-rts/render";

export async function startClient(canvas: HTMLCanvasElement) {
  return createRenderer(canvas);
}
