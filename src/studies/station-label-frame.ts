import { Matrix4, Vector3, PerspectiveCamera, type Camera } from 'three'

function sameNames(first: ReadonlySet<string>, second: ReadonlySet<string>) {
  if (first.size !== second.size) return false
  for (const name of first) if (!second.has(name)) return false
  return true
}

/** Station anchors stay fixed between camera/layout changes. Retention is also
 * an input: allow the next layout to settle its priorities before reusing it. */
export class StationLabelFrame {
  private view = new Matrix4()
  private projection = new Matrix4()
  private width = 0
  private height = 0
  private position = new Vector3()
  private fov = 44
  private repopulate = false
  private retained = new Set<string>()
  private sampled = false

  shouldUpdate(camera: Camera, size: { width: number; height: number },
    canRepopulate: boolean, retained: ReadonlySet<string>): boolean {
    const fov = camera instanceof PerspectiveCamera ? camera.fov : 44
    if (this.sampled && this.width === size.width && this.height === size.height
      && this.position.equals(camera.position) && this.fov === fov && this.repopulate === canRepopulate
      && this.view.equals(camera.matrixWorldInverse) && this.projection.equals(camera.projectionMatrix)
      && sameNames(this.retained, retained)) return false
    this.sampled = true
    this.view.copy(camera.matrixWorldInverse)
    this.projection.copy(camera.projectionMatrix)
    this.width = size.width
    this.height = size.height
    this.position.copy(camera.position)
    this.fov = fov
    this.repopulate = canRepopulate
    this.retained = new Set(retained)
    return true
  }
}
