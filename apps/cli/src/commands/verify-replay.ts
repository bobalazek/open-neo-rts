import { MAX_SNAPSHOT_TICK, parseMatchRecord, verifyMatchRecord } from "@open-neo-rts/sim";

/** Headless history verification; browser import separately checks the installed content/header. */
export async function verifyReplay(args: string[]): Promise<number> {
  try {
    if (args.length !== 1 || !args[0] || args[0].startsWith("--"))
      throw new Error("Usage: bun neo verify-replay <file>");
    const file = Bun.file(args[0]);
    if (file.size > 64 * 1024 * 1024) throw new Error("Replay exceeds the 64 MiB file limit");
    const value: unknown = JSON.parse(await file.text());
    const record = parseMatchRecord(
      value && typeof value === "object" && "record" in value ? value.record : value,
    );
    if (record.tick > MAX_SNAPSHOT_TICK || record.scenario.commands.length > 100000)
      throw new Error("Replay exceeds the two-hour or 100,000-command playback limit");
    const result = verifyMatchRecord(record);
    console.log(`Verified record history: ${result.tick} ${result.hash}`);
    console.log("Installed content and portable header identity were not checked.");
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
