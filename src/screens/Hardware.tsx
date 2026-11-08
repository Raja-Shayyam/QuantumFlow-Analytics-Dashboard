import { useState } from "react";
import { Sparkline } from "../components/charts";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Icon,
  PageHeader,
  SampleTag,
  Select,
  type Tone,
} from "../components/ui";
import { api, waitForJob, type Backend, type Job } from "../lib/api";
import { useApp } from "../lib/app-context";
import { errorMessage, fmtDuration, rolling, titleCase } from "../lib/format";
import { backendLabel, backendTone } from "./Overview";

const jobTone: Record<Job["status"], Tone> = {
  completed: "success",
  running: "info",
  queued: "warning",
  failed: "danger",
};

const ago = (seconds: number) => {
  const diff = Math.max(0, Date.now() / 1000 - seconds);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86400)} d ago`;
};

function BackendCard({
  backend,
  jobs,
  running,
  hasModel,
  onRun,
}: {
  backend: Backend;
  jobs: Job[];
  running: boolean;
  hasModel: boolean;
  onRun: () => void;
}) {
  const finished = jobs
    .filter(
      (j) =>
        j.metadata.backend === backend.id && (j.status === "completed" || j.status === "failed"),
    )
    .reverse();
  const successRate = finished.length
    ? finished.filter((j) => j.status === "completed").length / finished.length
    : null;
  const offline = backend.status === "offline";
  const color = offline
    ? "var(--red)"
    : backend.status === "busy"
      ? "var(--amber)"
      : "var(--green)";
  return (
    <Card className={`backend-card ${offline ? "is-offline" : ""}`}>
      <div className="backend-top">
        <span
          className={`provider-mark lg p-${backend.provider.toLowerCase().replace(/[^a-z]/g, "")}`}
        >
          {backend.provider.slice(0, 2).toUpperCase()}
        </span>
        <Badge tone={backendTone(backend.status)} pulse={!offline}>
          {backend.status === "online" ? "Available" : backendLabel(backend.status)}
        </Badge>
      </div>
      <div className="backend-name">
        <h3>{backend.provider}</h3>
        <p>{backend.name}</p>
        <code>{backend.id}</code>
      </div>
      <dl className="backend-specs">
        <div>
          <dt>Qubits</dt>
          <dd>{backend.qubits ?? "—"}</dd>
        </div>
        <div>
          <dt>Queue</dt>
          <dd>
            {backend.queue_depth == null
              ? "—"
              : backend.queue_depth === 0
                ? "Empty"
                : `${backend.queue_depth} jobs`}
          </dd>
        </div>
        <div>
          <dt>Success</dt>
          <dd>{successRate == null ? "—" : `${Math.round(successRate * 100)}%`}</dd>
        </div>
      </dl>
      <div
        className="backend-spark"
        title={
          finished.length
            ? `Rolling success over the last ${finished.length} jobs`
            : "No finished jobs yet"
        }
      >
        {finished.length > 2 ? (
          <Sparkline
            values={rolling(
              finished.map((j) => (j.status === "completed" ? 1 : 0)),
              3,
            )}
            color={color}
            height={32}
          />
        ) : null}
        <span>
          {finished.length
            ? `${finished.length} recent job${finished.length > 1 ? "s" : ""}`
            : "No job history"}
        </span>
      </div>
      <Button
        variant="secondary"
        disabled={offline || !hasModel}
        loading={running}
        onClick={onRun}
        icon={offline || !hasModel ? undefined : "play"}
        title={!hasModel && !offline ? "Deploy a model first to run jobs" : undefined}
        className="full"
      >
        {offline ? "Unavailable" : !hasModel ? "No model" : running ? "Running…" : "Run job"}
      </Button>
    </Card>
  );
}

export function Hardware() {
  const {
    backends,
    jobs,
    live,
    backendError,
    latest,
    notify,
    refreshBackends,
    refreshJobs,
    connect,
    navigate,
    setApiDialogOpen,
  } = useApp();
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<"all" | Job["status"]>("all");
  const counts = {
    online: backends.filter((b) => b.status === "online").length,
    busy: backends.filter((b) => b.status === "busy").length,
    offline: backends.filter((b) => b.status === "offline").length,
  };
  const visibleJobs = jobs.filter((j) => filter === "all" || j.status === filter);

  const run = async (backend: Backend) => {
    if (!live) {
      setApiDialogOpen(true);
      return notify("Connect the API to submit jobs.", "warning", "API offline");
    }
    if (!latest) {
      return notify(
        "Jobs execute the trained reservoir circuit — deploy a model first.",
        "info",
        "No model yet",
      );
    }
    setRunning((r) => ({ ...r, [backend.id]: true }));
    try {
      const job = await api.runOnBackend(backend.id);
      refreshJobs();
      const result = await waitForJob(job as Job<{ counts: Record<string, number> }>);
      const [state, shots] = Object.entries(result.counts).sort((a, b) => b[1] - a[1])[0] ?? [];
      notify(
        `Most frequent state |${state}⟩ (${shots} shots)`,
        "success",
        `${job.id} completed on ${backend.provider}`,
      );
    } catch (error) {
      notify(errorMessage(error), "danger", `Job failed on ${backend.provider}`);
    } finally {
      setRunning((r) => ({ ...r, [backend.id]: false }));
      refreshJobs();
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Quantum network"
        title="Hardware monitor"
        description={
          live
            ? backendError
              ? "Real quantum backends unavailable — running in local-only mode."
              : "Backends reported by qBraid, plus the always-available local statevector simulator."
            : "Sample backends shown while the API is offline."
        }
        actions={
          <Button
            variant="secondary"
            icon="refresh"
            onClick={() => (live ? (refreshBackends(), refreshJobs()) : connect())}
          >
            Refresh
          </Button>
        }
      />
      <div className="summary-row">
        <div className="summary-item">
          <i className="dot success" />
          <b>{counts.online}</b> available
        </div>
        <div className="summary-item">
          <i className="dot warning" />
          <b>{counts.busy}</b> busy
        </div>
        <div className="summary-item">
          <i className="dot danger" />
          <b>{counts.offline}</b> offline
        </div>
        <div className="summary-item">
          <Icon name="activity" size={16} />
          <b>{jobs.filter((j) => j.status === "running" || j.status === "queued").length}</b> active
          jobs
        </div>
        {!live && <SampleTag />}
      </div>
      {live && backendError && (
        <div className="inline-note">
          <Icon name="info" size={16} />
          <span>{backendError}</span>
        </div>
      )}
      {live && !latest && (
        <div className="inline-note">
          <Icon name="info" size={16} />
          <span>
            Jobs execute the trained reservoir circuit.{" "}
            <button className="link inline" onClick={() => navigate("model")}>
              Deploy a model
            </button>{" "}
            to enable them.
          </span>
        </div>
      )}
      <div className="backend-grid">
        {backends.map((b) => (
          <BackendCard
            key={b.id}
            backend={b}
            jobs={jobs}
            running={!!running[b.id]}
            hasModel={!!latest}
            onRun={() => run(b)}
          />
        ))}
      </div>
      <Card>
        <CardHeader
          title="Job history"
          subtitle={live ? "Jobs submitted to this API since it started" : "Sample jobs"}
          actions={
            <Select
              value={filter}
              onChange={(v) => setFilter(v as typeof filter)}
              label="Filter jobs by status"
            >
              <option value="all">All statuses</option>
              <option value="running">Running</option>
              <option value="queued">Queued</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </Select>
          }
        />
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Backend</th>
                <th>Algorithm</th>
                <th className="num">Qubits</th>
                <th>Status</th>
                <th className="num">Duration</th>
                <th className="num">Cost</th>
              </tr>
            </thead>
            <tbody>
              {visibleJobs.map((j) => {
                const backend = String(j.metadata.backend ?? "—");
                const local =
                  backend.startsWith("local") ||
                  backend.includes("simulator") ||
                  backend === "Classiq synthesis";
                const cost = (j.result as any)?.cost;
                return (
                  <tr key={j.id}>
                    <td>
                      <b className="mono">{j.id}</b>
                      <span className="cell-sub">{j.created_at ? ago(j.created_at) : ""}</span>
                    </td>
                    <td>{backend}</td>
                    <td>{String(j.metadata.algorithm ?? j.kind)}</td>
                    <td className="num mono">{j.metadata.n_qubits ?? "—"}</td>
                    <td>
                      <Badge tone={jobTone[j.status]} pulse={j.status === "running"}>
                        {titleCase(j.status)}
                        {j.status === "running" && j.progress > 0
                          ? ` · ${Math.round(j.progress * 100)}%`
                          : ""}
                      </Badge>
                      {j.status === "failed" && j.error && (
                        <span className="cell-sub error" title={j.error}>
                          {j.error}
                        </span>
                      )}
                    </td>
                    <td className="num mono">{fmtDuration(j.duration_s)}</td>
                    <td className="num mono">
                      {cost != null ? `$${Number(cost).toFixed(4)}` : local ? "$0.00" : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!visibleJobs.length && (
            <EmptyState
              icon="server"
              title={jobs.length ? "No jobs with this status" : "No jobs yet"}
            >
              {jobs.length
                ? "Choose a different status filter."
                : "Deploy a model or run a job on a backend to see it here."}
            </EmptyState>
          )}
        </div>
      </Card>
    </div>
  );
}
