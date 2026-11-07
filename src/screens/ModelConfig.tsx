import { useState } from "react";
import { QuantumCircuit } from "../components/circuit";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CheckGroup,
  Field,
  Icon,
  PageHeader,
  Progress,
  Segmented,
  Select,
  Slider,
  Toggle,
} from "../components/ui";
import { api, waitForJob, type ClassiqResult, type Job } from "../lib/api";
import { useApp } from "../lib/app-context";
import { errorMessage, fmtMs, titleCase } from "../lib/format";
import { DEFAULT_SETTINGS, estimateGates, pairCount, toTrainConfig } from "../lib/settings";
import { backendLabel, backendTone } from "./Overview";

const ENCODINGS = [
  { value: "angle" as const, label: "Angle", hint: "Ry(πx) re-uploaded before every layer" },
  {
    value: "amplitude" as const,
    label: "Amplitude",
    hint: "Window loaded into 2ⁿ amplitudes once",
  },
  { value: "basis" as const, label: "Basis", hint: "Above/below median → |1⟩/|0⟩" },
];

export function ModelConfig() {
  const {
    settings,
    update,
    backends,
    live,
    latest,
    datasets,
    onTrained,
    notify,
    navigate,
    setApiDialogOpen,
  } = useApp();
  const [training, setTraining] = useState<Job | null>(null);
  const [classiqJob, setClassiqJob] = useState<Job | null>(null);
  const [classiq, setClassiq] = useState<ClassiqResult | null>(null);
  const { qubits, depth, strategy, encoding, bases } = settings;

  const matchesLatest =
    !!latest &&
    latest.config.n_qubits === qubits &&
    latest.config.circuit_depth === depth &&
    latest.config.entanglement === strategy &&
    latest.config.input_encoding === encoding;
  const gateCount = matchesLatest && latest ? latest.circuit.gate_count : estimateGates(settings);
  const runtime = latest
    ? ((latest.metrics.inference_ms * gateCount) / latest.circuit.gate_count) *
      2 ** (qubits - latest.config.n_qubits)
    : null;
  const dataset = datasets.find((d) => d.id === settings.datasetId);
  const backend = backends.find((b) => b.id === settings.backend);
  const isDefault =
    (["qubits", "depth", "strategy", "encoding", "window", "includeInput"] as const).every(
      (k) => settings[k] === DEFAULT_SETTINGS[k],
    ) && bases.join() === DEFAULT_SETTINGS.bases.join();

  const deploy = async () => {
    if (!live) {
      setApiDialogOpen(true);
      return notify("Connect the QuantumFlow API to train a real model.", "warning", "API offline");
    }
    if (!bases.length) return notify("Select at least one measurement basis.", "warning");
    try {
      const job = await api.train(toTrainConfig(settings));
      const result = await waitForJob(job, setTraining);
      onTrained(result);
      notify(
        `R² ${result.metrics.test_r2.toFixed(3)} · ${(result.metrics.directional_accuracy * 100).toFixed(1)}% directional accuracy`,
        "success",
        "Model deployed",
      );
    } catch (error) {
      notify(errorMessage(error), "danger", "Training failed");
    } finally {
      setTraining(null);
    }
  };

  const optimize = async () => {
    if (!live) {
      setApiDialogOpen(true);
      return notify("Classiq synthesis runs on the backend.", "warning", "API offline");
    }
    try {
      const job = await api.classiq({
        n_qubits: qubits,
        circuit_depth: depth,
        entanglement: strategy,
        input_encoding: encoding,
      });
      const result = await waitForJob(job, setClassiqJob);
      setClassiq(result);
      notify(
        result.fallback_reason
          ? `Classiq unavailable — optimized with ${result.engine}.`
          : "Circuit synthesized with Classiq.",
        result.fallback_reason ? "info" : "success",
      );
    } catch (error) {
      notify(errorMessage(error), "danger", "Optimization failed");
    } finally {
      setClassiqJob(null);
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="QRC workbench"
        title="Model configuration"
        description={
          <>
            Training on{" "}
            <button className="link inline" onClick={() => navigate("data")}>
              {dataset?.name ?? settings.datasetId}
            </button>{" "}
            · {settings.window}-day window · {settings.split}/{100 - settings.split} split ·{" "}
            {settings.normalize ? "z-score" : "raw"}
            {settings.scale ? " + [−1, 1]" : ""}
          </>
        }
        actions={
          <Badge tone={live ? "success" : "warning"}>
            {live ? "API connected" : "Offline · sample mode"}
          </Badge>
        }
      />
      <div className="config-layout">
        <Card className="config-form">
          <section className="form-section">
            <h3>
              <Icon name="cpu" size={16} /> Architecture
            </h3>
            <Field label="Number of qubits" value={qubits}>
              <Slider
                label="Number of qubits"
                min={2}
                max={12}
                value={qubits}
                onChange={(v) => update({ qubits: v })}
              />
            </Field>
            <Field label="Circuit depth" value={`${depth} layer${depth > 1 ? "s" : ""}`}>
              <Slider
                label="Circuit depth"
                min={1}
                max={10}
                value={depth}
                onChange={(v) => update({ depth: v })}
              />
            </Field>
            <Field
              label="Entanglement strategy"
              htmlFor="entanglement"
              hint={`${pairCount(qubits, strategy)} CZ + RZZ couplings per layer`}
            >
              <Select
                id="entanglement"
                value={strategy}
                onChange={(v) => update({ strategy: v as typeof strategy })}
              >
                <option value="full">Full — all pairs</option>
                <option value="linear">Linear — nearest neighbour</option>
                <option value="ring">Ring — linear + wrap-around</option>
                <option value="custom">Custom — linear + random long-range</option>
              </Select>
            </Field>
          </section>
          <section className="form-section">
            <h3>
              <Icon name="layers" size={16} /> Encoding & readout
            </h3>
            <Field label="Input encoding" hint={ENCODINGS.find((e) => e.value === encoding)?.hint}>
              <Segmented
                label="Input encoding"
                value={encoding}
                options={ENCODINGS}
                onChange={(v) => update({ encoding: v })}
              />
            </Field>
            <Field
              label="Measurement basis"
              hint={
                bases.length
                  ? `${bases.includes("Z") ? qubits + (qubits * (qubits - 1)) / 2 : 0} Z-features incl. ZZ correlations, ${bases.filter((b) => b !== "Z").length * qubits} X/Y features`
                  : "Select at least one basis"
              }
            >
              <CheckGroup
                label="Measurement basis"
                values={bases}
                options={["X", "Y", "Z"] as ("X" | "Y" | "Z")[]}
                onChange={(v) => update({ bases: v })}
              />
            </Field>
            <Field label="Input window" value={`${settings.window} days`}>
              <Slider
                label="Input window"
                min={4}
                max={30}
                value={settings.window}
                onChange={(v) => update({ window: v })}
              />
            </Field>
            <Toggle
              label="Classical skip connection"
              description="Also feed the raw input window to the ridge readout. Turn off to isolate what the quantum features contribute."
              value={settings.includeInput}
              onChange={(v) => update({ includeInput: v })}
            />
          </section>
          <div className="form-actions">
            {training ? (
              <Progress value={training.progress} label={training.message || "Queued"} />
            ) : (
              <p className="form-actions-hint">
                {live
                  ? "Training runs on the exact statevector simulator."
                  : "Connect the API to deploy."}
              </p>
            )}
            <div className="form-actions-buttons">
              <Button
                variant="ghost"
                disabled={!!training || isDefault}
                onClick={() =>
                  update({
                    qubits: 6,
                    depth: 4,
                    strategy: "full",
                    encoding: "angle",
                    bases: ["Z"],
                    window: 10,
                    includeInput: true,
                  })
                }
              >
                Reset
              </Button>
              <Button size="lg" loading={!!training} onClick={deploy} icon="play">
                {training ? "Training…" : "Deploy model"}
              </Button>
            </div>
          </div>
        </Card>

        <div className="config-side">
          <Card>
            <CardHeader
              title="Live circuit preview"
              subtitle={`${titleCase(strategy)} entanglement · ${titleCase(encoding)} encoding`}
              actions={
                <Badge tone="info" pulse>
                  Live
                </Badge>
              }
            />
            <div className="preview-stage">
              <QuantumCircuit
                qubits={qubits}
                depth={depth}
                strategy={strategy}
                encoding={encoding}
                layout={matchesLatest ? latest?.circuit.layout : undefined}
              />
            </div>
            <dl className="stat-strip">
              <div>
                <dt>{matchesLatest ? "Gate count" : "Gate count (est.)"}</dt>
                <dd>{gateCount.toLocaleString()}</dd>
              </div>
              <div>
                <dt>State space</dt>
                <dd>
                  2^{qubits} = {(2 ** qubits).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt>Est. inference</dt>
                <dd>{runtime != null ? fmtMs(runtime) : "—"}</dd>
              </div>
            </dl>
          </Card>
          <Card className="classiq-card">
            <CardHeader
              icon="sparkles"
              title="Circuit synthesis"
              subtitle="Optimize gate count and depth with Classiq"
            />
            {classiq ? (
              <div className="classiq-result">
                <div className="compare-stat">
                  <span>Gates</span>
                  <b>
                    {classiq.before.gate_count} <Icon name="arrowRight" size={14} />{" "}
                    {classiq.after.gate_count ?? "?"}
                  </b>
                  {classiq.reduction_pct.gate_count != null && (
                    <em className={classiq.reduction_pct.gate_count > 0 ? "good" : "bad"}>
                      {classiq.reduction_pct.gate_count > 0 ? "−" : "+"}
                      {Math.abs(classiq.reduction_pct.gate_count)}%
                    </em>
                  )}
                </div>
                <div className="compare-stat">
                  <span>Depth</span>
                  <b>
                    {classiq.before.depth} <Icon name="arrowRight" size={14} />{" "}
                    {classiq.after.depth ?? "?"}
                  </b>
                  {classiq.reduction_pct.depth != null && (
                    <em className={classiq.reduction_pct.depth > 0 ? "good" : "bad"}>
                      {classiq.reduction_pct.depth > 0 ? "−" : "+"}
                      {Math.abs(classiq.reduction_pct.depth)}%
                    </em>
                  )}
                </div>
                <p className="classiq-engine">
                  Engine: <b>{classiq.engine}</b>
                  {classiq.fallback_reason && <span> — {classiq.fallback_reason}</span>}
                </p>
              </div>
            ) : classiqJob ? (
              <Progress value={classiqJob.progress} label={classiqJob.message || "Queued"} />
            ) : (
              <p className="muted-text">
                Compiles the current reservoir to a CX/RZ/SX basis and reports the reduction against
                an unoptimized transpile.
              </p>
            )}
            <Button variant="quantum" icon="sparkles" loading={!!classiqJob} onClick={optimize}>
              {classiqJob
                ? "Synthesizing…"
                : classiq
                  ? "Re-run synthesis"
                  : "Optimize with Classiq"}
            </Button>
          </Card>
        </div>
      </div>

      <Card className="backend-banner">
        <div className="brand">
          <span className="brand-mark">qB</span>
          <div>
            <b>Powered by qBraid</b>
            <span>
              {live
                ? `${backends.length} backend${backends.length === 1 ? "" : "s"} available to this API`
                : "30+ quantum backends via qBraid"}
            </span>
          </div>
        </div>
        <div className="backend-picker">
          <label htmlFor="backend">Verification backend</label>
          <Select id="backend" value={settings.backend} onChange={(v) => update({ backend: v })}>
            {backends.map((b) => (
              <option key={b.id} value={b.id} disabled={b.status === "offline"}>
                {b.source === "local" ? "Local simulator (default)" : `${b.provider} · ${b.name}`}
                {b.status === "offline" ? " — offline" : ""}
              </option>
            ))}
          </Select>
          {backend && (
            <Badge tone={backendTone(backend.status)} pulse>
              {backendLabel(backend.status)}
            </Badge>
          )}
        </div>
        <p className="banner-note">
          After training, one circuit is run on this backend to verify execution.
        </p>
      </Card>
    </div>
  );
}
