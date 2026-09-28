import { fabric } from '../components/FabricExtended';
import type { ShapeOptions, ShapeType } from '../types';

const defaultOpts = (options: ShapeOptions = {}): ShapeOptions => ({
  stroke: '#000000',
  fill: 'rgba(255, 255, 255, 0.0)',
  strokeWidth: 3,
  fontSize: 22,
  ...options,
});

function starPoints(spikes: number, outerRadius: number, innerRadius: number) {
  const points: { x: number; y: number }[] = [];
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;

  for (let i = 0; i < spikes; i++) {
    points.push({
      x: Math.cos(rot) * outerRadius,
      y: Math.sin(rot) * outerRadius,
    });
    rot += step;
    points.push({
      x: Math.cos(rot) * innerRadius,
      y: Math.sin(rot) * innerRadius,
    });
    rot += step;
  }

  return points;
}

function polygonPoints(sides: number, radius: number) {
  const points: { x: number; y: number }[] = [];
  const step = (Math.PI * 2) / sides;
  let angle = -Math.PI / 2;

  for (let i = 0; i < sides; i++) {
    points.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
    angle += step;
  }

  return points;
}

export function createShape(
  type: ShapeType,
  options: ShapeOptions = {}
): fabric.Object | null {
  const opts = defaultOpts(options);

  switch (type) {
    case 'Text':
      return new fabric.Textbox('Your text here', {
        fontSize: Number(opts.fontSize) || 22,
        fill: '#000000',
        width: 200,
      });

    case 'Sticky':
      return new fabric.Textbox('Your text here', {
        ...opts,
        backgroundColor: (opts.backgroundColor as string) || '#8bc34a',
        fill: '#ffffff',
        width: 150,
        textAlign: 'left',
        splitByGrapheme: true,
        height: 150,
        padding: 20,
      });

    case 'Circle':
      return new fabric.Circle({
        ...opts,
        radius: Number(opts.radius) || 70,
      });

    case 'Ellipse':
      return new fabric.Ellipse({
        ...opts,
        rx: Number(opts.width) || 90,
        ry: Number(opts.height) || 55,
      });

    case 'Rect':
      return new fabric.Rect({
        ...opts,
        width: Number(opts.width) || 100,
        height: Number(opts.height) || 100,
      });

    case 'RoundedRect':
      return new fabric.Rect({
        ...opts,
        width: Number(opts.width) || 120,
        height: Number(opts.height) || 80,
        rx: 16,
        ry: 16,
      });

    case 'Triangle':
      return new fabric.Triangle({
        ...opts,
        width: Number(opts.width) || 100,
        height: Number(opts.height) || 100,
      });

    case 'Diamond': {
      const size = Number(opts.width) || 100;
      return new fabric.Polygon(
        [
          { x: 0, y: -size / 2 },
          { x: size / 2, y: 0 },
          { x: 0, y: size / 2 },
          { x: -size / 2, y: 0 },
        ],
        { ...opts }
      );
    }

    case 'Star':
      return new fabric.Polygon(starPoints(5, 60, 28), { ...opts });

    case 'Hexagon':
      return new fabric.Polygon(polygonPoints(6, 60), { ...opts });

    case 'Pentagon':
      return new fabric.Polygon(polygonPoints(5, 60), { ...opts });

    case 'Arrow': {
      const triangle = new fabric.Triangle({
        ...opts,
        width: 10,
        height: 15,
        left: 235,
        top: 65,
        angle: 90,
      });
      const line = new fabric.Line([50, 100, 200, 100], {
        ...opts,
        left: 75,
        top: 70,
      });
      return new fabric.Group([line, triangle]);
    }

    case 'DoubleArrow': {
      const headRight = new fabric.Triangle({
        ...opts,
        width: 10,
        height: 15,
        left: 235,
        top: 65,
        angle: 90,
      });
      const headLeft = new fabric.Triangle({
        ...opts,
        width: 10,
        height: 15,
        left: 60,
        top: 65,
        angle: -90,
      });
      const line = new fabric.Line([50, 100, 200, 100], {
        ...opts,
        left: 75,
        top: 70,
      });
      return new fabric.Group([line, headLeft, headRight]);
    }

    case 'Line':
      return new fabric.Line([50, 10, 200, 150], {
        ...opts,
        angle: 47,
      });

    default:
      return null;
  }
}

export const GEOMETRY_SHAPES: ShapeType[] = [
  'Circle',
  'Ellipse',
  'Rect',
  'RoundedRect',
  'Triangle',
  'Diamond',
  'Star',
  'Pentagon',
  'Hexagon',
];
