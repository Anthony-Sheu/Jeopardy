import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In `npm run dev`, Vite serves the UI on :5173 (reachable from phones on your
// network) and forwards the realtime connection to the game server on :3000.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
