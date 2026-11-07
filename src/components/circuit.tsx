import type { ReactElement } from "react";
import { pairCount, type ModelSettings } from "../lib/settings";

const GATE_COLOR: Record<string, string> = {
  Rx: "var(--cyan)",
  Ry: "var(--purple-light)",
  Rz: "var(--amber)",
};

/**
 * Schematic of the QRC reservoir in backend/quantum/reservoir.py:
 * encoding → per layer [re-uploaded encoding (angle)] → Rx·Ry·Rz rotations → CZ+RZZ entangling block → measurement.
 * Rotation labels show the dominant rotation per qubit/layer when the API supplies a layout.
 */
export function QuantumCircuit({
  qubits,
  depth,
  strategy,
  encoding,
  layout,
  animated = true,
}: {
  qubits: number;
  depth: number;
  strategy: ModelSettings["strategy"];
  encoding: ModelSettings["encoding"];
  layout?: string[][];
  animated?: boolean;
}) {
  const wire = qubits > 8 ? 26 : 34;
  const gate = qubits > 8 ? 20 : 26;
  const col = gate + 16;
  const top = 26,
    left = 44;
  const reupload = encoding === "angle";
  const layerCols = (reupload ? 1 : 0) + 2;
  const preCols = encoding === "angle" ? 0 : 1;
  const width = left + (preCols + depth * layerCols + 1) * col + 12;
  const height = top + qubits * wire + 6;
  const wy = (q: number) => top + q * wire + wire / 2;
  const cx = (c: number) => left + c * col + col / 2;
  const pairs = pairCount(qubits, strategy);
  const labels = ["Rx", "Ry", "Rz"];

  const cols: ReactElement[] = [];
  let c = 0;
  if (encoding === "amplitude") {
    cols.push(
      <g key="amp">
        <rect
          x={cx(c) - gate / 2}
          y={wy(0) - gate / 2}
          width={gate}
          height={wy(qubits - 1) - wy(0) + gate}
          rx="6"
          className="g-encode"
        />
        <text
          x={cx(c)}
          y={(wy(0) + wy(qubits - 1)) / 2}
          className="g-text vertical"
          transform={`rotate(-90 ${cx(c)} ${(wy(0) + wy(qubits - 1)) / 2})`}
        >
          |ψ(x)⟩ amplitude
        </text>
      </g>,
    );
    c++;
  } else if (encoding === "basis") {
    cols.push(
      <g key="basis">
        {Array.from({ length: qubits }, (_, q) => (
          <g key={q}>
            <rect
              x={cx(c) - gate / 2}
              y={wy(q) - gate / 2}
              width={gate}
              height={gate}
              rx="5"
              className="g-encode"
            />
            <text x={cx(c)} y={wy(q)} className="g-text">
              Xᵇ
            </text>
          </g>
        ))}
      </g>,
    );
    c++;
  }
  for (let l = 0; l < depth; l++) {
    const layerStart = c;
    if (reupload) {
      const ec = c;
      cols.push(
        <g key={`e${l}`}>
          {Array.from({ length: qubits }, (_, q) => (
            <g key={q}>
              <rect
                x={cx(ec) - gate / 2}
                y={wy(q) - gate / 2}
                width={gate}
                height={gate}
                rx="5"
                className="g-encode"
              />
              <text x={cx(ec)} y={wy(q)} className="g-text small">
                x{q}
              </text>
            </g>
          ))}
        </g>,
      );
      c++;
    }
    const rc = c;
    cols.push(
      <g key={`r${l}`}>
        {Array.from({ length: qubits }, (_, q) => {
          const label = layout?.[q]?.[l] ?? labels[(q + l) % 3];
          const color = GATE_COLOR[label] ?? "var(--cyan)";
          return (
            <g
              key={q}
              className={animated ? "g-pulse" : undefined}
              style={{ animationDelay: `${((q + l) % 6) * 0.25}s`, color }}
            >
              <title>{`Layer ${l + 1}, q${q}: Rx·Ry·Rz (dominant ${label})`}</title>
              <rect
                x={cx(rc) - gate / 2}
                y={wy(q) - gate / 2}
                width={gate}
                height={gate}
                rx="5"
                fill="color-mix(in srgb, currentColor 14%, var(--bg))"
                stroke="currentColor"
              />
              <text x={cx(rc)} y={wy(q)} className="g-text" fill="currentColor">
                {label}
              </text>
            </g>
          );
        })}
      </g>,
    );
    c++;
    const ec = c;
    const x0 = cx(ec) - gate / 2 - 2,
      x1 = cx(ec) + gate / 2 + 2;
    cols.push(
      <g key={`n${l}`}>
        <title>{`Layer ${l + 1}: ${pairs} CZ + RZZ couplings (${strategy})`}</title>
        <rect
          x={x0}
          y={wy(0) - gate / 2}
          width={x1 - x0}
          height={wy(qubits - 1) - wy(0) + gate}
          rx="7"
          className="g-entangle"
        />
        {strategy === "linear" || strategy === "ring"
          ? Array.from({ length: qubits - 1 }, (_, q) => (
              <line
                key={q}
                x1={cx(ec) + (q % 2 ? 5 : -5)}
                x2={cx(ec) + (q % 2 ? 5 : -5)}
                y1={wy(q)}
                y2={wy(q + 1)}
                className="g-link"
              />
            ))
          : Array.from({ length: Math.min(qubits - 1, 4) }, (_, k) => (
              <line
                key={k}
                x1={cx(ec) - 7 + k * 4.5}
                x2={cx(ec) - 7 + k * 4.5}
                y1={wy(0)}
                y2={wy(qubits - 1 - (k % 2))}
                className="g-link"
              />
            ))}
        {strategy === "ring" && qubits > 2 && (
          <path
            d={`M${x1 - 3},${wy(0)} C${x1 + 8},${wy(0)} ${x1 + 8},${wy(qubits - 1)} ${x1 - 3},${wy(qubits - 1)}`}
            className="g-link"
            fill="none"
          />
        )}
        {Array.from({ length: qubits }, (_, q) => (
          <circle
            key={q}
            cx={cx(ec) + (strategy === "linear" || strategy === "ring" ? (q % 2 ? 5 : -5) : 0)}
            cy={wy(q)}
            r="3"
            className="g-dot"
          />
        ))}
      </g>,
    );
    cols.push(
      <text key={`lbl${l}`} x={(cx(layerStart) + cx(ec)) / 2} y={12} className="layer-label">
        L{l + 1}
      </text>,
    );
    c++;
  }
  const mc = c;
  return (
    <div className="circuit-scroll">
      <svg
        className="circuit"
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", maxWidth: width, minWidth: Math.min(width, 560), height: "auto" }}
        role="img"
        aria-label={`${qubits}-qubit reservoir, ${depth} layers, ${strategy} entanglement, ${encoding} encoding`}
      >
        {Array.from({ length: qubits }, (_, q) => (
          <g key={q}>
            <text x={4} y={wy(q)} className="q-label">
              q{q}
            </text>
            <line x1={left - 6} x2={cx(mc)} y1={wy(q)} y2={wy(q)} className="wire" />
          </g>
        ))}
        {cols}
        {Array.from({ length: qubits }, (_, q) => (
          <g key={`m${q}`}>
            <rect
              x={cx(mc) - gate / 2}
              y={wy(q) - gate / 2}
              width={gate}
              height={gate}
              rx="5"
              className="g-measure"
            />
            <path
              d={`M${cx(mc) - gate * 0.28},${wy(q) + gate * 0.18} A${gate * 0.3},${gate * 0.3} 0 0 1 ${cx(mc) + gate * 0.28},${wy(q) + gate * 0.18} M${cx(mc)},${wy(q) + gate * 0.18} L${cx(mc) + gate * 0.2},${wy(q) - gate * 0.22}`}
              className="g-meter"
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
