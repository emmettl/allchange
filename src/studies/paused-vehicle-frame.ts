/** Track the last submitted buffers, not the last animation callback. Create a
 * fresh tracker when geometry, projection, data or selection inputs change. */
export class PausedVehicleFrame {
  private time = NaN
  private visibility = NaN

  needsUpdate(isPlaying: boolean, time: number, visibility: number): boolean {
    return isPlaying || this.time !== time || this.visibility !== visibility
  }

  record(time: number, visibility: number): void {
    this.time = time
    this.visibility = visibility
  }
}
