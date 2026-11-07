// Sample data shown only while the API is unreachable. Every screen labels it as sample data.
import type { Backend, Comparison, Dataset, DatasetPreview, Job, TrainResult } from "./api";

const days = (n: number, start = Date.UTC(2025, 1, 17)) =>
  Array.from({ length: n }, (_, i) => new Date(start + i * 86400000).toISOString().slice(0, 10));

const actual = [
  42, 48, 39, 52, 58, 51, 63, 68, 60, 72, 78, 69, 73, 82, 76, 66, 71, 61, 56, 64, 72, 79, 74, 86,
  81, 90, 84, 88, 92, 87,
].map((v) => 18 + v / 5);
const predicted = [
  40, 45, 43, 49, 55, 56, 60, 65, 64, 69, 74, 72, 76, 78, 74, 69, 68, 63, 59, 65, 70, 76, 78, 82,
  84, 86, 87, 89, 90, 91,
].map((v) => 18 + v / 5);
const errors = actual.map((v, i) => Math.abs(v - predicted[i]));

export const DEMO_RESULT: TrainResult = {
  metrics: {
    test_rmse: 0.104,
    test_mae: 0.081,
    test_r2: 0.597,
    test_mse: 0.0108,
    price_rmse: 1.21,
    directional_accuracy: 0.58,
    train_time_s: 2.1,
    inference_ms: 3.6,
    train_samples: 400,
    test_samples: 100,
    feature_dimension: 27,
  },
  config: {
    dataset_id: "sp500",
    n_qubits: 6,
    circuit_depth: 4,
    entanglement: "full",
    input_encoding: "angle",
    measurement_basis: ["Z"],
    window_size: 10,
    train_split: 0.8,
    normalize: true,
    scale: false,
    include_input: true,
  },
  forecast: {
    dates: days(30),
    actual,
    predicted,
    lower: predicted.map((v) => v - 1.4),
    upper: predicted.map((v) => v + 1.4),
  },
  circuit: {
    gate_count: 264,
    depth: 52,
    two_qubit_gates: 120,
    layout: Array.from({ length: 6 }, (_, q) =>
      Array.from({ length: 4 }, (_, l) => ["Rx", "Ry", "Rz"][(q * 2 + l) % 3]),
    ),
  },
  correlation_matrix: Array.from({ length: 6 }, (_, r) =>
    Array.from({ length: 6 }, (_, c) =>
      r === c ? 1 : Number((Math.cos((r + 1) * (c + 2)) * 0.8).toFixed(2)),
    ),
  ),
  dataset: { id: "sp500", name: "S&P 500 Daily", source: "sample" },
};

export const DEMO_ERRORS = errors;

export const DEMO_DATASETS: Dataset[] = [
  {
    id: "sp500",
    name: "S&P 500 Daily",
    type: "Time Series",
    rows: 2520,
    start: "2015-11-09",
    end: "2025-11-07",
    source: "sample",
    status: "ready",
  },
  {
    id: "nasdaq_tech",
    name: "NASDAQ Tech Stocks",
    type: "Time Series",
    rows: 1260,
    start: "2020-11-09",
    end: "2025-11-07",
    source: "sample",
    status: "ready",
  },
  {
    id: "crypto_vol",
    name: "Crypto Volatility Index",
    type: "Time Series",
    rows: 1239,
    start: "2020-12-09",
    end: "2025-11-07",
    source: "sample",
    status: "ready",
  },
  {
    id: "synthetic_qcbm",
    name: "Synthetic QCBM Output",
    type: "Generated",
    rows: 504,
    start: "2023-12-01",
    end: "2025-11-07",
    source: "sample",
    status: "ready",
  },
];

export const DEMO_PREVIEW: DatasetPreview = {
  values: [100, 104, 102, 107, 105, 111, 109, 114, 112, 118, 116, 121, 119, 125, 123, 128],
  stats: { mean: 0.0004, std: 0.0107, skewness: -0.284, kurtosis: 3.127 },
  source: "sample",
};

export const DEMO_BACKENDS: Backend[] = [
  {
    id: "local_statevector",
    name: "Local Statevector",
    provider: "QuantumFlow",
    status: "online",
    qubits: 24,
    queue_depth: 0,
    source: "local",
  },
  {
    id: "ibm_brisbane",
    name: "Brisbane",
    provider: "IBM",
    status: "online",
    qubits: 127,
    queue_depth: 14,
    source: "qbraid",
  },
  {
    id: "ionq_forte",
    name: "Forte Enterprise",
    provider: "IonQ",
    status: "busy",
    qubits: 36,
    queue_depth: 42,
    source: "qbraid",
  },
  {
    id: "rigetti_ankaa_3",
    name: "Ankaa-3",
    provider: "Rigetti",
    status: "online",
    qubits: 84,
    queue_depth: 6,
    source: "qbraid",
  },
  {
    id: "quantinuum_h2",
    name: "H2-1",
    provider: "Quantinuum",
    status: "offline",
    qubits: 56,
    queue_depth: null,
    source: "qbraid",
  },
  {
    id: "qbraid_qir_simulator",
    name: "QIR Simulator",
    provider: "qBraid",
    status: "online",
    qubits: 32,
    queue_depth: 0,
    source: "qbraid",
  },
];

const job = (
  id: string,
  backend: string,
  algorithm: string,
  n_qubits: number,
  status: Job["status"],
  duration_s: number | null,
  minutesAgo: number,
): Job => ({
  id,
  kind: "sample",
  status,
  progress: status === "running" ? 0.62 : 1,
  message: "",
  metadata: { backend, algorithm, n_qubits },
  error: status === "failed" ? "Backend calibration in progress" : null,
  created_at: Date.now() / 1000 - minutesAgo * 60,
  duration_s,
});

export const DEMO_JOBS: Job[] = [
  job("QF-9A72", "ionq_forte", "Warm-start QAOA", 5, "running", 78, 2),
  job("QF-9A71", "rigetti_ankaa_3", "QRC Forecast", 6, "queued", null, 6),
  job("QF-9A70", "local_statevector", "QRC Forecast", 6, "completed", 2.1, 14),
  job("QF-9A69", "quantinuum_h2", "QCBM", 6, "failed", 2.4, 31),
  job("QF-9A68", "ibm_brisbane", "QRC Forecast", 6, "completed", 43.2, 58),
];

const cmpDates = days(40, Date.UTC(2025, 1, 3));
const cmpActual = cmpDates.map(
  (_, i) => 100 + Math.sin(i * 0.45) * 6 + i * 0.35 + Math.cos(i * 1.3) * 1.5,
);
export const DEMO_COMPARISON: Comparison = {
  models: [
    {
      model: "Quantum Reservoir (Ours)",
      quantum: true,
      rmse: 0.1038,
      mae: 0.0812,
      r2: 0.597,
      train_time_s: 2.1,
      inference_ms: 3.62,
    },
    {
      model: "Linear AR (Ridge)",
      quantum: false,
      rmse: 0.1041,
      mae: 0.0815,
      r2: 0.595,
      train_time_s: 0.002,
      inference_ms: 0.001,
    },
    {
      model: "Persistence (naive)",
      quantum: false,
      rmse: 0.105,
      mae: 0.0821,
      r2: 0.587,
      train_time_s: 0,
      inference_ms: 0,
    },
    {
      model: "Classical MLP",
      quantum: false,
      rmse: 0.1112,
      mae: 0.0874,
      r2: 0.537,
      train_time_s: 0.41,
      inference_ms: 0.001,
    },
    {
      model: "Random Forest",
      quantum: false,
      rmse: 0.1276,
      mae: 0.0991,
      r2: 0.391,
      train_time_s: 0.36,
      inference_ms: 0.332,
    },
  ],
  best_classical: "Linear AR (Ridge)",
  error_reduction_pct: 0.3,
  inference_speedup: 0.0003,
  series: {
    dates: cmpDates,
    actual: cmpActual,
    qrc: cmpActual.map((v, i) => (i ? cmpActual[i - 1] * 0.55 + v * 0.45 : v)),
    classical: cmpActual.map((v, i) => (i ? cmpActual[i - 1] : v)),
    advantage: cmpDates.map((_, i) => (i >= 8 && i <= 13) || (i >= 26 && i <= 31)),
  },
  noise: {
    p: 0.01,
    rmse_clean: 0.1038,
    rmse_noisy: 0.103,
    degradation_pct: -0.7,
    advantage_retained: true,
  },
};
