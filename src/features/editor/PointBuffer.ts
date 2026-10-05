/**
 * Growable typed-array buffer for the stroke in progress. The pointer handler only writes
 * numbers here (no object allocation); objects are built later, off the pointer path.
 */
export class PointBuffer {
  private data = new Float32Array(4 * 512);
  n = 0;

  push(x: number, y: number, pressure: number, t: number): void {
    if ((this.n + 1) * 4 > this.data.length) {
      const bigger = new Float32Array(this.data.length * 2);
      bigger.set(this.data);
      this.data = bigger;
    }
    const i = this.n * 4;
    this.data[i] = x;
    this.data[i + 1] = y;
    this.data[i + 2] = pressure;
    this.data[i + 3] = t;
    this.n++;
  }

  clear(): void {
    this.n = 0;
  }

  x(i: number) {
    return this.data[i * 4]!;
  }
  y(i: number) {
    return this.data[i * 4 + 1]!;
  }
  pressure(i: number) {
    return this.data[i * 4 + 2]!;
  }
  t(i: number) {
    return this.data[i * 4 + 3]!;
  }
}
