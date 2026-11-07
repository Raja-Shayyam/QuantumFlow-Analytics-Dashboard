import { Heatmap, LineChart, Sparkline } from "../components/charts";
import { QuantumCircuit } from "../components/circuit";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Icon,
  IconButton,
  PageHeader,
  SampleTag,
  type Tone,
} from "../components/ui";
import type { Backend, TrainResult } from "../lib/api";
import { useApp } from "../lib/app-context";
import { DEMO_RESULT } from "../lib/demo";
import { fmtMs, rolling, titleCase } from "../lib/format";

export const backendTone = (s: Backend["status"]): Tone =>
  s === "online" ? "success" : s === "offline" ? "danger" : s === "busy" ? "warning" : "neutral";
export const backendLabel = (s: Backend["status"]) =>
  s === "online" ? "Online" : s === "offline" ? "Offline" : s === "busy" ? "Busy" : "Unknown";

function Kpi({
  icon,
  label,
  value,
  detail,
  delta,
  good,
  color,
  spark,
}: {
  icon: string;
  label: string;
  value: string;
  detail: string;
  delta?: string;
  good?: boolean;
  color: string;
  spark?: number[];
}) {
  return (
    <Card className="kpi">
      <div className="kpi-top">
        <span
          className="kpi-icon"
          style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
        >
          <Icon name={icon} size={18} />
        </span>
        <span className="kpi-label">{label}</span>
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-foot">
        {delta ? (
          <span className={`kpi-delta ${good ? "good" : "bad"}`}>
            <Icon name={delta.startsWith("-") ? "arrowDown" : "arrowUp"} size={12} />
            {delta.replace(/^[+-]/, "")}
          </span>
        ) : null}
        <span className="kpi-detail">{detail}</span>
      </div>
      {spark && spark.length > 2 && Math.max(...spark) - Math.min(...spark) > 1e-9 ? (
        <div className="kpi-spark" aria-hidden="true">
          <Sparkline values={spark} color={color} height={40} />
        </div>
      ) : null}
    </Card>
  );
}

function ProviderRow({ backend }: { backend: Backend }) {
  return (
    <li className="provider-row">
      <span className={`provider-mark p-${backend.provider.toLowerCase().replace(/[^a-z]/g, "")}`}>
        {backend.provider.slice(0, 2).toUpperCase()}
      </span>
      <div>
        <b>{backend.provider}</b>
        <span>
          {backend.name} · {backend.qubits ?? "?"} qubits
        </span>
      </div>
      <Badge tone={backendTone(backend.status)} pulse={backend.status !== "offline"}>
        {backendLabel(backend.status)}
      </Badge>
    </li>
  );
}

function Onboarding() {
  const { navigate, settings, datasets } = useApp();
  const dataset = datasets.find((d) => d.id === settings.datasetId);
  const steps = [
    {
      icon: "database",
      title: "Choose a dataset",
      body: dataset ? `${dataset.name} is selected.` : "Pick a built-in series or upload a CSV.",
      page: "data" as const,
      cta: "Open data library",
    },
    {
      icon: "sliders",
      title: "Configure the reservoir",
      body: "Set qubits, depth, entanglement and encoding.",
      page: "model" as const,
      cta: "Open configuration",
    },
    {
      icon: "play",
      title: "Deploy and evaluate",
      body: "Train the readout, then compare against classical baselines.",
      page: "model" as const,
      cta: "Deploy a model",
    },
  ];
  return (
    <Card className="onboarding">
      <div className="onboarding-intro">
        <span className="eyebrow">Connected · no model yet</span>
        <h2>Train your first quantum reservoir</h2>
        <p>
          The API is online. Deploy a model to fill this dashboard with live forecasts, metrics and
          circuit details.
        </p>
        <Button icon="arrowRight" onClick={() => navigate("model")}>
          Configure & deploy
        </Button>
      </div>
      <ol className="steps">
        {steps.map((s, i) => (
          <li key={s.title}>
            <span className="step-num">{i + 1}</span>
            <div>
              <b>{s.title}</b>
              <p>{s.body}</p>
              <button className="link" onClick={() => navigate(s.page)}>
                {s.cta} <Icon name="arrowRight" size={14} />
              </button>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function Overview() {
  const { live, latest, previous, backends, refreshBackends, connect } = useApp();
  const result: TrainResult | null = live ? latest : DEMO_RESULT;
  const sample = !live;

  const header = (
    <PageHeader
      eyebrow="Quantum reservoir computing"
      title="Overview"
      description={
        result
          ? `${result.dataset.name} · ${result.config.n_qubits} qubits · ${titleCase(result.config.entanglement)} entanglement`
          : "Forecasting performance at a glance."
      }
      actions={
        result ? (
          <Badge tone={sample ? "neutral" : "success"} pulse={!sample}>
            {sample ? "Sample data" : "Live model"}
          </Badge>
        ) : undefined
      }
    />
  );

  const hardware = (
    <Card className="span-4">
      <CardHeader
        title="Hardware status"
        subtitle={live ? "Reported by the API" : "Sample providers"}
        actions={
          <IconButton
            icon="refresh"
            label="Refresh backends"
            onClick={() => (live ? refreshBackends() : connect())}
          />
        }
      />
      <ul className="provider-list">
        {backends.slice(0, 4).map((b) => (
          <ProviderRow key={b.id} backend={b} />
        ))}
      </ul>
    </Card>
  );

  if (!result) {
    return (
      <div className="page">
        {header}
        <Onboarding />
        <div className="grid">{hardware}</div>
      </div>
    );
  }

  const m = result.metrics;
  const f = result.forecast;
  const errors = f.actual.map((v, i) => Math.abs(v - f.predicted[i]));
  const hits = f.actual
    .slice(1)
    .map((v, i) =>
      Number(Math.sign(f.predicted[i + 1] - f.actual[i]) === Math.sign(v - f.actual[i])),
    );
  const diff = (now: number, before: number | undefined, fmt: (v: number) => string) =>
    before === undefined
      ? undefined
      : `${now - before >= 0 ? "+" : "-"}${fmt(Math.abs(now - before))}`;

  return (
    <div className="page">
      {header}
      <div className="kpi-grid">
        <Kpi
          icon="target"
          label="Directional accuracy"
          value={`${(m.directional_accuracy * 100).toFixed(1)}%`}
          detail={`${m.test_samples} test days`}
          delta={diff(
            m.directional_accuracy * 100,
            previous ? previous.directional_accuracy * 100 : undefined,
            (v) => `${v.toFixed(1)} pts`,
          )}
          good={!previous || m.directional_accuracy >= previous.directional_accuracy}
          color="var(--green)"
          spark={rolling(hits, 6)}
        />
        <Kpi
          icon="cpu"
          label="Active qubits"
          value={String(result.config.n_qubits)}
          detail={`${result.config.circuit_depth} layers · ${m.feature_dimension} features`}
          color="var(--cyan)"
        />
        <Kpi
          icon="activity"
          label="Test MSE (scaled)"
          value={m.test_mse.toFixed(4)}
          detail={`R² ${m.test_r2.toFixed(3)}`}
          delta={diff(m.test_mse, previous?.test_mse, (v) => v.toFixed(4))}
          good={!previous || m.test_mse <= previous.test_mse}
          color="var(--purple-light)"
          spark={rolling(errors, 6)}
        />
        <Kpi
          icon="zap"
          label="Inference / sample"
          value={fmtMs(m.inference_ms)}
          detail={`Trained in ${m.train_time_s.toFixed(1)} s`}
          delta={diff(m.inference_ms, previous?.inference_ms, (v) => fmtMs(v))}
          good={!previous || m.inference_ms <= previous.inference_ms}
          color="var(--amber)"
        />
      </div>

      <div className="grid">
        <Card className="span-7">
          <CardHeader
            title="Forecast vs actual"
            subtitle={`Held-out test set · last ${f.dates.length} days · shaded band is the 95% interval`}
            actions={
              <>
                {sample && <SampleTag />}
                <div className="legend">
                  <span>
                    <i className="lg-solid" /> Actual
                  </span>
                  <span>
                    <i className="lg-dash" /> QRC prediction
                  </span>
                </div>
              </>
            }
          />
          <LineChart
            ariaLabel="Actual values and QRC prediction with confidence band"
            dates={f.dates}
            series={[
              { label: "Actual", values: f.actual, color: "var(--text)" },
              {
                label: "QRC prediction",
                values: f.predicted,
                color: "var(--cyan)",
                dashed: true,
                glow: true,
              },
            ]}
            band={{ lower: f.lower, upper: f.upper, label: "95% band" }}
          />
        </Card>
        <Card className="span-5">
          <CardHeader
            title="Reservoir circuit"
            subtitle={`${result.circuit.gate_count} gates · depth ${result.circuit.depth} · ${result.circuit.two_qubit_gates} two-qubit`}
            actions={sample ? <SampleTag /> : <Badge tone="success">Trained</Badge>}
          />
          <QuantumCircuit
            qubits={result.config.n_qubits}
            depth={result.config.circuit_depth}
            strategy={result.config.entanglement}
            encoding={result.config.input_encoding}
            layout={result.circuit.layout}
          />
          <dl className="meta-row">
            <div>
              <dt>Encoding</dt>
              <dd>{titleCase(result.config.input_encoding)}</dd>
            </div>
            <div>
              <dt>Entanglement</dt>
              <dd>{titleCase(result.config.entanglement)}</dd>
            </div>
            <div>
              <dt>Measured</dt>
              <dd>{result.config.measurement_basis.join(", ")}</dd>
            </div>
          </dl>
        </Card>

        <Card className="span-4">
          <CardHeader title="Forecast error" subtitle="|actual − prediction| per test day" />
          <LineChart
            ariaLabel="Absolute forecast error per day"
            dates={f.dates}
            series={[
              { label: "Abs. error", values: errors, color: "var(--purple-light)", area: true },
            ]}
            height={200}
          />
        </Card>
        <Card className="span-4">
          <CardHeader title="Qubit correlations" subtitle="|corr| of ⟨Zᵢ⟩ across test states" />
          <Heatmap matrix={result.correlation_matrix} />
        </Card>
        {hardware}
      </div>
      {!sample && result.config.include_input !== false && (
        <p className="footnote">
          <Icon name="info" size={14} /> The readout also receives the raw input window (classical
          skip connection). Turn it off in Model configuration to measure the quantum features on
          their own.
        </p>
      )}
    </div>
  );
}
