import { startClient } from "@open-neo-rts/client";

const canvas = document.getElementById("game");
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("#game canvas missing");

await startClient(canvas);
