/** Random integer in [min, max] inclusive (ported from utils.ts). */
export function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export interface WeightedOption<T> {
  value: T;
  weight: number;
}

/** Picks one value from a weighted list; weights are relative (need not sum to 100). */
export function weightedPick<T>(options: WeightedOption<T>[]): T {
  const total = options.reduce((sum, o) => sum + o.weight, 0);
  let roll = Math.random() * total;
  for (const o of options) {
    if (roll < o.weight) return o.value;
    roll -= o.weight;
  }
  return options[options.length - 1].value; // float rounding fallback
}
