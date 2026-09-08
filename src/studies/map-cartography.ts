import { Float32BufferAttribute, type BufferGeometry } from 'three'

/** Timetable edges repeat per journey. Draw each exact segment once, preserving
 * the strongest source colour instead of adding light for duplicate services.
 * Nearby tracks and different paths are deliberately kept separate. */
export function compactMapLines(geometry: BufferGeometry): void {
  const points = geometry.getAttribute('position'), colours = geometry.getAttribute('color')
  const seen = new Map<string, number>(), positions: number[] = [], colors: number[] = []
  for (let i = 0; i < points.count; i += 2) {
    const a = [points.getX(i), points.getY(i), points.getZ(i)]
    const b = [points.getX(i + 1), points.getY(i + 1), points.getZ(i + 1)]
    const first = a.join(','), second = b.join(',')
    if (first === second) continue
    const forward = first < second, key = forward ? `${first}:${second}` : `${second}:${first}`
    let offset = seen.get(key)
    if (offset === undefined) {
      offset = positions.length
      seen.set(key, offset)
      positions.push(...(forward ? a : b), ...(forward ? b : a))
      if (colours) colors.push(0, 0, 0, 0, 0, 0)
    }
    if (colours) for (let end = 0; end < 2; end++) {
      const index = i + (forward ? end : 1 - end), target = offset + end * 3
      colors[target] = Math.max(colors[target], colours.getX(index))
      colors[target + 1] = Math.max(colors[target + 1], colours.getY(index))
      colors[target + 2] = Math.max(colors[target + 2], colours.getZ(index))
    }
  }
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  if (colours) geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
}

export interface MapLabelBox { left: number; right: number; top: number; bottom: number }
// Scoped to the canvas camera, so independent scenes never hide each other's labels.
export const stationLabelBoxes = new WeakMap<object, readonly MapLabelBox[]>()
export const emptyLabelBoxes: readonly MapLabelBox[] = []
