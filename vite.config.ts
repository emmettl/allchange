import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { londonDiagramRenderer } from './scripts/london-diagram-renderer.ts'
export default defineConfig({
  plugins: [londonDiagramRenderer(), react()],
  optimizeDeps: {
    exclude: ['@motionstudies/three'],
    include: ['@react-three/fiber', 'three'],
  },
  base: './',
  build: { manifest: true, target: 'es2022' },
})
