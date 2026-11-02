declare module "*.r8" {
  const url: string;
  export default url;
}

declare module "*.glb" {
  const url: string;
  export default url;
}

declare module "virtual:debug-builtins" {
  export const builtins: readonly { raw: unknown; model?: string }[];
}

declare module "virtual:normal-catalog" {
  export const content: {
    catalog: import("@open-neo-rts/sim").GameplayCatalog | null;
    error: string | null;
  };
}
