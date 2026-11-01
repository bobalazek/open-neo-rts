import { startClient } from "@open-neo-rts/client";

const canvas = document.getElementById("game");
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("#game canvas missing");

let exited = false;
let client: Awaited<ReturnType<typeof startClient>> | undefined;
addEventListener(
  "pagehide",
  () => {
    exited = true;
    client?.dispose();
  },
  { once: true },
);
client = await startClient(canvas);
if (exited) client.dispose();
