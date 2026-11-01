import {
  compareTraces,
  parseScenario,
  parseTrace,
  runScenario,
  traceScenario,
} from "@open-neo-rts/sim";

/** File I/O and argument parsing stay outside the simulation. */
export async function run(args: string[]): Promise<number> {
  try {
    if (args[0] === "--compare") {
      if (args.length !== 3) throw new Error("Usage: bun neo run --compare <trace-a> <trace-b>");
      const [a, b] = await Promise.all(
        args.slice(1).map(async (file) => parseTrace(JSON.parse(await Bun.file(file).text()))),
      );
      if (!a || !b) throw new Error("Two traces are required");
      const difference = compareTraces(a, b);
      if (!difference) {
        console.log("Traces match");
        return 0;
      }
      console.log(`First divergent tick: ${difference.tick}`);
      console.log(JSON.stringify(difference, null, 2));
      return 1;
    }
    const [file, ...flags] = args;
    if (!file || file.startsWith("--"))
      throw new Error("Usage: bun neo run <scenario> [--seed N] [--ticks T] [--trace file]");
    const options: { seed?: number; ticks?: number } = {};
    let traceFile: string | undefined;
    for (let i = 0; i < flags.length; i += 2) {
      const flag = flags[i];
      if (flag === "--trace") {
        if (traceFile !== undefined) throw new Error("Duplicate option: --trace");
        traceFile = flags[i + 1];
        if (!traceFile || traceFile.startsWith("--")) throw new Error("--trace requires a file");
        continue;
      }
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
    if (traceFile) {
      const trace = traceScenario(scenario, options);
      const repeat = traceScenario(scenario, options);
      await Bun.write(traceFile, `${JSON.stringify(trace, null, 2)}\n`);
      if (JSON.stringify(trace) !== JSON.stringify(repeat))
        throw new Error("Scenario traces diverged in the same process");
    }
    for (const { tick, hash } of first) console.log(`${tick} ${hash}`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
