import { useMemo } from "react";
import { CandlestickChart, type Candle } from "../components/charts";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  Icon,
  PageHeader,
  Progress,
  SampleTag,
} from "../components/ui";
import type { Comparison, ModelRow } from "../lib/api";
import { useApp } from "../lib/app-context";
import { DEMO_RESULT } from "../lib/demo";
import { fmtDuration, fmtMs, longDate } from "../lib/format";

function buildCandles(series: Comparison["series"]) {
  const { actual, qrc, advantage, dates } = series;
  const candles: Candle[] = actual.slice(1).map((close, i) => {
    const open = actual[i];
    const wick = Math.abs(close - open) * 0.5 + Math.abs(close) * 0.0015;
    return { open, close, high: Math.max(open, close) + wick, low: Math.min(open, close) - wick };
  });
  const prediction = qrc.slice(1);
  // A signal fires when the forecast implies a change of direction versus the previous close.
  const signals: { index: number; buy: boolean }[] = [];
  let last = 0;
  prediction.forEach((p, i) => {
    const move = p - candles[i].open;
    const dir = Math.sign(move);
    if (dir && dir !== last && Math.abs(move) > Math.abs(candles[i].open) * 0.002)
      signals.push({ index: i, buy: dir > 0 });
    if (dir) last = dir;
  });
  return { candles, prediction, zones: advantage.slice(1), signals, dates: dates.slice(1) };
}

const METRICS: {
  key: keyof ModelRow;
  label: string;
  better: "low" | "high";
  fmt: (r: ModelRow) => string;
}[] = [
  { key: "rmse", label: "RMSE", better: "low", fmt: (r) => r.rmse.toFixed(4) },
  { key: "mae", label: "MAE", better: "low", fmt: (r) => r.mae.toFixed(4) },
  { key: "r2", label: "R²", better: "high", fmt: (r) => r.r2.toFixed(3) },
  {
    key: "train_time_s",
    label: "Training",
    better: "low",
    fmt: (r) => fmtDuration(r.train_time_s),
  },
  { key: "inference_ms", label: "Inference", better: "low", fmt: (r) => fmtMs(r.inference_ms) },
];

function Insight({
  icon,
  value,
  label,
  tone,
}: {
  icon: string;
  value: string;
  label: string;
  tone: "good" | "warn" | "neutral";
}) {
  return (
    <Card className={`insight insight-${tone}`}>
      <span className="insight-icon">
        <Icon name={icon} size={18} />
      </span>
      <div>
        <b>{value}</b>
        <p>{label}</p>
      </div>
    </Card>
  );
}

export function Results() {
  const { live, latest, comparison, comparisonLoading, comparisonError, loadComparison, navigate } =
    useApp();
  const sample = !live;
  const result = live ? latest : DEMO_RESULT;
  const chart = useMemo(() => (comparison ? buildCandles(comparison.series) : null), [comparison]);

  const header = (
    <PageHeader
      eyebrow="Performance lab"
      title="Model performance report"
      description={
        result
          ? `${result.dataset.name} · every model uses the same windows and train/test split`
          : "Benchmark the quantum reservoir against classical baselines."
      }
      actions={
        comparison && (
          <>
            <span className="date-range">
              <Icon name="clock" size={16} />
              {longDate(comparison.series.dates[0])} –{" "}
              {longDate(comparison.series.dates[comparison.series.dates.length - 1])}
            </span>
            {live && (
              <Button
                variant="secondary"
                icon="refresh"
                loading={comparisonLoading}
                onClick={loadComparison}
              >
                Re-run
              </Button>
            )}
          </>
        )
      }
    />
  );

  if (live && !latest) {
    return (
      <div className="page">
        {header}
        <Card>
          <EmptyState
            icon="chart"
            title="No model to evaluate yet"
            action={
              <Button icon="arrowRight" onClick={() => navigate("model")}>
                Configure & deploy
              </Button>
            }
          >
            Deploy a model and this report will benchmark it against an MLP, linear AR, random
            forest and a naive persistence forecast.
          </EmptyState>
        </Card>
      </div>
    );
  }

  if (!comparison) {
    return (
      <div className="page">
        {header}
        <Card>
          {comparisonError ? (
            <EmptyState
              icon="alert"
              title="Benchmark failed"
              action={
                <Button variant="secondary" icon="refresh" onClick={loadComparison}>
                  Try again
                </Button>
              }
            >
              {comparisonError}
            </EmptyState>
          ) : (
            <div className="loading-block">
              <Progress
                value={0}
                indeterminate
                label="Training classical baselines on the same split…"
              />
              <p className="muted-text">This usually takes a few seconds.</p>
            </div>
          )}
        </Card>
      </div>
    );
  }

  const rows = comparison.models;
  const best = Object.fromEntries(
    METRICS.map((m) => [
      m.key,
      (m.better === "low" ? Math.min : Math.max)(...rows.map((r) => r[m.key] as number)),
    ]),
  );
  const maxRmse = Math.max(...rows.map((r) => r.rmse));
  const qrc = rows.find((r) => r.quantum)!;
  const qrcBest = qrc.rmse === best.rmse;
  const speed = comparison.inference_speedup;
  const skip = result?.config.include_input !== false;

  return (
    <div className="page">
      {header}
      {comparisonError && (
        <Callout tone="danger" icon="alert">
          {comparisonError}
        </Callout>
      )}
      <div className="insight-grid">
        <Insight
          icon="target"
          tone={
            comparison.error_reduction_pct > 1
              ? "good"
              : comparison.error_reduction_pct < -1
                ? "warn"
                : "neutral"
          }
          value={`${comparison.error_reduction_pct >= 0 ? "−" : "+"}${Math.abs(comparison.error_reduction_pct).toFixed(1)}% RMSE`}
          label={`vs ${comparison.best_classical}${Math.abs(comparison.error_reduction_pct) <= 1 ? " — effectively a tie" : ""}`}
        />
        <Insight
          icon="zap"
          tone={speed && speed >= 1 ? "good" : "warn"}
          value={
            speed
              ? `${(speed >= 1 ? speed : 1 / speed).toLocaleString(undefined, { maximumFractionDigits: speed >= 1 || 1 / speed < 10 ? 1 : 0 })}× ${speed >= 1 ? "faster" : "slower"}`
              : "—"
          }
          label={`inference vs ${comparison.best_classical} (statevector simulation)`}
        />
        <Insight
          icon="activity"
          tone="neutral"
          value={`${(comparison.noise.degradation_pct ?? 0) >= 0 ? "+" : "−"}${Math.abs(comparison.noise.degradation_pct ?? 0).toFixed(1)}% RMSE`}
          label={`under depolarizing noise p = ${comparison.noise.p} with 1024 shots`}
        />
      </div>

      <Card>
        <CardHeader
          title="Price and prediction"
          subtitle="Daily candles from the test set with the QRC forecast overlaid"
          actions={
            <>
              {sample && <SampleTag />}
              <div className="legend">
                <span>
                  <i className="lg-line" /> QRC
                </span>
                <span>
                  <i className="lg-tri up" /> Buy
                </span>
                <span>
                  <i className="lg-tri down" /> Sell
                </span>
                {chart?.zones.some(Boolean) && (
                  <span>
                    <i className="lg-zone" /> QRC beats {comparison.best_classical}
                  </span>
                )}
              </div>
            </>
          }
        />
        {chart && <CandlestickChart {...chart} />}
      </Card>

      <Card>
        <CardHeader
          title="Model comparison"
          subtitle="Held-out test set, scaled units · best value in each column is highlighted"
          actions={
            <Badge tone={skip ? "warning" : "info"} dot={false}>
              Skip connection {skip ? "on" : "off"}
            </Badge>
          }
        />
        <div className="table-wrap">
          <table className="table compare-table">
            <thead>
              <tr>
                <th>Model</th>
                {METRICS.map((m) => (
                  <th key={m.key} className="num">
                    {m.label}
                    <span className="th-hint">{m.better === "low" ? "↓" : "↑"}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.model} className={r.quantum ? "row-quantum" : ""}>
                  <td>
                    <div className="cell-title">
                      <span className={`cell-icon ${r.quantum ? "quantum" : ""}`}>
                        <Icon name={r.quantum ? "sparkles" : "chart"} size={16} />
                      </span>
                      <div>
                        <b>{r.model}</b>
                        <div className="rmse-bar" aria-hidden="true">
                          <i style={{ width: `${(r.rmse / maxRmse) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  </td>
                  {METRICS.map((m) => (
                    <td
                      key={m.key}
                      className={`num mono ${r[m.key] === best[m.key] ? "best" : ""}`}
                    >
                      {m.fmt(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {skip && (
          <Callout tone="warning" icon="beaker" title="Interpret with care">
            {qrcBest ? "QRC has the lowest RMSE, but " : ""}the readout also sees the raw input
            window. Re-deploy with the skip connection off to measure the quantum features alone.
          </Callout>
        )}
      </Card>
    </div>
  );
}
