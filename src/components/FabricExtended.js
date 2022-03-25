import { fabric } from 'fabric';

fabric.Canvas.prototype.initialize = (function (originalFn) {
  return function (...args) {
    originalFn.call(this, ...args);
    this._historyInit();
    return this;
  };
})(fabric.Canvas.prototype.initialize);

fabric.Canvas.prototype.dispose = (function (originalFn) {
  return function (...args) {
    originalFn.call(this, ...args);
    this._historyDispose();
    return this;
  };
})(fabric.Canvas.prototype.dispose);

fabric.Canvas.prototype._historyNext = function () {
  return JSON.stringify(this.toDatalessJSON(this.extraProps));
}

fabric.Canvas.prototype._historyEvents = function () {
  return {
    'object:added': this._historySaveAction,
    'object:removed': this._historySaveAction,
    'object:modified': this._historySaveAction,
    'object:skewing': this._historySaveAction
  }
}

fabric.Canvas.prototype._historyInit = function () {
  this.historyUndo = [];
  this.historyRedo = [];
  this.extraProps = ['selectable'];
  this.historyNextState = this._historyNext();

  this.on(this._historyEvents());
}

fabric.Canvas.prototype._historyDispose = function () {
  this.off(this._historyEvents())
}

fabric.Canvas.prototype._historySaveAction = function () {

  if (this.historyProcessing)
    return;

  const json = this.historyNextState;
  this.historyUndo.push(json);
  this.historyNextState = this._historyNext();
  this.fire('history:append', { json: json });
}

fabric.Canvas.prototype.undo = function (callback) {
  this.historyProcessing = true;

  const history = this.historyUndo.pop();
  if (history) {
    // Push the current state to the redo history
    this.historyRedo.push(this._historyNext());
    this.historyNextState = history;
    this._loadHistory(history, 'history:undo', callback);
  } else {
    this.historyProcessing = false;
  }
}

fabric.Canvas.prototype.redo = function (callback) {
  this.historyProcessing = true;
  const history = this.historyRedo.pop();
  if (history) {
    // Every redo action is actually a new action to the undo history
    this.historyUndo.push(this._historyNext());
    this.historyNextState = history;
    this._loadHistory(history, 'history:redo', callback);
  } else {
    this.historyProcessing = false;
  }
}

fabric.Canvas.prototype._loadHistory = function (history, event, callback) {
  var that = this;

  this.loadFromJSON(history, function () {
    that.renderAll();
    that.fire(event);
    that.historyProcessing = false;

    if (callback && typeof callback === 'function')
      callback();
  });
}

fabric.Canvas.prototype.clearHistory = function () {
  this.historyUndo = [];
  this.historyRedo = [];
  this.fire('history:clear');
}

// fabric.TextboxWithPadding = fabric.util.createClass(fabric.Textbox, {
//   _renderBackground: function (ctx) {
//     if (!this.backgroundColor) return;
    
//     let dim = this._getNonTransformedDimensions();
//     ctx.fillStyle = this.backgroundColor;

//     ctx.fillRect(
//       -dim.x / 2 - this.padding,
//       -dim.y / 2 - this.padding,
//       dim.x + this.padding * 2,
//       dim.y + this.padding * 2
//     );
    
//     this._removeShadow(ctx);
//   }
// });

export { fabric };