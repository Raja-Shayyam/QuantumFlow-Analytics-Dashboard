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
  integrations: Record<
    "qiskit" | "qiskit_aer" | "yfinance" | "classiq" | "qbraid",
    boolean
  >;
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
  circuit: {
    gate_count: number;
    depth: number;
    two_qubit_gates: number;
    layout: string[][];
  };
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
  after: {
    gate_count: number | null;
    depth: number | null;
    two_qubit_gates: number | null;
  };
  reduction_pct: { gate_count: number | null; depth: number | null };
}

const STORAGE_KEY = "qf_api_url";

export function getApiUrl(): string {
  const stored =
    typeof localStorage !== "undefined"
      ? localStorage.getItem(STORAGE_KEY)
      : null;
  return (
    stored ||
    import.meta.env.VITE_QUANTUMFLOW_API_URL ||
    "http://localhost:8000"
  ).replace(/\/$/, "");
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
    this.name = "ApiError";
  }
}

interface RequestOptions extends RequestInit {
  /** Override the default 20 s timeout for this request. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const UPLOAD_TIMEOUT_MS = 180_000;

async function request<T>(path: string, init?: RequestOptions): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Merge caller-supplied headers, then conditionally add Content-Type.
    // Only force JSON for string bodies — FormData sets its own boundary header.
    const headers = new Headers(init?.headers as HeadersInit | undefined);
    if (
      init?.body != null &&
      typeof init.body === "string" &&
      !headers.has("Content-Type")
    ) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(`${getApiUrl()}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });

    // Read as text first so non-JSON 4xx/5xx bodies are still surfaced.
    const text = await response.text();
    let body: any = {};
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = response.ok ? {} : { detail: text };
      }
    }

    if (!response.ok) {
      const raw = body?.detail;
      const detail = Array.isArray(raw)
        ? raw.map((d: any) => d?.msg ?? JSON.stringify(d)).join("; ")
        : typeof raw === "string"
          ? raw
          : undefined;
      throw new ApiError(
        detail || `Request failed (${response.status})`,
        response.status,
      );
    }

    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      controller.signal.aborted
        ? "Request timed out"
        : "Cannot reach the QuantumFlow API",
      0,
    );
  } finally {
    clearTimeout(timer);
  }
}

const post = <T>(path: string, body: unknown, opts?: { timeoutMs?: number }) =>
  request<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
    timeoutMs: opts?.timeoutMs,
  });

const postForm = <T>(
  path: string,
  form: FormData,
  opts?: { timeoutMs?: number },
) =>
  request<T>(path, {
    method: "POST",
    body: form,
    timeoutMs: opts?.timeoutMs ?? UPLOAD_TIMEOUT_MS,
  });

export const api = {
  health: () => request<Health>("/api/health", { timeoutMs: 3000 }),

  datasets: () =>
    request<{ datasets: Dataset[] }>("/api/datasets", { timeoutMs: 60000 }),

  preview: (id: string) =>
    request<DatasetPreview>(`/api/datasets/${encodeURIComponent(id)}/preview`),

  /** JSON upload — sends the CSV text inside `{ name, csv }`. */
  upload: (name: string, csv: string) =>
    post<Dataset>(
      "/api/datasets",
      { name, csv },
      { timeoutMs: UPLOAD_TIMEOUT_MS },
    ),

  /** Multipart upload — preferred for large files; no JSON size limit.
   *  Targets POST /api/datasets/file (multipart/form-data). */
  // uploadFile: (name: string, file: File) => {
  //   const form = new FormData();
  //   form.append("name", name);
  //   form.append("csv", file);
  //   return postForm<Dataset>("/api/datasets/file", form);
  // },
  //
  uploadFile: (_name: string, file: File) => {
    const form = new FormData();
    form.append("file", file); // key matches the FastAPI param name
    return postForm<Dataset>("/api/datasets/file", form);
  },

  train: (config: TrainConfig) =>
    post<Job<TrainResult>>("/api/qrc/train", config),

  latest: () => request<TrainResult>("/api/qrc/latest"),

  compare: () =>
    request<Comparison>("/api/metrics/compare", { timeoutMs: 120000 }),

  classiq: (
    body: Pick<
      TrainConfig,
      "n_qubits" | "circuit_depth" | "entanglement" | "input_encoding"
    >,
  ) => post<Job<ClassiqResult>>("/api/classiq/optimize", body),

  backends: (refresh = false) =>
    request<{
      backends: Backend[];
      error: string | null;
      qbraid_connected: boolean;
    }>(`/api/backends${refresh ? "?refresh=true" : ""}`),

  runOnBackend: (backend_id: string, shots = 1024) =>
    post<Job>("/api/backends/run", { backend_id, shots }),

  jobs: () => request<{ jobs: Job[] }>("/api/jobs?limit=25"),

  job: <T>(id: string) => request<Job<T>>(`/api/jobs/${id}`),
};

export type WaitForJobCallback<T> = (job: Job<T>) => void;

export interface WaitForJobOptions<T> {
  /** First poll delay in ms (default 500). */
  initialDelayMs?: number;
  /** Cap on backoff delay in ms (default 5000). */
  maxDelayMs?: number;
  /** Give up after this long and throw ApiError 408 (default 30 min). */
  maxWaitMs?: number;
  onUpdate?: WaitForJobCallback<T>;
}

/** Polls a job until it finishes. Rejects with the job's error message on failure. */
export async function waitForJob<T>(
  job: Job<T>,
  optionsOrCallback?: WaitForJobOptions<T> | WaitForJobCallback<T>,
): Promise<T> {
  const options: WaitForJobOptions<T> =
    typeof optionsOrCallback === "function"
      ? { onUpdate: optionsOrCallback }
      : (optionsOrCallback ?? {});

  const {
    initialDelayMs = 500,
    maxDelayMs = 5_000,
    maxWaitMs = 30 * 60 * 1000,
    onUpdate,
  } = options;

  let current = job;
  let delay = initialDelayMs;
  const startedAt = Date.now();

  while (current.status === "queued" || current.status === "running") {
    onUpdate?.(current);

    if (Date.now() - startedAt > maxWaitMs) {
      throw new ApiError(
        `Job ${current.id} did not finish within ${Math.round(maxWaitMs / 1000)} s`,
        408,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(Math.round(delay * 1.5), maxDelayMs);
    current = await api.job<T>(current.id);
  }

  onUpdate?.(current);
  if (current.status === "failed")
    throw new ApiError(current.error || "Job failed", 500);
  return current.result as T;
}
