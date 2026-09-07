import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { londonDiagramRenderer } from './scripts/london-diagram-renderer.ts'
import { londonNationalRailRenderer } from './scripts/london-national-rail-renderer.ts'
import { londonMotionRenderer } from './scripts/london-motion-renderer.ts'
export default defineConfig({
  plugins: [londonDiagramRenderer(), londonNationalRailRenderer(), londonMotionRenderer(), react()],
  optimizeDeps: {
    exclude: ['@motionstudies/three'],
    include: ['@react-three/fiber', 'three'],
  },
  base: './',
  build: { manifest: true, target: 'es2022' },
})
