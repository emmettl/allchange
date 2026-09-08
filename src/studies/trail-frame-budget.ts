/** Give moving markers priority when the browser cannot sustain smooth frames. */
export class TrailFrameBudget {
  private averageFrame = 1 / 60
  private recoverySeconds = 0
  private reduced = false
  private updatedPreviousFrame = false
  private longFrames = 0

  constructor(private readonly fullInterval = 1 / 30) {}

  shouldUpdateTrail(delta: number, elapsedSinceUpdate: number, force = false): boolean {
    const interval = this.interval(delta)
    if (force) {
      this.updatedPreviousFrame = true
      return true
    }
    // A wall-clock cap alone does nothing when one frame already exceeds it.
    // Leave a frame between rebuilds under load, even below 15 FPS.
    if (this.reduced && this.updatedPreviousFrame) {
      this.updatedPreviousFrame = false
      return false
    }
    this.updatedPreviousFrame = elapsedSinceUpdate >= interval
    return this.updatedPreviousFrame
  }

  interval(delta: number): number {
    // Ignore one long resume/loading gap. Repeated very slow foreground
    // frames still need a budget, even when each one exceeds 250 ms.
    if (Number.isFinite(delta) && delta >= 0.25) {
      this.longFrames++
      if (this.longFrames < 2) return this.reduced ? 1 / 15 : this.fullInterval
      delta = 0.25
    } else this.longFrames = 0
    if (Number.isFinite(delta) && delta > 0) {
      const weight = 1 - Math.exp(-delta / 0.35)
      this.averageFrame += (delta - this.averageFrame) * weight
      if (!this.reduced && this.averageFrame > 1 / 40) {
        this.reduced = true
        this.recoverySeconds = 0
      } else if (this.reduced) {
        this.recoverySeconds = this.averageFrame < 1 / 52 ? this.recoverySeconds + delta : 0
        if (this.recoverySeconds >= 3) this.reduced = false
      }
    }
    return this.reduced ? 1 / 15 : this.fullInterval
  }
}
