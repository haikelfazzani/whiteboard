import React, { createContext, useMemo, useState, type ReactNode } from 'react';

export interface WhiteboardGlobalState {
  canvasOptions: {
    selectionLineWidth: number;
    isDrawingMode: boolean;
  };
  backgroundImage: string;
}

interface WhiteboardContextValue {
  gstate: WhiteboardGlobalState;
  setGState: React.Dispatch<React.SetStateAction<WhiteboardGlobalState>>;
}

const WhiteboardContext = createContext<WhiteboardContextValue>({
  gstate: {
    canvasOptions: { selectionLineWidth: 2, isDrawingMode: false },
    backgroundImage:
      'linear-gradient(to right,#dfdfdf 1px,transparent 1px),linear-gradient(to bottom,#dfdfdf 1px,transparent 1px)',
  },
  setGState: () => undefined,
});

const initState: WhiteboardGlobalState = {
  canvasOptions: { selectionLineWidth: 2, isDrawingMode: false },
  backgroundImage:
    'linear-gradient(to right,#dfdfdf 1px,transparent 1px),linear-gradient(to bottom,#dfdfdf 1px,transparent 1px)',
};

function WhiteboardStore({ children }: { children: ReactNode }) {
  const [gstate, setGState] = useState<WhiteboardGlobalState>(initState);
  const value = useMemo(() => ({ gstate, setGState }), [gstate]);

  return (
    <WhiteboardContext.Provider value={value}>{children}</WhiteboardContext.Provider>
  );
}

export { WhiteboardContext, WhiteboardStore };
