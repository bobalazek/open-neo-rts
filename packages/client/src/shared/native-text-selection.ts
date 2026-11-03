import type { TextSelection } from "@open-neo-rts/render";

/** The semantic input remains the editor; native controls only copy its visible range. */
export function bindNativeTextSelection(
  root: HTMLElement,
  signal: AbortSignal,
  identify: (input: HTMLInputElement) => string | undefined,
  mirror: (id?: string, selection?: TextSelection) => void,
) {
  const sync = () => {
    if (signal.aborted) return;
    const input = document.activeElement;
    if (
      input instanceof HTMLInputElement &&
      root.contains(input) &&
      input.selectionStart !== null &&
      input.selectionEnd !== null
    )
      mirror(identify(input), {
        start: input.selectionStart,
        end: input.selectionEnd,
        direction: input.selectionDirection,
      });
    else mirror();
  };
  for (const event of ["focusin", "focusout", "input", "select", "keyup"])
    root.addEventListener(event, () => queueMicrotask(sync), { signal });
  document.addEventListener("selectionchange", sync, { signal });
  return { sync };
}
