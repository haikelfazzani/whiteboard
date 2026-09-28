import type { ReactNode, CSSProperties } from 'react';
import type { fabric } from 'fabric';

export type ShapeType =
  | 'Select'
  | 'Draw'
  | 'Highlighter'
  | 'Text'
  | 'Sticky'
  | 'Arrow'
  | 'DoubleArrow'
  | 'Line'
  | 'Circle'
  | 'Ellipse'
  | 'Rect'
  | 'RoundedRect'
  | 'Triangle'
  | 'Diamond'
  | 'Star'
  | 'Hexagon'
  | 'Pentagon';

/** WebM only. */
export type VideoFormat = 'webm';

export type VideoExportMode = 'live' | 'static';

export interface VideoExportOptions {
  /** Always webm. */
  format?: VideoFormat;
  /** Frames per second (default 30). */
  fps?: number;
  /** Optional fixed duration used by legacy one-shot helpers (seconds). */
  duration?: number;
  /** Preferred MIME type override, e.g. video/webm;codecs=vp9 */
  mimeType?: string;
  /** Video bitrate in bits/sec (default 2_500_000). */
  videoBitsPerSecond?: number;
  /** Filename used when downloading (without extension). */
  fileName?: string;
}

export interface ShapeOptions {
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  fontSize?: number;
  backgroundColor?: string;
  width?: number;
  height?: number;
  radius?: number;
  [key: string]: unknown;
}

export interface WhiteboardProps {
  className?: string;
  options?: ShapeOptions;
  style?: CSSProperties;
  children?: ReactNode;
  /** Called whenever canvas content changes. */
  onChange?: (json: object) => void;
  /** Called after a recording is stopped / video exported. */
  onVideoExport?: (blob: Blob, options: VideoExportOptions) => void;
}

export interface WhiteboardAPI {
  getCanvas: () => fabric.Canvas | null;
  toJSON: () => object;
  loadJSON: (json: object | string) => Promise<void>;
  toDataURL: (format?: string, quality?: number) => string;
  /** Start live WebM recording of the canvas. */
  startRecording: (options?: VideoExportOptions) => void;
  /** Stop recording, return WebM blob, and optionally download. */
  stopRecording: (download?: boolean) => Promise<Blob>;
  isRecording: () => boolean;
  /** @deprecated Use startRecording/stopRecording. One-shot short WebM capture. */
  toVideo: (options?: VideoExportOptions) => Promise<Blob>;
  /** @deprecated Use startRecording/stopRecording. */
  downloadVideo: (options?: VideoExportOptions) => Promise<Blob>;
  addShape: (type: ShapeType, options?: ShapeOptions) => fabric.Object | null;
  clear: (confirmClear?: boolean) => void;
  undo: () => void;
  redo: () => void;
  setDrawingMode: (enabled: boolean, tool?: 'Draw' | 'Highlighter') => void;
  deleteSelection: () => void;
  duplicateSelection: () => void;
  bringForward: () => void;
  sendBackward: () => void;
}
