import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { londonDiagramRenderer } from './scripts/london-diagram-renderer.ts'
import { londonSelectionRenderer } from './scripts/london-selection-renderer.ts'
import { londonCartographyRenderer } from './scripts/london-cartography-renderer.ts'
export default defineConfig({
  plugins: [londonDiagramRenderer(), londonSelectionRenderer(), londonCartographyRenderer(), react()],
  optimizeDeps: {
    exclude: ['@motionstudies/three'],
    include: ['@react-three/fiber', 'three'],
  },
  base: './',
  build: { manifest: true, target: 'es2022' },
})
