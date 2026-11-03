// UI primitives used by several features (buttons, panels, dialogs). Phase 2.
import english from "../locales/en.json";

/** Replacing unchanged text between pointerdown/up can cancel WebKit clicks. */
export function setText(element: Element, value: string) {
  if (element.textContent !== value) element.textContent = value;
}

/** English interface fallback. Content names remain inline in their authored definitions. */
export function text(
  key: keyof typeof english,
  values: Record<string, string | number> = {},
): string {
  return english[key].replace(/\{([a-zA-Z]+)\}/g, (match, name: string) =>
    String(values[name] ?? match),
  );
}
