import type { ICanvasRenderingContext } from "@babylonjs/core/Engines/ICanvas";
import { Control } from "@babylonjs/gui/2D/controls/control";

export interface ReplayChartData {
  tick: number;
  series: readonly {
    label: string;
    color: string;
    points: readonly { tick: number; value: number }[];
  }[];
}

/** Draw copied replay statistics directly in Babylon GUI, like the existing minimap. */
export class ReplayChart extends Control {
  private data: ReplayChartData = { tick: 0, series: [] };
  private readonly number = new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  constructor() {
    super("replay statistics chart");
    this.isHitTestVisible = false;
  }
  update(data: ReplayChartData) {
    this.data = data;
    this._markAsDirty();
  }
  override _draw(context: ICanvasRenderingContext) {
    const { left, top, width, height } = this._currentMeasure;
    const { tick, series } = this.data;
    const maxValue = Math.max(
      1,
      ...series.flatMap((row) => row.points.map((point) => point.value)),
    );
    const legendRows = Math.ceil(series.length / 2),
      plotHeight = Math.max(10, height - 40 - legendRows * 18);
    const plotWidth = Math.max(1, width - 48),
      y = 8;
    context.save();
    this._applyStates(context);
    context.translate(left, top);
    context.font = "12px Arial";
    context.fillStyle = "#b5c0bf";
    context.fillText(this.number.format(maxValue), 0, y + 10);
    context.fillText("0", 24, y + plotHeight);
    context.strokeStyle = "#475354";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(40, y);
    context.lineTo(40, y + plotHeight);
    context.lineTo(width - 8, y + plotHeight);
    context.stroke();
    const time = (value: number) =>
      `${Math.floor(value / 1200)}:${String(Math.floor(value / 20) % 60).padStart(2, "0")}`;
    context.fillText("0:00", 40, y + plotHeight + 18);
    const end = time(tick);
    context.fillText(end, width - 8 - context.measureText(end).width, y + plotHeight + 18);
    for (const [index, row] of series.entries()) {
      context.strokeStyle = row.color;
      context.fillStyle = row.color;
      context.lineWidth = 2;
      context.setLineDash(index % 2 ? [6, 3] : []);
      context.beginPath();
      row.points.forEach((point, i) => {
        const x = 40 + (point.tick / Math.max(1, tick)) * plotWidth;
        const py = y + plotHeight - (point.value / maxValue) * plotHeight;
        if (i) context.lineTo(x, py);
        else context.moveTo(x, py);
      });
      context.stroke();
      context.setLineDash([]);
      const last = row.points.at(-1);
      if (last) {
        context.beginPath();
        context.arc(
          40 + (last.tick / Math.max(1, tick)) * plotWidth,
          y + plotHeight - (last.value / maxValue) * plotHeight,
          3,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
      const label = `${row.label}: ${this.number.format(last?.value ?? 0)}`;
      context.fillText(
        label,
        ((index % 2) * width) / 2,
        y + plotHeight + 38 + Math.floor(index / 2) * 18,
        width / 2 - 8,
      );
    }
    context.restore();
  }
}
