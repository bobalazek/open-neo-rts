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
