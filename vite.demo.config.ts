import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname, 'demo'),
  base: '/whiteboard/',
  plugins: [react()],
  resolve: {
    alias: {
      // Allow demo to import the library source directly
      'whiteboard-react': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'demo-dist'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    open: false,
  },
});
