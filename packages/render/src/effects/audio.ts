import {
  type AudioBus,
  type AudioEngineV2,
  type Camera,
  CreateAudioEngineAsync,
  type StaticSound,
  Vector3,
} from "@babylonjs/core";

export const AUDIO_BUSES = ["music", "effects", "voices", "announcer", "ui", "ambience"] as const;
export type AudioBusName = (typeof AUDIO_BUSES)[number];
export type AudioVolumes = Record<AudioBusName | "master", number>;
export interface AudioPlayOptions {
  bus: AudioBusName;
  priority?: number;
  loop?: boolean;
  position?: { x: number; y: number; z: number };
  onEnded?: () => void;
}
interface Voice {
  source: string | AudioBuffer;
  scope: object;
  priority: number;
  bus: AudioBusName;
  sound?: StaticSound;
  canceled: boolean;
  position?: { x: number; y: number; z: number };
}

/** One device mixer, independent of graphics scenes. Each screen owns a disposable scope. */
export function createAudioMixer() {
  let engine: AudioEngineV2 | undefined, starting: Promise<AudioEngineV2> | undefined;
  let camera: Camera | undefined;
  let disposed = false,
    muted = false;
  let volumes: AudioVolumes = {
    master: 70,
    music: 60,
    effects: 80,
    voices: 80,
    announcer: 90,
    ui: 60,
    ambience: 50,
  };
  const buses = new Map<AudioBusName, AudioBus>();
  const buffers = new Map<
    string | AudioBuffer,
    Promise<Awaited<ReturnType<AudioEngineV2["createSoundBufferAsync"]>>>
  >();
  const voices = new Set<Voice>();
  const maxDistance = 120;
  const audible = (position: Voice["position"]) => {
    if (!position) return true;
    const listener = camera?.globalPosition ?? engine?.listener.position ?? Vector3.ZeroReadOnly;
    return (
      Math.hypot(position.x - listener.x, position.y - listener.y, position.z - listener.z) <
      maxDistance
    );
  };
  function levels() {
    if (!engine) return;
    engine.volume = muted ? 0 : volumes.master / 100;
    const announcing = [...voices].some(
      (voice) => voice.bus === "announcer" && voice.sound?.activeInstancesCount,
    );
    for (const [name, bus] of buses)
      bus.volume = (volumes[name] / 100) * (name === "music" && announcing ? 0.35 : 1);
  }
  function start(): Promise<AudioEngineV2> {
    if (disposed) return Promise.reject(new Error("Audio mixer is disposed"));
    if (starting) return starting;
    starting = (async () => {
      const next = await CreateAudioEngineAsync({
        disableDefaultUI: true,
        resumeOnInteraction: true,
        resumeOnPause: false,
        volume: 0,
      });
      if (disposed) {
        next.dispose();
        throw new Error("Audio mixer is disposed");
      }
      engine = next;
      try {
        for (const name of AUDIO_BUSES) buses.set(name, await next.createBusAsync(name));
        if (disposed) throw new Error("Audio mixer is disposed");
        levels();
        return next;
      } catch (error) {
        next.dispose();
        buses.clear();
        if (engine === next) engine = undefined;
        throw error;
      }
    })().catch((error) => {
      starting = undefined;
      throw error;
    });
    return starting;
  }
  const remove = (voice: Voice) => {
    if (voice.canceled) return;
    voice.canceled = true;
    voices.delete(voice);
    voice.sound?.dispose();
    if (voice.bus === "announcer") levels();
  };
  return {
    start,
    canPlay(bus: AudioBusName) {
      return (
        !disposed && !muted && volumes.master > 0 && volumes[bus] > 0 && engine?.state === "running"
      );
    },
    async unlock() {
      const current = await start();
      await current.unlockAsync();
    },
    apply(next: AudioVolumes, silent: boolean) {
      for (const key of ["master", ...AUDIO_BUSES] as const)
        if (!Number.isInteger(next[key]) || next[key] < 0 || next[key] > 100)
          throw new RangeError("Invalid audio volume");
      volumes = { ...next };
      muted = silent;
      for (const voice of [...voices])
        if (muted || !volumes.master || !volumes[voice.bus]) remove(voice);
      levels();
    },
    listen(nextCamera: Camera) {
      camera = nextCamera;
      if (engine && engine.listener.attachedNode !== camera) engine.listener.attach(camera);
      for (const voice of [...voices]) if (!audible(voice.position)) remove(voice);
    },
    scope() {
      const scope = {};
      let closed = false;
      return {
        async play(source: string | AudioBuffer, options: AudioPlayOptions): Promise<boolean> {
          if (
            closed ||
            disposed ||
            muted ||
            !volumes.master ||
            !volumes[options.bus] ||
            !audible(options.position)
          )
            return false;
          const priority = options.priority ?? 0;
          const same = [...voices].filter((v) => v.source === source);
          const candidates = same.length >= 6 ? same : voices.size >= 32 ? [...voices] : [];
          if (candidates.length) {
            const lowest = candidates.reduce((a, b) => (a.priority <= b.priority ? a : b));
            if (lowest.priority >= priority) return false;
            remove(lowest);
          }
          const voice: Voice = {
            source,
            scope,
            priority,
            bus: options.bus,
            canceled: false,
            ...(options.position && { position: { ...options.position } }),
          };
          voices.add(voice);
          try {
            const current = await start();
            if (
              voice.canceled ||
              closed ||
              disposed ||
              muted ||
              !volumes.master ||
              !volumes[options.bus] ||
              current.state !== "running"
            )
              return false;
            let buffer = buffers.get(source);
            if (!buffer) {
              buffer = current.createSoundBufferAsync(source);
              buffers.set(source, buffer);
              void buffer.catch(() => buffers.delete(source));
            }
            const decoded = await buffer;
            if (voice.canceled || closed || disposed) return false;
            const sound = await current.createSoundAsync("presentation cue", decoded, {
              outBus: buses.get(options.bus)!,
              maxInstances: 1,
              loop: options.loop ?? false,
              ...(voice.position && {
                spatialEnabled: true,
                spatialPosition: new Vector3(voice.position.x, voice.position.y, voice.position.z),
                spatialDistanceModel: "linear",
                spatialMinDistance: 8,
                spatialMaxDistance: maxDistance,
              }),
            });
            if (
              voice.canceled ||
              closed ||
              disposed ||
              muted ||
              !volumes.master ||
              !volumes[options.bus] ||
              current.state !== "running" ||
              !audible(voice.position)
            ) {
              sound.dispose();
              return false;
            }
            if (voice.position)
              sound.spatial.position = new Vector3(
                voice.position.x,
                voice.position.y,
                voice.position.z,
              );
            voice.sound = sound;
            sound.onEndedObservable.addOnce(() => {
              const completed = !voice.canceled;
              remove(voice);
              if (completed) options.onEnded?.();
            });
            sound.play();
            if (voice.bus === "announcer") levels();
            return true;
          } finally {
            if (!voice.sound || voice.sound.activeInstancesCount === 0) remove(voice);
          }
        },
        stop() {
          for (const voice of [...voices]) if (voice.scope === scope) remove(voice);
        },
        move(position: NonNullable<Voice["position"]>) {
          let playing = false;
          for (const voice of [...voices]) {
            if (voice.scope !== scope) continue;
            voice.position = { ...position };
            if (!audible(position)) remove(voice);
            else {
              if (voice.sound)
                voice.sound.spatial.position = new Vector3(position.x, position.y, position.z);
              playing = true;
            }
          }
          return playing;
        },
        retain(allowed: (position: Voice["position"]) => boolean) {
          for (const voice of [...voices])
            if (voice.scope === scope && !allowed(voice.position)) remove(voice);
        },
        dispose() {
          closed = true;
          for (const voice of [...voices]) if (voice.scope === scope) remove(voice);
        },
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const voice of [...voices]) remove(voice);
      buffers.clear();
      camera = undefined;
      buses.clear();
      engine?.dispose();
    },
  };
}

/** Original short test/click cue; procedural PCM has no external recording or binary asset. */
export function createAudioTestCue() {
  const sampleRate = 44100,
    length = 4410;
  const buffer = new AudioBuffer({ sampleRate, length, numberOfChannels: 1 });
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    data[i] =
      Math.sin(2 * Math.PI * (880 * t - 1800 * t * t)) *
      Math.min(1, i / 120) *
      Math.exp(-60 * t) *
      0.25;
  }
  return buffer;
}
