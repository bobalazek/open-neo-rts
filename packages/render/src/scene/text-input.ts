import type { IKeyboardEvent } from "@babylonjs/core/Events/deviceInputEvents";
import { InputText } from "@babylonjs/gui/2D/controls/inputText";

export interface TextSelection {
  start: number;
  end: number;
  direction: "forward" | "backward" | "none" | null;
}

/** Draws semantic field selection without taking keyboard or clipboard ownership. */
export class NativeTextInput extends InputText {
  private mirrorKey = "";

  constructor(name: string, value: string) {
    super(name, value);
    this.textHighlightColor = "#ddc382";
    this.highlighterOpacity = 0.35;
  }

  override processKey(keyCode: number, key?: string, event?: IKeyboardEvent) {
    // An empty field has one caret position; a delayed pointer draw must not reposition new text.
    if (!this.text) this._clickedCoordinate = null;
    super.processKey(keyCode, key, event);
  }

  mirrorSelection(selection?: TextSelection) {
    if (!selection) {
      if (!this.mirrorKey) return;
      this.mirrorKey = "";
      this._isFocused = false;
      this._isTextHighlightOn = false;
      this._scrollLeft = null;
      clearTimeout(this._blinkTimeout);
      this._markAsDirty();
      return;
    }
    const key = JSON.stringify([this.text, selection]);
    if (this.mirrorKey === key) return;
    this.mirrorKey = key;
    // DOM offsets count UTF-16 units; Babylon's TextWrapper counts Unicode code points.
    const start = [...this.text.slice(0, selection.start)].length;
    const end = [...this.text.slice(0, selection.end)].length;
    this._isFocused = true;
    this._isTextHighlightOn = start !== end;
    this._clickedCoordinate = null;
    this._blinkIsEven = false;
    // shortcut: Babylon 9.33 has no range setter; replace this adapter when one is available.
    Reflect.set(
      this,
      "_cursorOffset",
      [...this.text].length - (selection.direction === "backward" ? start : end),
    );
    Reflect.set(this, "_startHighlightIndex", start);
    Reflect.set(this, "_endHighlightIndex", end);
    Reflect.set(this, "_cursorIndex", -1);
    this._markAsDirty();
  }

  override onFocus() {
    this.mirrorKey = "";
    super.onFocus();
  }

  override onBlur() {
    this.mirrorKey = "";
    super.onBlur();
  }

  override dispose() {
    clearTimeout(this._blinkTimeout);
    super.dispose();
  }
}
