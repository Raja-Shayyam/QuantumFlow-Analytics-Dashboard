export const shortDate = (value: string) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};

export const longDate = (value: string) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      });
};

export const fmtDuration = (seconds: number | null | undefined) => {
  if (seconds == null) return "—";
  if (seconds < 1) return `${Math.max(1, Math.round(seconds * 1000))} ms`;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
};

export const fmtMs = (ms: number) =>
  ms < 0.01 ? "<0.01 ms" : ms < 10 ? `${ms.toFixed(2)} ms` : `${ms.toFixed(1)} ms`;

export const compact = (v: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);

export const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export const rolling = (values: number[], size = 5) =>
  values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - size + 1), i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });

/** Evenly spaced, human-friendly axis ticks covering [min, max]. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 1e-6; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

export function axisFormatter(min: number, max: number) {
  const span = Math.abs(max - min);
  const big = Math.max(Math.abs(min), Math.abs(max));
  if (big >= 10000) return (v: number) => compact(v);
  const digits = span >= 50 ? 0 : span >= 5 ? 1 : span >= 0.5 ? 2 : span >= 0.05 ? 3 : 4;
  return (v: number) => v.toFixed(digits);
}
