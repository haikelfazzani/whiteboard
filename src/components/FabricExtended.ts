import { fabric } from 'fabric';

export type HistoryCanvas = fabric.Canvas & {
  historyUndo: string[];
  historyRedo: string[];
  historyNextState: string;
  historyProcessing: boolean;
  extraProps: string[];
  _historyInit: () => void;
  _historyDispose: () => void;
  _historyNext: () => string;
  _historyEvents: () => Record<string, (...args: unknown[]) => void>;
  _historySaveAction: () => void;
  _loadHistory: (history: string, event: string, callback?: () => void) => void;
  undo: (callback?: () => void) => void;
  redo: (callback?: () => void) => void;
  clearHistory: () => void;
};

type CanvasProto = typeof fabric.Canvas.prototype & {
  initialize: (...args: unknown[]) => fabric.Canvas;
  dispose: (...args: unknown[]) => fabric.Canvas;
  _historyInit: () => void;
  _historyDispose: () => void;
  _historyNext: () => string;
  _historyEvents: () => Record<string, (...args: unknown[]) => void>;
  _historySaveAction: () => void;
  _loadHistory: (history: string, event: string, callback?: () => void) => void;
  undo: (callback?: () => void) => void;
  redo: (callback?: () => void) => void;
  clearHistory: () => void;
  historyUndo: string[];
  historyRedo: string[];
  historyNextState: string;
  historyProcessing: boolean;
  extraProps: string[];
};

const proto = fabric.Canvas.prototype as CanvasProto;

proto.initialize = (function (originalFn) {
  return function (this: HistoryCanvas, ...args: unknown[]) {
    originalFn.apply(this, args as never);
    this._historyInit();
    return this;
  };
})(proto.initialize);

proto.dispose = (function (originalFn) {
  return function (this: HistoryCanvas, ...args: unknown[]) {
    originalFn.apply(this, args as never);
    this._historyDispose();
    return this;
  };
})(proto.dispose);

proto._historyNext = function (this: HistoryCanvas) {
  return JSON.stringify(this.toDatalessJSON(this.extraProps));
};

proto._historyEvents = function (this: HistoryCanvas) {
  return {
    'object:added': this._historySaveAction,
    'object:removed': this._historySaveAction,
    'object:modified': this._historySaveAction,
    'object:skewing': this._historySaveAction,
  };
};

proto._historyInit = function (this: HistoryCanvas) {
  this.historyUndo = [];
  this.historyRedo = [];
  this.extraProps = ['selectable'];
  this.historyNextState = this._historyNext();
  const events = this._historyEvents();
  Object.keys(events).forEach((eventName) => {
    this.on(eventName as fabric.EventName, events[eventName] as (e: fabric.IEvent) => void);
  });
};

proto._historyDispose = function (this: HistoryCanvas) {
  const events = this._historyEvents();
  Object.keys(events).forEach((eventName) => {
    this.off(eventName as fabric.EventName, events[eventName] as (e: fabric.IEvent) => void);
  });
};

proto._historySaveAction = function (this: HistoryCanvas) {
  if (this.historyProcessing) return;

  const json = this.historyNextState;
  this.historyUndo.push(json);
  this.historyNextState = this._historyNext();
  this.fire('history:append', { json });
};

proto.undo = function (this: HistoryCanvas, callback?: () => void) {
  this.historyProcessing = true;

  const history = this.historyUndo.pop();
  if (history) {
    this.historyRedo.push(this._historyNext());
    this.historyNextState = history;
    this._loadHistory(history, 'history:undo', callback);
  } else {
    this.historyProcessing = false;
  }
};

proto.redo = function (this: HistoryCanvas, callback?: () => void) {
  this.historyProcessing = true;
  const history = this.historyRedo.pop();
  if (history) {
    this.historyUndo.push(this._historyNext());
    this.historyNextState = history;
    this._loadHistory(history, 'history:redo', callback);
  } else {
    this.historyProcessing = false;
  }
};

proto._loadHistory = function (
  this: HistoryCanvas,
  history: string,
  event: string,
  callback?: () => void
) {
  this.loadFromJSON(history, () => {
    this.renderAll();
    this.fire(event);
    this.historyProcessing = false;
    if (typeof callback === 'function') callback();
  });
};

proto.clearHistory = function (this: HistoryCanvas) {
  this.historyUndo = [];
  this.historyRedo = [];
  this.fire('history:clear');
};

export { fabric };
