/**
 * Fabric 7 compatibility layer + undo/redo history.
 * Fabric 7 exports named classes (no `fabric` namespace) — we rebuild one.
 */
import {
  ActiveSelection,
  Canvas,
  Circle,
  Ellipse,
  FabricImage,
  FabricObject,
  FabricText,
  Group,
  IText,
  Line,
  Path,
  Point,
  Polygon,
  Polyline,
  Rect,
  Textbox,
  Triangle,
  loadSVGFromURL,
  loadSVGFromString,
  util,
  controlsUtils,
} from 'fabric';
import type { TEvent } from 'fabric';

type AnyObject = FabricObject & {
  excludeFromExport?: boolean;
  data?: Record<string, unknown>;
};

export type HistoryCanvas = Canvas & {
  historyUndo: string[];
  historyRedo: string[];
  historyNextState: string;
  historyProcessing: boolean;
  extraProps: string[];
  _historyNext: () => string;
  _historySaveAction: (e?: { target?: AnyObject }) => void;
  undo: (callback?: () => void) => void;
  redo: (callback?: () => void) => void;
  clearHistory: () => void;
  /** Fabric 5 aliases */
  sendToBack: (obj: FabricObject) => Canvas;
  bringToFront: (obj: FabricObject) => Canvas;
  sendBackwards: (obj: FabricObject) => Canvas;
  bringForward: (obj: FabricObject) => Canvas;
  getPointer: (e: Event) => { x: number; y: number };
  setWidth: (w: number) => void;
  setHeight: (h: number) => void;
  setBackgroundColor: (color: string, cb?: () => void) => void;
};

function attachHistory(canvas: Canvas): HistoryCanvas {
  const c = canvas as HistoryCanvas;

  c.historyUndo = [];
  c.historyRedo = [];
  c.extraProps = ['selectable', 'data'];
  c.historyProcessing = false;

  c._historyNext = function () {
    return JSON.stringify(this.toDatalessJSON(this.extraProps));
  };

  c._historySaveAction = function (e?: { target?: AnyObject }) {
    if (this.historyProcessing) return;
    if (e?.target?.excludeFromExport) return;
    const json = this.historyNextState;
    this.historyUndo.push(json);
    this.historyNextState = this._historyNext();
    this.fire('history:append' as never, { json } as never);
  };

  c.undo = function (callback?: () => void) {
    this.historyProcessing = true;
    const history = this.historyUndo.pop();
    if (history) {
      this.historyRedo.push(this._historyNext());
      this.historyNextState = history;
      this.loadFromJSON(history).then(() => {
        this.renderAll();
        this.fire('history:loaded' as never);
        this.fire('history:undo' as never);
        this.historyProcessing = false;
        callback?.();
      });
    } else {
      this.historyProcessing = false;
    }
  };

  c.redo = function (callback?: () => void) {
    this.historyProcessing = true;
    const history = this.historyRedo.pop();
    if (history) {
      this.historyUndo.push(this._historyNext());
      this.historyNextState = history;
      this.loadFromJSON(history).then(() => {
        this.renderAll();
        this.fire('history:loaded' as never);
        this.fire('history:redo' as never);
        this.historyProcessing = false;
        callback?.();
      });
    } else {
      this.historyProcessing = false;
    }
  };

  c.clearHistory = function () {
    this.historyUndo = [];
    this.historyRedo = [];
    this.fire('history:clear' as never);
  };

  // Fabric 5 method aliases
  c.sendToBack = function (obj: FabricObject) {
    this.sendObjectToBack(obj);
    return this;
  };
  c.bringToFront = function (obj: FabricObject) {
    this.bringObjectToFront(obj);
    return this;
  };
  c.sendBackwards = function (obj: FabricObject) {
    this.sendObjectBackwards(obj);
    return this;
  };
  c.bringForward = function (obj: FabricObject) {
    this.bringObjectForward(obj);
    return this;
  };

  // Pointer / dimension / background shims for Fabric 5 call sites
  (c as HistoryCanvas & { getPointer: (e: Event) => { x: number; y: number } }).getPointer = function (e: Event) {
    const pt = this.getScenePoint(e as never);
    return { x: pt.x, y: pt.y };
  };
  (c as HistoryCanvas & { setWidth: (w: number) => void; setHeight: (h: number) => void }).setWidth = function (w: number) {
    this.setDimensions({ width: w });
  };
  (c as HistoryCanvas & { setHeight: (h: number) => void }).setHeight = function (h: number) {
    this.setDimensions({ height: h });
  };
  (c as HistoryCanvas & { setBackgroundColor: (color: string, cb?: () => void) => void }).setBackgroundColor = function (
    color: string,
    cb?: () => void
  ) {
    this.backgroundColor = color;
    this.requestRenderAll();
    cb?.();
  };

  const save = (e: { target?: AnyObject }) => c._historySaveAction(e);
  c.on('object:added', save as never);
  c.on('object:removed', save as never);
  c.on('object:modified', save as never);

  c.historyNextState = c._historyNext();
  return c;
}

/** Fabric 5-style Image.fromURL(url, callback) wrapper over Fabric 7 promises. */
function imageFromURL(
  url: string,
  callback?: (img: FabricImage) => void,
  imgOptions?: Record<string, unknown>
) {
  return FabricImage.fromURL(url, imgOptions as never).then((img) => {
    callback?.(img);
    return img;
  });
}

/** Fabric 5-style loadSVGFromURL(url, callback). */
function loadSVG(
  url: string,
  callback?: (objects: FabricObject[], options: Record<string, unknown>) => void
) {
  return loadSVGFromURL(url).then((result) => {
    const objects = (result.objects || []).filter(Boolean) as FabricObject[];
    const options = (result.options || {}) as Record<string, unknown>;
    callback?.(objects, options);
    return result;
  });
}

function groupSVGElements(objects: FabricObject[], options?: Record<string, unknown>) {
  if (objects.length === 1) return objects[0];
  return new Group(objects, options as never);
}

/** Namespace-shaped API used throughout the codebase. */
function HistoryFabricCanvas(
  el?: string | HTMLCanvasElement,
  options?: ConstructorParameters<typeof Canvas>[1]
) {
  const canvas = new Canvas(el, options);
  return attachHistory(canvas);
}
HistoryFabricCanvas.prototype = Canvas.prototype;

export const fabric: any = {
  Canvas: HistoryFabricCanvas,
  Line,
  Circle,
  Ellipse,
  Rect,
  Triangle,
  Polygon,
  Polyline,
  Path,
  Group,
  ActiveSelection,
  Point,
  Textbox,
  IText,
  Text: FabricText,
  Object: FabricObject,
  Image: Object.assign(FabricImage, { fromURL: imageFromURL }),
  util: {
    ...util,
    groupSVGElements,
  },
  controlsUtils,
  loadSVGFromURL: loadSVG,
  loadSVGFromString,
};

// Type surface matching previous `fabric.*` usage
export namespace fabric {
  export type Object = FabricObject;
  export type Canvas = import('fabric').Canvas;
  export type Line = import('fabric').Line;
  export type Circle = import('fabric').Circle;
  export type Ellipse = import('fabric').Ellipse;
  export type Rect = import('fabric').Rect;
  export type Triangle = import('fabric').Triangle;
  export type Polygon = import('fabric').Polygon;
  export type Path = import('fabric').Path;
  export type Group = import('fabric').Group;
  export type ActiveSelection = import('fabric').ActiveSelection;
  export type Point = import('fabric').Point;
  export type Textbox = import('fabric').Textbox;
  export type IText = import('fabric').IText;
  export type Image = import('fabric').FabricImage;
  export type IEvent = TEvent & { target?: FabricObject; e: Event };
  export type EventName = string;
}

export { attachHistory };
export type { FabricObject, Canvas, TEvent };
