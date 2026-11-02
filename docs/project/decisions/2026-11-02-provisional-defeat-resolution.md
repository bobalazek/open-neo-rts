# 2026-11-02 — First skirmish defeat and terminal resolution

**Context.** The first playable needs the documented Last Man Standing result.
Missing implementation details are delegated for later polish.

**Implementation defaults.** Use the existing elimination settings: annihilation
by default, base destruction or headquarters when explicitly configured. Living
walls do not preserve a Force. Defeat removes its remaining controllable actors;
already-fired ordnance remains independent while other teams keep playing. All
Forces resolve against the same completed tick before selecting a winning team;
simultaneous total elimination is a draw.

Surrender requires the explicit scope and unanimity among current seats granted
that scope on the Force. Votes are canonical; revoked/expired voters cease to
participate. Single-controller surrender is immediate. One-team normal harness
setups remain noncompetitive rather than generating an instant fabricated win.

**Consequences.** Terminal result/tick and final checkpoint occur once. The worker
pauses and gameplay no longer advances; post-end commands acknowledge refusal.
Replays stop at terminal state and reject scheduled post-end commands, preserving
trace validity and bounded execution. These public results are not full statistics,
a post-match screen or a complete save-file restoration implementation.
