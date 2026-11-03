import { Color4, FreeCamera, Vector3 } from "@babylonjs/core";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Button } from "@babylonjs/gui/2D/controls/button";
import { Checkbox } from "@babylonjs/gui/2D/controls/checkbox";
import { Container } from "@babylonjs/gui/2D/controls/container";
import { Control } from "@babylonjs/gui/2D/controls/control";
import { InputText } from "@babylonjs/gui/2D/controls/inputText";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { ScrollViewer } from "@babylonjs/gui/2D/controls/scrollViewers/scrollViewer";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { createEngine, createScene } from ".";

export interface PanelField {
  id: string;
  label: string;
  help: string;
  value: string | boolean;
  disabled: boolean;
  choices?: readonly { value: string; label: string }[];
}
export interface PanelContent {
  id: string;
  title: string;
  text: string;
  status: string;
  error: string;
  scale: number;
  fields: readonly PanelField[];
  actions: readonly {
    id: string;
    label: string;
    disabled: boolean;
    primary: boolean;
    back: boolean;
    activate: () => void;
  }[];
  change: (id: string, value: string | boolean) => void;
  submit: () => void;
}

/** The two settings entry points and pause-menu pages share one scene-owned widget panel. */
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
  let content = initial;
  let widgets: {
    field: PanelField;
    caption: TextBlock;
    help: TextBlock;
    input: Button | Checkbox | InputText;
  }[] = [];
  let actions: Button[] = [];
  let paragraph: TextBlock | undefined;
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
    popup?.dispose();
    popup = undefined;
  }
  function reveal(control: Control) {
    const range = contentHeight - scroll.heightInPixels;
    if (range <= 0 || control.parent !== body) return;
    const top = scroll.verticalBar.value * range;
    if (control.topInPixels < top)
      scroll.verticalBar.value = Math.max(0, (control.topInPixels - 12) / range);
    else if (control.topInPixels + control.heightInPixels > top + scroll.heightInPixels)
      scroll.verticalBar.value = Math.min(
        1,
        (control.topInPixels + control.heightInPixels - scroll.heightInPixels + 12) / range,
      );
  }
  function build() {
    closeChoices();
    for (const control of actions) control.dispose();
    for (const control of [...body.children]) control.dispose();
    widgets = [];
    paragraph = content.text ? label("panel text", content.text, 15) : undefined;
    for (const field of content.fields) {
      const caption = label(`${field.id} label`, field.label, 15);
      caption.color = "#eff1e9";
      const help = label(`${field.id} help`, field.help, 13);
      let input: Button | Checkbox | InputText;
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
          popup = new Rectangle("choices");
          popup.background = "#182126";
          popup.color = "#ddc382";
          body.addControl(popup);
          place(
            popup,
            input.leftInPixels,
            input.topInPixels + input.heightInPixels,
            input.widthInPixels,
            field.choices!.length * 44,
          );
          field.choices?.forEach((choice, i) => {
            const option = button(
              choice.value,
              choice.label,
              () => {
                closeChoices();
                content.change(field.id, choice.value);
              },
              popup,
            );
            place(option, 0, i * 44, input.widthInPixels, 44);
          });
          reveal(popup);
        });
      } else {
        input = new InputText(field.id, field.value);
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
      widgets.push({ field, caption, help, input });
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
        action.back ? gui : body,
      ),
    );
    scroll.verticalBar.value = 0;
    layout();
  }
  function textHeight(text: string, width: number, size: number) {
    if (!text) return 0;
    const context = gui.getContext();
    context.save();
    context.font = `${size}px Arial`;
    let lines = 0;
    for (const block of text.split("\n")) {
      let line = "";
      lines++;
      for (const word of block.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (line && context.measureText(next).width > width) {
          lines++;
          line = word;
        } else line = next;
      }
    }
    context.restore();
    return Math.ceil(lines * size * 1.4);
  }
  function layout() {
    closeChoices();
    const width = canvas.clientWidth,
      height = canvas.clientHeight;
    const scale = Math.min(content.scale, Math.max(0.85, width / 390));
    const inset = width < 600 ? 12 : 24;
    const frameWidth = Math.min(width - inset * 2, (content.id === "settings" ? 920 : 720) * scale);
    const x = (width - frameWidth) / 2;
    const pad = width < 600 ? 16 : 28;
    const inner = frameWidth - pad * 2 - 12;
    const columns = inner >= 650 * scale ? 2 : 1;
    const columnWidth = (inner - (columns - 1) * 24 * scale) / columns;
    body.widthInPixels = inner;
    let y = 0;
    if (paragraph) {
      paragraph.fontSize = 15 * scale;
      paragraph.text = content.text;
      const paragraphHeight = textHeight(content.text, inner, 15 * scale);
      place(paragraph, 0, 0, inner, paragraphHeight);
      y =
        paragraphHeight +
        (widgets.length || content.actions.some((action) => !action.back) ? 16 * scale : 0);
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
        widget.help.isVisible = helpHeight > 0;
        place(widget.help, columnX, y + helpTop + 8 * scale, columnWidth, Math.max(1, helpHeight));
        widget.help.fontSize = 13 * scale;
        rowHeight = Math.max(rowHeight, helpTop + (helpHeight ? 8 * scale + helpHeight : 0));
      });
      y += rowHeight + 24 * scale;
    }
    let visible = 0;
    actions.forEach((control, i) => {
      control.fontSize = 15 * scale;
      if (content.actions[i]?.back) return;
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
    const statusHeight = textHeight(content.status, inner, 13 * scale);
    const errorHeight = textHeight(content.error, inner, 13 * scale);
    const headerHeight = 82 * scale + (statusHeight ? 8 * scale + statusHeight : 0);
    const footerHeight = 20 * scale + (errorHeight ? 16 * scale + errorHeight : 0);
    const frameHeight = Math.min(height - inset * 2, headerHeight + contentHeight + footerHeight);
    const frameY = (height - frameHeight) / 2;
    place(frame, x, frameY, frameWidth, frameHeight);
    const back = content.actions.findIndex((action) => action.back);
    const backSpace = back >= 0 ? 100 * scale : 0;
    place(title, x + pad + backSpace, frameY + 20 * scale, inner - backSpace, 42 * scale);
    title.fontSize = 27 * scale;
    if (back >= 0) place(actions[back]!, x + pad, frameY + 20 * scale, 80 * scale, 42 * scale);
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
    place(
      error,
      x + pad,
      frameY + frameHeight - 20 * scale - errorHeight,
      inner,
      Math.max(1, errorHeight),
    );
    error.fontSize = 13 * scale;
    if (focused) focus(focused);
  }
  function focus(id?: string) {
    gui.focusedControl = null;
    focused = id;
    for (const widget of widgets) {
      widget.input.thickness = widget.field.id === id ? 2 : 1;
      if (widget.field.id === id) {
        const span =
          widget.help.topInPixels + widget.help.heightInPixels - widget.input.topInPixels;
        reveal(widget.field.help && span + 12 < scroll.heightInPixels ? widget.help : widget.input);
      }
    }
    for (const control of actions) {
      control.thickness = control.name === id ? 2 : 1;
      if (control.name === id) reveal(control);
    }
  }
  function update(next: PanelContent) {
    const rebuild = content.id !== next.id || actions.length === 0;
    const resize =
      content.scale !== next.scale ||
      content.status !== next.status ||
      content.error !== next.error ||
      content.text !== next.text;
    content = next;
    if (rebuild) build();
    else if (resize) layout();
    title.text = content.title;
    status.text = content.status;
    error.text = content.error;
    syncing = true;
    for (const widget of widgets) {
      const field = content.fields.find((item) => item.id === widget.field.id);
      if (!field) continue;
      widget.input.isEnabled = !field.disabled;
      if (widget.input instanceof Checkbox) widget.input.isChecked = field.value === true;
      else if (widget.input instanceof InputText) widget.input.text = String(field.value);
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
    activeField: () => focused,
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
