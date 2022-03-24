import React, { useEffect, useRef, useState } from 'react';
import { fabric } from './FabricHistory';

interface IProps {
  className?: string,
  options?: object
}

export function Editor({ className, options }: IProps) {
  const parentRef = useRef<any>();
  const canvasRef = useRef<any>();
  const [editor, setEditor] = useState<any>();

  const canvasOptions = { selectionLineWidth: 2, isDrawingMode: false };
  const shapeOptions = { stroke: '#000000', fill: 'rgba(255, 255, 255, 0.0)', strokeWidth: 3, ...options };

  useEffect(() => {
    const canvas = new fabric.Canvas(canvasRef?.current, canvasOptions);
    setEditor(canvas);

    if (parentRef && parentRef.current && canvas) {
      const data = localStorage.getItem('react-fabric');
      if (data) {
        canvas.loadFromJSON(JSON.parse(data), canvas.renderAll.bind(canvas));
      }

      canvas.setHeight(parentRef.current?.clientHeight || 0);
      canvas.setWidth(parentRef.current?.clientWidth || 0);
      canvas.renderAll();
    }

    return () => {
      canvas.dispose()
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
        objType = new fabric.Textbox('Hello world', { left: 100, top: 100, angle: 0 });
        break;

      case 'circle':
        editor.isDrawingMode = false;
        objType = new fabric.Circle({ ...shapeOptions, radius: 70, left: 100, top: 100 });
        break;

      case 'rect':
        editor.isDrawingMode = false;
        objType = new fabric.Rect({ ...shapeOptions, width: 100, height: 100 });
        break;

      default:
        break;
    }

    if (objName !== 'draw' && objName !== 'select') {
      editor.add(objType);
    }

    editor.renderAll();
  }

  const onMenu = (actionName: string) => {
    switch (actionName) {
      case 'save':
        localStorage.setItem('react-fabric', JSON.stringify(editor.toDatalessJSON()))
        break;

      case 'erase':
        const activeObject = editor.getActiveObject();

        if (activeObject && confirm('Are you sure?')) {
          editor.remove(activeObject);
        }
        break;

      case 'toJson':
        //editor.toDatalessJSON()
        break;

      case 'undo':
        editor.undo()
        break;

      case 'redo':
        editor.redo()
        break;

      default:
        break;
    }
  }

  return (<div className={className} ref={parentRef}>
    <div className='w-100 d-flex justify-between'>
      <div>
        <button onClick={() => { onAddShape('select') }}>hand</button>
        <button onClick={() => { onAddShape('draw') }}>draw</button>
        <button onClick={() => { onAddShape('circle') }}>circle</button>
        <button onClick={() => { onAddShape('rect') }}>Rectangle</button>
        <button onClick={() => { onAddShape('text') }}>text</button>
      </div>

      <div>
        <button onClick={() => { onMenu('erase') }}>erase</button>
        <button onClick={() => { onMenu('undo') }}>undo</button>
        <button onClick={() => { onMenu('redo') }}>redo</button>
        <button onClick={() => { onMenu('save') }}>save</button>
        <button onClick={() => { onMenu('toJson') }}>toJson</button>
      </div>
    </div>

    <canvas ref={canvasRef} className='canvas' />
  </div>)
}