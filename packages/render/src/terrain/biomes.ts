// Biome palettes: provisional colours until the art direction sign-off. See docs/design/terrain-and-biomes.md#biomes.

import type { Surface } from "@open-neo-rts/content";

export interface Palette {
  /** Base colour per surface, 0xRRGGBB. Every biome colours every surface. */
  surfaces: Record<Surface, number>;
  cliff: number;
  shallow: number;
  deep: number;
  /** Ground under structures. Unused until structures render. */
  foundation: number;
}

export const BIOMES = {
  temperate: {
    surfaces: {
      grass: 0x6fae4a,
      dirt: 0x9a7650,
      sand: 0xd8c48a,
      rock: 0x8c8c88,
      snow: 0xeef2f5,
      ice: 0xb8dcea,
      road: 0x5c5c60,
      rubble: 0x7d746a,
    },
    cliff: 0x8a8a86,
    shallow: 0x4fb3a6,
    deep: 0x1f6f8b,
    foundation: 0xb0aca4,
  },
  desert: {
    surfaces: {
      grass: 0xb5a95a,
      dirt: 0xb08a5a,
      sand: 0xe3c58a,
      rock: 0xa8784e,
      snow: 0xf2ece0,
      ice: 0xd0e4e6,
      road: 0x8a7a66,
      rubble: 0x9c8468,
    },
    cliff: 0xc08b5c,
    shallow: 0x7fd3c8,
    deep: 0x2f8fa8,
    foundation: 0xa88a64,
  },
  arctic: {
    surfaces: {
      grass: 0x7f9a7a,
      dirt: 0x6e665e,
      sand: 0xb9b4a6,
      rock: 0x4c5058,
      snow: 0xf0f4f8,
      ice: 0xbfe2f0,
      road: 0x5a5e66,
      rubble: 0x6a6c70,
    },
    cliff: 0x50555e,
    shallow: 0x8cc8dc,
    deep: 0x2c5f7c,
    foundation: 0xcfe6f0,
  },
  urban: {
    surfaces: {
      grass: 0x5f9e48,
      dirt: 0x857058,
      sand: 0xc9b994,
      rock: 0x9a9894,
      snow: 0xe8ecef,
      ice: 0xc4dce6,
      road: 0x46484c,
      rubble: 0x8a8078,
    },
    cliff: 0xa5a29b,
    shallow: 0x5e9aa0,
    deep: 0x2e5a66,
    foundation: 0xb8b4ac,
  },
} satisfies Record<string, Palette>;

export type Biome = keyof typeof BIOMES;
