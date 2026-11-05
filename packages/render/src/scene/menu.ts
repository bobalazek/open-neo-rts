import {
  ArcRotateCamera,
  Color3,
  Color4,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Button } from "@babylonjs/gui/2D/controls/button";
import { Control } from "@babylonjs/gui/2D/controls/control";
import { Image } from "@babylonjs/gui/2D/controls/image";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { loadModel } from "../units";
import { createEngine, createScene } from ".";

export interface MenuAction {
  id: string;
  label: string;
  primary?: boolean;
  secondary?: boolean;
  activate: () => void;
}

export interface MenuContent {
  intro: string;
  note: string;
  version: string;
  modelLabel: string;
  reducedMotion: boolean;
  scale: number;
  model: (signal: AbortSignal) => Promise<Uint8Array>;
  materials?: Readonly<Record<string, string>>;
}

// Original angular lettering; a vector stays sharp at every GUI texture resolution.
const wordmark = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="390" height="155" viewBox="0 0 390 155"><g fill="#ddc382"><path d="M2 39V8h23v31H2zm7-7h9V15H9zM33 39V8h24v20H40v11zm7-18h10v-6H40zM65 39V8h25v7H72v5h16v7H72v5h18v7zM98 39V8h7l13 18V8h7v31h-7l-13-18v18z"/><path d="M2 138V58h18l43 51V58h20v80H65L22 87v51zM98 138V58h83v19h-62v12h52v18h-52v12h62v19zM197 73l15-15h75l15 15v50l-15 15h-75l-15-15zm21 4v42h63V77z"/></g><path fill="#eff1e9" d="M320 138v-26h18v16h-5l6 10h-8l-5-10v10zm6-16h6v-4h-6zM344 112h20v6h-7v20h-6v-20h-7zM368 112h20v6h-14v4h14v16h-20v-6h14v-4h-14z"/></svg>`)}`;

/** Scene-owned native GUI. Actions belong to the client; this scene never touches a match. */
export async function createMenuScene(
  canvas: HTMLCanvasElement,
  content: MenuContent,
  signal: AbortSignal,
) {
  const engine = await createEngine(canvas, signal);
  engine.canvasTabIndex = -1;
  canvas.tabIndex = -1;
  const scene = createScene(engine);
  scene.clearColor = new Color4(0.045, 0.065, 0.075, 1);
  scene.fogMode = 3;
  scene.fogColor = new Color3(0.045, 0.065, 0.075);
  scene.fogStart = 13;
  scene.fogEnd = 30;
  const camera = new ArcRotateCamera(
    "menu camera",
    -Math.PI / 2.7,
    Math.PI / 2.9,
    10,
    new Vector3(0, 0.6, 0),
    scene,
  );
  camera.minZ = 0.05;
  const stage = MeshBuilder.CreateCylinder(
    "display plinth",
    { diameter: 9, height: 0.32, tessellation: 8 },
    scene,
  );
  stage.position.y = -0.2;
  const steel = new StandardMaterial("menu steel", scene);
  steel.diffuseColor = Color3.FromHexString("#25343b");
  steel.specularColor = new Color3(0.12, 0.12, 0.12);
  stage.material = steel;
  const ground = MeshBuilder.CreateGround("menu ground", { width: 100, height: 100 }, scene);
  ground.position.y = -0.38;
  ground.material = steel;
  const seam = new StandardMaterial("plinth seam", scene);
  seam.diffuseColor = Color3.FromHexString("#b9a16c");
  seam.emissiveColor = Color3.FromHexString("#332b18");
  const rim = MeshBuilder.CreateCylinder(
    "plinth rim",
    { diameter: 9.04, height: 0.035, tessellation: 8 },
    scene,
  );
  rim.position.y = -0.08;
  rim.material = seam;
  const modelRoot = new TransformNode("menu model", scene);
  const gui = AdvancedDynamicTexture.CreateFullscreenUI("Home", true, scene);
  gui.background = "transparent";
  const left = new Rectangle("menu shade");
  left.thickness = 0;
  left.background = "#10191e";
  left.alpha = 0.96;
  left.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  gui.addControl(left);
  const logo = new Image("Open Neo RTS", wordmark);
  logo.stretch = Image.STRETCH_UNIFORM;
  gui.addControl(logo);
  const label = (name: string, value: string, size: number, color = "#b5c0bf") => {
    const block = new TextBlock(name, value);
    block.fontFamily = "Arial, sans-serif";
    block.fontSize = size;
    block.color = color;
    block.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    block.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    block.textWrapping = true;
    gui.addControl(block);
    return block;
  };
  const intro = label("intro", content.intro, 17, "#eff1e9");
  const note = label("preview", content.note, 13);
  const version = label("version", content.version, 12);
  const caption = label("model", content.modelLabel, 14, "#ddc382");
  let actions: readonly MenuAction[] = [];
  let buttons: Button[] = [];
  let focused: string | undefined;
  let modelLoaded = false;
  const place = (control: Control, x: number, y: number, width: number, height: number) => {
    control.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    control.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    control.leftInPixels = x;
    control.topInPixels = y;
    control.widthInPixels = width;
    control.heightInPixels = height;
  };
  function layout() {
    const width = canvas.clientWidth,
      height = canvas.clientHeight;
    const narrow = width < 760;
    const landscape = width > height && height < 600;
    // Bound the authored UI scale to the available viewport without shrinking touch targets.
    const scale = Math.min(
      content.scale,
      Math.max(0.85, width / 390),
      Math.max(0.85, height / 720),
    );
    const inset = narrow ? 24 : Math.max(44, width * 0.05);
    const menuWidth = narrow ? width - inset * 2 : Math.min(360 * scale, width * 0.37);
    const textWidth = landscape ? width * 0.43 : menuWidth;
    const actionLeft = landscape ? width * 0.54 : inset;
    const actionWidth = landscape ? width * 0.43 - 12 : menuWidth;
    const short = height < 600;
    const rowHeight = Math.max(44, 50 * scale);
    intro.fontSize = 17 * scale;
    note.fontSize = 13 * scale;
    version.fontSize = 12 * scale;
    const normal = actions.filter((action) => !action.secondary).length;
    const menuHeight = normal * (rowHeight + 8);
    const logoTop = short ? 16 : narrow ? 24 : Math.max(38, height * 0.065);
    const logoHeight = short ? 65 : narrow ? 104 : 138 * scale;
    const menuTop = landscape
      ? Math.max(36, (height - menuHeight) / 2)
      : short
        ? 142
        : narrow
          ? Math.max(246, height - menuHeight - 166)
          : Math.max(logoTop + logoHeight + 90, (height - menuHeight) / 2);
    place(left, 0, 0, narrow ? width : inset * 2 + menuWidth, height);
    left.alpha = narrow ? 0.18 : 0.96;
    place(logo, inset, logoTop, Math.min(textWidth, 350 * scale), logoHeight);
    place(intro, inset, logoTop + logoHeight + 12, textWidth, 48 * scale);
    let y = menuTop;
    let footerX = inset;
    const footerCount = actions.filter((action) => action.secondary).length;
    const footerWidth = Math.min(
      125 * scale,
      (width - inset * 2 - Math.max(0, footerCount - 1) * 7 * scale) / Math.max(1, footerCount),
    );
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i]!,
        button = buttons[i]!;
      button.fontSize = (action.secondary ? 12 : 16) * scale;
      if (action.secondary) {
        place(button, footerX, height - 52 * scale, footerWidth, 40 * scale);
        footerX += footerWidth + 7 * scale;
      } else {
        place(button, actionLeft, y, actionWidth, rowHeight);
        y += rowHeight + 8;
      }
    }
    place(
      note,
      inset,
      landscape ? height - 146 * scale : Math.max(y + 12, height - 146 * scale),
      textWidth,
      (short ? 52 : 58) * scale,
    );
    place(version, inset, height - 76 * scale, menuWidth, 22 * scale);
    place(caption, width * 0.6, height - 60, width * 0.35, 40);
    caption.isVisible = modelLoaded && !narrow;
    // Fullscreen GUI shares its camera viewport; frame the model with a screen offset instead.
    camera.targetScreenOffset.x = narrow ? 0 : 2.5;
    camera.targetScreenOffset.y = narrow ? 1.8 : 0;
    camera.radius = narrow ? 16 : 12;
  }
  const focus = (id?: string) => {
    focused = id;
    for (let i = 0; i < buttons.length; i++) {
      buttons[i]!.color = actions[i]?.id === id ? "#fff6db" : "#ddc382";
      buttons[i]!.thickness = actions[i]?.id === id ? 2 : actions[i]?.secondary ? 0 : 1;
    }
  };
  function setActions(next: readonly MenuAction[]) {
    for (const button of buttons) button.dispose();
    actions = next;
    buttons = next.map((action) => {
      const button = Button.CreateSimpleButton(action.id, action.label);
      button.background = action.primary ? "#3c392d" : "#18262e";
      button.color = "#ddc382";
      button.cornerRadius = 0;
      button.tabIndex = -1;
      button.hoverCursor = "pointer";
      button.pointerDownAnimation = () => {
        button.background = "#4a4535";
      };
      button.pointerUpAnimation = () => {
        button.background = action.primary ? "#3c392d" : "#18262e";
      };
      button.pointerEnterAnimation = () => {
        button.background = "#35434a";
      };
      button.pointerOutAnimation = button.pointerUpAnimation;
      if (button.textBlock) {
        button.textBlock.textWrapping = true;
        button.textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        button.textBlock.paddingLeft = action.secondary ? 0 : 18;
      }
      button.onPointerClickObservable.add(action.activate);
      gui.addControl(button);
      return button;
    });
    focus(focused);
    layout();
    return new Promise<void>((resolve) => {
      const disposedObserver = scene.onDisposeObservable.addOnce(() => resolve());
      scene.onAfterRenderObservable.addOnce(() => {
        scene.onDisposeObservable.remove(disposedObserver);
        resolve();
      });
    });
  }
  const abort = new AbortController();
  let disposed = false;
  const modelReady = content
    .model(abort.signal)
    .then(async (bytes) => {
      if (disposed) return;
      const model = await loadModel(scene, bytes, content.materials);
      if (disposed) {
        model.dispose();
        return;
      }
      model.setTeamColor("#b83b32");
      for (const mesh of model.meshes) if (!mesh.parent) mesh.parent = modelRoot;
      const bounds = scene.getWorldExtends(
        (mesh) => model.meshes.includes(mesh) && mesh.getTotalVertices() > 0,
      );
      const size = bounds.max.subtract(bounds.min);
      modelRoot.scaling.setAll(5.7 / Math.max(size.x, size.y, size.z));
      modelRoot.position.y = -bounds.min.y * modelRoot.scaling.y;
      model.play("idle");
      modelLoaded = true;
      layout();
    })
    .catch(() => {
      caption.isVisible = false;
    });
  const render = () => {
    if (!content.reducedMotion)
      modelRoot.rotation.y += Math.min(engine.getDeltaTime(), 50) * 0.000045;
    scene.render();
  };
  const resize = () => {
    engine.resize();
    layout();
  };
  window.addEventListener("resize", resize);
  layout();
  engine.runRenderLoop(render);
  return {
    setActions,
    focus,
    modelReady,
    dispose() {
      if (disposed) return;
      disposed = true;
      abort.abort();
      window.removeEventListener("resize", resize);
      engine.stopRenderLoop(render);
      scene.dispose();
      engine.dispose();
    },
  };
}
