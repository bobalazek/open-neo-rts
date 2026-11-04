import { Button } from "@babylonjs/gui/2D/controls/button";
import { Container } from "@babylonjs/gui/2D/controls/container";
import { Control } from "@babylonjs/gui/2D/controls/control";
import { Image } from "@babylonjs/gui/2D/controls/image";
import { ScrollViewer } from "@babylonjs/gui/2D/controls/scrollViewers/scrollViewer";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";

export type PanelBlock =
  | { kind: "text"; id: string; text: string; heading?: boolean }
  | { kind: "image"; id: string; source: string; caption: string; width: number; height: number }
  | {
      kind: "table";
      id: string;
      caption: string;
      headers: readonly string[];
      rows: readonly (readonly string[])[];
    }
  | {
      kind: "button";
      id: string;
      text: string;
      caption: string;
      image?: string;
      active: boolean;
      disabled: boolean;
      activate: () => void;
    };

export function placePanelControl(
  control: Control,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  control.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  control.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  control.leftInPixels = x;
  control.topInPixels = y;
  control.widthInPixels = width;
  control.heightInPixels = height;
}

/** Rich views consume only copied display values and original image sources, never simulation state. */
export function createPanelBlock(
  parent: Container,
  initial: PanelBlock,
  measure: (text: string, width: number, size: number) => number,
  focus: (id: string) => void,
) {
  let block = initial;
  let focused = false;
  const root = block.kind === "button" ? new Button(block.id) : new Container(block.id);
  parent.addControl(root);
  const label = (name: string, value: string, size: number, container: Container = root) => {
    const text = new TextBlock(name, value);
    text.fontFamily = "Arial";
    text.fontSize = size;
    text.color = "#b5c0bf";
    text.textWrapping = true;
    text.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    text.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    text.isHitTestVisible = false;
    container.addControl(text);
    return text;
  };
  let image: Image | undefined;
  let title: TextBlock | undefined;
  let caption: TextBlock | undefined;
  let table: ScrollViewer | undefined;
  let tableBody: Container | undefined;
  const cells: TextBlock[][] = [];
  if (block.kind === "image" || (block.kind === "button" && block.image)) {
    image = new Image(`${block.id} image`, block.kind === "image" ? block.source : block.image);
    image.stretch = Image.STRETCH_UNIFORM;
    image.isHitTestVisible = false;
    root.addControl(image);
  }
  if (block.kind === "text") title = label(block.id, block.text, block.heading ? 20 : 14);
  if (block.kind === "image") caption = label(`${block.id} caption`, block.caption, 13);
  if (block.kind === "button" && root instanceof Button) {
    root.color = "#ddc382";
    root.background = block.active ? "#3c392d" : "#18262e";
    root.thickness = block.active ? 2 : 1;
    root.isEnabled = !block.disabled;
    root.tabIndex = -1;
    root.hoverCursor = "pointer";
    root.onPointerClickObservable.add(() => {
      if (block.kind === "button" && !block.disabled) block.activate();
    });
    title = label(`${block.id} title`, block.text, 15);
    title.color = "#eff1e9";
    caption = label(`${block.id} detail`, block.caption, 12);
  }
  if (block.kind === "table") {
    title = label(`${block.id} title`, block.caption, 16);
    title.color = "#eff1e9";
    table = new ScrollViewer(`${block.id} values`);
    table.color = "#475354";
    table.thickness = 1;
    table.barColor = "#ddc382";
    table.barBackground = "#10191e";
    table.barSize = 8;
    root.addControl(table);
    tableBody = new Container(`${block.id} rows`);
    tableBody.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    tableBody.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    table.addControl(tableBody);
    [block.headers, ...block.rows].forEach((values, row) => {
      cells.push(
        values.map((value, col) => {
          const text = label(`${block.id} ${row} ${col}`, value, 13, tableBody);
          text.color = row ? "#eff1e9" : "#ddc382";
          if (!row) text.fontWeight = "bold";
          return text;
        }),
      );
    });
    table.onPointerDownObservable.add(() => focus(block.id));
  }
  return {
    id: block.id,
    root,
    update(next: PanelBlock) {
      block = next;
      if (block.kind === "button" && root instanceof Button) {
        root.isEnabled = !block.disabled;
        root.background = block.active ? "#3c392d" : "#18262e";
        root.thickness = focused ? 3 : block.active ? 2 : 1;
      }
    },
    layout(width: number, scale: number, maxHeight: number) {
      if (block.kind === "text" && title) {
        const size = (block.heading ? 20 : 14) * scale;
        title.fontSize = size;
        const height = measure(block.text, width, size);
        placePanelControl(title, 0, 0, width, height);
        return height;
      }
      if (block.kind === "image" && image && caption) {
        const imageWidth = Math.min(width, block.width * scale);
        const imageHeight = (imageWidth * block.height) / Math.max(1, block.width);
        const captionHeight = measure(block.caption, width, 13 * scale);
        placePanelControl(image, 0, 0, imageWidth, imageHeight);
        caption.fontSize = 13 * scale;
        placePanelControl(caption, 0, imageHeight + 8 * scale, width, Math.max(1, captionHeight));
        return imageHeight + (captionHeight ? captionHeight + 8 * scale : 0);
      }
      if (block.kind === "button" && title && caption) {
        const imageWidth = image ? Math.min(112 * scale, width * 0.32) : 0;
        const left = imageWidth ? imageWidth + 24 * scale : 12 * scale;
        const textWidth = Math.max(20, width - left - 12 * scale);
        const titleHeight = measure(block.text, textWidth, 15 * scale);
        const captionHeight = measure(block.caption, textWidth, 12 * scale);
        const height = Math.max(
          (image ? 80 : 44) * scale,
          titleHeight + captionHeight + (captionHeight ? 8 : 0) * scale + 24 * scale,
        );
        title.fontSize = 15 * scale;
        caption.fontSize = 12 * scale;
        placePanelControl(title, left, 12 * scale, textWidth, titleHeight);
        placePanelControl(
          caption,
          left,
          12 * scale + titleHeight + 8 * scale,
          textWidth,
          Math.max(1, captionHeight),
        );
        if (image) placePanelControl(image, 12 * scale, 8 * scale, imageWidth, height - 16 * scale);
        return height;
      }
      if (block.kind === "table" && table && tableBody && title) {
        const data = block;
        const titleHeight = measure(block.caption, width, 16 * scale);
        title.fontSize = 16 * scale;
        placePanelControl(title, 0, 0, width, Math.max(1, titleHeight));
        const columns = data.headers.map((header, col) =>
          Math.max(
            112 * scale,
            Math.min(
              240 * scale,
              Math.max(header.length, ...data.rows.map((row) => (row[col] ?? "").length)) *
                8 *
                scale +
                24 * scale,
            ),
          ),
        );
        let y = 0;
        cells.forEach((row) => {
          const height = Math.max(
            30 * scale,
            ...row.map(
              (cell, col) =>
                measure(cell.text, (columns[col] ?? 112 * scale) - 16 * scale, 13 * scale) +
                12 * scale,
            ),
          );
          let x = 0;
          row.forEach((cell, col) => {
            const columnWidth = columns[col] ?? 112 * scale;
            cell.fontSize = 13 * scale;
            placePanelControl(
              cell,
              x + 8 * scale,
              y + 6 * scale,
              columnWidth - 16 * scale,
              height - 12 * scale,
            );
            x += columnWidth;
          });
          y += height;
        });
        tableBody.widthInPixels = columns.reduce((a, b) => a + b, 0);
        tableBody.heightInPixels = y;
        const height = Math.max(
          1,
          Math.min(y + 12 * scale, 340 * scale, maxHeight - titleHeight - 8 * scale),
        );
        placePanelControl(table, 0, titleHeight + 8 * scale, width, height);
        return titleHeight + 8 * scale + height;
      }
      return 0;
    },
    focus(active: boolean) {
      focused = active;
      if (root instanceof Button) {
        root.color = active ? "#eff1e9" : "#ddc382";
        root.thickness = active ? 3 : block.kind === "button" && block.active ? 2 : 1;
      }
      if (table) {
        table.color = active ? "#eff1e9" : "#475354";
        table.thickness = active ? 2 : 1;
      }
    },
    scroll(x: number, y: number) {
      if (!table) return;
      table.horizontalBar.value = Math.max(0, Math.min(1, x));
      table.verticalBar.value = Math.max(0, Math.min(1, y));
    },
    scrollKey(key: string) {
      if (!table) return false;
      const horizontal = key === "ArrowLeft" || key === "ArrowRight";
      const bar = horizontal ? table.horizontalBar : table.verticalBar;
      const step = key === "PageUp" || key === "PageDown" ? 0.8 : 0.1;
      const direction = ["ArrowLeft", "ArrowUp", "PageUp"].includes(key) ? -1 : 1;
      if (key === "Home" || key === "End") bar.value = key === "Home" ? 0 : 1;
      else if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(key)
      )
        bar.value = Math.max(0, Math.min(1, bar.value + direction * step));
      else return false;
      return true;
    },
  };
}
