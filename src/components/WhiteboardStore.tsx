import React, { createContext, useState } from 'react';

const WhiteboardContext = createContext<any>(null);

const initState = {
  canvasOptions : { selectionLineWidth: 2, isDrawingMode: false },
  backgroundImage: 'linear-gradient(to right,#dfdfdf 1px,transparent 1px),linear-gradient(to bottom,#dfdfdf 1px,transparent 1px)'
}

function WhiteboardStore(props: any) {
  const [gstate, setGState] = useState(initState);
  return (<WhiteboardContext.Provider value={{ gstate, setGState }}>{props.children}</WhiteboardContext.Provider>);
}

export { WhiteboardContext, WhiteboardStore };