// The Khronos validator ships no types; this covers the API we use.
declare module "gltf-validator" {
  export function validateBytes(
    data: Uint8Array,
    options?: {
      uri?: string;
      writeTimestamp?: boolean;
      externalResourceFunction?: (uri: string) => Promise<Uint8Array>;
    },
  ): Promise<{ issues: { messages: { severity: number; message: string; pointer?: string }[] } }>;
}
