import type { TrainConfig } from "./api";

export interface ModelSettings {
  qubits: number;
  depth: number;
  strategy: TrainConfig["entanglement"];
  encoding: TrainConfig["input_encoding"];
  bases: ("X" | "Y" | "Z")[];
  backend: string;
  datasetId: string;
  normalize: boolean;
  scale: boolean;
  split: number;
  window: number;
  includeInput: boolean;
}

export const DEFAULT_SETTINGS: ModelSettings = {
  qubits: 6,
  depth: 4,
  strategy: "full",
  encoding: "angle",
  bases: ["Z"],
  backend: "local_statevector",
  datasetId: "sp500",
  normalize: true,
  scale: false,
  split: 80,
  window: 10,
  includeInput: true,
};

/** Mirrors QuantumReservoir._pairs in backend/quantum/reservoir.py. */
export const pairCount = (n: number, strategy: ModelSettings["strategy"]) =>
  strategy === "full"
    ? (n * (n - 1)) / 2
    : strategy === "linear"
      ? n - 1
      : strategy === "ring"
        ? n > 2
          ? n
          : 1
        : n - 1 + Math.floor(((n - 2) * (n - 1)) / 4);

export const estimateGates = (
  s: Pick<ModelSettings, "qubits" | "depth" | "strategy" | "encoding">,
) => {
  const encoding =
    s.encoding === "angle" ? s.qubits * s.depth : s.encoding === "basis" ? s.qubits : 1;
  return encoding + s.depth * (3 * s.qubits + 2 * pairCount(s.qubits, s.strategy));
};

export const toTrainConfig = (s: ModelSettings): TrainConfig => ({
  dataset_id: s.datasetId,
  n_qubits: s.qubits,
  circuit_depth: s.depth,
  entanglement: s.strategy,
  input_encoding: s.encoding,
  measurement_basis: s.bases,
  window_size: s.window,
  train_split: s.split / 100,
  normalize: s.normalize,
  scale: s.scale,
  include_input: s.includeInput,
  execution_backend: s.backend === "local_statevector" ? null : s.backend,
});
