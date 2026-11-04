/// <reference path="../assets.d.ts" />

import assembly from "../../../../content/core/music/assembly-line.ogg";
import menu from "../../../../content/core/music/command-board.ogg";
import march from "../../../../content/core/music/steel-march.ogg";
import type { MusicLibrary } from "./music";

// shortcut: fixed built-in soundtrack; move selection into pack metadata when music authoring is added.
export const MUSIC: MusicLibrary = { menu: [menu], match: [assembly, march] };
