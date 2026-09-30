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
  fromId?: string | null;
  toId?: string | null;
}

type ObjWithData = fabric.Object & {
  data?: {
    id?: string;
    connector?: boolean;
    kind?: ConnectorKind;
    fromId?: string | null;
    toId?: string | null;
    labeledShape?: boolean;
  };
};

type ConnectorLine = fabric.Line & ObjWithData & {
  __connectorRenderPatched?: boolean;
};

let nextId = 1;

const HEAD_LEN = 16;
const SNAP_DISTANCE = 36;
const DRAG_THRESHOLD = 6;

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
  if ((obj as fabric.Object & { __anchorMarker?: boolean }).__anchorMarker) return false;
  if (obj.excludeFromExport) return false;
  return true;
}

export const CONNECTOR_JSON_PROPS = ['data'] as const;

export function getObjectCorners(obj: fabric.Object): Point[] {
  const coords = obj.aCoords;
  if (coords?.tl && coords.tr && coords.br && coords.bl) {
    return [
      { x: coords.tl.x, y: coords.tl.y },
      { x: coords.tr.x, y: coords.tr.y },
      { x: coords.br.x, y: coords.br.y },
      { x: coords.bl.x, y: coords.bl.y },
    ];
  }

  // Fallback: axis-aligned bounding box corners
  const bound = obj.getBoundingRect(true, true);
  return [
    { x: bound.left, y: bound.top },
    { x: bound.left + bound.width, y: bound.top },
    { x: bound.left + bound.width, y: bound.top + bound.height },
    { x: bound.left, y: bound.top + bound.height },
  ];
}

function edgeIntersection(center: Point, toward: Point, corners: Point[]): Point {
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (dx === 0 && dy === 0) return { ...center };

  let best: Point | null = null;
  let bestT = Infinity;

  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    const hit = raySegmentIntersection(center, dx, dy, a, b);
    if (hit && hit.t > 1e-6 && hit.t < bestT) {
      bestT = hit.t;
      best = hit.point;
    }
  }

  return best || { ...center };
}

/** Ray from origin along (dx,dy) vs segment a→b. t is distance along ray in "toward" units. */
function raySegmentIntersection(
  origin: Point,
  dx: number,
  dy: number,
  a: Point,
  b: Point
): { t: number; point: Point } | null {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const denom = dx * ey - dy * ex;
  if (Math.abs(denom) < 1e-8) return null;

  const ax = a.x - origin.x;
  const ay = a.y - origin.y;
  const t = (ax * ey - ay * ex) / denom;
  const u = (ax * dy - ay * dx) / denom;
  if (t < 0 || u < -1e-6 || u > 1 + 1e-6) return null;

  return {
    t,
    point: { x: origin.x + dx * t, y: origin.y + dy * t },
  };
}

/** Edge attachment using the object's oriented box (works for rotated shapes). */
export function getAnchorPoint(obj: fabric.Object, toward: Point): Point {
  obj.setCoords();
  const center = obj.getCenterPoint();
  return edgeIntersection(center, toward, getObjectCorners(obj));
}

/** Snap to nearest edge midpoint when close; otherwise edge toward target. */
export function getNearestConnectionPoint(obj: fabric.Object, pointer: Point): Point {
  obj.setCoords();
  const corners = getObjectCorners(obj);
  const midpoints: Point[] = [];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    midpoints.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }

  let best = midpoints[0];
  let bestDist = Infinity;
  for (const p of midpoints) {
    const d = (p.x - pointer.x) ** 2 + (p.y - pointer.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }

  const edge = getAnchorPoint(obj, pointer);
  const edgeDist = (edge.x - pointer.x) ** 2 + (edge.y - pointer.y) ** 2;
  return edgeDist + 36 < bestDist ? edge : best;
}

export function findNearestConnectable(
  canvas: fabric.Canvas,
  pointer: Point,
  maxDist = SNAP_DISTANCE
): fabric.Object | null {
  let best: fabric.Object | null = null;
  let bestDist = maxDist * maxDist;

  canvas.getObjects().forEach((obj) => {
    if (!isConnectable(obj)) return;
    obj.setCoords();
    const center = obj.getCenterPoint();
    const attach = getAnchorPoint(obj, pointer);
    // Prefer objects whose outline or center is near the pointer
    const dAttach = (attach.x - pointer.x) ** 2 + (attach.y - pointer.y) ** 2;
    const bound = obj.getBoundingRect(true, true);
    const inside =
      pointer.x >= bound.left &&
      pointer.x <= bound.left + bound.width &&
      pointer.y >= bound.top &&
      pointer.y <= bound.top + bound.height;
    const dCenter = (center.x - pointer.x) ** 2 + (center.y - pointer.y) ** 2;
    const d = inside ? 0 : Math.min(dAttach, dCenter);
    if (d < bestDist) {
      bestDist = d;
      best = obj;
    }
  });

  return best;
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  fromX: number,
  fromY: number,
  stroke: string
) {
  const angle = Math.atan2(tipY - fromY, tipX - fromX);
  const leftX = tipX - HEAD_LEN * Math.cos(angle - Math.PI / 7);
  const leftY = tipY - HEAD_LEN * Math.sin(angle - Math.PI / 7);
  const rightX = tipX - HEAD_LEN * Math.cos(angle + Math.PI / 7);
  const rightY = tipY - HEAD_LEN * Math.sin(angle + Math.PI / 7);

  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(leftX, leftY);
  ctx.lineTo(rightX, rightY);
  ctx.closePath();
  ctx.fillStyle = stroke;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.fill();
  ctx.stroke();
}

/** Patch a connector Line so Arrow / DoubleArrow heads are painted in _render (no Group). */
export function patchConnectorRenderer(line: fabric.Line): void {
  const connector = line as ConnectorLine;
  if (connector.__connectorRenderPatched) return;
  if (!connector.data?.connector) return;

  const kind = connector.data.kind || 'Line';
  if (kind === 'Line') {
    connector.__connectorRenderPatched = true;
    return;
  }

  const originalRender = connector._render.bind(connector);
  connector._render = function (ctx: CanvasRenderingContext2D) {
    originalRender(ctx);
    const pts = this.calcLinePoints();
    const stroke = (this.stroke as string) || '#000000';
    if (kind === 'Arrow' || kind === 'DoubleArrow') {
      drawArrowHead(ctx, pts.x2, pts.y2, pts.x1, pts.y1, stroke);
    }
    if (kind === 'DoubleArrow') {
      drawArrowHead(ctx, pts.x1, pts.y1, pts.x2, pts.y2, stroke);
    }
  };
  connector.__connectorRenderPatched = true;
}

export function createConnectorObject(
  kind: ConnectorKind,
  from: Point,
  to: Point,
  fromId: string | null | undefined,
  toId: string | null | undefined,
  options: ShapeOptions = {}
): fabric.Line {
  const stroke = (options.stroke as string) || '#000000';
  const strokeWidth = Number(options.strokeWidth) || 3;
  const data: ConnectorData = {
    connector: true,
    kind,
    fromId: fromId || null,
    toId: toId || null,
  };

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
  }) as ConnectorLine;

  line.data = data;
  patchConnectorRenderer(line);
  return line;
}

export function updateConnectorGeometry(
  connector: fabric.Object,
  from: Point,
  to: Point
) {
  const data = (connector as ObjWithData).data;
  if (!data?.connector) return;

  // Legacy Group arrows → replace in place when possible
  if (connector.type === 'group') {
    const canvas = connector.canvas;
    if (!canvas) return;
    const stroke = (connector as fabric.Group).getObjects().find((o) => o.type === 'line')?.stroke;
    const strokeWidth = (connector as fabric.Group).getObjects().find((o) => o.type === 'line')
      ?.strokeWidth;
    const next = createConnectorObject(
      data.kind || 'Arrow',
      from,
      to,
      data.fromId,
      data.toId,
      { stroke: (stroke as string) || '#000000', strokeWidth: Number(strokeWidth) || 3 }
    );
    const idx = canvas.getObjects().indexOf(connector);
    canvas.remove(connector);
    canvas.insertAt(next, idx >= 0 ? idx : canvas.getObjects().length, false);
    return;
  }

  if (connector.type === 'line') {
    const line = connector as fabric.Line;
    // Reset transform so endpoint edits stay in canvas space
    line.set({
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      angle: 0,
      scaleX: 1,
      scaleY: 1,
      skewX: 0,
      skewY: 0,
    });
    line.setCoords();
    patchConnectorRenderer(line);
    return;
  }
}

export function findObjectById(canvas: fabric.Canvas, id: string): fabric.Object | null {
  return (
    canvas.getObjects().find((obj) => (obj as ObjWithData).data?.id === id) || null
  );
}

function lineEndpoints(line: fabric.Line): { from: Point; to: Point } {
  return {
    from: { x: line.x1 ?? 0, y: line.y1 ?? 0 },
    to: { x: line.x2 ?? 0, y: line.y2 ?? 0 },
  };
}

export function refreshConnectorsForObject(canvas: fabric.Canvas, moved: fabric.Object) {
  const movedId = (moved as ObjWithData).data?.id;
  if (!movedId || isConnector(moved)) return;

  canvas.getObjects().forEach((obj) => {
    const data = (obj as ObjWithData).data;
    if (!data?.connector) return;
    if (data.fromId !== movedId && data.toId !== movedId) return;

    const fromObj = data.fromId ? findObjectById(canvas, data.fromId) : null;
    const toObj = data.toId ? findObjectById(canvas, data.toId) : null;

    let from: Point;
    let to: Point;

    if (obj.type === 'line') {
      const ends = lineEndpoints(obj as fabric.Line);
      from = ends.from;
      to = ends.to;
    } else {
      from = fromObj?.getCenterPoint() || { x: 0, y: 0 };
      to = toObj?.getCenterPoint() || { x: 0, y: 0 };
    }

    if (fromObj && toObj) {
      const fromCenter = fromObj.getCenterPoint();
      const toCenter = toObj.getCenterPoint();
      from = getAnchorPoint(fromObj, toCenter);
      to = getAnchorPoint(toObj, fromCenter);
    } else if (fromObj) {
      from = getAnchorPoint(fromObj, to);
    } else if (toObj) {
      to = getAnchorPoint(toObj, from);
    } else {
      return;
    }

    updateConnectorGeometry(obj, from, to);
  });

  canvas.requestRenderAll();
}

export function refreshAllConnectors(canvas: fabric.Canvas) {
  // Snapshot first — update may replace legacy groups
  const connectors = canvas.getObjects().filter((obj) => isConnector(obj));

  connectors.forEach((obj) => {
    const data = (obj as ObjWithData).data!;
    patchConnectorRenderer(obj as fabric.Line);

    const fromObj = data.fromId ? findObjectById(canvas, data.fromId) : null;
    const toObj = data.toId ? findObjectById(canvas, data.toId) : null;

    let from: Point;
    let to: Point;

    if (obj.type === 'line') {
      const ends = lineEndpoints(obj as fabric.Line);
      from = ends.from;
      to = ends.to;
    } else if (obj.type === 'group') {
      // Derive endpoints from child line before migration
      const child = (obj as fabric.Group).getObjects().find((o) => o.type === 'line') as
        | fabric.Line
        | undefined;
      if (child) {
        const c = obj.getCenterPoint();
        // Best-effort: use bound anchors if shapes exist, else group center span
        from = fromObj ? getAnchorPoint(fromObj, toObj?.getCenterPoint() || c) : c;
        to = toObj ? getAnchorPoint(toObj, fromObj?.getCenterPoint() || c) : c;
      } else {
        return;
      }
    } else {
      return;
    }

    if (fromObj && toObj) {
      const fromCenter = fromObj.getCenterPoint();
      const toCenter = toObj.getCenterPoint();
      from = getAnchorPoint(fromObj, toCenter);
      to = getAnchorPoint(toObj, fromCenter);
    } else if (fromObj) {
      from = getAnchorPoint(fromObj, to);
    } else if (toObj) {
      to = getAnchorPoint(toObj, from);
    } else if (obj.type !== 'group') {
      // Unbound free connector — still patch renderer
      return;
    }

    updateConnectorGeometry(obj, from, to);
  });

  canvas.requestRenderAll();
}

/** After loadFromJSON: ensure ids, patch renderers, migrate legacy groups, re-bind geometry. */
export function hydrateConnectors(canvas: fabric.Canvas) {
  canvas.getObjects().forEach((obj) => {
    if (!isConnector(obj)) {
      if (isConnectable(obj)) ensureObjectId(obj);
      return;
    }
    ensureObjectId(obj);
    if (obj.type === 'line') patchConnectorRenderer(obj as fabric.Line);
  });
  refreshAllConnectors(canvas);
}

/** Small visual markers for edge midpoints (not part of saved JSON). */
export function createAnchorMarkers(obj: fabric.Object): fabric.Circle[] {
  obj.setCoords();
  const corners = getObjectCorners(obj);
  const points: Point[] = [];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    points.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }

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

export { DRAG_THRESHOLD, SNAP_DISTANCE, HEAD_LEN };
