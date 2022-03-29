import React from 'react';
import { WhiteboardStore } from './WhiteboardStore';
import { CanvasEditor } from './CanvasEditor';

export function Whiteboard(props: any) {
  return <WhiteboardStore>
    <CanvasEditor {...props} />
  </WhiteboardStore>
}