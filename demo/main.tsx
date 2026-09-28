import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Whiteboard } from '../src';
import './style.css';

function Demo() {
  return (
    <div className="demo-shell">
      <Whiteboard
        onVideoExport={(blob) => {
          console.log('WebM ready', blob.type, blob.size);
        }}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Demo />
  </StrictMode>
);
