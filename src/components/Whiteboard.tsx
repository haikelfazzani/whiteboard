import React, { useEffect, useRef, useState } from 'react';
import { fabric } from './FabricHistory';
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

  const onAddShape = (objName: string) => {
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
        objType = new fabric.Textbox('Hello world', { fontSize: objOptions.fontSize });
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
        objType = new fabric.Line([50, 10, 200, 150], { ...objOptions });
        break;

      case 'image':
        inputFileRef.current.click()
        break;

      case 'sticky':
        editor.isDrawingMode = false;
        objType = new fabric.Rect({ ...objOptions, width: 100, height: 100 });
        break;

      default:
        break;
    }

    if (objName === 'image') {
      return
    }

    if (objName !== 'draw' && objName !== 'select') {
      editor.add(objType);
    }

    editor.centerObject(objType);
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

  return (<div className={'whiteboard ' + className} style={{ backgroundImage: showGrid ? backgroundImage : '' }} ref={parentRef}>
    {showObjOptions && <div className='w-100 d-flex justify-center'
      style={{ position: 'fixed', top: '10px', left: 0, zIndex: 9999, overflow: 'hidden' }}>
      <div className='d-flex bg-white br7 shadow py-1 pr-1 pl-1'>
        <div>
          <label>Font Size</label>
          <input type="number" min="1" name='fontSize' onChange={onOptionsChange} defaultValue="22" />
        </div>

        <div>
          <label>strokeWidth</label>
          <input type="number" min="1" name='strokeWidth' onChange={onOptionsChange} defaultValue="3" />
        </div>

        <div className='d-flex mr-1'>
          <div>stroke</div>
          <input type="color" name='stroke' onChange={onOptionsChange} defaultValue="#000" />
        </div>

        <div className='d-flex mr-1'>
          <div>background</div>
          <input type="color" name='fill' onChange={onOptionsChange} defaultValue="#000" />
        </div>
      </div>
    </div>}

    <div className='tools shadow'>
      <button onClick={() => { onAddShape('select') }} title="Hand"><HandIcon /></button>
      <button onClick={() => { onAddShape('draw') }} title="Pen"><PenIcon /></button>
      <button onClick={() => { onAddShape('sticky') }} title="Add Sticky"><StickyIcon /></button>
      <button onClick={() => { onAddShape('arrow') }} title="Add Arrow"><ArrowIcon /></button>
      <button onClick={() => { onAddShape('line') }} title="Add Line"><LineIcon /></button>
      <button onClick={() => { onAddShape('circle') }} title="Add Circle"><CircleIcon /></button>
      <button onClick={() => { onAddShape('rect') }} title="Add Rectangle"><RectIcon /></button>
      <button onClick={() => { onAddShape('triangle') }} title="Add Triangle"><TriangleIcon /></button>
      <button onClick={() => { onAddShape('text') }} title="Add Text"><TextIcon /></button>
      <button onClick={() => { onAddShape('image') }} title="Add Image"><ImageIcon /></button>
    </div>

    <canvas ref={canvasRef} className='canvas' />

    <div className='w-100 menu'>
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