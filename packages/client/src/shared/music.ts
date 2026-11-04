import type { createAudioMixer } from "@open-neo-rts/render";

export type MusicContext = "menu" | "match";
export type MusicLibrary = Readonly<Record<MusicContext, readonly string[]>>;

/** Desired scene music survives browser locking/mute; canceled work never advances an old playlist. */
export function createMusicPlayer(
  mixer: Pick<ReturnType<typeof createAudioMixer>, "scope" | "canPlay">,
  library: MusicLibrary,
) {
  const scope = mixer.scope();
  let context: MusicContext | undefined,
    generation = 0,
    playing = false,
    disposed = false;
  let bag: string[] = [],
    last: string | undefined;
  const failed = new Set<string>();
  function next() {
    if (!context) return undefined;
    if (!bag.length) {
      bag = [...library[context]].filter((source) => !failed.has(source));
      for (let i = bag.length - 1; i > 0; i--) {
        const other = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[other]] = [bag[other]!, bag[i]!];
      }
      if (bag.length > 1 && bag.at(-1) === last)
        [bag[0], bag[bag.length - 1]] = [bag.at(-1)!, bag[0]!];
    }
    while (bag.length) {
      const source = bag.pop()!;
      if (!failed.has(source)) return source;
    }
    return undefined;
  }
  async function play() {
    if (disposed || !context || playing || !mixer.canPlay("music")) return;
    const source = next();
    if (!source) return;
    const ticket = generation;
    playing = true;
    last = source;
    try {
      const started = await scope.play(source, {
        bus: "music",
        priority: 2,
        onEnded: () => {
          if (ticket !== generation || disposed) return;
          playing = false;
          void play();
        },
      });
      if (ticket === generation && !started) playing = false;
    } catch {
      if (ticket !== generation || disposed) return;
      playing = false;
      failed.add(source);
      void play();
    }
  }
  function refresh() {
    if (!mixer.canPlay("music")) {
      generation++;
      scope.stop();
      playing = false;
    } else void play();
  }
  return {
    refresh,
    set(next: MusicContext | undefined) {
      if (disposed) return;
      if (next !== context) {
        generation++;
        scope.stop();
        playing = false;
        context = next;
        bag = [];
        last = undefined;
        failed.clear();
      }
      refresh();
    },
    dispose() {
      disposed = true;
      generation++;
      scope.dispose();
    },
  };
}
