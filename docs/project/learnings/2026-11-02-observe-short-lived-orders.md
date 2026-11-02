# Observe short-lived orders at the worker boundary

The minimap journey in CI41489811848 exhausted its90-second total budget while
waiting for the HUD's transient “Attacking” label; CI41491138993 reached later
controls before the same overall deadline. Neither retained a detailed action
trace or worker history, so those logs alone do not prove a lost command.

An independent real normal-match probe confirmed the competing valid sequence:
the selected Field Technician's minimap attack-move to25088,26112 was accepted,
appeared in actual worker snapshots at ticks116–152 (about1.85 seconds), reached
its destination, and then correctly displayed idle with no current order. Slow
driver round trips can miss that entire intermediate UI state.

Assert bounded captured own-actor order signatures (Force, definition, type and
exact target) from real worker replies; preserve HUD mode/focus/selection and
payment checks. Give added ping interactions their own focused journey so the
original90-second workload and fixed-inset resize regression stay intact. No
product delay, command retry or deadline increase is needed.
