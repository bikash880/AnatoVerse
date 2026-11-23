import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Skelly's AI route runs in server/skelly.ts (keeps the API key off the client)
  server: { proxy: { '/api': `http://localhost:${process.env.SKELLY_PORT ?? 8787}` } },
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // Keep the heavy 3D stack in its own cacheable chunk.
        manualChunks: { three: ['three', '@react-three/fiber', '@react-three/drei'] },
      },
    },
  },
});
