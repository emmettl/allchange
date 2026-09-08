/// <reference lib="dom" />

export interface WebGLDrawSample {
  draws: number
  zeroOpacityDraws: number
}

declare global {
  interface Window {
    allChangeDraws: WebGLDrawSample
  }
}

/** Observe actual WebGL submissions; no application debug hooks or timing assumptions. */
export function installWebGLDrawCounters() {
  window.allChangeDraws = { draws: 0, zeroOpacityDraws: 0 }
  const prototype = WebGL2RenderingContext.prototype
  const locations = new WeakMap<WebGLUniformLocation, { program: WebGLProgram; name: string }>()
  const opacities = new WeakMap<WebGLProgram, number>()
  const programs = new WeakMap<WebGL2RenderingContext, WebGLProgram | null>()
  const getLocation = prototype.getUniformLocation
  prototype.getUniformLocation = function (program, name) {
    const location = getLocation.call(this, program, name)
    if (location) locations.set(location, { program, name })
    return location
  }
  const uniform = prototype.uniform1f
  prototype.uniform1f = function (location, value) {
    const record = location ? locations.get(location) : undefined
    if (record?.name === 'opacity') opacities.set(record.program, value)
    uniform.call(this, location, value)
  }
  const useProgram = prototype.useProgram
  prototype.useProgram = function (program) {
    programs.set(this, program)
    useProgram.call(this, program)
  }
  function count(gl: WebGL2RenderingContext, vertices: number) {
    if (vertices === 0) return
    window.allChangeDraws.draws++
    const program = programs.get(gl)
    if (program && opacities.get(program) === 0) window.allChangeDraws.zeroOpacityDraws++
  }
  const arrays = prototype.drawArrays
  prototype.drawArrays = function (mode, first, vertices) {
    count(this, vertices)
    arrays.call(this, mode, first, vertices)
  }
  const arraysInstanced = prototype.drawArraysInstanced
  prototype.drawArraysInstanced = function (mode, first, vertices, instances) {
    count(this, vertices * instances)
    arraysInstanced.call(this, mode, first, vertices, instances)
  }
  const elementsInstanced = prototype.drawElementsInstanced
  prototype.drawElementsInstanced = function (mode, vertices, type, offset, instances) {
    count(this, vertices * instances)
    elementsInstanced.call(this, mode, vertices, type, offset, instances)
  }
  const elements = prototype.drawElements
  prototype.drawElements = function (mode, vertices, type, offset) {
    count(this, vertices)
    elements.call(this, mode, vertices, type, offset)
  }
}

export async function sampleWebGLDraws(): Promise<WebGLDrawSample> {
  // First frame lets React/R3F commit visibility after the DOM layout marker.
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  window.allChangeDraws = { draws: 0, zeroOpacityDraws: 0 }
  for (let i = 0; i < 4; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  return { ...window.allChangeDraws }
}
