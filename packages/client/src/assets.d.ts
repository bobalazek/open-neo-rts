declare module "*.r8" {
  const url: string;
  export default url;
}

declare module "*.glb" {
  const url: string;
  export default url;
}

declare module "*.png" {
  const url: string;
  export default url;
}
declare module "*.ogg" {
  const url: string;
  export default url;
}

declare module "virtual:debug-builtins" {
  export const builtins: readonly {
    raw: unknown;
    model?: string;
    wreck?: string;
    icon?: string;
    sounds?: Readonly<Record<string, string>>;
  }[];
}

declare module "virtual:normal-catalog" {
  export const content: {
    catalog: import("@open-neo-rts/sim").GameplayCatalog | null;
    packs: readonly import("@open-neo-rts/content").PackIdentity[];
    cosmeticHash: string | null;
    error: string | null;
  };
}
