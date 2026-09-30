# whiteboard-react

React whiteboard component powered by [Fabric.js](http://fabricjs.com/). Draw freehand, drop shapes, edit text inside shapes, undo/redo, export PNG/JSON, and record the canvas live as **WebM**.

### [Live demo](https://haikelfazzani.github.io/whiteboard/)

## Features

- Header toolbar: select, pen, highlighter, text, sticky note, arrows, line, geometry shapes, image & JSON import
- Footer toolbar: object options, grid, erase, duplicate, undo/redo, save, PNG export, JSON export, **WebM record start/stop**, clear, zoom
- Shapes: circle, ellipse, rectangle, rounded rect, triangle, diamond, star, pentagon, hexagon
- **Connect shapes**: Line / Arrow / Double Arrow — drag to draw (ends snap to shapes) or click shape A → B; bound ends follow when shapes move
- **Double-click a shape** to type text inside it
- Live **WebM** recording via a dedicated canvas composite of the Fabric board (start / stop)
- Keyboard shortcuts: `Delete`, `Esc` cancel connector, `Ctrl/Cmd+Z` undo, `Ctrl/Cmd+Y` redo, `Ctrl/Cmd+D` duplicate, `Ctrl/Cmd+S` save, `Ctrl/Cmd+O` open image
- Imperative API via `ref`
- React 19, TypeScript, Fabric 5.x

## Installation

```shell
npm install whiteboard-react fabric react-colorful
```

**Peer dependencies:** `react` / `react-dom` ^19, `fabric` `>=5.3.0 <6`, `react-colorful` ≥ 5.6

## Quick start

```jsx
import { useRef } from 'react';
import { Whiteboard } from 'whiteboard-react';

function App() {
  const boardRef = useRef(null);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Whiteboard
        ref={boardRef}
        onChange={(json) => console.log(json)}
        onVideoExport={(blob) => console.log(blob.type, blob.size)}
      />
    </div>
  );
}
```

> Styles are bundled with the component. Give the parent an explicit height (e.g. `100vh`) — the whiteboard fills it.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `className` | `string` | `''` | Extra CSS class on the root |
| `style` | `CSSProperties` | — | Inline styles on the root |
| `options` | `ShapeOptions` | — | Default stroke / fill / font for new shapes |
| `onChange` | `(json: object) => void` | — | Fired when objects are added, removed, or modified |
| `onVideoExport` | `(blob: Blob, options) => void` | — | Fired when a WebM recording stops |

## Imperative API (`ref`)

```ts
interface WhiteboardAPI {
  getCanvas: () => fabric.Canvas | null;
  toJSON: () => object;
  loadJSON: (json: object | string) => Promise<void>;
  toDataURL: (format?: string, quality?: number) => string;

  startRecording: (options?: VideoExportOptions) => void;
  stopRecording: (download?: boolean) => Promise<Blob>; // default download = true
  isRecording: () => boolean;

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
```

### Examples

```jsx
// Add shapes
boardRef.current.addShape('Star');
boardRef.current.addShape('Hexagon', { stroke: '#333', fill: 'rgba(0,0,0,0.05)' });

// Export still / JSON
const png = boardRef.current.toDataURL('png');
const json = boardRef.current.toJSON();
await boardRef.current.loadJSON(json);

// Live WebM recording
boardRef.current.startRecording({ fps: 30 });
// …draw on the board…
const blob = await boardRef.current.stopRecording(); // downloads whiteboard-*.webm
// or: await boardRef.current.stopRecording(false); // blob only, no download
```

### Shape types

`Select` · `Draw` · `Highlighter` · `Text` · `Sticky` · `Arrow` · `DoubleArrow` · `Line` · `Circle` · `Ellipse` · `Rect` · `RoundedRect` · `Triangle` · `Diamond` · `Star` · `Pentagon` · `Hexagon`

### Text inside shapes

Double-click any geometry shape to add a centered label and start typing. Double-click again later to edit it.

### Connect shapes with Line / Arrow

1. Select **Line**, **Arrow**, or **Double Arrow** in the header
2. **Drag** on the canvas to draw freely — ends snap to nearby shapes when close
3. Or **click** shape A, then **click** shape B for an edge-to-edge link
4. After a connector is created, the tool returns to **Select**
5. Drag either bound shape — the connector stays attached  
Press `Esc` to cancel connector mode.

## Local development

```shell
npm install
npm run demo          # Vite demo → http://localhost:5173/whiteboard/
npm run build         # Rollup library → lib/
npm run typecheck
npm run build:demo    # static demo → demo-dist/
npm run deploy        # publish demo-dist/ to the gh-pages branch
```

## Scripts

| Script | Description |
| --- | --- |
| `build` | Build the npm package (CJS + ESM + typings) |
| `demo` | Run the interactive demo locally |
| `build:demo` | Build the GitHub Pages demo |
| `deploy` | Deploy demo to `gh-pages` |
| `typecheck` | Run TypeScript without emitting |

## License

MIT
