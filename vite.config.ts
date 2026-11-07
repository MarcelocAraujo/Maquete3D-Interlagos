import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true },
  build: {
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        // separa bibliotecas pesadas em chunks próprios (melhor cache)
        manualChunks(id: string) {
          if (id.includes('node_modules/three/')) return 'three';
          if (id.includes('@react-three') || id.includes('postprocessing') || id.includes('camera-controls') || id.includes('three-mesh-bvh')) return 'r3f';
          if (id.includes('node_modules/react') || id.includes('framer-motion') || id.includes('zustand')) return 'react';
          return undefined;
        },
      },
    },
  },
});
