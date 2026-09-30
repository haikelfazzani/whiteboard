import { fabric } from '../components/FabricExtended';
import type { ShapeOptions, ShapeType } from '../types';
import rough from 'roughjs';

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
  /** Continuous local unit vector center → attach (any perimeter point). */
  fromDir?: Point | null;
  toDir?: Point | null;
  /** Optional label text object id that follows the midpoint. */
  labelId?: string | null;
  /** Rough.js seed for stable sketchy look across renders. */
  roughSeed?: number;
}

type ObjWithData = fabric.Object & {
  data?: {
    id?: string;
    connector?: boolean;
    kind?: ConnectorKind;
    fromId?: string | null;
    toId?: string | null;
    fromDir?: Point | null;
    toDir?: Point | null;
    labelId?: string | null;
    roughSeed?: number;
    labeledShape?: boolean;
  };
  __snapGlow?: boolean;
  __prevShadow?: fabric.Object['shadow'];
};

type ConnectorLine = fabric.Line & ObjWithData & {
  __connectorRenderPatched?: boolean;
};

export type EndpointHandle = fabric.Circle & {
  __endpointHandle?: 'start' | 'end';
  __connectorRef?: ConnectorLine;
};

let nextId = 1;

const HEAD_LEN = 16;
const SNAP_DISTANCE_SCREEN = 48; // screen pixels — scaled by zoom
const DRAG_THRESHOLD = 8;
const SIBLING_SPACING = 16;

/** Screen-constant snap distance in canvas units. */
export function snapDistance(canvas?: fabric.Canvas | null): number {
  const zoom = canvas?.getZoom?.() || 1;
  return SNAP_DISTANCE_SCREEN / zoom;
}

export function dragThreshold(canvas?: fabric.Canvas | null): number {
  const zoom = canvas?.getZoom?.() || 1;
  return DRAG_THRESHOLD / zoom;
}

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
  if ((obj as EndpointHandle).__endpointHandle) return false;
  if ((obj as fabric.Object & { __anchorMarker?: boolean }).__anchorMarker) return false;
  if (obj.excludeFromExport) return false;
  return true;
}

export function isEndpointHandle(obj: fabric.Object | null | undefined): boolean {
  return !!(obj as EndpointHandle | null | undefined)?.__endpointHandle;
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
  const bound = obj.getBoundingRect();
  return [
    { x: bound.left, y: bound.top },
    { x: bound.left + bound.width, y: bound.top },
    { x: bound.left + bound.width, y: bound.top + bound.height },
    { x: bound.left, y: bound.top + bound.height },
  ];
}

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

/** Edge attachment + strokeWidth/2 outward so arrowheads sit on the painted border. */
export function getAnchorPoint(obj: fabric.Object, toward: Point): Point {
  obj.setCoords();
  const center = obj.getCenterPoint();
  const hit = edgeIntersection(center, toward, getObjectCorners(obj));
  const sw = (obj.strokeWidth || 0) * (obj.scaleX || 1);
  if (sw <= 0) return hit;

  const dx = hit.x - center.x;
  const dy = hit.y - center.y;
  const len = Math.hypot(dx, dy) || 1;
  const push = sw / 2;
  return {
    x: hit.x + (dx / len) * push,
    y: hit.y + (dy / len) * push,
  };
}

/** Closest point on segment AB to P. */
function closestPointOnSegment(p: Point, a: Point, b: Point): Point {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-12) return { ...a };
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + abx * t, y: a.y + aby * t };
}

/**
 * Free edge attachment: any point on the shape perimeter nearest the pointer
 * (not forced to midpoints / cardinals).
 */
export function getNearestConnectionPoint(obj: fabric.Object, pointer: Point): Point {
  obj.setCoords();
  const corners = getObjectCorners(obj);
  if (corners.length < 2) return getAnchorPoint(obj, pointer);

  let best = corners[0];
  let bestDist = Infinity;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    const proj = closestPointOnSegment(pointer, a, b);
    const d = (proj.x - pointer.x) ** 2 + (proj.y - pointer.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = proj;
    }
  }

  // Push outward by half stroke so arrowheads sit on the painted border
  const sw = (obj.strokeWidth || 0) * (obj.scaleX || 1);
  if (sw <= 0) return best;
  const c = obj.getCenterPoint();
  const dx = best.x - c.x;
  const dy = best.y - c.y;
  const len = Math.hypot(dx, dy) || 1;
  const push = sw / 2;
  return {
    x: best.x + (dx / len) * push,
    y: best.y + (dy / len) * push,
  };
}

function normalizeDir(p: Point): Point {
  const len = Math.hypot(p.x, p.y) || 1;
  return { x: p.x / len, y: p.y / len };
}

/**
 * Store continuous local direction (center → attach) so the exact edge point
 * is restored when the shape moves/rotates — not snapped to N/E/S/W.
 */
export function dirFromAttach(obj: fabric.Object, attach: Point): Point {
  obj.setCoords();
  const c = obj.getCenterPoint();
  const world = normalizeDir({ x: attach.x - c.x, y: attach.y - c.y });

  // Convert world direction into the object's local (unrotated) frame
  const angleRad = ((obj.angle || 0) * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return normalizeDir({
    x: world.x * cos + world.y * sin,
    y: -world.x * sin + world.y * cos,
  });
}

export function attachFromDir(
  obj: fabric.Object,
  dir: Point | null | undefined,
  fallbackToward: Point
): Point {
  obj.setCoords();
  const c = obj.getCenterPoint();
  if (dir && (Math.abs(dir.x) > 1e-6 || Math.abs(dir.y) > 1e-6)) {
    // dir is stored in object-local cardinal space — rotate into world
    const angleRad = ((obj.angle || 0) * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const worldDir = {
      x: dir.x * cos - dir.y * sin,
      y: dir.x * sin + dir.y * cos,
    };
    return getAnchorPoint(obj, {
      x: c.x + worldDir.x * 10000,
      y: c.y + worldDir.y * 10000,
    });
  }
  return getAnchorPoint(obj, fallbackToward);
}

/** Ray-casting point-in-polygon using the object's exact screen corners (aCoords). */
export function isPointInsideShape(obj: fabric.Object, pointer: Point): boolean {
  obj.setCoords();
  const corners = getObjectCorners(obj);
  if (corners.length < 3) return false;

  let inside = false;
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const xi = corners[i].x;
    const yi = corners[i].y;
    const xj = corners[j].x;
    const yj = corners[j].y;
    const intersect =
      yi > pointer.y !== yj > pointer.y &&
      pointer.x < ((xj - xi) * (pointer.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function findNearestConnectable(
  canvas: fabric.Canvas,
  pointer: Point,
  maxDist?: number
): fabric.Object | null {
  const limit = maxDist ?? snapDistance(canvas);
  let best: fabric.Object | null = null;
  let bestDist = limit * limit;

  canvas.getObjects().forEach((obj: fabric.Object) => {
    if (!isConnectable(obj)) return;
    obj.setCoords();
    const center = obj.getCenterPoint();
    const attach = getAnchorPoint(obj, pointer);
    const dAttach = (attach.x - pointer.x) ** 2 + (attach.y - pointer.y) ** 2;
    const inside = isPointInsideShape(obj, pointer);
    const dCenter = (center.x - pointer.x) ** 2 + (center.y - pointer.y) ** 2;
    const d = inside ? Math.min(dAttach, 1) : Math.min(dAttach, dCenter);
    if (d < bestDist) {
      bestDist = d;
      best = obj;
    }
  });

  return best;
}

export function hitConnectable(
  canvas: fabric.Canvas,
  pointer: Point,
  exclude?: fabric.Object | null
): fabric.Object | null {
  const objects = canvas.getObjects();

  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    if (!isConnectable(obj) || obj === exclude) continue;
    obj.setCoords();
    if (isPointInsideShape(obj, pointer)) return obj;
  }
  return findNearestConnectable(canvas, pointer, snapDistance(canvas));
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  fromX: number,
  fromY: number,
  stroke: string,
  strokeWidth: number
) {
  const angle = Math.atan2(tipY - fromY, tipX - fromX);
  const headLength = HEAD_LEN + strokeWidth * 1.5;
  const leftX = tipX - headLength * Math.cos(angle - Math.PI / 7);
  const leftY = tipY - headLength * Math.sin(angle - Math.PI / 7);
  const rightX = tipX - headLength * Math.cos(angle + Math.PI / 7);
  const rightY = tipY - headLength * Math.sin(angle + Math.PI / 7);

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

function strokeRoughOps(
  ctx: CanvasRenderingContext2D,
  ops: { op: string; data: number[] }[],
  stroke: string,
  strokeWidth: number
) {
  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const op of ops) {
    if (op.op === 'move') ctx.moveTo(op.data[0], op.data[1]);
    else if (op.op === 'lineTo') ctx.lineTo(op.data[0], op.data[1]);
    else if (op.op === 'bcurveTo') {
      ctx.bezierCurveTo(op.data[0], op.data[1], op.data[2], op.data[3], op.data[4], op.data[5]);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function drawRoughConnectorStroke(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: string,
  strokeWidth: number,
  seed: number
) {
  const gen = rough.generator();
  const drawable = gen.line(x1, y1, x2, y2, {
    roughness: 1.15,
    bowing: 0.9,
    stroke,
    strokeWidth,
    seed,
    disableMultiStroke: false,
  });
  for (const set of drawable.sets) {
    if (set.type === 'path') {
      strokeRoughOps(ctx, set.ops as { op: string; data: number[] }[], stroke, strokeWidth);
    }
  }
}

/** Soft selection glow under the connector path (no Fabric bounding box). */
function drawSelectionTrack(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  active: boolean
) {
  if (!active) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(33, 150, 243, 0.35)';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

export function patchConnectorRenderer(line: fabric.Line): void {
  const connector = line as ConnectorLine;
  if (connector.__connectorRenderPatched) return;
  if (!connector.data?.connector) return;

  const kind = connector.data.kind || 'Line';
  if (!connector.data.roughSeed) {
    connector.data.roughSeed = Math.floor(Math.random() * 2 ** 31);
  }
  const seed = connector.data.roughSeed;

  connector._render = function (ctx: CanvasRenderingContext2D) {
    const pts = this.calcLinePoints();
    const stroke = (this.stroke as string) || '#000000';
    const strokeWidth = this.strokeWidth || 2;
    const active = this.canvas?.getActiveObject() === this;

    drawSelectionTrack(ctx, pts.x1, pts.y1, pts.x2, pts.y2, !!active);
    drawRoughConnectorStroke(ctx, pts.x1, pts.y1, pts.x2, pts.y2, stroke, strokeWidth, seed);

    if (kind === 'Arrow' || kind === 'DoubleArrow') {
      drawArrowHead(ctx, pts.x2, pts.y2, pts.x1, pts.y1, stroke, strokeWidth);
    }
    if (kind === 'DoubleArrow') {
      drawArrowHead(ctx, pts.x1, pts.y1, pts.x2, pts.y2, stroke, strokeWidth);
    }
  };
  connector.__connectorRenderPatched = true;
}

export function applyConnectorStyle(line: fabric.Line): void {
  const connector = line as ConnectorLine;
  if (!connector.data?.connector) return;

  connector.set({
    hasControls: false,
    hasBorders: false, // custom selection track instead of Fabric bbox
    lockMovementX: true,
    lockMovementY: true,
    lockRotation: true,
    lockScalingX: true,
    lockScalingY: true,
    objectCaching: false,
    perPixelTargetFind: true,
    padding: 12,
    hoverCursor: 'move',
  });
  connector.setCoords();
}

/** Canvas-level hit slack for thin connector strokes (not an object prop). */
export function applyConnectorCanvasDefaults(canvas: fabric.Canvas): void {
  canvas.targetFindTolerance = Math.max(canvas.targetFindTolerance || 0, 10);
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

function connectorsForPair(
  canvas: fabric.Canvas,
  fromId: string,
  toId: string
): fabric.Object[] {
  const key = pairKey(fromId, toId);
  return canvas.getObjects().filter((obj) => {
    const d = (obj as ObjWithData).data;
    if (!d?.connector || !d.fromId || !d.toId) return false;
    return pairKey(d.fromId, d.toId) === key;
  });
}

export function getSiblingOffset(
  canvas: fabric.Canvas,
  connector: fabric.Object
): Point {
  const data = (connector as ObjWithData).data;
  if (!data?.fromId || !data?.toId) return { x: 0, y: 0 };

  const siblings = connectorsForPair(canvas, data.fromId, data.toId);
  const n = siblings.length;
  if (n <= 1) return { x: 0, y: 0 };

  const idx = siblings.indexOf(connector);
  if (idx < 0) return { x: 0, y: 0 };

  const fromObj = findObjectById(canvas, data.fromId);
  const toObj = findObjectById(canvas, data.toId);
  if (!fromObj || !toObj) return { x: 0, y: 0 };

  const a = fromObj.getCenterPoint();
  const b = toObj.getCenterPoint();
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const offset = (idx - (n - 1) / 2) * SIBLING_SPACING;
  return { x: nx * offset, y: ny * offset };
}

/**
 * Absolute canvas endpoints. Fabric 7 stores x1/y1 as construction coords and
 * renders via calcLinePoints() around the object center — never read raw x1/y1.
 */
export function getConnectorEndpoints(line: fabric.Line): { from: Point; to: Point } {
  const pts = line.calcLinePoints();
  const m = line.calcTransformMatrix();
  const p1 = fabric.util.transformPoint({ x: pts.x1, y: pts.y1 }, m);
  const p2 = fabric.util.transformPoint({ x: pts.x2, y: pts.y2 }, m);
  return {
    from: { x: p1.x, y: p1.y },
    to: { x: p2.x, y: p2.y },
  };
}

export function createConnectorObject(
  kind: ConnectorKind,
  from: Point,
  to: Point,
  fromId: string | null | undefined,
  toId: string | null | undefined,
  options: ShapeOptions = {},
  fromDir?: Point | null,
  toDir?: Point | null
): fabric.Line {
  const stroke = (options.stroke as string) || '#000000';
  const strokeWidth = Number(options.strokeWidth) || 3;
  const data: ConnectorData = {
    connector: true,
    kind,
    fromId: fromId || null,
    toId: toId || null,
    fromDir: fromDir || null,
    toDir: toDir || null,
  };

  const line = new fabric.Line([from.x, from.y, to.x, to.y], {
    stroke,
    strokeWidth,
    selectable: true,
    evented: true,
    objectCaching: false,
  }) as ConnectorLine;

  line.data = data;
  patchConnectorRenderer(line);
  applyConnectorStyle(line);
  return line;
}

export function updateConnectorGeometry(
  connector: fabric.Object,
  from: Point,
  to: Point
) {
  const data = (connector as ObjWithData).data;
  if (!data?.connector) return;

  if (connector.type === 'group') {
    const canvas = connector.canvas;
    if (!canvas) return;
    const child = (connector as fabric.Group).getObjects().find((o) => o.type === 'line');
    const next = createConnectorObject(
      data.kind || 'Arrow',
      from,
      to,
      data.fromId,
      data.toId,
      {
        stroke: (child?.stroke as string) || '#000000',
        strokeWidth: Number(child?.strokeWidth) || 3,
      },
      data.fromDir,
      data.toDir
    );
    const idx = canvas.getObjects().indexOf(connector);
    canvas.remove(connector);
    if (idx >= 0) canvas.insertAt(idx, next);
    else canvas.add(next);
    return;
  }

  if (connector.type === 'line') {
    const line = connector as fabric.Line;
    // Fabric 7 Line: set absolute endpoints only. _setWidthHeight() recenters —
    // do NOT also force left/top/origin or the other tip jumps / rescales.
    line.set({
      angle: 0,
      scaleX: 1,
      scaleY: 1,
      skewX: 0,
      skewY: 0,
      flipX: false,
      flipY: false,
    });
    line.set({
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
    });
    line.setCoords();
    patchConnectorRenderer(line);
    applyConnectorStyle(line);
    if (line.canvas) syncConnectorLabel(line.canvas, line);
  }
}

export function findObjectById(canvas: fabric.Canvas, id: string): fabric.Object | null {
  return (
    canvas.getObjects().find((obj) => (obj as ObjWithData).data?.id === id) || null
  );
}

/** Absolute canvas point for an object, even when nested in an ActiveSelection/Group. */
export function getAbsoluteCenter(obj: fabric.Object): Point {
  const parent = (obj as fabric.Object & { group?: fabric.Group | fabric.ActiveSelection }).group;
  if (parent) {
    // calcTransformMatrix includes the parent group transform
    const m = obj.calcTransformMatrix();
    return {
      x: m[4],
      y: m[5],
    };
  }
  return obj.getCenterPoint();
}

/** Pause history while mutating transient UI objects. */
export function withHistoryPaused(canvas: fabric.Canvas, fn: () => void) {
  const hist = canvas as fabric.Canvas & { historyProcessing?: boolean; _historyNext?: () => string; historyNextState?: string };
  const prev = !!hist.historyProcessing;
  hist.historyProcessing = true;
  try {
    fn();
  } finally {
    hist.historyProcessing = prev;
    if (typeof hist._historyNext === 'function') {
      hist.historyNextState = hist._historyNext();
    }
  }
}

/** Keep connectors under the shapes they attach to. */
export function sendConnectorBehindTargets(canvas: fabric.Canvas, connector: fabric.Object) {
  if (!isConnector(connector)) return;
  const data = (connector as ObjWithData).data;
  const c = canvas as fabric.Canvas & {
    sendObjectToBack?: (o: fabric.Object) => void;
    bringObjectToFront?: (o: fabric.Object) => void;
    sendToBack?: (o: fabric.Object) => void;
    bringToFront?: (o: fabric.Object) => void;
  };

  (c.sendObjectToBack || c.sendToBack)?.call(c, connector);

  const ids = [data?.fromId, data?.toId].filter(Boolean) as string[];
  ids.forEach((id) => {
    const shape = findObjectById(canvas, id);
    if (shape) (c.bringObjectToFront || c.bringToFront)?.call(c, shape);
  });

  canvas.getObjects().forEach((obj: fabric.Object) => {
    if (isEndpointHandle(obj)) (c.bringObjectToFront || c.bringToFront)?.call(c, obj);
  });
}

/** Sync optional midpoint label when connector geometry changes. */
export function syncConnectorLabel(canvas: fabric.Canvas, connector: fabric.Object) {
  const data = (connector as ObjWithData).data;
  if (!data?.labelId || connector.type !== 'line') return;
  const label = findObjectById(canvas, data.labelId);
  if (!label) return;
  const ends = getConnectorEndpoints(connector as fabric.Line);
  label.set({
    left: (ends.from.x + ends.to.x) / 2,
    top: (ends.from.y + ends.to.y) / 2,
    originX: 'center',
    originY: 'center',
  });
  label.setCoords();
}

let snapGlowTarget: fabric.Object | null = null;

export function clearSnapGlow(canvas?: fabric.Canvas | null) {
  if (snapGlowTarget) {
    const o = snapGlowTarget as ObjWithData;
    o.set({ shadow: o.__prevShadow || null });
    o.__snapGlow = false;
    o.__prevShadow = undefined;
    snapGlowTarget = null;
    canvas?.requestRenderAll();
  }
}

/** Imminent-snap UX: soft blue glow on the hover target. */
export function setSnapGlow(canvas: fabric.Canvas, target: fabric.Object | null) {
  if (target === snapGlowTarget) return;
  clearSnapGlow(canvas);
  if (!target) return;
  const o = target as ObjWithData;
  o.__prevShadow = o.shadow;
  o.__snapGlow = true;
  o.set({
    shadow: {
      color: 'rgba(33, 150, 243, 0.55)',
      blur: 18,
      offsetX: 0,
      offsetY: 0,
    } as never,
  });
  snapGlowTarget = target;
  canvas.requestRenderAll();
}

/**
 * When a shape is deleted: detach bound connector ends (free the line) rather than
 * leaving dangling fromId/toId references. Optionally remove fully-orphaned connectors.
 */
export function detachConnectorsForDeleted(
  canvas: fabric.Canvas,
  deletedIds: string[],
  options: { removeOrphans?: boolean } = { removeOrphans: false }
) {
  if (!deletedIds.length) return;
  const idSet = new Set(deletedIds);

  canvas.getObjects().slice().forEach((obj) => {
    const data = (obj as ObjWithData).data;
    if (!data?.connector) return;

    let changed = false;
    if (data.fromId && idSet.has(data.fromId)) {
      data.fromId = null;
      data.fromDir = null;
      changed = true;
    }
    if (data.toId && idSet.has(data.toId)) {
      data.toId = null;
      data.toDir = null;
      changed = true;
    }

    if (!changed) return;

    if (options.removeOrphans && !data.fromId && !data.toId) {
      canvas.remove(obj);
      return;
    }

    // Geometry stays where it is; only binding is cleared
  });
}

export function collectObjectIds(obj: fabric.Object): string[] {
  const ids: string[] = [];
  if (obj.type === 'activeSelection') {
    (obj as fabric.ActiveSelection).forEachObject((child) => {
      const id = (child as ObjWithData).data?.id;
      if (id) ids.push(id);
    });
  } else {
    const id = (obj as ObjWithData).data?.id;
    if (id) ids.push(id);
  }
  return ids;
}

function computeBoundEndpoints(
  canvas: fabric.Canvas,
  connector: fabric.Object
): { from: Point; to: Point } | null {
  const data = (connector as ObjWithData).data;
  if (!data?.connector) return null;

  const fromObj = data.fromId ? findObjectById(canvas, data.fromId) : null;
  const toObj = data.toId ? findObjectById(canvas, data.toId) : null;

  // Refresh coords so ActiveSelection/group members yield absolute aCoords
  fromObj?.setCoords();
  toObj?.setCoords();

  const current =
    connector.type === 'line'
      ? getConnectorEndpoints(connector as fabric.Line)
      : {
          from: fromObj ? getAbsoluteCenter(fromObj) : { x: 0, y: 0 },
          to: toObj ? getAbsoluteCenter(toObj) : { x: 0, y: 0 },
        };

  let from = current.from;
  let to = current.to;

  if (fromObj && toObj) {
    const fromCenter = getAbsoluteCenter(fromObj);
    const toCenter = getAbsoluteCenter(toObj);
    from = attachFromDir(fromObj, data.fromDir, toCenter);
    to = attachFromDir(toObj, data.toDir, fromCenter);
  } else if (fromObj) {
    from = attachFromDir(fromObj, data.fromDir, to);
  } else if (toObj) {
    to = attachFromDir(toObj, data.toDir, from);
  } else {
    return null;
  }

  const offset = getSiblingOffset(canvas, connector);
  return {
    from: { x: from.x + offset.x, y: from.y + offset.y },
    to: { x: to.x + offset.x, y: to.y + offset.y },
  };
}

export function refreshConnectorsForObject(canvas: fabric.Canvas, moved: fabric.Object) {
  // Multi-select drag: refresh every member using absolute (group-aware) centers
  if (moved.type === 'activeSelection') {
    (moved as fabric.ActiveSelection).forEachObject((child) => {
      refreshConnectorsForObject(canvas, child);
    });
    return;
  }

  const movedId = (moved as ObjWithData).data?.id;
  if (!movedId || isConnector(moved) || isEndpointHandle(moved)) return;

  // Ensure aCoords reflect absolute position while inside a group
  moved.setCoords();

  canvas.getObjects().forEach((obj) => {
    const data = (obj as ObjWithData).data;
    if (!data?.connector) return;
    if (data.fromId !== movedId && data.toId !== movedId) return;

    const ends = computeBoundEndpoints(canvas, obj);
    if (!ends) return;
    updateConnectorGeometry(obj, ends.from, ends.to);
  });

  canvas.requestRenderAll();
}

export function refreshAllConnectors(canvas: fabric.Canvas) {
  const connectors = canvas.getObjects().filter((obj) => isConnector(obj));

  connectors.forEach((obj) => {
    if (obj.type === 'line') {
      patchConnectorRenderer(obj as fabric.Line);
      applyConnectorStyle(obj as fabric.Line);
    }

    const ends = computeBoundEndpoints(canvas, obj);
    if (ends) {
      updateConnectorGeometry(obj, ends.from, ends.to);
    } else if (obj.type === 'group') {
      const data = (obj as ObjWithData).data!;
      const fromObj = data.fromId ? findObjectById(canvas, data.fromId) : null;
      const toObj = data.toId ? findObjectById(canvas, data.toId) : null;
      const c = obj.getCenterPoint();
      updateConnectorGeometry(
        obj,
        fromObj ? getAnchorPoint(fromObj, toObj?.getCenterPoint() || c) : c,
        toObj ? getAnchorPoint(toObj, fromObj?.getCenterPoint() || c) : c
      );
    }
  });

  canvas.requestRenderAll();
}

export function hydrateConnectors(canvas: fabric.Canvas) {
  canvas.getObjects().forEach((obj) => {
    if (!isConnector(obj)) {
      if (isConnectable(obj)) ensureObjectId(obj);
      return;
    }
    ensureObjectId(obj);
    if (obj.type === 'line') {
      patchConnectorRenderer(obj as fabric.Line);
      applyConnectorStyle(obj as fabric.Line);
    }
  });
  refreshAllConnectors(canvas);
}

export function buildConnectedEndpoints(
  canvas: fabric.Canvas,
  fromObj: fabric.Object,
  toObj: fabric.Object,
  fromPointer: Point,
  toPointer: Point
): {
  from: Point;
  to: Point;
  fromDir: Point;
  toDir: Point;
  fromId: string;
  toId: string;
} {
  const fromId = ensureObjectId(fromObj);
  const toId = ensureObjectId(toObj);

  // Lock each end to a cardinal edge based on where the user aimed
  const fromDir = dirFromAttach(fromObj, getNearestConnectionPoint(fromObj, fromPointer));
  const toDir = dirFromAttach(toObj, getNearestConnectionPoint(toObj, toPointer));
  let from = attachFromDir(fromObj, fromDir, toObj.getCenterPoint());
  let to = attachFromDir(toObj, toDir, fromObj.getCenterPoint());

  const existing = connectorsForPair(canvas, fromId, toId);
  const n = existing.length + 1;
  const idx = n - 1;
  const a = fromObj.getCenterPoint();
  const b = toObj.getCenterPoint();
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const offsetAmt = (idx - (n - 1) / 2) * SIBLING_SPACING;
  const offset = { x: nx * offsetAmt, y: ny * offsetAmt };

  return {
    from: { x: from.x + offset.x, y: from.y + offset.y },
    to: { x: to.x + offset.x, y: to.y + offset.y },
    fromDir,
    toDir,
    fromId,
    toId,
  };
}

export function clearEndpointHandles(canvas: fabric.Canvas) {
  withHistoryPaused(canvas, () => {
    canvas.getObjects().slice().forEach((obj) => {
      if (isEndpointHandle(obj)) canvas.remove(obj);
    });
  });
}

function makeHandle(kind: 'start' | 'end', line: ConnectorLine, pt: Point): EndpointHandle {
  const handle = new fabric.Circle({
    left: pt.x,
    top: pt.y,
    radius: 7,
    originX: 'center',
    originY: 'center',
    fill: '#2196f3',
    stroke: '#ffffff',
    strokeWidth: 2,
    hasControls: false,
    hasBorders: false,
    selectable: true,
    evented: true,
    objectCaching: false,
    excludeFromExport: true,
    // Prefer handle hit over marquee / pan conflicts
    hoverCursor: 'grab',
    moveCursor: 'grabbing',
    perPixelTargetFind: false,
    padding: 4,
  }) as EndpointHandle;

  handle.__endpointHandle = kind;
  handle.__connectorRef = line;
  return handle;
}

export function showEndpointHandles(canvas: fabric.Canvas, connector: fabric.Object) {
  clearEndpointHandles(canvas);
  if (!isConnector(connector) || connector.type !== 'line') return;

  const line = connector as ConnectorLine;
  const ends = getConnectorEndpoints(line);
  withHistoryPaused(canvas, () => {
    const start = makeHandle('start', line, ends.from);
    const end = makeHandle('end', line, ends.to);
    canvas.add(start, end);
    const c = canvas as fabric.Canvas & { bringObjectToFront?: (o: fabric.Object) => void };
    c.bringObjectToFront?.(start);
    c.bringObjectToFront?.(end);
  });
  canvas.requestRenderAll();
}

export function syncEndpointHandles(canvas: fabric.Canvas, connector?: fabric.Object | null) {
  const handles = canvas.getObjects().filter((o) => isEndpointHandle(o)) as EndpointHandle[];
  if (!handles.length) return;

  const line =
    (connector as ConnectorLine | undefined) ||
    handles[0].__connectorRef ||
    null;
  if (!line || !line.canvas) {
    clearEndpointHandles(canvas);
    return;
  }

  const ends = getConnectorEndpoints(line);
  handles.forEach((h) => {
    const pt = h.__endpointHandle === 'start' ? ends.from : ends.to;
    h.set({ left: pt.x, top: pt.y });
    h.setCoords();
  });
  canvas.requestRenderAll();
}

export function moveConnectorByHandle(handle: fabric.Object) {
  if (!isEndpointHandle(handle)) return;
  const h = handle as EndpointHandle;
  const line = h.__connectorRef;
  const canvas = line?.canvas;
  if (!line?.data?.connector || !canvas) return;

  const pointer = { x: h.left ?? 0, y: h.top ?? 0 };
  // Capture the fixed other tip BEFORE mutating geometry
  const ends = getConnectorEndpoints(line);
  const otherEnd = h.__endpointHandle === 'start' ? ends.to : ends.from;

  // Exclude the opposite bound shape for self-connect prevention during hover
  const oppositeId =
    h.__endpointHandle === 'start' ? line.data.toId : line.data.fromId;
  const opposite = oppositeId ? findObjectById(canvas, oppositeId) : null;

  const hit = hitConnectable(canvas, pointer, opposite);
  // Free placement anywhere on the perimeter — no midpoint / cardinal snap
  let tip = pointer;
  if (hit) {
    tip = getNearestConnectionPoint(hit, pointer);
    h.set({ left: tip.x, top: tip.y });
    h.setCoords();
    setSnapGlow(canvas, hit);
  } else {
    clearSnapGlow(canvas);
  }

  if (h.__endpointHandle === 'start') {
    updateConnectorGeometry(line, tip, otherEnd);
    if (line.data) {
      if (hit) {
        line.data.fromId = ensureObjectId(hit);
        line.data.fromDir = dirFromAttach(hit, tip);
      } else {
        line.data.fromId = null;
        line.data.fromDir = null;
      }
    }
  } else {
    updateConnectorGeometry(line, otherEnd, tip);
    if (line.data) {
      if (hit) {
        line.data.toId = ensureObjectId(hit);
        line.data.toDir = dirFromAttach(hit, tip);
      } else {
        line.data.toId = null;
        line.data.toDir = null;
      }
    }
  }

  // Keep the opposite handle glued to the unchanged tip
  const handles = canvas.getObjects().filter((o: fabric.Object) => isEndpointHandle(o)) as EndpointHandle[];
  handles.forEach((other) => {
    if (other === h) return;
    other.set({ left: otherEnd.x, top: otherEnd.y });
    other.setCoords();
  });
  canvas.requestRenderAll();
}

export function commitConnectorHandle(canvas: fabric.Canvas, handle: fabric.Object) {
  if (!isEndpointHandle(handle)) return;
  const h = handle as EndpointHandle;
  const line = h.__connectorRef;
  if (!line?.data?.connector) return;

  clearSnapGlow(canvas);

  const pointer = { x: h.left ?? 0, y: h.top ?? 0 };
  const ends = getConnectorEndpoints(line);
  const isStart = h.__endpointHandle === 'start';
  const otherEnd = isStart ? ends.to : ends.from;
  const oppositeId = isStart ? line.data.toId : line.data.fromId;
  const opposite = oppositeId ? findObjectById(canvas, oppositeId) : null;

  // Reject self-connect — leave as free endpoint at drop position
  let hit = hitConnectable(canvas, pointer, opposite);
  if (hit && opposite && hit === opposite) {
    hit = null;
  }

  let tip = pointer;
  if (hit) {
    tip = getNearestConnectionPoint(hit, pointer);
    if (isStart) {
      line.data!.fromId = ensureObjectId(hit);
      line.data!.fromDir = dirFromAttach(hit, tip);
    } else {
      line.data!.toId = ensureObjectId(hit);
      line.data!.toDir = dirFromAttach(hit, tip);
    }
  } else if (isStart) {
    line.data!.fromId = null;
    line.data!.fromDir = null;
  } else {
    line.data!.toId = null;
    line.data!.toDir = null;
  }

  // Place exactly where the user dropped — do not spring / move the other tip
  if (isStart) updateConnectorGeometry(line, tip, otherEnd);
  else updateConnectorGeometry(line, otherEnd, tip);

  // Sibling offset for multi-connectors between the same pair (parallel shift only)
  if (line.data!.fromId && line.data!.toId) {
    const refreshed = computeBoundEndpoints(canvas, line);
    if (refreshed) {
      // Preserve the tip the user just chose; only shift if siblings demand it
      const offset = getSiblingOffset(canvas, line);
      if (offset.x !== 0 || offset.y !== 0) {
        updateConnectorGeometry(
          line,
          { x: refreshed.from.x, y: refreshed.from.y },
          { x: refreshed.to.x, y: refreshed.to.y }
        );
      }
    }
  }

  sendConnectorBehindTargets(canvas, line);
  syncEndpointHandles(canvas, line);
  canvas.requestRenderAll();
}

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

export {
  HEAD_LEN,
  SIBLING_SPACING,
  DRAG_THRESHOLD,
  SNAP_DISTANCE_SCREEN as SNAP_DISTANCE,
};