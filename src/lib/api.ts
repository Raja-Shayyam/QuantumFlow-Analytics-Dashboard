// Typed client for the QuantumFlow FastAPI service (see /backend).

export type JobStatus = "queued" | "running" | "completed" | "failed";

export interface Job<T = unknown> {
  id: string;
  kind: string;
  status: JobStatus;
  progress: number;
  message: string;
  metadata: Record<string, string | number | null | undefined>;
  result?: T | null;
  error: string | null;
  created_at: number;
  duration_s: number | null;
}

export interface Health {
  status: string;
  version: string;
  data_mode: string;
  model_trained: boolean;
  integrations: Record<"qiskit" | "qiskit_aer" | "yfinance" | "classiq" | "qbraid", boolean>;
}

export interface TrainConfig {
  dataset_id: string;
  n_qubits: number;
  circuit_depth: number;
  entanglement: "full" | "linear" | "ring" | "custom";
  input_encoding: "angle" | "amplitude" | "basis";
  measurement_basis: ("X" | "Y" | "Z")[];
  window_size: number;
  train_split: number;
  normalize: boolean;
  scale: boolean;
  include_input?: boolean;
  execution_backend?: string | null;
}

export interface TrainResult {
  metrics: {
    test_rmse: number;
    test_mae: number;
    test_r2: number;
    test_mse: number;
    price_rmse: number;
    directional_accuracy: number;
    train_time_s: number;
    inference_ms: number;
    train_samples: number;
    test_samples: number;
    feature_dimension: number;
  };
  config: TrainConfig & { window_size: number };
  forecast: {
    dates: string[];
    actual: number[];
    predicted: number[];
    lower: number[];
    upper: number[];
  };
  circuit: { gate_count: number; depth: number; two_qubit_gates: number; layout: string[][] };
  correlation_matrix: number[][];
  dataset: { id: string; name: string; source: string };
  verification?: { backend: string; counts: Record<string, number> };
}

export interface ModelRow {
  model: string;
  quantum: boolean;
  rmse: number;
  mae: number;
  r2: number;
  train_time_s: number;
  inference_ms: number;
}

export interface Comparison {
  models: ModelRow[];
  best_classical: string;
  error_reduction_pct: number;
  inference_speedup: number | null;
  series: {
    dates: string[];
    actual: number[];
    qrc: number[];
    classical: number[];
    advantage: boolean[];
  };
  noise: {
    p: number;
    rmse_clean: number;
    rmse_noisy: number;
    degradation_pct: number | null;
    advantage_retained: boolean;
  };
}

export interface Backend {
  id: string;
  name: string;
  provider: string;
  status: "online" | "busy" | "offline" | "unknown";
  qubits: number | null;
  queue_depth: number | null;
  source: "local" | "qbraid";
}

export interface Dataset {
  id: string;
  name: string;
  type: string;
  rows: number | null;
  start: string | null;
  end: string | null;
  source: string | null;
  status: "ready" | "error";
}

export interface DatasetPreview {
  values: number[];
  stats: { mean: number; std: number; skewness: number; kurtosis: number };
  source: string;
}

export interface ClassiqResult {
  engine: string;
  fallback_reason: string | null;
  before: { gate_count: number; depth: number; two_qubit_gates: number };
  after: { gate_count: number | null; depth: number | null; two_qubit_gates: number | null };
  reduction_pct: { gate_count: number | null; depth: number | null };
}

const STORAGE_KEY = "qf_api_url";

export function getApiUrl(): string {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  return (stored || import.meta.env.VITE_QUANTUMFLOW_API_URL || "http://localhost:8000").replace(
    /\/$/,
    "",
  );
}

export function setApiUrl(url: string | null) {
  if (url) localStorage.setItem(STORAGE_KEY, url.trim());
  else localStorage.removeItem(STORAGE_KEY);
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init?.timeoutMs ?? 20000);
  try {
    const response = await fetch(`${getApiUrl()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = Array.isArray(body.detail)
        ? body.detail.map((d: { msg: string }) => d.msg).join("; ")
        : body.detail;
      throw new ApiError(detail || `Request failed (${response.status})`, response.status);
    }
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      controller.signal.aborted ? "Request timed out" : "Cannot reach the QuantumFlow API",
      0,
    );
  } finally {
    clearTimeout(timer);
  }
}

const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body) });

export const api = {
  health: () => request<Health>("/api/health", { timeoutMs: 3000 }),
  datasets: () => request<{ datasets: Dataset[] }>("/api/datasets", { timeoutMs: 60000 }),
  preview: (id: string) =>
    request<DatasetPreview>(`/api/datasets/${encodeURIComponent(id)}/preview`),
  upload: (name: string, csv: string) => post<Dataset>("/api/datasets", { name, csv }),
  train: (config: TrainConfig) => post<Job<TrainResult>>("/api/qrc/train", config),
  latest: () => request<TrainResult>("/api/qrc/latest"),
  compare: () => request<Comparison>("/api/metrics/compare", { timeoutMs: 120000 }),
  classiq: (
    body: Pick<TrainConfig, "n_qubits" | "circuit_depth" | "entanglement" | "input_encoding">,
  ) => post<Job<ClassiqResult>>("/api/classiq/optimize", body),
  backends: (refresh = false) =>
    request<{ backends: Backend[]; error: string | null; qbraid_connected: boolean }>(
      `/api/backends${refresh ? "?refresh=true" : ""}`,
    ),
  runOnBackend: (backend_id: string, shots = 1024) =>
    post<Job>("/api/backends/run", { backend_id, shots }),
  jobs: () => request<{ jobs: Job[] }>("/api/jobs?limit=25"),
  job: <T>(id: string) => request<Job<T>>(`/api/jobs/${id}`),
};

/** Polls a job until it finishes. Rejects with the job's error message on failure. */
export async function waitForJob<T>(job: Job<T>, onUpdate?: (job: Job<T>) => void): Promise<T> {
  let current = job;
  while (current.status === "queued" || current.status === "running") {
    onUpdate?.(current);
    await new Promise((resolve) => setTimeout(resolve, 700));
    current = await api.job<T>(current.id);
  }
  onUpdate?.(current);
  if (current.status === "failed") throw new ApiError(current.error || "Job failed", 500);
  return current.result as T;
}
