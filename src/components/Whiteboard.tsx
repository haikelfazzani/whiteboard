import React, { forwardRef } from 'react';
import { WhiteboardStore } from './WhiteboardStore';
import { CanvasEditor } from './CanvasEditor';
import type { WhiteboardAPI, WhiteboardProps } from '../types';

export const Whiteboard = forwardRef<WhiteboardAPI, WhiteboardProps>(
  function Whiteboard(props, ref) {
    return (
      <WhiteboardStore>
        <CanvasEditor ref={ref} {...props} />
      </WhiteboardStore>
    );
  }
);

export default Whiteboard;
