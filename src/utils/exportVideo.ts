import type { fabric } from '../components/FabricExtended';
import type { VideoExportOptions } from '../types';

const WEBM_CANDIDATES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

function pickWebmMime(override?: string): string {
  if (override && MediaRecorder.isTypeSupported(override)) {
    return override;
  }

  for (const type of WEBM_CANDIDATES) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }

  return 'video/webm';
}

function getFabricCanvases(canvas: fabric.Canvas) {
  const c = canvas as fabric.Canvas & {
    lowerCanvasEl?: HTMLCanvasElement;
    upperCanvasEl?: HTMLCanvasElement;
  };
  return {
    lower: c.lowerCanvasEl || (canvas.getElement() as HTMLCanvasElement),
    upper: c.upperCanvasEl || null,
  };
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function resolveVideoMimeType(_format = 'webm', override?: string) {
  return pickWebmMime(override);
}

/**
 * Live WebM recorder.
 * Composites Fabric's canvas onto a dedicated HTMLCanvasElement each frame,
 * then captures that canvas with MediaRecorder (required for reliable WebM output).
 */
export class CanvasRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private stream: MediaStream | null = null;
  private rafId: number | null = null;
  private stopPromise: Promise<Blob> | null = null;
  private fabricCanvas: fabric.Canvas | null = null;
  private recordCanvas: HTMLCanvasElement | null = null;
  private recordCtx: CanvasRenderingContext2D | null = null;
  private includeControls = false;

  get recording() {
    return this.recorder?.state === 'recording' || this.recorder?.state === 'paused';
  }

  /** Expose the offscreen canvas used for capture (useful for debugging). */
  getCaptureCanvas() {
    return this.recordCanvas;
  }

  start(canvas: fabric.Canvas, options: VideoExportOptions = {}) {
    if (typeof MediaRecorder === 'undefined') {
      throw new Error('MediaRecorder is not supported in this browser');
    }
    if (typeof HTMLCanvasElement === 'undefined' || !HTMLCanvasElement.prototype.captureStream) {
      throw new Error('canvas.captureStream is not supported in this browser');
    }
    if (this.recording) {
      throw new Error('Recording is already in progress');
    }

    const fps = options.fps ?? 30;
    const mimeType = pickWebmMime(options.mimeType);
    const videoBitsPerSecond = options.videoBitsPerSecond ?? 2_500_000;
    const { lower } = getFabricCanvases(canvas);

    if (!lower) {
      throw new Error('Fabric canvas element is not available for recording');
    }

    this.fabricCanvas = canvas;
    this.chunks = [];
    this.includeControls = false;

    // Dedicated recording canvas (must exist for captureStream).
    const recordCanvas = document.createElement('canvas');
    recordCanvas.width = lower.width || Math.max(1, Math.floor(canvas.getWidth()));
    recordCanvas.height = lower.height || Math.max(1, Math.floor(canvas.getHeight()));
    recordCanvas.setAttribute('data-whiteboard-recorder', 'true');
    // Keep in DOM — some browsers only encode reliably when the canvas is attached.
    recordCanvas.style.cssText =
      'position:fixed;left:-99999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(recordCanvas);

    const ctx = recordCanvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) {
      recordCanvas.remove();
      throw new Error('Could not get 2D context for recording canvas');
    }

    this.recordCanvas = recordCanvas;
    this.recordCtx = ctx;

    canvas.discardActiveObject();
    canvas.renderAll();
    this.paintFrame();

    this.stream = recordCanvas.captureStream(fps);
    if (!this.stream || this.stream.getVideoTracks().length === 0) {
      this.cleanup();
      throw new Error('Failed to create MediaStream from recording canvas');
    }

    this.recorder = new MediaRecorder(this.stream, {
      mimeType,
      videoBitsPerSecond,
    });

    this.recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    this.stopPromise = new Promise<Blob>((resolve, reject) => {
      if (!this.recorder) {
        reject(new Error('Recorder missing'));
        return;
      }

      this.recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: mimeType });
        this.cleanup();
        resolve(blob);
      };

      this.recorder.onerror = () => {
        this.cleanup();
        reject(new Error('MediaRecorder failed while recording video'));
      };
    });

    // Continuously composite Fabric → recording canvas so captureStream gets new frames.
    const interval = Math.max(16, Math.round(1000 / fps));
    let last = 0;
    const tick = (ts: number) => {
      if (!this.recording && this.recorder?.state !== 'recording') return;
      if (ts - last >= interval) {
        last = ts;
        this.paintFrame();
      }
      this.rafId = window.requestAnimationFrame(tick);
    };
    this.rafId = window.requestAnimationFrame(tick);

    this.recorder.start(250);
  }

  private paintFrame() {
    const fabricCanvas = this.fabricCanvas;
    const ctx = this.recordCtx;
    const recordCanvas = this.recordCanvas;
    if (!fabricCanvas || !ctx || !recordCanvas) return;

    fabricCanvas.renderAll();
    const { lower, upper } = getFabricCanvases(fabricCanvas);

    // Match pixel size if fabric resized mid-recording.
    if (lower && (recordCanvas.width !== lower.width || recordCanvas.height !== lower.height)) {
      recordCanvas.width = lower.width;
      recordCanvas.height = lower.height;
    }

    const bg =
      typeof fabricCanvas.backgroundColor === 'string' && fabricCanvas.backgroundColor
        ? fabricCanvas.backgroundColor
        : '#ffffff';

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, recordCanvas.width, recordCanvas.height);

    if (lower) {
      ctx.drawImage(lower, 0, 0, recordCanvas.width, recordCanvas.height);
    }
    // Skip upper canvas (selection handles) unless explicitly enabled.
    if (this.includeControls && upper) {
      ctx.drawImage(upper, 0, 0, recordCanvas.width, recordCanvas.height);
    }
    ctx.restore();
  }

  async stop(): Promise<Blob> {
    if (!this.recorder || !this.stopPromise) {
      throw new Error('No active recording');
    }

    // One last frame before stopping.
    this.paintFrame();

    if (this.recorder.state !== 'inactive') {
      this.recorder.requestData?.();
      this.recorder.stop();
    }

    return this.stopPromise;
  }

  private cleanup() {
    if (this.rafId != null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.recorder = null;
    this.fabricCanvas = null;
    this.recordCtx = null;
    if (this.recordCanvas?.parentNode) {
      this.recordCanvas.parentNode.removeChild(this.recordCanvas);
    }
    this.recordCanvas = null;
  }
}

/** @deprecated Prefer CanvasRecorder start/stop. */
export async function exportCanvasToVideo(
  canvas: fabric.Canvas,
  options: VideoExportOptions = {}
): Promise<Blob> {
  const recorder = new CanvasRecorder();
  recorder.start(canvas, options);
  const durationMs = Math.max(800, Math.round((options.duration || 2) * 1000));
  await new Promise((r) => setTimeout(r, durationMs));
  return recorder.stop();
}

export async function downloadCanvasVideo(
  canvas: fabric.Canvas,
  options: VideoExportOptions = {}
): Promise<Blob> {
  const blob = await exportCanvasToVideo(canvas, options);
  const base = options.fileName || `whiteboard-${Date.now()}`;
  downloadBlob(blob, `${base}.webm`);
  return blob;
}
