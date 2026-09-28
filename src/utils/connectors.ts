import { fabric } from '../components/FabricExtended';
import type { ShapeOptions, ShapeType } from '../types';

export type ConnectorKind = 'Line' | 'Arrow' | 'DoubleArrow';

export interface Point {
  x: number;
  y: number;
}

export interface ConnectorData {
  connector: true;
  kind: ConnectorKind;
  fromId: string;
  toId: string;
}

type ObjWithData = fabric.Object & {
  data?: {
    id?: string;
    connector?: boolean;
    kind?: ConnectorKind;
    fromId?: string;
    toId?: string;
    labeledShape?: boolean;
  };
};

let nextId = 1;

export function ensureObjectId(obj: fabric.Object): string {
  const o = obj as ObjWithData;
  if (!o.data) o.data = {};
  if (!o.data.id) o.data.id = `wb_${Date.now().toString(36)}_${nextId++}`;
  return o.data.id;
}

export function isConnector(obj: fabric.Object | null | undefined): boolean {
  return !!(obj as ObjWithData | null | undefined)?.data?.connector;
}

export function isConnectable(obj: fabric.Object | null | undefined): boolean {
  if (!obj) return false;
  if (isConnector(obj)) return false;
  const type = obj.type || '';
  // Skip freehand paths and pure connectors; allow shapes, text, groups, images
  if (type === 'path' && !(obj as ObjWithData).data?.labeledShape) {
    // free drawing paths are usually not connection targets; still allow if user wants
  }
  return true;
}

export const CONNECTOR_JSON_PROPS = ['data'] as const;

/** Bounding-box edge intersection from shape center toward a target point. */
export function getAnchorPoint(obj: fabric.Object, toward: Point): Point {
  const center = obj.getCenterPoint();
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;

  if (dx === 0 && dy === 0) {
    return { x: center.x, y: center.y };
  }

  const bound = obj.getBoundingRect(true, true);
  const halfW = bound.width / 2;
  const halfH = bound.height / 2;

  if (halfW <= 0 || halfH <= 0) {
    return { x: center.x, y: center.y };
  }

  const scale = Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH) || 1;
  return {
    x: center.x + dx / scale,
    y: center.y + dy / scale,
  };
}

/** Snap to nearest of N/E/S/W midpoints when close; otherwise edge toward target. */
export function getNearestConnectionPoint(obj: fabric.Object, pointer: Point): Point {
  const center = obj.getCenterPoint();
  const bound = obj.getBoundingRect(true, true);
  const halfW = bound.width / 2;
  const halfH = bound.height / 2;

  const candidates: Point[] = [
    { x: center.x, y: center.y - halfH }, // N
    { x: center.x + halfW, y: center.y }, // E
    { x: center.x, y: center.y + halfH }, // S
    { x: center.x - halfW, y: center.y }, // W
  ];

  let best = candidates[0];
  let bestDist = Infinity;
  for (const p of candidates) {
    const d = (p.x - pointer.x) ** 2 + (p.y - pointer.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }

  // Prefer cardinal anchors when the pointer is near the shape; fall back to edge ray.
  const edge = getAnchorPoint(obj, pointer);
  const edgeDist = (edge.x - pointer.x) ** 2 + (edge.y - pointer.y) ** 2;
  return edgeDist + 36 < bestDist ? edge : best;
}

function arrowHead(at: Point, angleDeg: number, opts: ShapeOptions) {
  return new fabric.Triangle({
    width: 12,
    height: 16,
    left: at.x,
    top: at.y,
    originX: 'center',
    originY: 'center',
    angle: angleDeg,
    fill: (opts.stroke as string) || '#000000',
    stroke: (opts.stroke as string) || '#000000',
    strokeWidth: 1,
    selectable: false,
    evented: false,
  });
}

function lineAngle(from: Point, to: Point) {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

export function createConnectorObject(
  kind: ConnectorKind,
  from: Point,
  to: Point,
  fromId: string,
  toId: string,
  options: ShapeOptions = {}
): fabric.Object {
  const stroke = (options.stroke as string) || '#000000';
  const strokeWidth = Number(options.strokeWidth) || 3;
  const data: ConnectorData = { connector: true, kind, fromId, toId };

  const line = new fabric.Line([from.x, from.y, to.x, to.y], {
    stroke,
    strokeWidth,
    selectable: true,
    evented: true,
    objectCaching: false,
    perPixelTargetFind: true,
    hasControls: false,
    lockMovementX: true,
    lockMovementY: true,
  });

  if (kind === 'Line') {
    (line as ObjWithData).data = data;
    return line;
  }

  const angle = lineAngle(from, to);
  const children: fabric.Object[] = [line];

  if (kind === 'Arrow' || kind === 'DoubleArrow') {
    children.push(arrowHead(to, angle + 90, options));
  }
  if (kind === 'DoubleArrow') {
    children.push(arrowHead(from, angle - 90, options));
  }

  const group = new fabric.Group(children, {
    selectable: true,
    evented: true,
    objectCaching: false,
    subTargetCheck: false,
    hasControls: false,
    lockMovementX: true,
    lockMovementY: true,
  }) as ObjWithData;
  group.data = data;
  return group;
}

export function updateConnectorGeometry(
  connector: fabric.Object,
  from: Point,
  to: Point
) {
  const data = (connector as ObjWithData).data;
  if (!data?.connector) return;

  if (connector.type === 'line') {
    (connector as fabric.Line).set({ x1: from.x, y1: from.y, x2: to.x, y2: to.y });
    connector.setCoords();
    return;
  }

  if (connector.type === 'group') {
    const group = connector as fabric.Group;
    const items = group.getObjects();
    const line = items.find((o) => o.type === 'line') as fabric.Line | undefined;
    const heads = items.filter((o) => o.type === 'triangle');
    if (!line) return;

    // Work in group-local space by resetting group then setting absolute coords via recreate.
    // Simpler: replace geometry by adjusting line endpoints relative to group origin.
    const angle = lineAngle(from, to);
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;

    group.set({ left: midX, top: midY, angle: 0, scaleX: 1, scaleY: 1 });
    line.set({
      x1: from.x - midX,
      y1: from.y - midY,
      x2: to.x - midX,
      y2: to.y - midY,
    });

    if (heads[0]) {
      heads[0].set({
        left: to.x - midX,
        top: to.y - midY,
        angle: angle + 90,
        originX: 'center',
        originY: 'center',
      });
    }
    if (heads[1]) {
      heads[1].set({
        left: from.x - midX,
        top: from.y - midY,
        angle: angle - 90,
        originX: 'center',
        originY: 'center',
      });
    }

    group.setCoords();
    group.dirty = true;
  }
}

export function findObjectById(canvas: fabric.Canvas, id: string): fabric.Object | null {
  return (
    canvas.getObjects().find((obj) => (obj as ObjWithData).data?.id === id) || null
  );
}

export function refreshConnectorsForObject(canvas: fabric.Canvas, moved: fabric.Object) {
  const movedId = (moved as ObjWithData).data?.id;
  if (!movedId || isConnector(moved)) return;

  canvas.getObjects().forEach((obj) => {
    const data = (obj as ObjWithData).data;
    if (!data?.connector) return;
    if (data.fromId !== movedId && data.toId !== movedId) return;

    const fromObj = findObjectById(canvas, data.fromId!);
    const toObj = findObjectById(canvas, data.toId!);
    if (!fromObj || !toObj) return;

    const fromCenter = fromObj.getCenterPoint();
    const toCenter = toObj.getCenterPoint();
    const from = getAnchorPoint(fromObj, toCenter);
    const to = getAnchorPoint(toObj, fromCenter);
    updateConnectorGeometry(obj, from, to);
  });

  canvas.requestRenderAll();
}

export function refreshAllConnectors(canvas: fabric.Canvas) {
  canvas.getObjects().forEach((obj) => {
    if (!isConnector(obj)) return;
    const data = (obj as ObjWithData).data!;
    const fromObj = findObjectById(canvas, data.fromId!);
    const toObj = findObjectById(canvas, data.toId!);
    if (!fromObj || !toObj) return;
    const fromCenter = fromObj.getCenterPoint();
    const toCenter = toObj.getCenterPoint();
    updateConnectorGeometry(
      obj,
      getAnchorPoint(fromObj, toCenter),
      getAnchorPoint(toObj, fromCenter)
    );
  });
  canvas.requestRenderAll();
}

/** Small visual markers for N/E/S/W connection points (not part of saved JSON). */
export function createAnchorMarkers(obj: fabric.Object): fabric.Circle[] {
  const center = obj.getCenterPoint();
  const bound = obj.getBoundingRect(true, true);
  const halfW = bound.width / 2;
  const halfH = bound.height / 2;
  const points = [
    { x: center.x, y: center.y - halfH },
    { x: center.x + halfW, y: center.y },
    { x: center.x, y: center.y + halfH },
    { x: center.x - halfW, y: center.y },
  ];

  return points.map((p) => {
    const marker = new fabric.Circle({
      left: p.x,
      top: p.y,
      radius: 5,
      originX: 'center',
      originY: 'center',
      fill: '#2196f3',
      stroke: '#ffffff',
      strokeWidth: 2,
      selectable: false,
      evented: false,
      excludeFromExport: true,
    });
    (marker as fabric.Circle & { __anchorMarker?: boolean }).__anchorMarker = true;
    return marker;
  });
}

export function clearAnchorMarkers(canvas: fabric.Canvas) {
  canvas.getObjects().forEach((obj) => {
    if ((obj as fabric.Object & { __anchorMarker?: boolean }).__anchorMarker) {
      canvas.remove(obj);
    }
  });
}

export function isConnectorTool(type: ShapeType): type is ConnectorKind {
  return type === 'Line' || type === 'Arrow' || type === 'DoubleArrow';
}
