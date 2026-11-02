import type { MapMetric } from '@sewa/shared';

/**
 * Colour rules for the delay map (a "choropleth": each area filled by its value). Pure functions, no React.
 *
 * - 5 classes by QUANTILE: each colour covers about the same number of districts, so one extreme
 *   district (e.g. Kathmandu's volume) doesn't make the other 76 all the same colour.
 * - One hue, light → dark: darker = worse. For on-time rate higher is BETTER, so the scale is flipped.
 * - Areas with no value (nothing closed yet, no requests) are grey and say "no data".
 */
export const RAMP = ['#fde7ea', '#f6aab7', '#ec6a82', '#c8123a', '#7d0b22'] as const;
export const NO_DATA = '#d8dee8';

export const higherIsBetter = (metric: MapMetric) => metric === 'onTimeRate';

/** Upper bounds of classes 0..3 (class 4 = everything above). Duplicates removed for skewed data. */
export function quantileBreaks(values: number[], classes = RAMP.length): number[] {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const breaks: number[] = [];
  for (let i = 1; i < classes; i++) {
    const v = sorted[Math.min(sorted.length - 1, Math.floor((i / classes) * sorted.length))]!;
    if (breaks.at(-1) !== v) breaks.push(v);
  }
  return breaks;
}

/** Which class (0 = lightest) a value falls in. */
export function classOf(value: number, breaks: number[]): number {
  const i = breaks.findIndex((b) => value < b);
  return i === -1 ? breaks.length : i;
}

/** Colour of class `c` when there are `breaks.length + 1` classes (fewer than 5 when data is skewed). */
export function colorForClass(c: number, breaks: number[], metric: MapMetric): string {
  const steps = breaks.length + 1;
  // Spread the classes we actually have over the whole ramp, so 2 classes = lightest + darkest.
  const index = steps === 1 ? RAMP.length - 1 : Math.round((c / (steps - 1)) * (RAMP.length - 1));
  return RAMP[higherIsBetter(metric) ? RAMP.length - 1 - index : index]!;
}

export function colorFor(value: number | null | undefined, breaks: number[], metric: MapMetric): string {
  if (value === null || value === undefined) return NO_DATA;
  return colorForClass(classOf(value, breaks), breaks, metric);
}
