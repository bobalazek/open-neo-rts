import type { ICanvasRenderingContext } from "@babylonjs/core/Engines/ICanvas";
import { Control } from "@babylonjs/gui/2D/controls/control";

/** The full square map fits inside the circle; inverse rotation keeps corner cells reachable. */
export function circularMapPoint(x: number, y: number, diameter: number) {
  const dx = x - diameter / 2,
    dy = y - diameter / 2;
  const side = (diameter - 4) / Math.SQRT2;
  const u = (dx + dy) / Math.SQRT2 / side + 0.5;
  const v = (dy - dx) / Math.SQRT2 / side + 0.5;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? { x: u, y: v } : null;
}

/** Babylon GUI draws the existing permitted minimap pixels directly, without encoded-image churn. */
export class BattlefieldMap extends Control {
  focused = false;
  constructor(private readonly source: HTMLCanvasElement) {
    super("battlefield minimap");
    this.isPointerBlocker = true;
    this.hoverCursor = "crosshair";
  }
  point(x: number, y: number) {
    return circularMapPoint(
      x - this._currentMeasure.left,
      y - this._currentMeasure.top,
      this._currentMeasure.width,
    );
  }
  override contains(x: number, y: number) {
    const m = this._currentMeasure,
      dx = x - m.left - m.width / 2,
      dy = y - m.top - m.height / 2;
    // Base containment also registers Babylon's pointer blocker and completes its capture lifecycle.
    return dx * dx + dy * dy <= Math.min(m.width, m.height) ** 2 / 4 && super.contains(x, y);
  }
  override _onCanvasBlur() {
    this._forcePointerUp();
  }
  override _draw(context: ICanvasRenderingContext) {
    const { left, top, width, height } = this._currentMeasure;
    const radius = Math.min(width, height) / 2 - 2;
    context.save();
    this._applyStates(context);
    context.translate(left + width / 2, top + height / 2);
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.fillStyle = "#10191e";
    context.fill();
    context.save();
    context.clip();
    context.rotate(Math.PI / 4);
    const side = (radius * 2) / Math.SQRT2;
    Reflect.set(context, "imageSmoothingEnabled", false);
    context.drawImage(this.source, -side / 2, -side / 2, side, side);
    context.restore();
    context.strokeStyle = this.focused ? "#eff1e9" : "#ddc382";
    context.lineWidth = this.focused ? 3 : 1;
    context.stroke();
    context.font = "12px Arial";
    context.fillStyle = "#eff1e9";
    context.fillText("N", radius * 0.66, -radius * 0.68);
    context.restore();
  }
  refresh() {
    this._markAsDirty();
  }
}
