import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { axisFormatter, longDate, niceTicks, shortDate } from "../lib/format";

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

const pathFrom = (points: [number, number][]) =>
  points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");

export interface LineSeries {
  label: string;
  values: number[];
  color: string;
  dashed?: boolean;
  glow?: boolean;
  area?: boolean;
}

export function LineChart({
  dates,
  series,
  band,
  height = 280,
  format,
  ariaLabel,
  showXAxis = true,
}: {
  dates: string[];
  series: LineSeries[];
  band?: { lower: number[]; upper: number[]; label: string };
  height?: number;
  format?: (v: number) => string;
  ariaLabel: string;
  showXAxis?: boolean;
}) {
  const [ref, width] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId().replace(/:/g, "");
  const n = series[0]?.values.length ?? 0;
  const all = [
    ...series.flatMap((s) => s.values),
    ...(band ? [...band.lower, ...band.upper] : []),
  ].filter(Number.isFinite);
  const rawMin = Math.min(...all),
    rawMax = Math.max(...all);
  const pad = (rawMax - rawMin) * 0.08 || Math.abs(rawMax) * 0.05 || 1;
  const ticks = niceTicks(rawMin - pad, rawMax + pad, 4);
  const min = Math.min(rawMin - pad, ticks[0] ?? rawMin),
    max = Math.max(rawMax + pad, ticks[ticks.length - 1] ?? rawMax);
  const fmt = format ?? axisFormatter(min, max);
  const m = { top: 12, right: 16, bottom: showXAxis ? 28 : 8, left: 52 };
  const w = Math.max(0, width - m.left - m.right),
    h = height - m.top - m.bottom;
  const x = (i: number) => m.left + (n <= 1 ? w / 2 : (i / (n - 1)) * w);
  const y = (v: number) => m.top + h - ((v - min) / (max - min || 1)) * h;
  const tickCount = Math.max(2, Math.min(6, n, Math.floor(w / 90)));
  const xTicks =
    showXAxis && n > 1
      ? Array.from({ length: tickCount }, (_, k) => Math.round((k * (n - 1)) / (tickCount - 1)))
      : [];

  if (n < 2)
    return (
      <div className="chart-empty" style={{ height }}>
        Not enough data to chart
      </div>
    );
  return (
    <div ref={ref} className="chart" style={{ height }} onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          <defs>
            <filter id={`glow${uid}`} x="-10%" y="-30%" width="120%" height="160%">
              <feGaussianBlur stdDeviation="3.5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {series.map((s, i) => (
              <linearGradient key={i} id={`fill${uid}${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop stopColor={s.color} stopOpacity="0.32" />
                <stop offset="1" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={m.left + w} y1={y(t)} y2={y(t)} className="grid-line" />
              <text
                x={m.left - 10}
                y={y(t)}
                className="axis-text"
                textAnchor="end"
                dominantBaseline="middle"
              >
                {fmt(t)}
              </text>
            </g>
          ))}
          {xTicks.map((i) => (
            <text
              key={i}
              x={x(i)}
              y={height - 8}
              className="axis-text"
              textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
            >
              {dates[i] ? shortDate(dates[i]) : i + 1}
            </text>
          ))}
          {band && (
            <path
              d={`${pathFrom(band.upper.map((v, i) => [x(i), y(v)] as [number, number]))}${pathFrom(band.lower.map((v, i) => [x(i), y(v)] as [number, number]).reverse()).replace("M", "L")}Z`}
              fill="var(--cyan)"
              opacity="0.1"
            />
          )}
          {series.map((s, si) => {
            const pts = s.values.map((v, i) => [x(i), y(v)] as [number, number]);
            return (
              <g key={s.label}>
                {s.area && (
                  <path
                    d={`${pathFrom(pts)}L${x(n - 1)},${m.top + h}L${x(0)},${m.top + h}Z`}
                    fill={`url(#fill${uid}${si})`}
                  />
                )}
                <path
                  d={pathFrom(pts)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={s.glow ? 2.25 : 2}
                  strokeDasharray={s.dashed ? "6 5" : undefined}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  filter={s.glow ? `url(#glow${uid})` : undefined}
                />
              </g>
            );
          })}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={m.top} y2={m.top + h} className="crosshair" />
              {series.map((s) => (
                <circle
                  key={s.label}
                  cx={x(hover)}
                  cy={y(s.values[hover])}
                  r="4.5"
                  fill="var(--bg)"
                  stroke={s.color}
                  strokeWidth="2"
                />
              ))}
            </g>
          )}
          <rect
            x={m.left}
            y={m.top}
            width={w}
            height={h}
            fill="transparent"
            onMouseMove={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              setHover(
                Math.max(
                  0,
                  Math.min(n - 1, Math.round(((e.clientX - box.left) / box.width) * (n - 1))),
                ),
              );
            }}
          />
        </svg>
      )}
      {hover !== null && width > 0 && (
        <div
          className="tooltip"
          style={{
            left: x(hover),
            top: m.top,
            transform: `translateX(${x(hover) > width * 0.6 ? "calc(-100% - 14px)" : "14px"})`,
          }}
        >
          <div className="tooltip-title">
            {dates[hover] ? longDate(dates[hover]) : `Point ${hover + 1}`}
          </div>
          {series.map((s) => (
            <div key={s.label} className="tooltip-row">
              <i style={{ background: s.color }} />
              <span>{s.label}</span>
              <b>{fmt(s.values[hover])}</b>
            </div>
          ))}
          {band && (
            <div className="tooltip-row muted">
              <i />
              <span>{band.label}</span>
              <b>
                {fmt(band.lower[hover])} – {fmt(band.upper[hover])}
              </b>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Sparkline({
  values,
  color = "var(--cyan)",
  height = 36,
}: {
  values: number[];
  color?: string;
  height?: number;
}) {
  const uid = useId().replace(/:/g, "");
  const data = values.length > 1 ? values : [0.5, 0.5];
  const lo = Math.min(...data),
    hi = Math.max(...data);
  const pts = data
    .map(
      (v, i) =>
        `${(i / (data.length - 1)) * 100},${hi === lo ? 50 : 92 - ((v - lo) / (hi - lo)) * 84}`,
    )
    .join(" ");
  return (
    <svg
      className="sparkline"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ height }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`sp${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,100 ${pts} 100,100`} fill={`url(#sp${uid})`} />
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface Candle {
  open: number;
  close: number;
  high: number;
  low: number;
}

export function CandlestickChart({
  dates,
  candles,
  prediction,
  zones,
  signals,
  height = 320,
}: {
  dates: string[];
  candles: Candle[];
  prediction: number[];
  zones: boolean[];
  signals: { index: number; buy: boolean }[];
  height?: number;
}) {
  const [ref, width] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId().replace(/:/g, "");
  const n = candles.length;
  const values = candles.flatMap((c) => [c.high, c.low]).concat(prediction);
  const rawMin = Math.min(...values),
    rawMax = Math.max(...values);
  const pad = (rawMax - rawMin) * 0.12 || 1;
  const ticks = niceTicks(rawMin - pad, rawMax + pad, 4);
  const min = Math.min(rawMin - pad, ticks[0]),
    max = Math.max(rawMax + pad, ticks[ticks.length - 1]);
  const fmt = axisFormatter(min, max);
  const m = { top: 14, right: 16, bottom: 28, left: 56 };
  const w = Math.max(0, width - m.left - m.right),
    h = height - m.top - m.bottom;
  const step = w / Math.max(1, n);
  const x = (i: number) => m.left + step * (i + 0.5);
  const y = (v: number) => m.top + h - ((v - min) / (max - min || 1)) * h;
  const body = Math.max(2, Math.min(10, step * 0.55));
  const runs = useMemo(() => {
    const out: [number, number][] = [];
    zones.forEach((z, i) => {
      if (!z) return;
      const last = out[out.length - 1];
      if (last && last[1] === i - 1) last[1] = i;
      else out.push([i, i]);
    });
    return out.filter(([a, b]) => b - a >= 2);
  }, [zones]);
  const signalAt = new Map(signals.map((s) => [s.index, s.buy]));
  const tickCount = Math.max(2, Math.min(6, n, Math.floor(w / 90)));
  const xTicks = Array.from({ length: tickCount }, (_, k) =>
    Math.round((k * (n - 1)) / Math.max(1, tickCount - 1)),
  );

  return (
    <div ref={ref} className="chart" style={{ height }} onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="Price candlesticks with QRC prediction overlay"
        >
          <defs>
            <linearGradient id={`zone${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="var(--purple)" stopOpacity="0.2" />
              <stop offset="1" stopColor="var(--purple)" stopOpacity="0.04" />
            </linearGradient>
            <filter id={`cg${uid}`} x="-10%" y="-30%" width="120%" height="160%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {runs.map(([a, b]) => (
            <rect
              key={a}
              x={x(a) - step / 2}
              y={m.top}
              width={(b - a + 1) * step}
              height={h}
              fill={`url(#zone${uid})`}
              className="zone"
            />
          ))}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={m.left + w} y1={y(t)} y2={y(t)} className="grid-line" />
              <text
                x={m.left - 10}
                y={y(t)}
                className="axis-text"
                textAnchor="end"
                dominantBaseline="middle"
              >
                {fmt(t)}
              </text>
            </g>
          ))}
          {xTicks.map((i) => (
            <text key={i} x={x(i)} y={height - 8} className="axis-text" textAnchor="middle">
              {dates[i] ? shortDate(dates[i]) : ""}
            </text>
          ))}
          {candles.map((c, i) => {
            const up = c.close >= c.open,
              color = up ? "var(--green)" : "var(--red)";
            return (
              <g key={i} opacity={hover === null || hover === i ? 1 : 0.55}>
                <line
                  x1={x(i)}
                  x2={x(i)}
                  y1={y(c.high)}
                  y2={y(c.low)}
                  stroke={color}
                  strokeWidth="1.2"
                />
                <rect
                  x={x(i) - body / 2}
                  y={Math.min(y(c.open), y(c.close))}
                  width={body}
                  height={Math.max(1.5, Math.abs(y(c.open) - y(c.close)))}
                  rx="1"
                  fill={up ? color : "var(--bg)"}
                  stroke={color}
                  strokeWidth="1.2"
                />
              </g>
            );
          })}
          <path
            d={pathFrom(prediction.map((p, i) => [x(i), y(p)]))}
            fill="none"
            stroke="var(--cyan)"
            strokeWidth="2.25"
            strokeLinejoin="round"
            filter={`url(#cg${uid})`}
          />
          {signals.map(({ index, buy }) => {
            const c = candles[index];
            const cx = x(index);
            return buy ? (
              <path key={`b${index}`} d={`M${cx},${y(c.low) + 8}l-6,10h12z`} fill="var(--green)" />
            ) : (
              <path key={`s${index}`} d={`M${cx},${y(c.high) - 8}l-6,-10h12z`} fill="var(--red)" />
            );
          })}
          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={m.top} y2={m.top + h} className="crosshair" />
          )}
          <rect
            x={m.left}
            y={m.top}
            width={w}
            height={h}
            fill="transparent"
            onMouseMove={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              setHover(
                Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - box.left) / box.width) * n))),
              );
            }}
          />
        </svg>
      )}
      {hover !== null && width > 0 && candles[hover] && (
        <div
          className="tooltip"
          style={{
            left: x(hover),
            top: m.top,
            transform: `translateX(${x(hover) > width * 0.6 ? "calc(-100% - 14px)" : "14px"})`,
          }}
        >
          <div className="tooltip-title">
            {dates[hover] ? longDate(dates[hover]) : `Day ${hover + 1}`}
          </div>
          {(
            [
              ["Open", candles[hover].open],
              ["Close", candles[hover].close],
              ["High", candles[hover].high],
              ["Low", candles[hover].low],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="tooltip-row">
              <i style={{ background: "var(--text-3)" }} />
              <span>{k}</span>
              <b>{fmt(v)}</b>
            </div>
          ))}
          <div className="tooltip-row">
            <i style={{ background: "var(--cyan)" }} />
            <span>QRC</span>
            <b>{fmt(prediction[hover])}</b>
          </div>
          {signalAt.has(hover) && (
            <div className={`tooltip-signal ${signalAt.get(hover) ? "buy" : "sell"}`}>
              {signalAt.get(hover) ? "Buy signal" : "Sell signal"}
            </div>
          )}
          {zones[hover] && (
            <div className="tooltip-signal zone">QRC error below best classical</div>
          )}
        </div>
      )}
    </div>
  );
}

export function Heatmap({ matrix }: { matrix: number[][] }) {
  const [hover, setHover] = useState<[number, number] | null>(null);
  const n = matrix.length;
  const value = hover ? matrix[hover[0]][hover[1]] : null;
  return (
    <div className="heatmap">
      <div
        className="heatmap-grid"
        style={{ gridTemplateColumns: `20px repeat(${n}, 1fr)` }}
        onMouseLeave={() => setHover(null)}
      >
        <span />
        {matrix.map((_, c) => (
          <span key={`h${c}`} className={`heatmap-label ${hover?.[1] === c ? "active" : ""}`}>
            q{c}
          </span>
        ))}
        {matrix.map((row, r) => (
          <div key={r} className="heatmap-row">
            <span className={`heatmap-label ${hover?.[0] === r ? "active" : ""}`}>q{r}</span>
            {row.map((v, c) => (
              <button
                type="button"
                key={c}
                className="heatmap-cell"
                aria-label={`q${r} to q${c}: ${v.toFixed(2)}`}
                onMouseEnter={() => setHover([r, c])}
                onFocus={() => setHover([r, c])}
                style={{
                  background: `color-mix(in srgb, var(--cyan) ${Math.min(1, Math.abs(v)) * 88}%, #2a1d5c)`,
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="heatmap-side">
        <div className="heatmap-readout">
          {hover ? (
            <>
              <span>
                q{hover[0]} ↔ q{hover[1]}
              </span>
              <b>{value!.toFixed(2)}</b>
            </>
          ) : (
            <span>Hover a cell</span>
          )}
        </div>
        <div className="heatmap-legend">
          <span>|r| = 1</span>
          <i />
          <span>0</span>
        </div>
      </div>
    </div>
  );
}
