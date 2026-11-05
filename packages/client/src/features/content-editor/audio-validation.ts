/** Offline decoding never opens a speaker or changes the app-owned mixer. */
export async function checkEditorAudio(bytes: Uint8Array): Promise<string[]> {
  try {
    const context = new OfflineAudioContext(1, 1, 48000);
    // decodeAudioData detaches its input; the validated export bytes must survive unchanged.
    const decoded = await context.decodeAudioData(new Uint8Array(bytes).buffer);
    let peak = 0;
    for (let channel = 0; channel < decoded.numberOfChannels; channel++)
      for (const sample of decoded.getChannelData(channel)) {
        if (!Number.isFinite(sample)) return ["decoded audio contains non-finite samples"];
        peak = Math.max(peak, Math.abs(sample));
      }
    if (!decoded.length || !peak) return ["decoded audio is empty or silent"];
    // shortcut: sample peak is an early gate; CLI FFmpeg true-peak qualification remains required.
    if (peak > 10 ** (-1.1 / 20))
      return ["decoded sample peak exceeds -1.1 dBFS; lower the export level and revalidate"];
    return [];
  } catch (error) {
    return [`audio decoding failed: ${error instanceof Error ? error.message : String(error)}`];
  }
}
