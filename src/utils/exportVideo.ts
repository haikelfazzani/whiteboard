import type { fabric } from 'fabric';
import type { VideoExportOptions } from '../types';

const WEBM_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
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

function getCaptureElement(canvas: fabric.Canvas): HTMLCanvasElement {
  return (
    (canvas as fabric.Canvas & { lowerCanvasEl?: HTMLCanvasElement }).lowerCanvasEl ||
    (canvas.getElement() as HTMLCanvasElement)
  );
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

/** Live WebM recorder with explicit start / stop. */
export class CanvasRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private stream: MediaStream | null = null;
  private pulse: number | null = null;
  private stopPromise: Promise<Blob> | null = null;
  private canvas: fabric.Canvas | null = null;

  get recording() {
    return this.recorder?.state === 'recording' || this.recorder?.state === 'paused';
  }

  start(canvas: fabric.Canvas, options: VideoExportOptions = {}) {
    if (typeof MediaRecorder === 'undefined') {
      throw new Error('MediaRecorder is not supported in this browser');
    }
    if (this.recording) {
      throw new Error('Recording is already in progress');
    }

    const fps = options.fps ?? 30;
    const mimeType = pickWebmMime(options.mimeType);
    const videoBitsPerSecond = options.videoBitsPerSecond ?? 2_500_000;
    const element = getCaptureElement(canvas);

    this.canvas = canvas;
    this.chunks = [];
    this.stream = element.captureStream(fps);
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

    // Keep fabric redrawing so captureStream receives frames while idle.
    this.pulse = window.setInterval(() => {
      this.canvas?.renderAll();
    }, Math.max(16, 1000 / fps));

    canvas.discardActiveObject();
    canvas.renderAll();
    this.recorder.start(200);
  }

  async stop(): Promise<Blob> {
    if (!this.recorder || !this.stopPromise) {
      throw new Error('No active recording');
    }

    if (this.recorder.state !== 'inactive') {
      this.recorder.stop();
    }

    return this.stopPromise;
  }

  private cleanup() {
    if (this.pulse != null) {
      window.clearInterval(this.pulse);
      this.pulse = null;
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.recorder = null;
    this.canvas = null;
  }
}

/** @deprecated Prefer CanvasRecorder start/stop. Kept for API compatibility. */
export async function exportCanvasToVideo(
  canvas: fabric.Canvas,
  options: VideoExportOptions = {}
): Promise<Blob> {
  const recorder = new CanvasRecorder();
  recorder.start(canvas, options);
  // Default short capture if caller doesn't manage stop themselves.
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
