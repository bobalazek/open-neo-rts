/** Shift adds; Ctrl/Cmd toggles. Handles are already restricted to the projection. */
export function changeSelection(
  current: readonly string[],
  picked: readonly string[],
  modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
): string[] {
  if (!modifiers.shiftKey && !modifiers.ctrlKey && !modifiers.metaKey) return [...new Set(picked)];
  const next = new Set(current);
  for (const handle of picked) {
    if ((modifiers.ctrlKey || modifiers.metaKey) && next.has(handle)) next.delete(handle);
    else next.add(handle);
  }
  return [...next];
}
