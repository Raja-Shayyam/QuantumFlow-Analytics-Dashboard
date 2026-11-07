import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Callout, Icon, IconButton, Kbd, Modal } from "./components/ui";
import { AppProvider, useApp, type Page } from "./lib/app-context";
import { titleCase } from "./lib/format";
import { DataManagement } from "./screens/Data";
import { Hardware } from "./screens/Hardware";
import { ModelConfig } from "./screens/ModelConfig";
import { Overview } from "./screens/Overview";
import { Results } from "./screens/Results";

const NAV: { id: Page; label: string; icon: string; description: string }[] = [
  { id: "overview", label: "Overview", icon: "grid", description: "Forecast, KPIs and circuit" },
  {
    id: "model",
    label: "Model configuration",
    icon: "sliders",
    description: "Configure and deploy the reservoir",
  },
  {
    id: "data",
    label: "Data management",
    icon: "database",
    description: "Datasets and preprocessing",
  },
  {
    id: "results",
    label: "Results & analysis",
    icon: "chart",
    description: "Benchmark against classical models",
  },
  {
    id: "hardware",
    label: "Hardware monitor",
    icon: "cpu",
    description: "Backends and job history",
  },
];

function Sidebar({
  expanded,
  onToggle,
  mobileOpen,
  onNavigate,
}: {
  expanded: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onNavigate: () => void;
}) {
  const { page, navigate, live, apiStatus, setApiDialogOpen } = useApp();
  return (
    <aside
      className={`sidebar ${expanded ? "expanded" : ""} ${mobileOpen ? "mobile-open" : ""}`}
      aria-label="Main navigation"
    >
      <div className="brand-row">
        <span className="logo-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="22" height="22">
            <circle cx="16" cy="16" r="4" fill="currentColor" />
            <ellipse
              cx="16"
              cy="16"
              rx="13"
              ry="5.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <ellipse
              cx="16"
              cy="16"
              rx="13"
              ry="5.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              transform="rotate(60 16 16)"
            />
            <ellipse
              cx="16"
              cy="16"
              rx="13"
              ry="5.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              transform="rotate(120 16 16)"
            />
          </svg>
        </span>
        <span className="brand-text">
          Quantum<b>Flow</b>
          <small>Analytics</small>
        </span>
      </div>
      <nav className="nav">
        {NAV.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${page === item.id ? "active" : ""}`}
            aria-current={page === item.id ? "page" : undefined}
            data-tip={item.label}
            onClick={() => {
              navigate(item.id);
              onNavigate();
            }}
          >
            <Icon name={item.icon} size={20} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <button
          className={`connection ${live ? "ok" : apiStatus === "checking" ? "checking" : "off"}`}
          data-tip={live ? "API connected" : "Connect API"}
          onClick={() => setApiDialogOpen(true)}
        >
          <span className="connection-dot" />
          <span className="connection-text">
            <b>QRC engine</b>
            <small>
              {live ? "Connected" : apiStatus === "checking" ? "Connecting…" : "Offline"}
            </small>
          </span>
        </button>
        <button
          className="collapse-btn"
          onClick={onToggle}
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
          data-tip={expanded ? "Collapse" : "Expand"}
        >
          <Icon name={expanded ? "chevronLeft" : "chevronRight"} size={18} />
          <span>Collapse</span>
        </button>
      </div>
    </aside>
  );
}

function NotificationsMenu({ onClose }: { onClose: () => void }) {
  const { jobs, live, navigate } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) =>
      !ref.current?.parentElement?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  const recent = jobs.slice(0, 6);
  const tone = {
    completed: "success",
    running: "info",
    queued: "warning",
    failed: "danger",
  } as const;
  return (
    <div ref={ref} className="popover notifications" role="dialog" aria-label="Job activity">
      <header>
        <b>Job activity</b>
        {!live && <span className="sample-tag">Sample</span>}
      </header>
      {recent.length ? (
        <ul>
          {recent.map((j) => (
            <li key={j.id}>
              <Badge tone={tone[j.status]} pulse={j.status === "running"}>
                {titleCase(j.status)}
              </Badge>
              <div>
                <b>{String(j.metadata.algorithm ?? j.kind)}</b>
                <span>
                  {j.id} · {String(j.metadata.backend ?? "")}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="popover-empty">No jobs yet.</p>
      )}
      <footer>
        <button
          className="link"
          onClick={() => {
            navigate("hardware");
            onClose();
          }}
        >
          View all jobs <Icon name="arrowRight" size={14} />
        </button>
      </footer>
    </div>
  );
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { navigate, datasets, update, setApiDialogOpen, refreshBackends, live } = useApp();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const items = useMemo(() => {
    const all = [
      ...NAV.map((n) => ({
        id: `p-${n.id}`,
        group: "Pages",
        icon: n.icon,
        label: n.label,
        hint: n.description,
        run: () => navigate(n.id),
      })),
      ...datasets.map((d) => ({
        id: `d-${d.id}`,
        group: "Datasets",
        icon: "database",
        label: d.name,
        hint: `Select for training · ${d.rows?.toLocaleString() ?? "?"} rows`,
        run: () => (update({ datasetId: d.id }), navigate("data")),
      })),
      {
        id: "a-deploy",
        group: "Actions",
        icon: "play",
        label: "Deploy a model",
        hint: "Open model configuration",
        run: () => navigate("model"),
      },
      {
        id: "a-api",
        group: "Actions",
        icon: "plug",
        label: "Connect API",
        hint: "Change the QuantumFlow API URL",
        run: () => setApiDialogOpen(true),
      },
      ...(live
        ? [
            {
              id: "a-refresh",
              group: "Actions",
              icon: "refresh",
              label: "Refresh backends",
              hint: "Re-query qBraid devices",
              run: () => refreshBackends(),
            },
          ]
        : []),
    ];
    const q = query.trim().toLowerCase();
    return q ? all.filter((i) => `${i.label} ${i.hint}`.toLowerCase().includes(q)) : all;
  }, [query, datasets, navigate, update, setApiDialogOpen, refreshBackends, live]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
    }
  }, [open]);
  useEffect(() => setIndex(0), [query]);

  const choose = (i: number) => {
    const item = items[i];
    if (!item) return;
    onClose();
    item.run();
  };

  let lastGroup = "";
  return (
    <Modal open={open} onClose={onClose} labelledBy="palette-input">
      <div className="palette">
        <div className="palette-input">
          <Icon name="search" size={18} />
          <input
            id="palette-input"
            autoFocus
            placeholder="Search pages, datasets and actions…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown")
                (e.preventDefault(), setIndex((i) => Math.min(items.length - 1, i + 1)));
              if (e.key === "ArrowUp") (e.preventDefault(), setIndex((i) => Math.max(0, i - 1)));
              if (e.key === "Enter") (e.preventDefault(), choose(index));
            }}
            aria-activedescendant={items[index]?.id}
          />
          <Kbd>Esc</Kbd>
        </div>
        <ul className="palette-list" role="listbox">
          {items.map((item, i) => {
            const heading = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <li key={item.id} role="presentation">
                {heading && <div className="palette-group">{heading}</div>}
                <button
                  id={item.id}
                  role="option"
                  aria-selected={i === index}
                  className={i === index ? "active" : ""}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => choose(i)}
                >
                  <Icon name={item.icon} size={16} />
                  <span>{item.label}</span>
                  <small>{item.hint}</small>
                </button>
              </li>
            );
          })}
          {!items.length && <li className="palette-empty">No results for “{query}”</li>}
        </ul>
        <div className="palette-foot">
          <span>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span>
            <Kbd>↵</Kbd> select
          </span>
        </div>
      </div>
    </Modal>
  );
}

function ApiDialog() {
  const { apiDialogOpen, setApiDialogOpen, apiUrl, changeApiUrl, live, health, notify } = useApp();
  const [value, setValue] = useState(apiUrl);
  const [testing, setTesting] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (apiDialogOpen) {
      setValue(apiUrl);
      setFailed(false);
    }
  }, [apiDialogOpen, apiUrl]);
  const submit = async (url: string | null) => {
    setTesting(true);
    setFailed(false);
    const ok = await changeApiUrl(url);
    setTesting(false);
    if (ok) {
      setApiDialogOpen(false);
      notify("Live data is now shown across the dashboard.", "success", "API connected");
    } else setFailed(true);
  };
  return (
    <Modal
      open={apiDialogOpen}
      onClose={() => setApiDialogOpen(false)}
      title="Connect the QuantumFlow API"
      footer={
        <>
          <Button variant="ghost" onClick={() => submit(null)} disabled={testing}>
            Reset to default
          </Button>
          <Button
            type="submit"
            loading={testing}
            icon="plug"
            onClick={() => submit(value.trim() || null)}
          >
            {testing ? "Connecting…" : "Connect"}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(value.trim() || null);
        }}
      >
        <div className="field">
          <div className="field-label">
            <label htmlFor="api-url">API URL</label>
            <Badge tone={live ? "success" : "warning"}>
              {live ? `Connected · v${health?.version}` : "Not connected"}
            </Badge>
          </div>
          <input
            id="api-url"
            className="text-input mono"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="http://localhost:8000"
            spellCheck={false}
          />
        </div>
      </form>
      {failed && (
        <Callout tone="danger" icon="alert" title="Couldn't reach the API">
          Check that the server is running, the URL is correct, and CORS allows this origin. HTTPS
          pages can only call HTTPS APIs or localhost.
        </Callout>
      )}
      <div className="setup-steps">
        <b>Start the backend locally</b>
        <pre>
          <code>{`cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000`}</code>
        </pre>
        <p>Until it's connected, the dashboard shows clearly labelled sample data.</p>
      </div>
    </Modal>
  );
}

function ToastStack() {
  const { toasts, dismiss } = useApp();
  const icon = {
    success: "check",
    danger: "alert",
    warning: "alert",
    info: "info",
    neutral: "info",
  } as const;
  const title = {
    success: "Success",
    danger: "Error",
    warning: "Heads up",
    info: "Info",
    neutral: "Notice",
  } as const;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.tone}`}
          role={t.tone === "danger" ? "alert" : "status"}
        >
          <span className="toast-icon">
            <Icon name={icon[t.tone]} size={18} />
          </span>
          <div>
            <b>{t.title ?? title[t.tone]}</b>
            <p>{t.message}</p>
          </div>
          <IconButton icon="x" label="Dismiss notification" onClick={() => dismiss(t.id)} />
        </div>
      ))}
    </div>
  );
}

function Shell() {
  const { page, live, apiStatus, apiUrl, health, latest, activeJobs, setApiDialogOpen, connect } =
    useApp();
  const [expanded, setExpanded] = useState(() => localStorage.getItem("qf_sidebar") === "expanded");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const current = NAV.find((n) => n.id === page)!;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const toggle = () =>
    setExpanded((e) => {
      localStorage.setItem("qf_sidebar", e ? "collapsed" : "expanded");
      return !e;
    });

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <div className={`shell ${expanded ? "sidebar-expanded" : ""}`}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Sidebar
        expanded={expanded}
        onToggle={toggle}
        mobileOpen={mobileOpen}
        onNavigate={() => setMobileOpen(false)}
      />
      {mobileOpen && <div className="scrim" onClick={() => setMobileOpen(false)} />}
      <header className="topbar">
        <div className="topbar-left">
          <span className="mobile-only">
            <IconButton icon="menu" label="Open navigation" onClick={() => setMobileOpen(true)} />
          </span>
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <span>QuantumFlow</span>
            <Icon name="chevronRight" size={14} />
            <b>{current.label}</b>
          </nav>
        </div>
        <button className="search-trigger" onClick={() => setPaletteOpen(true)}>
          <Icon name="search" size={16} />
          <span>Search or jump to…</span>
          <Kbd>{isMac ? "⌘" : "Ctrl"} K</Kbd>
        </button>
        <div className="topbar-right">
          <div className="popover-anchor">
            <IconButton
              icon="bell"
              label="Job activity"
              badge={activeJobs}
              active={notificationsOpen}
              onClick={() => setNotificationsOpen((o) => !o)}
            />
            {notificationsOpen && <NotificationsMenu onClose={() => setNotificationsOpen(false)} />}
          </div>
          <button
            className={`api-pill ${live ? "ok" : apiStatus === "checking" ? "checking" : "off"}`}
            onClick={() => setApiDialogOpen(true)}
          >
            <i />
            <span>
              {live ? "Live API" : apiStatus === "checking" ? "Connecting" : "Sample mode"}
            </span>
          </button>
        </div>
      </header>
      {apiStatus === "offline" && (
        <div className="banner" role="status">
          <Icon name="plug" size={16} />
          <span>
            <b>Viewing sample data.</b> The QuantumFlow API at{" "}
            <code>{apiUrl.replace(/^https?:\/\//, "")}</code> isn't reachable, so real training and
            jobs are disabled.
          </span>
          <div className="banner-actions">
            <Button variant="ghost" size="sm" icon="refresh" onClick={connect}>
              Retry
            </Button>
            <Button size="sm" onClick={() => setApiDialogOpen(true)}>
              Connect API
            </Button>
          </div>
        </div>
      )}
      <main id="main" className="main" key={page}>
        {page === "overview" && <Overview />}
        {page === "model" && <ModelConfig />}
        {page === "data" && <DataManagement />}
        {page === "results" && <Results />}
        {page === "hardware" && <Hardware />}
      </main>
      <footer className="statusbar">
        <span className={`status-item ${live ? "ok" : "off"}`}>
          <i />
          {live ? "Connected" : apiStatus === "checking" ? "Connecting" : "Offline"}
        </span>
        <button
          className="status-item link-like"
          onClick={() => setApiDialogOpen(true)}
          title="Change API URL"
        >
          <Icon name="plug" size={12} /> {apiUrl.replace(/^https?:\/\//, "")}
        </button>
        <span className="status-item hide-sm">
          Model{" "}
          <b>
            {latest
              ? `${latest.config.n_qubits} qubits · depth ${latest.config.circuit_depth}`
              : "none"}
          </b>
        </span>
        <span className="status-item hide-sm">
          qBraid <b>{health?.integrations.qbraid ? "connected" : "local only"}</b>
        </span>
        <span className="status-item hide-sm">
          Classiq <b>{health?.integrations.classiq ? "available" : "fallback"}</b>
        </span>
        <span className="status-item push">
          {health ? `API v${health.version}` : "QuantumFlow"}
        </span>
      </footer>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ApiDialog />
      <ToastStack />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
