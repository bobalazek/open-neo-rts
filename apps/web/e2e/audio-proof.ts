import { AudioEngineV2 } from "../../../packages/render/node_modules/@babylonjs/core/index.js";
import { createAudioMixer } from "../../../packages/render/src/effects/audio";

const mixer = createAudioMixer();
const volumes = {
  master: 100,
  music: 100,
  effects: 100,
  voices: 100,
  announcer: 100,
  ui: 100,
  ambience: 100,
};
mixer.apply(volumes, false);
const button = document.createElement("button");
button.textContent = "Start audio proof";
document.body.append(button);
button.onclick = async () => {
  await mixer.unlock();
  const cue = new AudioBuffer({ sampleRate: 44100, length: 44100 * 4, numberOfChannels: 1 });
  const data = cue.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.sin(i * 0.1) * 0.1;
  Reflect.set(window, "audioFixture", {
    mixer,
    volumes,
    cue,
    engine: AudioEngineV2.Instances.at(-1),
  });
  button.textContent = "Audio proof ready";
};
