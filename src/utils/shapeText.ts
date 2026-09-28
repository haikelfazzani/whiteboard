import { fabric } from '../components/FabricExtended';

const EDITABLE_SHAPE_TYPES = new Set([
  'rect',
  'circle',
  'ellipse',
  'triangle',
  'polygon',
  'path',
]);

type LabeledGroup = fabric.Group & { data?: { labeledShape?: boolean } };

function isTextObject(obj: fabric.Object | undefined | null): obj is fabric.Textbox | fabric.IText {
  return !!obj && (obj.type === 'textbox' || obj.type === 'i-text' || obj.type === 'text');
}

function findTextInGroup(group: fabric.Group): fabric.Textbox | fabric.IText | null {
  return (group.getObjects().find(isTextObject) as fabric.Textbox | fabric.IText | undefined) || null;
}

function shapeSupportsInlineText(obj: fabric.Object) {
  return EDITABLE_SHAPE_TYPES.has(obj.type || '');
}

function createCenteredLabel(shape: fabric.Object, text = 'Text') {
  const scaledW = typeof shape.getScaledWidth === 'function' ? shape.getScaledWidth() : shape.width || 100;
  const width = Math.max(48, scaledW * 0.7);
  return new fabric.Textbox(text, {
    originX: 'center',
    originY: 'center',
    left: 0,
    top: 0,
    width,
    fontSize: 16,
    fill: '#111111',
    textAlign: 'center',
    splitByGrapheme: true,
    editable: true,
  });
}

function ungroupToCanvas(canvas: fabric.Canvas, group: fabric.Group): fabric.Object[] {
  const items = group.getObjects().slice() as fabric.Object[];
  // Restore child transforms to canvas space (Fabric 5).
  (group as fabric.Group & { _restoreObjectsState: () => fabric.Group })._restoreObjectsState();
  canvas.remove(group);
  items.forEach((item) => {
    item.setCoords();
    canvas.add(item);
  });
  canvas.requestRenderAll();
  return items;
}

function regroupItems(canvas: fabric.Canvas, items: fabric.Object[]) {
  const fresh = items.filter((item) => canvas.getObjects().includes(item));
  if (fresh.length < 2) return null;

  fresh.forEach((item) => canvas.remove(item));
  const group = new fabric.Group(fresh, { subTargetCheck: true }) as LabeledGroup;
  group.data = { labeledShape: true };
  canvas.add(group);
  canvas.setActiveObject(group);
  canvas.requestRenderAll();
  return group;
}

function beginTextEditing(canvas: fabric.Canvas, text: fabric.Textbox | fabric.IText, items?: fabric.Object[]) {
  canvas.setActiveObject(text);
  text.enterEditing();
  text.selectAll();
  canvas.requestRenderAll();

  if (!items) return;

  const onExit = () => {
    text.off('editing:exited', onExit);
    regroupItems(canvas, items);
  };
  text.on('editing:exited', onExit);
}

function wrapShapeWithLabel(canvas: fabric.Canvas, shape: fabric.Object) {
  const center = shape.getCenterPoint();
  const angle = shape.angle || 0;
  const scaleX = shape.scaleX || 1;
  const scaleY = shape.scaleY || 1;

  canvas.remove(shape);

  shape.set({
    originX: 'center',
    originY: 'center',
    left: 0,
    top: 0,
    angle: 0,
    scaleX: 1,
    scaleY: 1,
  });
  shape.setCoords();

  const label = createCenteredLabel(shape);
  const group = new fabric.Group([shape, label], {
    left: center.x,
    top: center.y,
    angle,
    scaleX,
    scaleY,
    originX: 'center',
    originY: 'center',
    subTargetCheck: true,
  }) as LabeledGroup;
  group.data = { labeledShape: true };

  canvas.add(group);
  canvas.requestRenderAll();
  return group;
}

/**
 * Double-click: edit text, or add/edit text inside geometry shapes.
 */
export function attachShapeTextEditing(canvas: fabric.Canvas) {
  const onDblClick = (opt: fabric.IEvent) => {
    const target = opt.target;
    if (!target) return;

    if (isTextObject(target)) {
      beginTextEditing(canvas, target);
      return;
    }

    if (target.type === 'group') {
      const group = target as LabeledGroup;
      if (!findTextInGroup(group) && !group.data?.labeledShape) return;

      const items = ungroupToCanvas(canvas, group);
      const text = items.find(isTextObject);
      if (!text) return;
      beginTextEditing(canvas, text, items);
      return;
    }

    if (!shapeSupportsInlineText(target)) return;

    const group = wrapShapeWithLabel(canvas, target);
    const items = ungroupToCanvas(canvas, group);
    const text = items.find(isTextObject);
    if (!text) return;
    beginTextEditing(canvas, text, items);
  };

  canvas.on('mouse:dblclick', onDblClick);

  return () => {
    canvas.off('mouse:dblclick', onDblClick);
  };
}
