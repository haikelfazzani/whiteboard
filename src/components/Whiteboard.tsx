import React, { useEffect, useRef, useState } from 'react';
import { fabric } from './FabricExtended';
import { RgbaStringColorPicker } from "react-colorful";
import Dropdown from './Dropdown';
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
import UndoIcon from './icons/UndoIcon';
import StickyIcon from './icons/StickyIcon';
import TextIcon from './icons/TextIcon';
import TrashIcon from './icons/TrashIcon';
import TriangleIcon from './icons/TriangleIcon';
import RedoIcon from './icons/RedoIcon';
import GeometryIcon from './icons/GeometryIcon';
import './Whiteboard.css';
import CogIcon from './icons/CogIcon';

interface IProps {
  className?: string,
  options?: object
}

const bottomMenu = [
  { title: 'Show Object Options', icon: <CogIcon /> },
  { title: 'Grid', icon: <GridIcon /> },
  { title: 'Erase', icon: <EraseIcon /> },
  { title: 'Undo', icon: <UndoIcon /> },
  { title: 'Redo', icon: <RedoIcon /> },
  { title: 'Save', icon: <FlopIcon /> },
  { title: 'Export', icon: <ExportIcon /> },
  { title: 'ToJson', icon: <JsonIcon /> },
  { title: 'Clear', icon: <TrashIcon /> }
];

const toolbar = [
  { title: 'Select', icon: <HandIcon /> },
  { title: 'Draw', icon: <PenIcon /> },
  { title: 'Text', icon: <TextIcon /> },
  { title: 'Sticky', icon: <StickyIcon /> },
  { title: 'Arrow', icon: <ArrowIcon /> },
  { title: 'Line', icon: <LineIcon /> }
];

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

  const [colorProp, setColorProp] = useState<string>('background')

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

      // canvas.on('mouse:down', function (event) {
      //   setShowObjOptions(canvas.getActiveObject() ? true : false)
      // });

      canvas.setHeight(parentRef.current?.clientHeight || 0);
      canvas.setWidth(parentRef.current?.clientWidth || 0);
      canvas.renderAll();
    }

    return () => {
      //canvas.off('mouse:down');
      canvas.dispose();
    }
  }, [])

  const onToolbar = (objName: string) => {
    let objType;

    switch (objName) {
      case 'Select':
        editor.isDrawingMode = false;
        editor.discardActiveObject().renderAll();
        break;

      case 'Draw':
        if (editor) {
          editor.isDrawingMode = true;
          editor.freeDrawingBrush.width = 5;
          editor.freeDrawingBrush.color = "rgba(255,0,0,.5)";
        }
        break;

      case 'Text':
        editor.isDrawingMode = false;
        objType = new fabric.Textbox('Your text here', { fontSize: objOptions.fontSize });
        break;

      case 'Circle':
        editor.isDrawingMode = false;
        objType = new fabric.Circle({ ...objOptions, radius: 70 });
        break;

      case 'Rect':
        editor.isDrawingMode = false;
        objType = new fabric.Rect({ ...objOptions, width: 100, height: 100 });
        break;

      case 'Triangle':
        editor.isDrawingMode = false;
        objType = new fabric.Triangle({ ...objOptions, width: 100, height: 100 });
        break;

      case 'Arrow':
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

      case 'Line':
        editor.isDrawingMode = false;
        objType = new fabric.Line([50, 10, 200, 150], { ...objOptions, angle: 47 });
        break;

      case 'Image':
        inputFileRef.current.click()
        break;

      case 'Sticky':
        objType = new fabric.Textbox('Your text here', {
          ...objOptions,
          backgroundColor: '#8bc34a',
          fill: '#fff',
          width: 150,
          textAlign: 'left',
          splitByGrapheme: true,
          height: 150,
          padding: 20
        });
        break;

      default:
        break;
    }

    if (objName === 'Image') {
      return
    }

    if (objName !== 'Draw' && objName !== 'Select') {
      editor.add(objType);
      editor.centerObject(objType);
    }

    editor.renderAll();
  }

  const onBottomMenu = (actionName: string) => {
    switch (actionName) {
      case 'Show Object Options':
        setShowObjOptions(!showObjOptions);
      break;

      case 'Export':
        const image = editor.toDataURL("image/png").replace("image/png", "image/octet-stream");
        window.open(image);
        break;

      case 'Save':
        localStorage.setItem('whiteboard-cache', JSON.stringify(editor.toDatalessJSON()))
        break;

      case 'Erase':
        const activeObject = editor.getActiveObject();
        if (activeObject) {
          editor.remove(activeObject);
        }
        break;

      case 'ToJson':
        const content = JSON.stringify(editor.toDatalessJSON());
        const link = document.createElement("a");
        const file = new Blob([content], { type: 'application/json' });
        link.setAttribute('download', 'whiteboard.json');
        link.href = URL.createObjectURL(file);
        document.body.appendChild(link);
        link.click();
        link.remove();
        break;

      case 'Undo':
        editor.undo()
        break;

      case 'Redo':
        editor.redo()
        break;

      case 'Grid':
        setShowGrid(!showGrid)
        break;

      case 'Clear':
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
        editor.centerObject(img);
        editor.add(img);
      });
    }

    if (file && fileType === 'image/svg+xml') {
      fabric.loadSVGFromURL(url, function (objects, options) {
        var svg = fabric.util.groupSVGElements(objects, options);
        svg.scaleToWidth(180);
        svg.scaleToHeight(180);
        editor.centerObject(svg);
        editor.add(svg);
      });
    }
  }

  const onRadioColor = (e: any) => {
    setColorProp(e.target.value);
  }

  const onColorChange = (value: any) => {
    const activeObj = editor.getActiveObject();

    if (activeObj) {
      const ops = { ...objOptions, [colorProp]: value };
      activeObj.set(colorProp, value);
      setObjOptions(ops);
      editor.renderAll()
    }
    else {
      if (colorProp === 'backgroundColor') {
        editor.backgroundColor = value;
        editor.renderAll()
      }
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
    {showObjOptions && <div className='left-menu'>
      <div className='bg-white d-flex align-center justify-between shadow br-7'>
        <label>Font size</label>
        <input type="number" min="1" name='fontSize' onChange={onOptionsChange} defaultValue="22" />
      </div>

      <div className='bg-white d-flex align-center justify-between shadow br-7'>
        <label>Stroke</label>
        <input type="number" min="1" name='strokeWidth' onChange={onOptionsChange} defaultValue="3" />
      </div>

      <div className='bg-white d-flex flex-column shadow br-7'>
        <div className='d-flex align-end mb-10'>
          <input className='mr-10' type="radio" onChange={onRadioColor} name="color" defaultValue="backgroundColor" />
          <label htmlFor='backgroundColor'>background</label>
        </div>
        <div className='d-flex align-end mb-10'>
          <input className='mr-10' type="radio" onChange={onRadioColor} id="stroke" name="color" defaultValue="stroke" />
          <label htmlFor='stroke'>stroke</label>
        </div>

        <div className='d-flex align-end mb-10'>
          <input className='mr-10' type="radio" onChange={onRadioColor} id="fill" name="color" defaultValue="fill" />
          <label htmlFor='fill'>fill</label>
        </div>

        <RgbaStringColorPicker onChange={onColorChange} />
      </div>
    </div>}


    <div className='w-100 d-flex justify-center align-center' style={{ position: 'fixed', top: '10px', left: 0, zIndex: 9999 }}>
      <div className='bg-white d-flex justify-center align-center shadow br-7'>
        {toolbar.map(item => <button key={item.title} onClick={() => { onToolbar(item.title) }} title={item.title}>{item.icon}</button>)}
        <Dropdown title={<GeometryIcon />}>
          <button onClick={() => { onToolbar('Circle') }} title="Add Circle"><CircleIcon /></button>
          <button onClick={() => { onToolbar('Rect') }} title="Add Rectangle"><RectIcon /></button>
          <button onClick={() => { onToolbar('Triangle') }} title="Add Triangle"><TriangleIcon /></button>
        </Dropdown>
        <button onClick={() => { onToolbar('Image') }} title="Add Image"><ImageIcon /></button>
      </div>
    </div>

    <canvas ref={canvasRef} className='canvas' />

    <div className='w-100 bottom-menu'>
      <div className='d-flex align-center bg-white br-7 shadow pr-1 pl-1'>feedback</div>

      <div className='d-flex align-center bg-white br-7 shadow'>
        {bottomMenu.map(item => <button key={item.title} onClick={() => { onBottomMenu(item.title) }} title={item.title}>{item.icon}</button>)}
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