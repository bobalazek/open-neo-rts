// Deterministic fixed-tick simulation: commands in, game state out. Features live in src/features/<name>/.
export * from "./commands";
export * from "./ecs";
export * from "./features/combat";
export * from "./features/construction";
export * from "./features/control";
export * from "./features/economy";
export * from "./features/entities";
export * from "./features/events";
export * from "./features/movement";
export * from "./features/production";
export * from "./features/projectiles";
export * from "./features/vision";
export * from "./kernel";
export * from "./match";
export * from "./projection";
export * from "./snapshots";
