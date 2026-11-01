import { createRenderer } from "@open-neo-rts/render";

const canvas = document.getElementById("game");
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("#game canvas missing");

await createRenderer(canvas);
