import { defineComponent } from "../../ecs";

/** Private, non-actor vision sources. No Template/Transform means no actor projection. */
export const AreaReveal = defineComponent("AreaReveal", {
  force: "u32",
  x: "i32",
  y: "i32",
  radius: "u32",
  from: "u32",
  until: "u32",
});

// shortcut: bound independent timed fields; revisit with counted vision work if content needs more.
export const MAX_AREA_REVEALS = 256;
