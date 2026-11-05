import { Color4, FreeCamera, Vector3 } from "@babylonjs/core";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Button } from "@babylonjs/gui/2D/controls/button";
import { Checkbox } from "@babylonjs/gui/2D/controls/checkbox";
import { Container } from "@babylonjs/gui/2D/controls/container";
import { Control } from "@babylonjs/gui/2D/controls/control";
import { Image } from "@babylonjs/gui/2D/controls/image";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { ScrollViewer } from "@babylonjs/gui/2D/controls/scrollViewers/scrollViewer";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { createEngine, createScene } from ".";
import { createPanelBlock, type PanelBlock, panelTextHeight } from "./panel-content";
import { NativeTextInput, type TextSelection } from "./text-input";

export interface PanelField {
  id: string;
  label: string;
  help: string;
  tooltip?: string;
  value: string | boolean;
  disabled: boolean;
  choices?: readonly { value: string; label: string }[];
}
export interface PanelContent {
  id: string;
  revision?: string;
  fieldRevision?: string;
  title: string;
  text: string;
  status: string;
  error: string;
  progress?: { value: number; max: number };
  scale: number;
  fields: readonly PanelField[];
  actions: readonly {
    id: string;
    label: string;
    tooltip?: string;
    disabled: boolean;
    primary: boolean;
    back: boolean;
    resume?: boolean;
    detail?: boolean;
    footer?: boolean;
    activate: () => void;
  }[];
  tabs?: PanelContent["actions"];
  blocks?: readonly PanelBlock[];
  gallery?: { items: readonly PanelBlock[]; detail: readonly PanelBlock[] };
  change: (id: string, value: string | boolean) => void;
  submit: () => void;
}

/** Menu pages share a scene-owned widget panel and copied controller display values. */
export async function createPanelScene(
  canvas: HTMLCanvasElement,
  initial: PanelContent,
  modal: boolean,
  signal: AbortSignal,
) {
  const engine = await createEngine(canvas, signal);
  engine.canvasTabIndex = -1;
  canvas.tabIndex = -1;
  const scene = createScene(engine);
  scene.clearColor = modal ? new Color4(0, 0, 0, 0) : Color4.FromHexString("#10191eff");
  new FreeCamera("panel camera", new Vector3(0, 0, -10), scene);
  const gui = AdvancedDynamicTexture.CreateFullscreenUI("game panel", true, scene);
  // Nested scroll viewers can retain clipped dirty rectangles and leave inventory text blank.
  gui.useInvalidateRectOptimization = false;
  gui.disableTabNavigation = true;
  const shade = new Rectangle("modal shade");
  shade.background = "#071018";
  shade.alpha = 0.6;
  shade.thickness = 0;
  shade.isVisible = modal;
  gui.addControl(shade);
  const frame = new Rectangle("panel frame");
  frame.background = "#182126";
  frame.color = "#475354";
  frame.thickness = 1;
  gui.addControl(frame);
  const title = new TextBlock("panel title");
  title.color = "#eff1e9";
  title.fontWeight = "bold";
  title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  gui.addControl(title);
  const status = new TextBlock("panel status");
  status.color = "#ddc382";
  status.textWrapping = true;
  status.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  gui.addControl(status);
  const error = new TextBlock("panel error");
  error.color = "#ffb7a8";
  error.textWrapping = true;
  error.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  gui.addControl(error);
  const scroll = new ScrollViewer("panel scroll");
  scroll.thickness = 0;
  scroll.barSize = 8;
  scroll.barColor = "#ddc382";
  scroll.barBackground = "#10191e";
  scroll.wheelPrecision = 0.08;
  gui.addControl(scroll);
  const body = new Container("panel body");
  body.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  body.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  scroll.addControl(body);
  const tooltip = new Rectangle("panel tooltip");
  tooltip.background = "#182126";
  tooltip.color = "#ddc382";
  tooltip.isHitTestVisible = false;
  tooltip.isVisible = false;
  tooltip.zIndex = 10;
  gui.addControl(tooltip);
  const tooltipText = new TextBlock("panel tooltip text");
  tooltipText.color = "#eff1e9";
  tooltipText.textWrapping = true;
  tooltipText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  tooltipText.isHitTestVisible = false;
  tooltip.addControl(tooltipText);
  let content = initial;
  let widgets: {
    field: PanelField;
    caption: TextBlock;
    help: TextBlock;
    input: Button | Checkbox | NativeTextInput;
    chevron?: Image;
  }[] = [];
  let actions: Button[] = [];
  let tabs: Button[] = [];
  let rich: ReturnType<typeof createPanelBlock>[] = [];
  let mainBlocks: typeof rich = [],
    galleryItems: typeof rich = [],
    detailBlocks: typeof rich = [];
  let paragraph: TextBlock | undefined;
  let progress: Rectangle | undefined;
  let progressFill: Rectangle | undefined;
  let popup: Rectangle | undefined;
  let syncing = false;
  let focused: string | undefined;
  let contentHeight = 0;
  const place = (control: Control, x: number, y: number, width: number, height: number) => {
    control.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    control.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    control.leftInPixels = x;
    control.topInPixels = y;
    control.widthInPixels = width;
    control.heightInPixels = height;
  };
  const label = (name: string, text: string, size: number) => {
    const block = new TextBlock(name, text);
    block.fontFamily = "Arial";
    block.color = "#b5c0bf";
    block.fontSize = size;
    block.textWrapping = true;
    block.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    block.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    body.addControl(block);
    return block;
  };
  const button = (
    id: string,
    text: string,
    activate: () => void,
    parent: Container | AdvancedDynamicTexture = body,
  ) => {
    const control = Button.CreateSimpleButton(id, text);
    control.color = "#ddc382";
    control.background = "#18262e";
    control.disabledColor = "#18262e";
    control.thickness = 1;
    control.tabIndex = -1;
    control.hoverCursor = "pointer";
    control.pointerEnterAnimation = () => {
      control.background = "#35434a";
    };
    control.pointerOutAnimation = () => {
      control.background = content.actions.find((action) => action.id === id)?.primary
        ? "#3c392d"
        : "#18262e";
    };
    control.pointerDownAnimation = () => {
      control.background = "#4a4535";
    };
    control.pointerUpAnimation = control.pointerOutAnimation;
    if (control.textBlock) control.textBlock.textWrapping = true;
    control.onPointerClickObservable.add(() => {
      if (control.isEnabled) activate();
    });
    parent.addControl(control);
    return control;
  };
  function closeChoices() {
    tooltip.isVisible = false;
    popup?.dispose();
    popup = undefined;
  }
  function describe(value: string | undefined, anchor: Control) {
    tooltip.isVisible = false;
    if (!value || popup) return;
    const scale = Math.min(content.scale, Math.max(0.85, canvas.clientWidth / 390));
    const width = Math.min(340 * scale, canvas.clientWidth - 24);
    const height = textHeight(value, width - 24, 13 * scale) + 24;
    const below = anchor.centerY + anchor.heightInPixels / 2 + 8;
    const bottom =
      anchor.parent === body
        ? scroll.topInPixels + scroll.heightInPixels
        : canvas.clientHeight - 12;
    const top =
      below + height <= bottom ? below : anchor.centerY - anchor.heightInPixels / 2 - height - 8;
    place(
      tooltip,
      Math.max(12, Math.min(canvas.clientWidth - width - 12, anchor.centerX - width / 2)),
      Math.max(12, Math.min(canvas.clientHeight - height - 12, top)),
      width,
      height,
    );
    tooltipText.text = value;
    tooltipText.fontSize = 13 * scale;
    place(tooltipText, 12, 12, width - 24, height - 24);
    tooltip.isVisible = true;
  }
  function reveal(control: Control, start = false) {
    const range = contentHeight - scroll.heightInPixels;
    if (range <= 0 || control.parent !== body) return;
    const top = scroll.verticalBar.value * range;
    if (start || control.topInPixels < top)
      scroll.verticalBar.value = Math.max(0, Math.min(1, (control.topInPixels - 12) / range));
    else if (control.topInPixels + control.heightInPixels > top + scroll.heightInPixels)
      scroll.verticalBar.value = Math.min(
        1,
        (control.topInPixels + control.heightInPixels - scroll.heightInPixels + 12) / range,
      );
  }
  function build(keepFields: boolean) {
    closeChoices();
    for (const control of actions) control.dispose();
    const preserved = new Set<Control>(
      keepFields ? widgets.flatMap((widget) => [widget.caption, widget.help, widget.input]) : [],
    );
    for (const control of [...body.children]) if (!preserved.has(control)) control.dispose();
    if (!keepFields) widgets = [];
    paragraph = content.text ? label("panel text", content.text, 15) : undefined;
    progress = undefined;
    progressFill = undefined;
    if (content.progress) {
      progress = new Rectangle("panel progress");
      progress.background = "#10191e";
      progress.color = "#475354";
      progress.thickness = 1;
      progress.isHitTestVisible = false;
      body.addControl(progress);
      progressFill = new Rectangle("panel progress fill");
      progressFill.background = "#ddc382";
      progressFill.thickness = 0;
      progressFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      progressFill.isHitTestVisible = false;
      progress.addControl(progressFill);
    }
    for (const field of keepFields ? [] : content.fields) {
      const caption = label(`${field.id} label`, field.label, 15);
      caption.color = "#eff1e9";
      const help = label(`${field.id} help`, field.help, 13);
      let input: Button | Checkbox | NativeTextInput;
      let chevron: Image | undefined;
      if (typeof field.value === "boolean") {
        input = new Checkbox(field.id);
        input.background = "#10191e";
        input.color = "#ddc382";
        body.addControl(input);
        input.onIsCheckedChangedObservable.add((value) => {
          if (!syncing) content.change(field.id, value);
        });
        input.onPointerDownObservable.add(() => {
          focused = field.id;
        });
        caption.isPointerBlocker = true;
        caption.onPointerClickObservable.add(() => {
          if (!field.disabled)
            content.change(field.id, !content.fields.find((item) => item.id === field.id)?.value);
        });
      } else if (field.choices) {
        input = button(field.id, "", () => {
          if (popup) {
            closeChoices();
            return;
          }
          focused = field.id;
          tooltip.isVisible = false;
          popup = new Rectangle("choices");
          popup.background = "#182126";
          popup.color = "#ddc382";
          popup.isPointerBlocker = true;
          gui.addControl(popup);
          const scale = Math.min(content.scale, Math.max(0.85, canvas.clientWidth / 390));
          const rowHeight = 44 * scale;
          const popupHeight = Math.min(
            field.choices!.length * rowHeight + 2,
            264 * scale,
            canvas.clientHeight - 24,
          );
          const below = input.centerY + input.heightInPixels / 2;
          const popupTop =
            below + popupHeight <= canvas.clientHeight - 12
              ? below
              : Math.max(12, input.centerY - input.heightInPixels / 2 - popupHeight);
          place(
            popup,
            Math.max(
              12,
              Math.min(
                canvas.clientWidth - input.widthInPixels - 12,
                input.centerX - input.widthInPixels / 2,
              ),
            ),
            popupTop,
            input.widthInPixels,
            popupHeight,
          );
          const options = new ScrollViewer("panel choices scroll");
          options.thickness = 0;
          options.barSize = 8 * scale;
          options.barColor = "#ddc382";
          options.barBackground = "#10191e";
          options.wheelPrecision = 0.08;
          popup.addControl(options);
          const list = new Container("panel choices list");
          list.heightInPixels = field.choices!.length * rowHeight;
          list.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
          list.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
          options.addControl(list);
          field.choices?.forEach((choice, i) => {
            const option = button(
              choice.value,
              choice.label,
              () => {
                closeChoices();
                content.change(field.id, choice.value);
              },
              list,
            );
            // Let pointer entry reach the scroller; the popup itself blocks controls beneath it.
            option.isPointerBlocker = false;
            place(option, 0, i * rowHeight, input.widthInPixels - 10 * scale, rowHeight);
          });
          const selected =
            field.choices?.findIndex(
              (choice) =>
                choice.value === content.fields.find((item) => item.id === field.id)?.value,
            ) ?? 0;
          const range = list.heightInPixels - popupHeight + 2;
          options.verticalBar.value =
            range > 0 ? Math.max(0, Math.min(1, (selected * rowHeight - rowHeight) / range)) : 0;
        });
        chevron = new Image(
          `${field.id} disclosure`,
          `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="8" viewBox="0 0 12 8"><path d="m1 1 5 5 5-5" fill="none" stroke="#ddc382" stroke-width="1.5"/></svg>')}`,
        );
        chevron.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        chevron.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        chevron.isHitTestVisible = false;
        input.addControl(chevron);
      } else {
        input = new NativeTextInput(field.id, field.value);
        input.autoStretchWidth = false;
        input.background = "#10191e";
        input.focusedBackground = "#25343b";
        input.color = "#eff1e9";
        input.focusedColor = "#ddc382";
        input.promptMessage = field.label;
        input.onTextChangedObservable.add((control) => {
          if (!syncing) content.change(field.id, control.text);
        });
        input.onFocusObservable.add(() => {
          closeChoices();
          focused = field.id;
          reveal(input);
        });
        input.onKeyboardEventProcessedObservable.add((event) => {
          if (event.key === "Enter") content.submit();
        });
        body.addControl(input);
      }
      input.tabIndex = -1;
      for (const control of [input, caption]) {
        control.onPointerEnterObservable.add(() => describe(field.tooltip, input));
        control.onPointerOutObservable.add(() => {
          tooltip.isVisible = false;
        });
      }
      widgets.push({ field, caption, help, input, chevron });
    }
    actions = content.actions.map((action) =>
      button(
        action.id,
        action.label,
        () => {
          closeChoices();
          const current = content.actions.find((item) => item.id === action.id);
          if (current && !current.disabled) current.activate();
        },
        action.back || action.resume || action.footer ? gui : body,
      ),
    );
    actions.forEach((control, i) => {
      control.onPointerEnterObservable.add(() => describe(content.actions[i]?.tooltip, control));
      control.onPointerOutObservable.add(() => {
        tooltip.isVisible = false;
      });
    });
    tabs = (content.tabs ?? []).map((action) =>
      button(action.id, action.label, () => {
        content.tabs?.find((tab) => tab.id === action.id)?.activate();
      }),
    );
    const makeBlocks = (blocks: readonly PanelBlock[]) =>
      blocks.map((block) =>
        createPanelBlock(body, block, textHeight, (id) => {
          focused = id;
        }),
      );
    mainBlocks = makeBlocks(content.blocks ?? []);
    galleryItems = makeBlocks(content.gallery?.items ?? []);
    detailBlocks = makeBlocks(content.gallery?.detail ?? []);
    rich = [...mainBlocks, ...galleryItems, ...detailBlocks];
    scroll.verticalBar.value = 0;
    layout();
  }
  function textHeight(text: string, width: number, size: number) {
    return panelTextHeight(gui.getContext(), text, width, size);
  }
  function layout() {
    closeChoices();
    const width = canvas.clientWidth,
      height = canvas.clientHeight;
    const scale = Math.min(content.scale, Math.max(0.85, width / 390));
    const inset = width < 600 ? 12 : 24;
    const frameWidth = Math.min(
      width - inset * 2,
      (content.gallery || content.id === "results" ? 1240 : content.id === "settings" ? 920 : 720) *
        scale,
    );
    const x = (width - frameWidth) / 2;
    const pad = width < 600 ? 16 : 28;
    const inner = frameWidth - pad * 2 - 12;
    const statusHeight = textHeight(content.status, inner, 13 * scale);
    const errorHeight = textHeight(content.error, inner, 13 * scale);
    const pinned = actions.flatMap((control, i) => (content.actions[i]?.footer ? [control] : []));
    const pinnedColumns = Math.min(pinned.length, Math.max(1, Math.floor(inner / (140 * scale))));
    const pinnedHeight = pinned.length ? Math.ceil(pinned.length / pinnedColumns) * 52 * scale : 0;
    const headerHeight = 82 * scale + (statusHeight ? 8 * scale + statusHeight : 0);
    const footerHeight = 20 * scale + pinnedHeight + (errorHeight ? 16 * scale + errorHeight : 0);
    const tableHeight = Math.max(1, height - inset * 2 - headerHeight - footerHeight - 16 * scale);
    const columns = inner >= 650 * scale ? 2 : 1;
    const columnWidth = (inner - (columns - 1) * 24 * scale) / columns;
    body.widthInPixels = inner;
    let y = 0;
    if (tabs.length) {
      const tabColumns = Math.min(tabs.length, Math.max(1, Math.floor(inner / (130 * scale))));
      const tabWidth = (inner - (tabColumns - 1) * 8 * scale) / tabColumns;
      tabs.forEach((tab, i) => {
        tab.fontSize = 14 * scale;
        place(
          tab,
          (i % tabColumns) * (tabWidth + 8 * scale),
          Math.floor(i / tabColumns) * 52 * scale,
          tabWidth,
          44 * scale,
        );
      });
      y = Math.ceil(tabs.length / tabColumns) * 52 * scale + 12 * scale;
    }
    if (paragraph) {
      paragraph.fontSize = 15 * scale;
      paragraph.text = content.text;
      const paragraphHeight = textHeight(content.text, inner, 15 * scale);
      place(paragraph, 0, y, inner, paragraphHeight);
      y +=
        paragraphHeight +
        (widgets.length || content.actions.some((action) => !action.back) ? 16 * scale : 0);
    }
    if (progress && progressFill && content.progress) {
      place(progress, 0, y, inner, 12 * scale);
      progressFill.width = Math.min(1, Math.max(0, content.progress.value / content.progress.max));
      y += 36 * scale;
    }
    for (let start = 0; start < widgets.length; start += columns) {
      let rowHeight = 0;
      widgets.slice(start, start + columns).forEach((widget, column) => {
        const columnX = column * (columnWidth + 24 * scale);
        const check = widget.input instanceof Checkbox;
        const captionWidth = columnWidth - (check ? 42 * scale : 0);
        const captionHeight = Math.max(
          check ? 44 * scale : 0,
          textHeight(widget.field.label, captionWidth, 15 * scale),
        );
        const inputTop = check ? (captionHeight - 26 * scale) / 2 : captionHeight + 8 * scale;
        const helpTop = check ? captionHeight : inputTop + 44 * scale;
        const helpHeight = textHeight(widget.field.help, columnWidth, 13 * scale);
        place(widget.caption, columnX + (check ? 42 * scale : 0), y, captionWidth, captionHeight);
        widget.caption.fontSize = 15 * scale;
        place(
          widget.input,
          columnX,
          y + inputTop,
          check ? 26 * scale : columnWidth,
          (check ? 26 : 44) * scale,
        );
        widget.input.fontSize = 16 * scale;
        if (widget.chevron && widget.input instanceof Button) {
          widget.chevron.widthInPixels = 12 * scale;
          widget.chevron.heightInPixels = 8 * scale;
          widget.chevron.leftInPixels = -16 * scale;
          if (widget.input.textBlock) {
            widget.input.textBlock.paddingLeftInPixels = 12 * scale;
            widget.input.textBlock.paddingRightInPixels = 32 * scale;
          }
        }
        widget.help.isVisible = helpHeight > 0;
        place(widget.help, columnX, y + helpTop + 8 * scale, columnWidth, Math.max(1, helpHeight));
        widget.help.fontSize = 13 * scale;
        rowHeight = Math.max(rowHeight, helpTop + (helpHeight ? 8 * scale + helpHeight : 0));
      });
      y += rowHeight + 24 * scale;
    }
    const layoutBlocks = (blocks: typeof rich, x: number, top: number, blockWidth: number) => {
      let end = top;
      for (const block of blocks) {
        const blockHeight = block.layout(blockWidth, scale, tableHeight);
        place(block.root, x, end, blockWidth, blockHeight);
        end += blockHeight + 16 * scale;
      }
      return end;
    };
    y = layoutBlocks(mainBlocks, 0, y, inner);
    let detailY = y;
    const galleryWide = !!content.gallery && inner >= 760 * scale;
    const listWidth = galleryWide
      ? (inner - 32 * scale) * (content.id === "manual" ? 0.32 : 0.5)
      : inner;
    const detailWidth = galleryWide ? inner - 32 * scale - listWidth : inner;
    const detailX = galleryWide ? listWidth + 32 * scale : 0;
    if (content.gallery) {
      const listEnd = layoutBlocks(galleryItems, 0, y, listWidth);
      detailY = layoutBlocks(
        detailBlocks,
        detailX,
        galleryWide ? y : listEnd + 16 * scale,
        detailWidth,
      );
      y = Math.max(listEnd, detailY);
    }
    actions.forEach((control, i) => {
      if (!content.actions[i]?.detail) return;
      control.fontSize = 15 * scale;
      place(control, detailX, detailY, detailWidth, 44 * scale);
      detailY += 52 * scale;
    });
    y = Math.max(y, detailY);
    let visible = 0;
    actions.forEach((control, i) => {
      control.fontSize = 15 * scale;
      if (
        content.actions[i]?.back ||
        content.actions[i]?.resume ||
        content.actions[i]?.detail ||
        content.actions[i]?.footer
      )
        return;
      const rowY = y + Math.floor(visible / columns) * 52 * scale;
      place(
        control,
        (visible % columns) * (columnWidth + 24 * scale),
        rowY,
        columnWidth,
        44 * scale,
      );
      visible++;
    });
    contentHeight =
      y + (visible ? Math.ceil(visible / columns) * 52 * scale - 8 * scale : 0) + 12 * scale;
    body.heightInPixels = contentHeight;
    const frameHeight =
      content.gallery || content.id === "results"
        ? height - inset * 2
        : Math.min(height - inset * 2, headerHeight + contentHeight + footerHeight);
    const frameY = (height - frameHeight) / 2;
    place(frame, x, frameY, frameWidth, frameHeight);
    const back = content.actions.findIndex((action) => action.back);
    const resume = content.actions.findIndex((action) => action.resume);
    const resumeSpace = resume >= 0 ? 140 * scale : 0;
    const backSpace = back >= 0 ? 100 * scale : 0;
    place(
      title,
      x + pad + backSpace,
      frameY + 20 * scale,
      inner - backSpace - resumeSpace,
      42 * scale,
    );
    title.fontSize = 27 * scale;
    if (back >= 0) place(actions[back]!, x + pad, frameY + 20 * scale, 80 * scale, 42 * scale);
    if (resume >= 0)
      place(
        actions[resume]!,
        x + pad + inner - 128 * scale,
        frameY + 20 * scale,
        128 * scale,
        42 * scale,
      );
    status.isVisible = statusHeight > 0;
    place(status, x + pad, frameY + 70 * scale, inner, Math.max(1, statusHeight));
    status.fontSize = 13 * scale;
    place(
      scroll,
      x + pad,
      frameY + headerHeight,
      inner + 12,
      Math.max(1, frameHeight - headerHeight - footerHeight),
    );
    error.isVisible = errorHeight > 0;
    pinned.forEach((control, i) => {
      const gap = 8 * scale;
      const itemWidth = (inner - (pinnedColumns - 1) * gap) / pinnedColumns;
      place(
        control,
        x + pad + (i % pinnedColumns) * (itemWidth + gap),
        frameY +
          frameHeight -
          20 * scale -
          pinnedHeight +
          Math.floor(i / pinnedColumns) * 52 * scale,
        itemWidth,
        44 * scale,
      );
    });
    place(
      error,
      x + pad,
      frameY +
        frameHeight -
        20 * scale -
        pinnedHeight -
        errorHeight -
        (pinnedHeight && errorHeight ? 8 * scale : 0),
      inner,
      Math.max(1, errorHeight),
    );
    error.fontSize = 13 * scale;
    if (focused) highlight(focused);
  }
  function focus(id?: string) {
    gui.focusedControl = null;
    highlight(id);
    tooltip.isVisible = false;
    // Reveal changes scroll position; focus help needs the next measured control bounds.
    scene.onAfterRenderObservable.addOnce(() => {
      if (disposed || focused !== id) return;
      const widget = widgets.find((widget) => widget.field.id === id);
      if (widget) describe(widget.field.tooltip, widget.input);
      else {
        const index = actions.findIndex((action) => action.name === id);
        if (index >= 0) describe(content.actions[index]?.tooltip, actions[index]!);
      }
    });
  }
  function highlight(id?: string) {
    focused = id;
    for (const widget of widgets) {
      widget.input.thickness = widget.field.id === id ? 2 : 1;
      if (widget.field.id === id) {
        const span =
          widget.help.topInPixels + widget.help.heightInPixels - widget.input.topInPixels;
        reveal(widget.field.help && span + 12 < scroll.heightInPixels ? widget.help : widget.input);
      }
    }
    for (const control of [...actions, ...tabs]) {
      control.thickness = control.name === id ? 2 : 1;
      if (control.name === id) reveal(control);
    }
    for (const block of rich) block.focus(block.id === id);
    const block = rich.find((block) => block.id === id);
    if (block)
      reveal(
        block.root,
        content.id === "manual" &&
          !!content.gallery?.detail.some(
            (item) => item.id === id && item.kind === "text" && item.heading,
          ),
      );
  }
  function update(next: PanelContent) {
    const keepFields =
      content.id === next.id &&
      content.fieldRevision === next.fieldRevision &&
      widgets.length === next.fields.length;
    const rebuild =
      content.id !== next.id ||
      content.revision !== next.revision ||
      !!content.progress !== !!next.progress ||
      actions.length === 0;
    const resize =
      content.scale !== next.scale ||
      content.status !== next.status ||
      content.error !== next.error ||
      content.progress?.value !== next.progress?.value ||
      content.progress?.max !== next.progress?.max ||
      content.text !== next.text;
    content = next;
    if (rebuild) build(keepFields);
    else if (resize) layout();
    title.text = content.title;
    status.text = content.status;
    error.text = content.error;
    syncing = true;
    for (const widget of widgets) {
      const field = content.fields.find((item) => item.id === widget.field.id);
      if (!field) continue;
      widget.input.isEnabled = !field.disabled;
      widget.input.alpha = field.disabled ? 0.65 : 1;
      if (widget.input instanceof Checkbox) widget.input.isChecked = field.value === true;
      else if (widget.input instanceof NativeTextInput) widget.input.text = String(field.value);
      else if (widget.input.textBlock)
        widget.input.textBlock.text =
          field.choices?.find((choice) => choice.value === field.value)?.label ??
          String(field.value);
    }
    syncing = false;
    actions.forEach((control, i) => {
      const action = content.actions[i];
      control.isEnabled = !action?.disabled;
      control.alpha = action?.disabled ? 0.4 : 1;
      control.background = action?.primary ? "#3c392d" : "#18262e";
    });
    tabs.forEach((control, i) => {
      control.background = content.tabs?.[i]?.primary ? "#3c392d" : "#18262e";
      control.isEnabled = !content.tabs?.[i]?.disabled;
    });
    for (const block of [
      ...(content.blocks ?? []),
      ...(content.gallery?.items ?? []),
      ...(content.gallery?.detail ?? []),
    ])
      rich.find((widget) => widget.id === block.id)?.update(block);
  }
  const resize = () => {
    engine.resize();
    layout();
  };
  const render = () => scene.render();
  window.addEventListener("resize", resize);
  update(initial);
  engine.runRenderLoop(render);
  let disposed = false;
  return {
    update,
    focus,
    selection(id?: string, selection?: TextSelection) {
      for (const { field, input } of widgets)
        if (input instanceof NativeTextInput)
          input.mirrorSelection(field.id === id ? selection : undefined);
    },
    activeField: () => focused,
    scrollTo: (id: string, x: number, y: number) =>
      rich.find((block) => block.id === id)?.scroll(x, y),
    scrollKey: (id: string, key: string) =>
      rich.find((block) => block.id === id)?.scrollKey(key) ?? false,
    closeChoices: () => {
      const open = !!popup;
      closeChoices();
      return open;
    },
    drawn: () =>
      new Promise<void>((resolve) => {
        const observer = scene.onDisposeObservable.addOnce(() => resolve());
        scene.onAfterRenderObservable.addOnce(() => {
          scene.onDisposeObservable.remove(observer);
          resolve();
        });
      }),
    dispose() {
      if (disposed) return;
      disposed = true;
      window.removeEventListener("resize", resize);
      engine.stopRenderLoop(render);
      scene.dispose();
      engine.dispose();
    },
  };
}
