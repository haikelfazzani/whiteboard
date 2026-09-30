export { Whiteboard } from './components/Whiteboard';
export { CanvasEditor } from './components/CanvasEditor';
export { createShape, GEOMETRY_SHAPES } from './utils/shapes';
export {
  createConnectorObject,
  refreshAllConnectors,
  hydrateConnectors,
  isConnectorTool,
} from './utils/connectors';
export {
  CanvasRecorder,
  exportCanvasToVideo,
  downloadCanvasVideo,
  downloadBlob,
  resolveVideoMimeType,
} from './utils/exportVideo';
export { fabric } from './components/FabricExtended';

export type {
  WhiteboardAPI,
  WhiteboardProps,
  VideoExportOptions,
  VideoFormat,
  VideoExportMode,
  ShapeType,
  ShapeOptions,
} from './types';
