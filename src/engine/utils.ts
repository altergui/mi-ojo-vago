/** Random integer in [min, max] inclusive (ported from utils.ts). */
export function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
