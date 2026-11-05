import {
  GizmoCoordinatesMode,
  GizmoManager,
  Mesh,
  Quaternion,
  type Scene,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";

export interface SocketChange {
  index: number;
  name: string;
  parent: number | null;
  translation: readonly number[];
  rotation: readonly number[];
  scale: readonly number[];
}
export interface SocketNode {
  index: number;
  name: string;
  parent: number | null;
  editable: boolean;
}

/** Actual model-local nodes drive both the native gizmos and exported transform copies. */
export function createSocketPreview(
  scene: Scene,
  model: readonly TransformNode[],
  specs: readonly SocketNode[],
  changed: () => void,
) {
  const nodes = new Map<number, TransformNode>();
  for (const spec of specs) {
    const matches = model.filter((node) => node.name === spec.name);
    if (matches.length > 1) throw new Error("Ambiguous model node name");
    if (matches[0]) nodes.set(spec.index, matches[0]);
  }
  const roots = model.filter((node) => !model.some((parent) => parent === node.parent));
  if (roots.length !== 1) throw new Error("Socket editing requires one loaded model root");
  const original = [...nodes.values()].map((node) => ({
    node,
    position: node.position.clone(),
    rotation: node.rotation.clone(),
    quaternion: node.rotationQuaternion?.clone(),
    scale: node.scaling.clone(),
  }));
  const created: TransformNode[] = [],
    changes = new Map<number, SocketNode>();
  const entries = specs.filter((spec) => nodes.has(spec.index)).map((spec) => ({ ...spec }));
  const gizmos = new GizmoManager(scene);
  gizmos.usePointerToAttachGizmos = false;
  gizmos.coordinatesMode = GizmoCoordinatesMode.Local;
  gizmos.positionGizmoEnabled = gizmos.rotationGizmoEnabled = true;
  const gui = AdvancedDynamicTexture.CreateFullscreenUI("socket label", true, scene);
  const caption = new Rectangle("socket caption");
  caption.background = "#182126";
  caption.color = "#475354";
  caption.thickness = 1;
  caption.height = "26px";
  caption.linkOffsetY = -32;
  caption.isHitTestVisible = false;
  gui.addControl(caption);
  const label = new TextBlock("selected socket");
  label.fontFamily = "Arial";
  label.fontSize = 13;
  label.color = "#fff6db";
  label.isHitTestVisible = false;
  caption.addControl(label);
  const anchor = new Mesh("socket label anchor", scene);
  anchor.isPickable = false;
  let selected: SocketNode | undefined,
    disposed = false;
  function emit() {
    if (!selected || disposed) return;
    changes.set(selected.index, selected);
    changed();
  }
  gizmos.gizmos.positionGizmo!.onDragObservable.add(emit);
  gizmos.gizmos.rotationGizmo!.onDragObservable.add(emit);
  gizmos.gizmos.positionGizmo!.onDragEndObservable.add(emit);
  gizmos.gizmos.rotationGizmo!.onDragEndObservable.add(emit);
  function mode(value: "move" | "rotate") {
    gizmos.positionGizmoEnabled = value === "move";
    gizmos.rotationGizmoEnabled = value === "rotate";
    gizmos.attachToNode(selected ? nodes.get(selected.index)! : null);
  }
  return {
    entries,
    select(index: number, value: "move" | "rotate") {
      selected = entries.find((entry) => entry.index === index && entry.editable);
      caption.isVisible = !!selected;
      if (selected) {
        anchor.parent = nodes.get(selected.index)!;
        anchor.position.setAll(0);
        label.text = selected.name;
        const context = gui.getContext();
        context.save();
        context.font = "13px Arial";
        caption.width = `${Math.min(220, Math.ceil(context.measureText(selected.name).width) + 16)}px`;
        context.restore();
        caption.linkWithMesh(anchor);
      }
      mode(value);
    },
    mode,
    values() {
      const node = selected && nodes.get(selected.index);
      if (!node) return;
      return {
        position: node.position.asArray(),
        angles: (node.rotationQuaternion?.toEulerAngles() ?? node.rotation)
          .asArray()
          .map((n) => (n * 180) / Math.PI),
      };
    },
    set(axis: number, rotation: boolean, value: number) {
      if (
        !selected ||
        !Number.isInteger(axis) ||
        axis < 0 ||
        axis > 2 ||
        !Number.isFinite(value) ||
        Math.abs(value) > (rotation ? 360 : 1000)
      )
        throw new Error("Invalid socket value");
      const node = nodes.get(selected.index)!;
      const values = rotation
        ? (node.rotationQuaternion?.toEulerAngles() ?? node.rotation).asArray()
        : node.position.asArray();
      values[axis] = rotation ? (value * Math.PI) / 180 : value;
      if (rotation) node.rotationQuaternion = Quaternion.FromEulerVector(Vector3.FromArray(values));
      else node.position.copyFromFloats(values[0]!, values[1]!, values[2]!);
      node.computeWorldMatrix(true);
      emit();
    },
    add(index: number, name: string, parent: number | null) {
      if (
        !/^socket_[a-z]+(_\d+)?$/.test(name) ||
        entries.some((entry) => entry.name === name) ||
        nodes.has(index)
      )
        throw new Error("Invalid or duplicate socket name");
      const owner = parent === null ? roots[0] : nodes.get(parent);
      if (!owner) throw new Error("Socket parent is not in the loaded scene");
      const node = new TransformNode(name, scene);
      node.parent = owner;
      node.rotationQuaternion = Quaternion.Identity();
      nodes.set(index, node);
      created.push(node);
      const entry = { index, name, parent, editable: true };
      entries.push(entry);
      selected = entry;
      emit();
    },
    changes: (): SocketChange[] =>
      [...changes.values()].map((change) => {
        const node = nodes.get(change.index)!;
        return {
          index: change.index,
          name: change.name,
          parent: change.parent,
          translation: node.position.asArray(),
          rotation: (node.rotationQuaternion ?? Quaternion.FromEulerVector(node.rotation))
            .clone()
            .normalize()
            .asArray(),
          scale: node.scaling.asArray(),
        };
      }),
    dispose() {
      if (disposed) return;
      disposed = true;
      gizmos.dispose();
      gui.dispose();
      anchor.dispose();
      for (const node of created.reverse()) if (!node.isDisposed()) node.dispose();
      for (const pose of original)
        if (!pose.node.isDisposed()) {
          pose.node.position.copyFrom(pose.position);
          pose.node.rotation.copyFrom(pose.rotation);
          pose.node.rotationQuaternion = pose.quaternion?.clone() ?? null;
          pose.node.scaling.copyFrom(pose.scale);
        }
    },
  };
}
