import { Container } from "@babylonjs/gui/2D/controls/container";
import { Control } from "@babylonjs/gui/2D/controls/control";
import { Image } from "@babylonjs/gui/2D/controls/image";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { ScrollViewer } from "@babylonjs/gui/2D/controls/scrollViewers/scrollViewer";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { placePanelControl as place, scrollPanelKey } from "./panel-content";

export type ReplayProductionData = readonly {
  id: string;
  label: string;
  items: readonly { id: string; label: string; image?: string; state: string; progress: number }[];
}[];

/** Original queue thumbnails stay contextual; names, work state and progress appear on hover. */
export function createReplayProduction(
  parent: Container,
  hint: (text: string) => void,
  focus: () => void,
) {
  const root = new ScrollViewer("replay production queues"),
    body = new Container("replay production entries");
  root.thickness = 0;
  root.barSize = 8;
  root.barColor = "#ddc382";
  root.barBackground = "#10191e";
  root.addControl(body);
  parent.addControl(root);
  root.onPointerDownObservable.add(focus);
  body.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  body.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  let data: ReplayProductionData = [],
    identity = "",
    hovered: string | undefined;
  const groups: {
    title: TextBlock;
    items: { frame: Rectangle; image: Image; bar: Rectangle }[];
  }[] = [];
  function describe() {
    const item = data.flatMap((group) => group.items).find((item) => item.id === hovered);
    hint(item ? `${item.label} · ${item.state} · ${item.progress}%` : "");
  }
  return {
    root,
    update(next: ReplayProductionData) {
      data = next;
      const key = JSON.stringify(
        data.map((group) => [
          group.id,
          group.label,
          group.items.map((item) => [item.id, item.image]),
        ]),
      );
      if (identity !== key) {
        identity = key;
        hovered = undefined;
        hint("");
        for (const group of groups) {
          group.title.dispose();
          for (const item of group.items) item.frame.dispose();
        }
        groups.length = 0;
        for (const group of data) {
          const title = new TextBlock(group.id, group.label);
          title.fontFamily = "Arial";
          title.color = "#eff1e9";
          title.fontSize = 12;
          title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
          title.isHitTestVisible = false;
          body.addControl(title);
          const items = group.items.map((item) => {
            const frame = new Rectangle(item.id);
            frame.color = "#475354";
            frame.background = "#18262e";
            frame.thickness = 1;
            const image = new Image(item.id, item.image ?? "");
            image.stretch = Image.STRETCH_UNIFORM;
            image.isHitTestVisible = false;
            const bar = new Rectangle(`${item.id} progress`);
            bar.background = "#ddc382";
            bar.thickness = 0;
            bar.isHitTestVisible = false;
            frame.addControl(image);
            frame.addControl(bar);
            body.addControl(frame);
            frame.onPointerEnterObservable.add(() => {
              hovered = item.id;
              frame.color = "#ddc382";
              describe();
            });
            frame.onPointerOutObservable.add(() => {
              hovered = undefined;
              frame.color = "#475354";
              hint("");
            });
            return { frame, image, bar };
          });
          groups.push({ title, items });
        }
      }
      if (hovered) describe();
    },
    layout(width: number, height: number, scale: number) {
      const columns = Math.max(1, Math.floor((width - 10) / (48 * scale)));
      let y = 0;
      for (const [index, group] of groups.entries()) {
        group.title.fontSize = 12 * scale;
        place(group.title, 0, y, width - 10, 22 * scale);
        y += 24 * scale;
        for (const [i, item] of group.items.entries()) {
          place(
            item.frame,
            (i % columns) * 48 * scale,
            y + Math.floor(i / columns) * 48 * scale,
            42 * scale,
            42 * scale,
          );
          place(item.image, 3 * scale, 2 * scale, 36 * scale, 34 * scale);
          place(
            item.bar,
            2 * scale,
            37 * scale,
            (38 * scale * data[index]!.items[i]!.progress) / 100,
            3 * scale,
          );
        }
        y += Math.ceil(group.items.length / columns) * 48 * scale + 8 * scale;
      }
      body.widthInPixels = width;
      body.heightInPixels = y;
      root.widthInPixels = width;
      root.heightInPixels = height;
    },
    focus(active: boolean) {
      root.color = "#fff6db";
      root.thickness = active ? 2 : 0;
    },
    scrollKey(key: string) {
      return scrollPanelKey(root, key);
    },
  };
}
