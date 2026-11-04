---

version: 1
slug: "src-features-settings-index-ts"
primary_target: "src/features/settings/index.ts"
related_targets: ["../render/src/camera/index.ts"]
---

# Device camera controls

Operate extension of the existing Graphite Command Stations native Settings
panel, from Home and a paused match. Preserve the shared fields, fixed Back,
scrolling fields/actions, semantic keyboard editing and graphics fallback.
Add mouse camera sensitivity and inverted middle-drag rotation beside the
existing keyboard/edge camera speed. Reuse the current percentage choices and
checkboxes; no new visual world, assets or decorative motion.

The safety interaction is previewing camera behavior, then canceling without
changing saved preferences. Existing version-one preferences migrate without
losing their selected graphics, scale or camera settings. Desktop and narrow
captures must keep both new controls reachable and their descriptions readable.
