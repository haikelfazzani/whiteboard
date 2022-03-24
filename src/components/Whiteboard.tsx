import React, { useEffect, useRef, useState } from 'react';
import Dropdown from './Dropdown';
import { fabric } from './FabricExtended';
import ArrowIcon from './icons/ArrowIcon';
import CircleIcon from './icons/CircleIcon';
import EraseIcon from './icons/EraseIcon';
import ExportIcon from './icons/ExportIcon';
import FlopIcon from './icons/FlopIcon';
import GridIcon from './icons/GridIcon';
import HandIcon from './icons/HandIcon';
import ImageIcon from './icons/ImageIcon';
import JsonIcon from './icons/JsonIcon';
import LineIcon from './icons/LineIcon';
import PenIcon from './icons/PenIcon';
import RectIcon from './icons/RectIcon';
import RedoIcon from './icons/RedoIcon';
import StickyIcon from './icons/StickyIcon';
import TextIcon from './icons/TextIcon';
import TrashIcon from './icons/TrashIcon';
import TriangleIcon from './icons/TriangleIcon';
import UndoIcon from './icons/UndoIcon';
import { RgbaStringColorPicker } from "react-colorful";
import PaletteIcon from './icons/PaletteIcon';
import PaintBucketIcon from './icons/PaintBucketIcon';
import GeometryIcon from './icons/GeometryIcon';
import './Whiteboard.css';
import FontSizeIcon from './icons/FontSizeIcon';

interface IProps {
  className?: string,
  options?: object
}

const backgroundImage = 'linear-gradient(to right,#dfdfdf 1px,transparent 1px),linear-gradient(to bottom,#dfdfdf 1px,transparent 1px)';

export function Whiteboard({ className, options }: IProps) {
  const parentRef = useRef<any>();
  const canvasRef = useRef<any>();
  const [editor, setEditor] = useState<any>();

  const inputFileRef = useRef<any>();

  const canvasOptions = { selectionLineWidth: 2, isDrawingMode: false };

  const [objOptions, setObjOptions] = useState({
    stroke: '#000000', fontSize: 22, fill: 'rgba(255, 255, 255, 0.0)', strokeWidth: 3, ...options
  });

  const [showObjOptions, setShowObjOptions] = useState<boolean>(false);

  const [showGrid, setShowGrid] = useState<boolean>(true);

  useEffect(() => {
    const canvas = new fabric.Canvas(canvasRef?.current, canvasOptions);
    setEditor(canvas);

    if (parentRef && parentRef.current && canvas) {
      const data = localStorage.getItem('whiteboard-cache');
      if (data) {
        canvas.loadFromJSON(JSON.parse(data), canvas.renderAll.bind(canvas));
      }

      canvas.on('mouse:down', function (event) {
        setShowObjOptions(canvas.getActiveObject() ? true : false)
      });

      canvas.setHeight(parentRef.current?.clientHeight || 0);
      canvas.setWidth(parentRef.current?.clientWidth || 0);
      canvas.renderAll();
    }

    return () => {
      canvas.off('mouse:down');
      canvas.dispose();
    }
  }, [])

  const onToolbar = (objName: string) => {
    let objType;

    switch (objName) {
      case 'select':
        editor.isDrawingMode = false;
        editor.discardActiveObject().renderAll();
        break;

      case 'draw':
        editor.isDrawingMode = true;
        editor.freeDrawingBrush.width = 5;
        editor.freeDrawingBrush.color = "rgba(255,0,0,.5)";
        break;

      case 'text':
        editor.isDrawingMode = false;
        objType = new fabric.Textbox('Your text here', { fontSize: objOptions.fontSize });
        break;

      case 'circle':
        editor.isDrawingMode = false;
        objType = new fabric.Circle({ ...objOptions, radius: 70 });
        break;

      case 'rect':
        editor.isDrawingMode = false;
        objType = new fabric.Rect({ ...objOptions, width: 100, height: 100 });
        break;

      case 'triangle':
        editor.isDrawingMode = false;
        objType = new fabric.Triangle({ ...objOptions, width: 100, height: 100 });
        break;

      case 'arrow':
        editor.isDrawingMode = false;
        const triangle = new fabric.Triangle({
          ...objOptions,
          width: 10,
          height: 15,
          left: 235,
          top: 65,
          angle: 90
        });

        const line = new fabric.Line([50, 100, 200, 100], { ...objOptions, left: 75, top: 70 });

        objType = new fabric.Group([line, triangle]);
        break;

      case 'line':
        editor.isDrawingMode = false;
        objType = new fabric.Line([50, 10, 200, 150], { ...objOptions, angle: 47 });
        break;

      case 'image':
        inputFileRef.current.click()
        break;

      case 'sticky':
        // objType = new fabric.TextboxWithPadding('Your text here', {
        //   backgroundColor: '#8bc34a',
        //   fill: '#fff',
        //   width: 150,
        //   textAlign: 'left',
        //   splitByGrapheme: true,
        //   height: 150,
        //   padding: 20
        // });
        break;

      default:
        break;
    }

    if (objName === 'image') {
      return
    }

    if (objName !== 'draw' && objName !== 'select') {
      editor.add(objType);
      editor.centerObject(objType);
    }

    editor.renderAll();
  }

  const onBottomMenu = (actionName: string) => {
    switch (actionName) {
      case 'export':
        const image = editor.toDataURL("image/png").replace("image/png", "image/octet-stream");
        window.open(image);
        break;

      case 'save':
        localStorage.setItem('whiteboard-cache', JSON.stringify(editor.toDatalessJSON()))
        break;

      case 'erase':
        const activeObject = editor.getActiveObject();
        if (activeObject) {
          editor.remove(activeObject);
        }
        break;

      case 'toJson':
        const content = JSON.stringify(editor.toDatalessJSON());
        const link = document.createElement("a");
        const file = new Blob([content], { type: 'application/json' });
        link.setAttribute('download', 'whiteboard.json');
        link.href = URL.createObjectURL(file);
        document.body.appendChild(link);
        link.click();
        link.remove();
        break;

      case 'undo':
        editor.undo()
        break;

      case 'redo':
        editor.redo()
        break;

      case 'bg-grid':
        setShowGrid(!showGrid)
        break;

      case 'clear':
        if (confirm('Are you sure to reset the whiteboard?')) {
          localStorage.removeItem('whiteboard-cache')
          editor.clearHistory();
          editor.clear();
        }
        break;

      default:
        break;
    }
  }

  const onFileChange = (e: any) => {
    const file = e.target.files[0];
    const fileType = file.type;
    const url = URL.createObjectURL(file);

    if (file && (fileType === 'image/png' || fileType === 'image/jpeg')) {
      fabric.Image.fromURL(url, function (img) {
        img.set({ width: 180, height: 180 });
        editor.add(img);
      });
    }

    if (file && fileType === 'image/svg+xml') {
      fabric.loadSVGFromURL(url, function (objects, options) {
        var svg = fabric.util.groupSVGElements(objects, options);
        svg.scaleToWidth(180);
        svg.scaleToHeight(180);
        editor.add(svg);
      });
    }
  }

  const onColorChange = (value: any, name: string) => {
    const activeObj = editor.getActiveObject();

    if (activeObj) {
      const ops = { ...objOptions, [name]: value };
      activeObj.set(name, value);
      setObjOptions(ops);
      editor.renderAll()
    }
  }

  const onOptionsChange = (e: any) => {
    let val = e.target.value;
    const name = e.target.name;
    const activeObj = editor.getActiveObject();

    if (activeObj) {
      val = isNaN(val) ? val : +val;

      const ops = { ...objOptions, [name]: val };
      activeObj.set(name, val);

      setObjOptions(ops);
      editor.renderAll()
    }
  }

  const onZoom = (e: any) => {
    editor.zoomToPoint(new fabric.Point(editor.width / 2, editor.height / 2), +e.target.value);
    const units = 10;
    const delta = new fabric.Point(units, 0);
    editor.relativePan(delta);

    e.preventDefault();
    e.stopPropagation();
  }

  return (<div className={'w-100 h-100 whiteboard ' + className} style={{ backgroundImage: showGrid ? backgroundImage : '' }} ref={parentRef}>
    {showObjOptions && <div className='w-100 d-flex justify-center'
      style={{ position: 'fixed', top: '10px', left: 0, zIndex: 9999 }}>
      <div className='top-menu d-flex'>
        <div className='d-flex align-center'>
          <label><FontSizeIcon /></label>
          <input type="number" min="1" name='fontSize' onChange={onOptionsChange} defaultValue="22" />
        </div>

        <div className='d-flex align-center'>
          <label>Stroke</label>
          <input type="number" min="1" name='strokeWidth' onChange={onOptionsChange} defaultValue="3" />
        </div>

        <Dropdown title={<PaletteIcon />}>
          <RgbaStringColorPicker onChange={(color) => { onColorChange(color, 'stroke') }} />
        </Dropdown>

        <Dropdown title={<PaintBucketIcon />}>
          <RgbaStringColorPicker onChange={(color) => { onColorChange(color, 'fill') }} />
        </Dropdown>
      </div>
    </div>}

    <div className='toolbar shadow br-7'>
      <button onClick={() => { onToolbar('select') }} title="Hand"><HandIcon /></button>
      <button onClick={() => { onToolbar('draw') }} title="Pen"><PenIcon /></button>
      <button onClick={() => { onToolbar('text') }} title="Add Text"><TextIcon /></button>
      <button onClick={() => { onToolbar('sticky') }} title="Add Sticky"><StickyIcon /></button>
      <button onClick={() => { onToolbar('arrow') }} title="Add Arrow"><ArrowIcon /></button>
      <button onClick={() => { onToolbar('line') }} title="Add Line"><LineIcon /></button>
      <Dropdown title={<GeometryIcon />}>
        <button onClick={() => { onToolbar('circle') }} title="Add Circle"><CircleIcon /></button>
        <button onClick={() => { onToolbar('rect') }} title="Add Rectangle"><RectIcon /></button>
        <button onClick={() => { onToolbar('triangle') }} title="Add Triangle"><TriangleIcon /></button>
      </Dropdown>
      <button onClick={() => { onToolbar('image') }} title="Add Image"><ImageIcon /></button>
    </div>

    <canvas ref={canvasRef} className='canvas' />

    <div className='w-100 bottom-menu'>
      <div className='d-flex align-center bg-white br-7 shadow pr-1 pl-1'>feedback</div>

      <div className='d-flex align-center bg-white br-7 shadow'>
        <button onClick={() => { onBottomMenu('bg-grid') }} title="Grid"><GridIcon /></button>
        <button onClick={() => { onBottomMenu('erase') }} title="Eraser"><EraseIcon /></button>
        <button onClick={() => { onBottomMenu('undo') }} title="Undo"><RedoIcon /></button>
        <button onClick={() => { onBottomMenu('redo') }} title="Redo"><UndoIcon /></button>
        <button onClick={() => { onBottomMenu('save') }} title="Save"><FlopIcon /></button>
        <button onClick={() => { onBottomMenu('export') }} title="Export PNG"><ExportIcon /></button>
        <button onClick={() => { onBottomMenu('toJson') }} title="Export Json"><JsonIcon /></button>
        <button onClick={() => { onBottomMenu('clear') }} title="Reset"><TrashIcon /></button>
      </div>

      <select className='d-flex align-center bg-white br-7 shadow border-0 pr-1 pl-1' onChange={onZoom} defaultValue="1">
        <option value="2">200%</option>
        <option value="1.5">150%</option>
        <option value="1">100%</option>
        <option value="0.75">75%</option>
        <option value="0.50">50%</option>
        <option value="0.25">25%</option>
      </select>

      <input ref={inputFileRef} type="file" onChange={onFileChange} accept="image/svg+xml, image/gif, image/jpeg, image/png" hidden />
    </div>
  </div>)
}