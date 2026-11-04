import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@motionstudies/three'],
    include: ['@react-three/fiber', 'three'],
  },
  base: './',
  build: {
    manifest: true,
    target: 'es2022',
    rolldownOptions: {
      output: {
        // These runtime modules are all needed at startup. Compress them
        // together while leaving edition scenes and optional layers lazy.
        codeSplitting: { groups: [{ name: 'react-runtime', test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/ }] },
      },
    },
  },
})
