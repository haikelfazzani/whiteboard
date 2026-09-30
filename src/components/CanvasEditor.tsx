import React, {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { RgbaStringColorPicker } from 'react-colorful';
import { fabric, HistoryCanvas } from './FabricExtended';
import Dropdown from './Dropdown';
import ArrowIcon from './icons/ArrowIcon';
import CircleIcon from './icons/CircleIcon';
import CogIcon from './icons/CogIcon';
import DiamondIcon from './icons/DiamondIcon';
import DoubleArrowIcon from './icons/DoubleArrowIcon';
import DuplicateIcon from './icons/DuplicateIcon';
import EllipseIcon from './icons/EllipseIcon';
import EraseIcon from './icons/EraseIcon';
import ExportIcon from './icons/ExportIcon';
import FlopIcon from './icons/FlopIcon';
import GeometryIcon from './icons/GeometryIcon';
import GridIcon from './icons/GridIcon';
import HandIcon from './icons/HandIcon';
import HexagonIcon from './icons/HexagonIcon';
import HighlighterIcon from './icons/HighlighterIcon';
import ImageIcon from './icons/ImageIcon';
import JsonIcon from './icons/JsonIcon';
import LineIcon from './icons/LineIcon';
import PenIcon from './icons/PenIcon';
import PentagonIcon from './icons/PentagonIcon';
import RecordIcon from './icons/RecordIcon';
import RectIcon from './icons/RectIcon';
import RedoIcon from './icons/RedoIcon';
import RoundedRectIcon from './icons/RoundedRectIcon';
import StarIcon from './icons/StarIcon';
import StickyIcon from './icons/StickyIcon';
import StopIcon from './icons/StopIcon';
import TextIcon from './icons/TextIcon';
import TrashIcon from './icons/TrashIcon';
import TriangleIcon from './icons/TriangleIcon';
import UndoIcon from './icons/UndoIcon';
import { WhiteboardContext } from './WhiteboardStore';
import { createShape } from '../utils/shapes';
import {
  CanvasRecorder,
  downloadBlob,
  downloadCanvasVideo,
  exportCanvasToVideo,
} from '../utils/exportVideo';
import { attachShapeTextEditing } from '../utils/shapeText';
import {
  clearAnchorMarkers,
  createAnchorMarkers,
  createConnectorObject,
  DRAG_THRESHOLD,
  ensureObjectId,
  findNearestConnectable,
  getAnchorPoint,
  getNearestConnectionPoint,
  hydrateConnectors,
  isConnectable,
  isConnector,
  isConnectorTool,
  refreshConnectorsForObject,
  SNAP_DISTANCE,
  type ConnectorKind,
} from '../utils/connectors';
import type { Point } from '../utils/connectors';
import type {
  ShapeOptions,
  ShapeType,
  VideoExportOptions,
  WhiteboardAPI,
  WhiteboardProps,
} from '../types';
import './Whiteboard.css';

const JSON_PROPS = ['data'];

const headerTools: { title: ShapeType; icon: React.ReactNode }[] = [
  { title: 'Select', icon: <HandIcon /> },
  { title: 'Draw', icon: <PenIcon /> },
  { title: 'Highlighter', icon: <HighlighterIcon /> },
  { title: 'Text', icon: <TextIcon /> },
  { title: 'Sticky', icon: <StickyIcon /> },
  { title: 'Arrow', icon: <ArrowIcon /> },
  { title: 'DoubleArrow', icon: <DoubleArrowIcon /> },
  { title: 'Line', icon: <LineIcon /> },
];

const geometryTools: { title: ShapeType; icon: React.ReactNode; label: string }[] = [
  { title: 'Circle', icon: <CircleIcon />, label: 'Circle' },
  { title: 'Ellipse', icon: <EllipseIcon />, label: 'Ellipse' },
  { title: 'Rect', icon: <RectIcon />, label: 'Rectangle' },
  { title: 'RoundedRect', icon: <RoundedRectIcon />, label: 'Rounded rectangle' },
  { title: 'Triangle', icon: <TriangleIcon />, label: 'Triangle' },
  { title: 'Diamond', icon: <DiamondIcon />, label: 'Diamond' },
  { title: 'Star', icon: <StarIcon />, label: 'Star' },
  { title: 'Pentagon', icon: <PentagonIcon />, label: 'Pentagon' },
  { title: 'Hexagon', icon: <HexagonIcon />, label: 'Hexagon' },
];

const footerTools = [
  { title: 'Show Object Options', icon: <CogIcon /> },
  { title: 'Grid', icon: <GridIcon /> },
  { title: 'Erase', icon: <EraseIcon /> },
  { title: 'Duplicate', icon: <DuplicateIcon /> },
  { title: 'Undo', icon: <UndoIcon /> },
  { title: 'Redo', icon: <RedoIcon /> },
  { title: 'Save', icon: <FlopIcon /> },
  { title: 'Export', icon: <ExportIcon /> },
  { title: 'ToJson', icon: <JsonIcon /> },
  { title: 'Clear', icon: <TrashIcon /> },
] as const;

const CACHE_KEY = 'whiteboard-cache';

export const CanvasEditor = forwardRef<WhiteboardAPI, WhiteboardProps>(
  function CanvasEditor({ onChange, onVideoExport, className = '', options, style }, ref) {
    const parentRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const inputImageFileRef = useRef<HTMLInputElement>(null);
    const inputJsonFileRef = useRef<HTMLInputElement>(null);
    const editorRef = useRef<HistoryCanvas | null>(null);
    const recorderRef = useRef(new CanvasRecorder());
    const recordOptionsRef = useRef<VideoExportOptions>({ format: 'webm' });
    const onChangeRef = useRef(onChange);
    const onVideoExportRef = useRef(onVideoExport);
    const connectRef = useRef<{
      kind: ConnectorKind | null;
      from: fabric.Object | null;
      fromPoint: Point | null;
      preview: fabric.Line | null;
      pointerDown: boolean;
      didDrag: boolean;
      downPointer: Point | null;
      downTarget: fabric.Object | null;
    }>({
      kind: null,
      from: null,
      fromPoint: null,
      preview: null,
      pointerDown: false,
      didDrag: false,
      downPointer: null,
      downTarget: null,
    });

    const { gstate } = useContext(WhiteboardContext);
    const { canvasOptions, backgroundImage } = gstate;

    const [editor, setEditor] = useState<HistoryCanvas | null>(null);
    const [activeTool, setActiveTool] = useState<ShapeType>('Select');
    const [connectHint, setConnectHint] = useState<string>('');
    const [recording, setRecording] = useState(false);
    const [recordElapsed, setRecordElapsed] = useState(0);
    const [objOptions, setObjOptions] = useState<ShapeOptions>({
      stroke: '#000000',
      fontSize: 22,
      fill: 'rgba(255, 255, 255, 0.0)',
      strokeWidth: 3,
      ...options,
    });
    const objOptionsRef = useRef(objOptions);
    const [colorProp, setColorProp] = useState<'backgroundColor' | 'stroke' | 'fill'>(
      'backgroundColor'
    );
    const [showObjOptions, setShowObjOptions] = useState(false);
    const [showGrid, setShowGrid] = useState(true);

    useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);

    useEffect(() => {
      onVideoExportRef.current = onVideoExport;
    }, [onVideoExport]);

    useEffect(() => {
      objOptionsRef.current = objOptions;
    }, [objOptions]);

    useEffect(() => {
      if (!recording) {
        setRecordElapsed(0);
        return;
      }
      const started = Date.now();
      const id = window.setInterval(() => {
        setRecordElapsed(Math.floor((Date.now() - started) / 1000));
      }, 250);
      return () => window.clearInterval(id);
    }, [recording]);

    const resetConnectMode = useCallback((canvas?: HistoryCanvas | null) => {
      const c = canvas || editorRef.current;
      if (c) {
        clearAnchorMarkers(c);
        if (connectRef.current.preview) {
          c.remove(connectRef.current.preview);
        }
        c.defaultCursor = 'default';
        c.hoverCursor = 'move';
        c.selection = true;
        c.requestRenderAll();
      }
      connectRef.current = {
        kind: null,
        from: null,
        fromPoint: null,
        preview: null,
        pointerDown: false,
        didDrag: false,
        downPointer: null,
        downTarget: null,
      };
      setConnectHint('');
    }, []);

    const notifyChange = useCallback(() => {
      const canvas = editorRef.current;
      if (canvas && onChangeRef.current) {
        onChangeRef.current(canvas.toDatalessJSON(JSON_PROPS));
      }
    }, []);

    const onObjectAdded = useCallback(
      (e: fabric.IEvent) => {
        const t = e.target as
          | (fabric.Object & { excludeFromExport?: boolean; __anchorMarker?: boolean })
          | undefined;
        if (!t) return;
        if (t.excludeFromExport || t.__anchorMarker) return;
        if (connectRef.current.preview && t === connectRef.current.preview) return;
        notifyChange();
      },
      [notifyChange]
    );

    const addShapeToCanvas = useCallback(
      (type: ShapeType, shapeOptions?: ShapeOptions) => {
        const canvas = editorRef.current;
        if (!canvas) return null;

        setActiveTool(type);
        resetConnectMode(canvas);

        if (type === 'Select') {
          canvas.isDrawingMode = false;
          canvas.discardActiveObject().renderAll();
          return null;
        }

        if (type === 'Draw' || type === 'Highlighter') {
          canvas.isDrawingMode = true;
          const isHighlighter = type === 'Highlighter';
          const width = isHighlighter
            ? Number(localStorage.getItem('highlighter.width') || 18)
            : Number(localStorage.getItem('freeDrawingBrush.width') || 5);
          const color = isHighlighter
            ? localStorage.getItem('highlighter.color') || 'rgba(255, 235, 59, 0.45)'
            : localStorage.getItem('freeDrawingBrush.color') || '#000000';
          canvas.freeDrawingBrush.width = width;
          canvas.freeDrawingBrush.color = color;
          return null;
        }

        canvas.isDrawingMode = false;

        // Line / Arrow / DoubleArrow: drag to draw, or click shape → shape
        if (isConnectorTool(type)) {
          canvas.discardActiveObject().renderAll();
          canvas.defaultCursor = 'crosshair';
          canvas.hoverCursor = 'crosshair';
          canvas.selection = false;
          connectRef.current = {
            kind: type,
            from: null,
            fromPoint: null,
            preview: null,
            pointerDown: false,
            didDrag: false,
            downPointer: null,
            downTarget: null,
          };
          setConnectHint(`Drag to draw ${type}, or click two shapes (Esc to cancel)`);
          return null;
        }

        const obj = createShape(type, { ...objOptions, ...shapeOptions });
        if (!obj) return null;

        ensureObjectId(obj);
        canvas.add(obj);
        canvas.centerObject(obj);
        canvas.setActiveObject(obj);
        canvas.renderAll();
        return obj;
      },
      [objOptions, resetConnectMode]
    );

    const deleteSelection = useCallback(() => {
      const canvas = editorRef.current;
      if (!canvas) return;
      const active = canvas.getActiveObject();
      if (active) {
        canvas.remove(active);
        canvas.discardActiveObject();
        canvas.renderAll();
      }
    }, []);

    const duplicateSelection = useCallback(() => {
      const canvas = editorRef.current;
      if (!canvas) return;
      const active = canvas.getActiveObject();
      if (!active) return;

      active.clone((cloned: fabric.Object) => {
        cloned.set({
          left: (cloned.left || 0) + 20,
          top: (cloned.top || 0) + 20,
          evented: true,
        });
        if (cloned.type === 'activeSelection' && 'canvas' in cloned) {
          (cloned as fabric.ActiveSelection).canvas = canvas;
          (cloned as fabric.ActiveSelection).forEachObject((obj) => {
            canvas.add(obj);
          });
          cloned.setCoords();
        } else {
          canvas.add(cloned);
        }
        canvas.setActiveObject(cloned);
        canvas.renderAll();
      });
    }, []);

    const startRecording = useCallback((videoOptions: VideoExportOptions = {}) => {
      const canvas = editorRef.current;
      if (!canvas) throw new Error('Canvas is not ready');
      const opts: VideoExportOptions = { format: 'webm', ...videoOptions };
      recordOptionsRef.current = opts;
      recorderRef.current.start(canvas, opts);
      setRecording(true);
    }, []);

    const stopRecording = useCallback(async (download = true) => {
      const blob = await recorderRef.current.stop();
      setRecording(false);
      onVideoExportRef.current?.(blob, recordOptionsRef.current);
      if (download) {
        const base = recordOptionsRef.current.fileName || `whiteboard-${Date.now()}`;
        downloadBlob(blob, `${base}.webm`);
      }
      return blob;
    }, []);

    const toVideo = useCallback(async (videoOptions: VideoExportOptions = {}) => {
      const canvas = editorRef.current;
      if (!canvas) throw new Error('Canvas is not ready');
      const blob = await exportCanvasToVideo(canvas, { format: 'webm', ...videoOptions });
      onVideoExportRef.current?.(blob, { format: 'webm', ...videoOptions });
      return blob;
    }, []);

    const downloadVideo = useCallback(async (videoOptions: VideoExportOptions = {}) => {
      const canvas = editorRef.current;
      if (!canvas) throw new Error('Canvas is not ready');
      const blob = await downloadCanvasVideo(canvas, { format: 'webm', ...videoOptions });
      onVideoExportRef.current?.(blob, { format: 'webm', ...videoOptions });
      return blob;
    }, []);

    useImperativeHandle(
      ref,
      (): WhiteboardAPI => ({
        getCanvas: () => editorRef.current,
        toJSON: () => editorRef.current?.toDatalessJSON(JSON_PROPS) || {},
        loadJSON: (json) =>
          new Promise((resolve, reject) => {
            const canvas = editorRef.current;
            if (!canvas) {
              reject(new Error('Canvas is not ready'));
              return;
            }
            const data = typeof json === 'string' ? JSON.parse(json) : json;
            canvas.loadFromJSON(data, () => {
              canvas.getObjects().forEach((obj) => ensureObjectId(obj));
              hydrateConnectors(canvas);
              canvas.renderAll();
              resolve();
            });
          }),
        toDataURL: (format = 'png', quality = 1) =>
          editorRef.current?.toDataURL({ format, quality }) || '',
        startRecording,
        stopRecording,
        isRecording: () => recorderRef.current.recording,
        toVideo,
        downloadVideo,
        addShape: (type, shapeOptions) => addShapeToCanvas(type, shapeOptions),
        clear: (confirmClear = true) => {
          const canvas = editorRef.current;
          if (!canvas) return;
          if (confirmClear && !window.confirm('Are you sure to reset the whiteboard?')) {
            return;
          }
          localStorage.removeItem(CACHE_KEY);
          canvas.clearHistory();
          canvas.clear();
        },
        undo: () => editorRef.current?.undo(),
        redo: () => editorRef.current?.redo(),
        setDrawingMode: (enabled, tool = 'Draw') => {
          if (!enabled) {
            addShapeToCanvas('Select');
            return;
          }
          addShapeToCanvas(tool);
        },
        deleteSelection,
        duplicateSelection,
        bringForward: () => {
          const canvas = editorRef.current;
          const active = canvas?.getActiveObject();
          if (canvas && active) {
            canvas.bringForward(active);
            canvas.renderAll();
          }
        },
        sendBackward: () => {
          const canvas = editorRef.current;
          const active = canvas?.getActiveObject();
          if (canvas && active) {
            canvas.sendBackwards(active);
            canvas.renderAll();
          }
        },
      }),
      [
        addShapeToCanvas,
        deleteSelection,
        duplicateSelection,
        downloadVideo,
        startRecording,
        stopRecording,
        toVideo,
      ]
    );

    useEffect(() => {
      if (!canvasRef.current || !parentRef.current) return;

      const canvas = new fabric.Canvas(canvasRef.current, canvasOptions) as HistoryCanvas;
      editorRef.current = canvas;
      setEditor(canvas);

      const detachTextEditing = attachShapeTextEditing(canvas);

      const onKeydown = (e: KeyboardEvent) => {
        if (!editorRef.current) return;
        const c = editorRef.current;
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;

        if (e.code === 'Delete' || e.key === 'Delete') {
          const activeObject = c.getActiveObject();
          if (activeObject) c.remove(activeObject);
        }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
          e.preventDefault();
          duplicateSelection();
        }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
          const object = c.getActiveObject();
          if (!object) return;
          object.clone((cloned: fabric.Object) => {
            cloned.set({ top: (cloned.top || 0) + 5, left: (cloned.left || 0) + 5 });
            c.add(cloned);
            c.setActiveObject(cloned);
            c.renderAll();
          });
        }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          localStorage.setItem(CACHE_KEY, JSON.stringify(c.toDatalessJSON(JSON_PROPS)));
        }

        if (e.key === 'Escape') {
          resetConnectMode(c);
          c.defaultCursor = 'default';
          c.hoverCursor = 'move';
          setActiveTool('Select');
        }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
          e.preventDefault();
          inputImageFileRef.current?.click();
        }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          c.undo();
        }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
          e.preventDefault();
          c.redo();
        }
      };

      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          canvas.loadFromJSON(JSON.parse(cached), () => {
            canvas.getObjects().forEach((obj) => ensureObjectId(obj));
            hydrateConnectors(canvas);
            canvas.renderAll();
          });
        } catch {
          // ignore corrupt cache
        }
      }

      const finishConnector = (
        kind: ConnectorKind,
        fromPt: Point,
        toPt: Point,
        fromObj: fabric.Object | null,
        toObj: fabric.Object | null
      ) => {
        const s = connectRef.current;
        if (s.preview) {
          canvas.remove(s.preview);
          s.preview = null;
        }
        clearAnchorMarkers(canvas);

        const dx = toPt.x - fromPt.x;
        const dy = toPt.y - fromPt.y;
        if (dx * dx + dy * dy < 4) {
          resetConnectMode(canvas);
          setActiveTool('Select');
          return;
        }

        const fromId = fromObj ? ensureObjectId(fromObj) : null;
        const toId = toObj ? ensureObjectId(toObj) : null;

        let start = fromPt;
        let end = toPt;
        if (fromObj && toObj) {
          const fromCenter = fromObj.getCenterPoint();
          const toCenter = toObj.getCenterPoint();
          start = getAnchorPoint(fromObj, toCenter);
          end = getAnchorPoint(toObj, fromCenter);
        } else if (fromObj) {
          start = getAnchorPoint(fromObj, toPt);
        } else if (toObj) {
          end = getAnchorPoint(toObj, fromPt);
        }

        const connector = createConnectorObject(
          kind,
          start,
          end,
          fromId,
          toId,
          objOptionsRef.current
        );
        canvas.add(connector);
        canvas.setActiveObject(connector);
        canvas.requestRenderAll();
        notifyChange();

        resetConnectMode(canvas);
        setActiveTool('Select');
      };

      const onObjectMoving = (e: fabric.IEvent) => {
        if (e.target) refreshConnectorsForObject(canvas, e.target);
      };
      const onObjectModified = (e: fabric.IEvent) => {
        if (e.target) refreshConnectorsForObject(canvas, e.target);
        notifyChange();
      };

      const onConnectDown = (opt: fabric.IEvent) => {
        if (!connectRef.current.kind) return;

        const pointer = canvas.getPointer(opt.e);
        let target = opt.target as fabric.Object | undefined;
        if (target && (target as fabric.Object & { __anchorMarker?: boolean }).__anchorMarker) {
          target = undefined;
        }
        if (target && (isConnector(target) || !isConnectable(target))) {
          target = undefined;
        }

        canvas.discardActiveObject();

        const s = connectRef.current;
        s.pointerDown = true;
        s.didDrag = false;
        s.downPointer = pointer;
        s.downTarget = target || null;

        // Second click on another shape → finish immediately
        if (s.from && target && target !== s.from) {
          finishConnector(
            s.kind!,
            s.fromPoint || getAnchorPoint(s.from, pointer),
            pointer,
            s.from,
            target
          );
          return;
        }

        // Start (or restart) a connector from this point / shape
        if (!s.from) {
          const fromObj = target || findNearestConnectable(canvas, pointer, SNAP_DISTANCE);
          const fromPt = fromObj ? getNearestConnectionPoint(fromObj, pointer) : { ...pointer };
          s.from = fromObj;
          s.fromPoint = fromPt;

          if (s.preview) canvas.remove(s.preview);
          clearAnchorMarkers(canvas);
          s.preview = new fabric.Line([fromPt.x, fromPt.y, fromPt.x, fromPt.y], {
            stroke: (objOptionsRef.current.stroke as string) || '#2196f3',
            strokeWidth: Number(objOptionsRef.current.strokeWidth) || 2,
            strokeDashArray: [6, 4],
            selectable: false,
            evented: false,
            excludeFromExport: true,
          });
          canvas.add(s.preview);
          if (fromObj) {
            createAnchorMarkers(fromObj).forEach((m) => canvas.add(m));
            setConnectHint(`Drag to another shape, or click the second shape`);
          } else {
            setConnectHint(`Drag to draw ${s.kind}`);
          }
          canvas.requestRenderAll();
        }
      };

      const onConnectMove = (opt: fabric.IEvent) => {
        const s = connectRef.current;
        if (!s.kind) return;

        const pointer = canvas.getPointer(opt.e);

        if (s.pointerDown && s.downPointer) {
          const dx = pointer.x - s.downPointer.x;
          const dy = pointer.y - s.downPointer.y;
          if (dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) {
            s.didDrag = true;
          }
        }

        if (s.fromPoint && s.preview) {
          const fromPt = s.from ? getAnchorPoint(s.from, pointer) : s.fromPoint;
          if (s.from) s.fromPoint = fromPt;
          s.preview.set({ x1: fromPt.x, y1: fromPt.y, x2: pointer.x, y2: pointer.y });
          s.preview.setCoords();
        }

        clearAnchorMarkers(canvas);
        const hovered =
          (opt.target && isConnectable(opt.target) && !isConnector(opt.target)
            ? opt.target
            : null) || findNearestConnectable(canvas, pointer, SNAP_DISTANCE);
        if (hovered) {
          createAnchorMarkers(hovered).forEach((m) => canvas.add(m));
        }
        if (s.from && s.from !== hovered) {
          createAnchorMarkers(s.from).forEach((m) => canvas.add(m));
        }
        canvas.requestRenderAll();
      };

      const onConnectUp = (opt: fabric.IEvent) => {
        const s = connectRef.current;
        if (!s.kind || !s.pointerDown) return;
        s.pointerDown = false;

        const pointer = canvas.getPointer(opt.e);

        if (s.didDrag && s.fromPoint) {
          let toTarget =
            (opt.target && isConnectable(opt.target) && !isConnector(opt.target)
              ? opt.target
              : null) || findNearestConnectable(canvas, pointer, SNAP_DISTANCE);
          if (toTarget && toTarget === s.from) toTarget = null;

          const toPt = toTarget ? getNearestConnectionPoint(toTarget, pointer) : pointer;
          finishConnector(s.kind, s.fromPoint, toPt, s.from, toTarget);
          return;
        }

        // Click without drag: keep first shape selected for click-click flow
        if (s.downTarget && s.from === s.downTarget) {
          setConnectHint(`Click second shape to finish ${s.kind} (Esc to cancel)`);
          return;
        }

        // Click on empty canvas with no drag — stay ready / ignore
        if (!s.from) {
          if (s.preview) {
            canvas.remove(s.preview);
            s.preview = null;
          }
        }
      };

      canvas.on('object:added', onObjectAdded);
      canvas.on('object:removed', notifyChange);
      canvas.on('object:modified', onObjectModified);
      canvas.on('object:moving', onObjectMoving);
      canvas.on('object:scaling', onObjectMoving);
      canvas.on('object:rotating', onObjectMoving);
      canvas.on('mouse:down', onConnectDown);
      canvas.on('mouse:move', onConnectMove);
      canvas.on('mouse:up', onConnectUp);

      const resizeCanvas = () => {
        if (!parentRef.current || !editorRef.current) return;
        const area = parentRef.current.querySelector('.wb-canvas-area') as HTMLElement | null;
        const height = area?.clientHeight || parentRef.current.clientHeight || 0;
        const width = area?.clientWidth || parentRef.current.clientWidth || 0;
        editorRef.current.setHeight(height);
        editorRef.current.setWidth(width);
        editorRef.current.renderAll();
      };

      resizeCanvas();
      document.addEventListener('keydown', onKeydown);
      window.addEventListener('resize', resizeCanvas);

      return () => {
        detachTextEditing();
        canvas.off('object:added', onObjectAdded);
        canvas.off('object:removed', notifyChange);
        canvas.off('object:modified', onObjectModified);
        canvas.off('object:moving', onObjectMoving);
        canvas.off('object:scaling', onObjectMoving);
        canvas.off('object:rotating', onObjectMoving);
        canvas.off('mouse:down', onConnectDown);
        canvas.off('mouse:move', onConnectMove);
        canvas.off('mouse:up', onConnectUp);
        document.removeEventListener('keydown', onKeydown);
        window.removeEventListener('resize', resizeCanvas);
        if (recorderRef.current.recording) {
          void recorderRef.current.stop().catch(() => undefined);
        }
        editorRef.current = null;
        canvas.dispose();
      };
      // intentional mount-only setup
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onFooterAction = async (actionName: string) => {
      if (!editor) return;

      switch (actionName) {
        case 'Show Object Options':
          setShowObjOptions((v) => !v);
          break;

        case 'Export': {
          const image = editor.toDataURL({ format: 'png' });
          const link = document.createElement('a');
          link.href = image;
          link.download = `whiteboard-${Date.now()}.png`;
          link.click();
          break;
        }

        case 'Save':
          localStorage.setItem(CACHE_KEY, JSON.stringify(editor.toDatalessJSON(JSON_PROPS)));
          break;

        case 'Erase':
          deleteSelection();
          break;

        case 'Duplicate':
          duplicateSelection();
          break;

        case 'ToJson': {
          const content = JSON.stringify(editor.toDatalessJSON(JSON_PROPS));
          const link = document.createElement('a');
          const file = new Blob([content], { type: 'application/json' });
          link.setAttribute('download', 'whiteboard.json');
          link.href = URL.createObjectURL(file);
          document.body.appendChild(link);
          link.click();
          link.remove();
          break;
        }

        case 'Undo':
          editor.undo();
          break;

        case 'Redo':
          editor.redo();
          break;

        case 'Grid':
          setShowGrid((v) => !v);
          break;

        case 'Clear':
          if (window.confirm('Are you sure to reset the whiteboard?')) {
            localStorage.removeItem(CACHE_KEY);
            editor.clearHistory();
            editor.clear();
          }
          break;

        default:
          break;
      }
    };

    const toggleRecording = async () => {
      try {
        if (recording) {
          await stopRecording(true);
        } else {
          startRecording({ format: 'webm' });
        }
      } catch (err) {
        console.error(err);
        setRecording(false);
        window.alert('WebM recording failed in this browser.');
      }
    };

    const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!editor || !e.target.files || e.target.files.length < 1) return;

      const inputFileName = e.target.name;
      const file = e.target.files[0];
      const fileType = file.type;
      const url = URL.createObjectURL(file);

      if (inputFileName === 'json') {
        fetch(url)
          .then((r) => r.json())
          .then((json) => {
            editor.loadFromJSON(json, () => {
              hydrateConnectors(editor);
              editor.renderAll();
            });
          })
          .finally(() => URL.revokeObjectURL(url));
        return;
      }

      if (fileType === 'image/png' || fileType === 'image/jpeg' || fileType === 'image/gif') {
        fabric.Image.fromURL(url, (img) => {
          img.scaleToWidth(180);
          editor.centerObject(img);
          editor.add(img);
          URL.revokeObjectURL(url);
        });
      }

      if (fileType === 'image/svg+xml') {
        fabric.loadSVGFromURL(url, (objects, svgOptions) => {
          const svg = fabric.util.groupSVGElements(objects, svgOptions);
          svg.scaleToWidth(180);
          svg.scaleToHeight(180);
          editor.centerObject(svg);
          editor.add(svg);
          URL.revokeObjectURL(url);
        });
      }

      e.target.value = '';
    };

    const onRadioColor = (e: React.ChangeEvent<HTMLInputElement>) => {
      setColorProp(e.target.value as 'backgroundColor' | 'stroke' | 'fill');
    };

    const onColorChange = (value: string) => {
      if (!editor) return;
      const activeObj = editor.getActiveObject();

      if (editor.isDrawingMode) {
        editor.freeDrawingBrush.color = value;
        localStorage.setItem('freeDrawingBrush.color', value);
        localStorage.setItem('highlighter.color', value);
      }

      if (activeObj) {
        activeObj.set(colorProp, value);
        setObjOptions((prev) => ({ ...prev, [colorProp]: value }));
        editor.renderAll();
        return;
      }

      if (colorProp === 'backgroundColor') {
        editor.setBackgroundColor(value, () => editor.renderAll());
      }
    };

    const onOptionsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!editor) return;
      let val: string | number = e.target.value;
      const name = e.target.name;
      const activeObj = editor.getActiveObject();

      if (editor.isDrawingMode && name === 'strokeWidth') {
        editor.freeDrawingBrush.width = Number(val);
        localStorage.setItem('freeDrawingBrush.width', String(val));
        localStorage.setItem('highlighter.width', String(val));
      }

      if (activeObj) {
        val = isNaN(Number(val)) ? val : Number(val);
        activeObj.set(name as keyof fabric.Object, val);
        setObjOptions((prev) => ({ ...prev, [name]: val }));
        editor.renderAll();
      }
    };

    const onZoom = (e: React.ChangeEvent<HTMLSelectElement>) => {
      if (!editor) return;
      editor.zoomToPoint(
        new fabric.Point(editor.getWidth() / 2, editor.getHeight() / 2),
        Number(e.target.value)
      );
      editor.relativePan(new fabric.Point(10, 0));
    };

    const formatElapsed = (seconds: number) => {
      const m = Math.floor(seconds / 60)
        .toString()
        .padStart(2, '0');
      const s = (seconds % 60).toString().padStart(2, '0');
      return `${m}:${s}`;
    };

    return (
      <div
        className={'whiteboard ' + className}
        style={{ backgroundImage: showGrid ? backgroundImage : '', ...style }}
        ref={parentRef}
      >
        <header className="wb-header">
          <div className="wb-toolbar shadow br-7">
            {headerTools.map((item) => (
              <button
                key={item.title}
                type="button"
                className={activeTool === item.title ? 'is-active' : ''}
                onClick={() => addShapeToCanvas(item.title)}
                title={item.title}
              >
                {item.icon}
              </button>
            ))}
            <Dropdown title={<GeometryIcon />}>
              {geometryTools.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => addShapeToCanvas(item.title)}
                  title={item.label}
                >
                  {item.icon}
                </button>
              ))}
            </Dropdown>
            <button
              type="button"
              onClick={() => inputImageFileRef.current?.click()}
              title="Load Image"
            >
              <ImageIcon />
            </button>
            <button
              type="button"
              onClick={() => inputJsonFileRef.current?.click()}
              title="Load From Json"
            >
              <JsonIcon />
            </button>
          </div>
        </header>

        <div className="wb-canvas-area">
          {showObjOptions && (
            <div className="left-menu">
              <div className="bg-white d-flex align-center justify-between shadow br-7">
                <label>Font size</label>
                <input
                  type="number"
                  min="1"
                  name="fontSize"
                  onChange={onOptionsChange}
                  defaultValue="22"
                />
              </div>

              <div className="bg-white d-flex align-center justify-between shadow br-7">
                <label>Stroke</label>
                <input
                  type="number"
                  min="1"
                  name="strokeWidth"
                  onChange={onOptionsChange}
                  defaultValue="3"
                />
              </div>

              <div className="bg-white d-flex flex-column shadow br-7">
                <div className="d-flex align-end mb-10">
                  <input
                    className="mr-10"
                    type="radio"
                    onChange={onRadioColor}
                    name="color"
                    defaultValue="backgroundColor"
                    defaultChecked
                  />
                  <label htmlFor="backgroundColor">background</label>
                </div>
                <div className="d-flex align-end mb-10">
                  <input
                    className="mr-10"
                    type="radio"
                    onChange={onRadioColor}
                    id="stroke"
                    name="color"
                    defaultValue="stroke"
                  />
                  <label htmlFor="stroke">stroke</label>
                </div>
                <div className="d-flex align-end mb-10">
                  <input
                    className="mr-10"
                    type="radio"
                    onChange={onRadioColor}
                    id="fill"
                    name="color"
                    defaultValue="fill"
                  />
                  <label htmlFor="fill">fill</label>
                </div>
                <RgbaStringColorPicker onChange={onColorChange} />
              </div>
            </div>
          )}

          <canvas ref={canvasRef} className="canvas" />
        </div>

        <footer className="wb-footer">
          <div className="wb-status bg-white br-7 shadow">
            {recording ? (
              <span className="wb-rec-live">
                <span className="wb-rec-dot" />
                REC {formatElapsed(recordElapsed)}
              </span>
            ) : connectHint ? (
              <span className="wb-connect-hint">{connectHint}</span>
            ) : (
              'whiteboard'
            )}
          </div>

          <div className="wb-toolbar shadow br-7">
            {footerTools.map((item) => (
              <button
                key={item.title}
                type="button"
                onClick={() => {
                  void onFooterAction(item.title);
                }}
                title={item.title}
              >
                {item.icon}
              </button>
            ))}
            <button
              type="button"
              className={recording ? 'is-recording' : ''}
              onClick={() => {
                void toggleRecording();
              }}
              title={recording ? 'Stop recording (WebM)' : 'Start recording (WebM)'}
            >
              {recording ? <StopIcon /> : <RecordIcon />}
            </button>
          </div>

          <select
            className="wb-zoom bg-white br-7 shadow border-0"
            onChange={onZoom}
            defaultValue="1"
            title="Zoom"
          >
            <option value="2">200%</option>
            <option value="1.5">150%</option>
            <option value="1">100%</option>
            <option value="0.75">75%</option>
            <option value="0.50">50%</option>
            <option value="0.25">25%</option>
          </select>

          <input
            ref={inputImageFileRef}
            type="file"
            name="image"
            onChange={onFileChange}
            accept="image/svg+xml, image/gif, image/jpeg, image/png"
            hidden
          />
          <input
            ref={inputJsonFileRef}
            type="file"
            name="json"
            onChange={onFileChange}
            accept="application/json"
            hidden
          />
        </footer>
      </div>
    );
  }
);
