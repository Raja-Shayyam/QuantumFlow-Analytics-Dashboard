import { useEffect, useRef, useState } from "react";
import { LineChart } from "../components/charts";
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
  Slider,
  Toggle,
} from "../components/ui";
import { api, type DatasetPreview } from "../lib/api";
import { useApp } from "../lib/app-context";
import { DEMO_PREVIEW } from "../lib/demo";
import { errorMessage } from "../lib/format";

const typeIcon = (type: string) =>
  type === "Generated" ? "sparkles" : type === "Uploaded" ? "file" : "chart";
const range = (start: string | null, end: string | null) =>
  start && end ? `${start.slice(0, 7)} → ${end.slice(0, 7)}` : "—";

export function DataManagement() {
  const { datasets, settings, update, live, notify, addDataset, setApiDialogOpen } = useApp();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [preview, setPreview] = useState<DatasetPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const types = Array.from(new Set(datasets.map((d) => d.type)));
  const visible = datasets.filter(
    (d) =>
      d.name.toLowerCase().includes(query.trim().toLowerCase()) &&
      (type === "all" || d.type === type),
  );
  const selected = datasets.find((d) => d.id === settings.datasetId) ?? datasets[0];

  useEffect(() => {
    if (!live || !selected) return;
    let cancelled = false;
    setPreview(null);
    setPreviewError(null);
    api.preview(selected.id).then(
      (p) => !cancelled && setPreview(p),
      (e) => !cancelled && setPreviewError(errorMessage(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [live, selected?.id]);

  const shown = live ? preview : DEMO_PREVIEW;

  const upload = async (file: File) => {
    if (!live) {
      setApiDialogOpen(true);
      return notify("Uploads are stored by the backend.", "warning", "API offline");
    }
    if (!/\.csv$/i.test(file.name)) return notify("Please choose a .csv file.", "warning");
    setUploading(true);
    try {
      // const dataset = await api.upload(file.name.replace(/\.csv$/i, ""), await file.text());
      const dataset = await api.uploadFile(file.name.replace(/\.csv$/i, ""), file);
      addDataset(dataset);
      update({ datasetId: dataset.id });
      notify(
        `${dataset.rows?.toLocaleString()} rows · selected for training`,
        "success",
        `Uploaded ${dataset.name}`,
      );
    } catch (error) {
      notify(errorMessage(error), "danger", "Upload failed");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <div
      className="page"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) upload(file);
      }}
    >
      <PageHeader
        eyebrow="Data pipeline"
        title="Dataset library"
        description="The selected dataset and preprocessing settings are used for the next deployment."
        actions={
          <>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
            <Button
              icon="upload"
              loading={uploading}
              onClick={() =>
                live
                  ? fileInput.current?.click()
                  : (setApiDialogOpen(true),
                    notify("Uploads are stored by the backend.", "warning", "API offline"))
              }
            >
              Upload dataset
            </Button>
          </>
        }
      />
      {dragging && (
        <div className="drop-overlay">
          <Icon name="upload" size={28} />
          <b>Drop a CSV to upload</b>
          <span>
            Needs a date column and a value column (close / value / price), at least 60 rows.
          </span>
        </div>
      )}
      <div className="data-layout">
        <Card className="table-card">
          <div className="toolbar">
            <div className="search-field">
              <Icon name="search" size={16} />
              <input
                placeholder="Search datasets"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search datasets"
              />
              {query && (
                <button onClick={() => setQuery("")} aria-label="Clear search">
                  <Icon name="x" size={14} />
                </button>
              )}
            </div>
            <Select value={type} onChange={setType} label="Filter by type">
              <option value="all">All types</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            <span className="toolbar-count">
              {visible.length} of {datasets.length}
            </span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th className="num">Rows</th>
                  <th>Date range</th>
                  <th>Source</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((d) => {
                  const isSelected = selected?.id === d.id;
                  return (
                    <tr
                      key={d.id}
                      className={`clickable ${isSelected ? "selected" : ""}`}
                      onClick={() => update({ datasetId: d.id })}
                      onKeyDown={(e) =>
                        (e.key === "Enter" || e.key === " ") && update({ datasetId: d.id })
                      }
                      tabIndex={0}
                      aria-selected={isSelected}
                    >
                      <td>
                        <div className="cell-title">
                          <span className="cell-icon">
                            <Icon name={typeIcon(d.type)} size={16} />
                          </span>
                          <div>
                            <b>{d.name}</b>
                            {isSelected && (
                              <span className="cell-sub accent">Selected for training</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>{d.type}</td>
                      <td className="num mono">{d.rows?.toLocaleString() ?? "—"}</td>
                      <td className="mono">{range(d.start, d.end)}</td>
                      <td>{d.source ?? "—"}</td>
                      <td>
                        <Badge tone={d.status === "ready" ? "success" : "danger"}>
                          {d.status === "ready" ? "Ready" : "Error"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!visible.length && (
              <EmptyState
                icon="search"
                title="No datasets match"
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => (setQuery(""), setType("all"))}
                  >
                    Clear filters
                  </Button>
                }
              >
                Try a different search or type filter.
              </EmptyState>
            )}
          </div>
          <p className="table-foot">
            <Icon name="info" size={14} /> Tip: drag a CSV anywhere on this page to upload it.
          </p>
        </Card>

        <Card as="aside" className="preview-card">
          <CardHeader
            title="Data preview"
            subtitle={selected?.name}
            actions={!live ? <SampleTag /> : undefined}
          />
          {shown ? (
            <LineChart
              ariaLabel={`${selected?.name} price history`}
              dates={[]}
              series={[{ label: "Value", values: shown.values, color: "var(--cyan)", area: true }]}
              height={150}
              showXAxis={false}
            />
          ) : (
            <div className="chart-empty" style={{ height: 150 }}>
              {previewError ?? <span className="spinner" />}
            </div>
          )}
          <dl className="stat-grid">
            {(
              [
                ["Mean daily return", shown?.stats.mean, (v: number) => `${(v * 100).toFixed(3)}%`],
                ["Volatility (σ)", shown?.stats.std, (v: number) => `${(v * 100).toFixed(2)}%`],
                ["Skewness", shown?.stats.skewness, (v: number) => v.toFixed(3)],
                ["Kurtosis", shown?.stats.kurtosis, (v: number) => v.toFixed(2)],
              ] as const
            ).map(([label, value, fmt]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value == null ? "—" : fmt(value)}</dd>
              </div>
            ))}
          </dl>
          <div className="form-section compact">
            <h3>Preprocessing</h3>
            <Toggle
              label="Normalize"
              description="Z-score using training-set mean and σ"
              value={settings.normalize}
              onChange={(v) => update({ normalize: v })}
            />
            <Toggle
              label="Scale to [−1, 1]"
              description="Min–max scaling after normalization"
              value={settings.scale}
              onChange={(v) => update({ scale: v })}
            />
            <div className="split">
              <div className="field-label">
                <span>Train / test split</span>
                <span className="field-value">
                  {settings.split}% / {100 - settings.split}%
                </span>
              </div>
              <Slider
                label="Train/test split"
                min={50}
                max={95}
                value={settings.split}
                onChange={(v) => update({ split: v })}
                marks={["50%", "95%"]}
              />
              <div className="split-bar" aria-hidden="true">
                <i style={{ width: `${settings.split}%` }}>Train</i>
                <i>Test</i>
              </div>
            </div>
            <p className="field-hint">
              Scalers are fit on the training portion only, so there is no look-ahead leakage.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
