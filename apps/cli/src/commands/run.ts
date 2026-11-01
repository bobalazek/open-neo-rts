import { parseScenario, runScenario } from "@open-neo-rts/sim";

/** File I/O and argument parsing stay outside the simulation. */
export async function run(args: string[]): Promise<number> {
  try {
    const [file, ...flags] = args;
    if (!file || file.startsWith("--"))
      throw new Error("Usage: bun neo run <scenario> [--seed N] [--ticks T]");
    const options: { seed?: number; ticks?: number } = {};
    for (let i = 0; i < flags.length; i += 2) {
      const flag = flags[i];
      if (flag !== "--seed" && flag !== "--ticks") throw new Error(`Unknown option: ${flag}`);
      const key = flag === "--seed" ? "seed" : "ticks";
      if (options[key] !== undefined) throw new Error(`Duplicate option: ${flag}`);
      const raw = flags[i + 1];
      const max = key === "seed" ? 0xffffffff : 0x80000000;
      if (raw === undefined || !/^\d+$/.test(raw) || Number(raw) > max)
        throw new Error(`${flag} requires an integer from 0 to ${max}`);
      options[key] = Number(raw);
    }
    const scenario = parseScenario(JSON.parse(await Bun.file(file).text()));
    const first = runScenario(scenario, options);
    const second = runScenario(scenario, options);
    if (JSON.stringify(first) !== JSON.stringify(second))
      throw new Error("Scenario runs diverged in the same process");
    for (const { tick, hash } of first) console.log(`${tick} ${hash}`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
