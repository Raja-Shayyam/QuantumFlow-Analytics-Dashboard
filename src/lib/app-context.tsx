import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  ApiError,
  getApiUrl,
  setApiUrl,
  type Backend,
  type Comparison,
  type Dataset,
  type Health,
  type Job,
  type TrainResult,
} from "./api";
import { DEMO_BACKENDS, DEMO_COMPARISON, DEMO_DATASETS, DEMO_JOBS } from "./demo";
import { errorMessage } from "./format";
import { DEFAULT_SETTINGS, type ModelSettings } from "./settings";
import type { Tone } from "../components/ui";

export type Page = "overview" | "model" | "data" | "results" | "hardware";
export type ApiStatus = "checking" | "online" | "offline";
export interface Toast {
  id: number;
  message: string;
  tone: Tone;
  title?: string;
}

interface AppState {
  page: Page;
  navigate: (page: Page) => void;
  apiStatus: ApiStatus;
  live: boolean;
  apiUrl: string;
  health: Health | null;
  connect: () => Promise<boolean>;
  changeApiUrl: (url: string | null) => Promise<boolean>;
  datasets: Dataset[];
  addDataset: (d: Dataset) => void;
  backends: Backend[];
  backendError: string | null;
  refreshBackends: () => Promise<void>;
  jobs: Job[];
  refreshJobs: () => Promise<void>;
  activeJobs: number;
  latest: TrainResult | null;
  previous: TrainResult["metrics"] | null;
  onTrained: (r: TrainResult) => void;
  comparison: Comparison | null;
  comparisonLoading: boolean;
  comparisonError: string | null;
  loadComparison: () => void;
  settings: ModelSettings;
  update: (patch: Partial<ModelSettings>) => void;
  toasts: Toast[];
  notify: (message: string, tone?: Tone, title?: string) => void;
  dismiss: (id: number) => void;
  apiDialogOpen: boolean;
  setApiDialogOpen: (open: boolean) => void;
}

const Ctx = createContext<AppState | null>(null);

export const useApp = () => {
  const value = useContext(Ctx);
  if (!value) throw new Error("useApp must be used inside AppProvider");
  return value;
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<Page>("overview");
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");
  const [apiUrl, setUrl] = useState(getApiUrl());
  const [health, setHealth] = useState<Health | null>(null);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [backends, setBackends] = useState<Backend[]>([]);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [latest, setLatest] = useState<TrainResult | null>(null);
  const [previous, setPrevious] = useState<TrainResult["metrics"] | null>(null);
  const [modelVersion, setModelVersion] = useState(0);
  const [comparison, setComparison] = useState<{ version: number; data: Comparison } | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ModelSettings>(DEFAULT_SETTINGS);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [apiDialogOpen, setApiDialogOpen] = useState(false);
  const toastId = useRef(0);
  const live = apiStatus === "online";

  const dismiss = useCallback(
    (id: number) => setToasts((all) => all.filter((t) => t.id !== id)),
    [],
  );
  const notify = useCallback(
    (message: string, tone: Tone = "success", title?: string) => {
      const id = ++toastId.current;
      setToasts((all) => [...all.slice(-3), { id, message, tone, title }]);
      setTimeout(() => dismiss(id), tone === "danger" ? 8000 : 4500);
    },
    [dismiss],
  );
  const update = useCallback(
    (patch: Partial<ModelSettings>) => setSettings((s) => ({ ...s, ...patch })),
    [],
  );
  const navigate = useCallback((p: Page) => {
    setPage(p);
    window.scrollTo({ top: 0 });
  }, []);

  const refreshBackends = useCallback(async () => {
    try {
      const res = await api.backends(true);
      setBackends(res.backends);
      setBackendError(res.error);
    } catch (error) {
      setBackendError(errorMessage(error));
    }
  }, []);
  const refreshJobs = useCallback(async () => {
    try {
      setJobs((await api.jobs()).jobs);
    } catch {
      /* transient — the next poll retries */
    }
  }, []);

  const connect = useCallback(async () => {
    setApiStatus((s) => (s === "online" ? s : "checking"));
    try {
      setHealth(await api.health());
      setApiStatus("online");
      const [ds, bk] = await Promise.allSettled([api.datasets(), api.backends(), refreshJobs()]);
      if (ds.status === "fulfilled") setDatasets(ds.value.datasets);
      if (bk.status === "fulfilled") {
        setBackends(bk.value.backends);
        setBackendError(bk.value.error);
      }
      try {
        setLatest(await api.latest());
        setModelVersion((v) => v + 1);
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 404)) throw error;
        setLatest(null);
      }
      return true;
    } catch {
      setApiStatus("offline");
      setHealth(null);
      return false;
    }
  }, [refreshJobs]);

  const changeApiUrl = useCallback(
    async (url: string | null) => {
      setApiUrl(url);
      setUrl(getApiUrl());
      setLatest(null);
      setComparison(null);
      setApiStatus("checking");
      return connect();
    },
    [connect],
  );

  useEffect(() => {
    connect();
  }, [connect]);

  // Heartbeat: notices the backend starting or stopping.
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        setHealth(await api.health());
        if (apiStatus !== "online") connect();
      } catch {
        setApiStatus("offline");
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [apiStatus, connect]);

  const activeJobs = (live ? jobs : DEMO_JOBS).filter(
    (j) => j.status === "queued" || j.status === "running",
  ).length;
  useEffect(() => {
    if (!live || (page !== "hardware" && !activeJobs)) return;
    const timer = setInterval(refreshJobs, 2500);
    return () => clearInterval(timer);
  }, [live, page, activeJobs, refreshJobs]);

  const loadComparison = useCallback(async () => {
    setComparisonLoading(true);
    setComparisonError(null);
    try {
      const data = await api.compare();
      setComparison({ version: modelVersion, data });
    } catch (error) {
      setComparisonError(errorMessage(error));
    } finally {
      setComparisonLoading(false);
    }
  }, [modelVersion]);

  useEffect(() => {
    if (
      page === "results" &&
      live &&
      latest &&
      comparison?.version !== modelVersion &&
      !comparisonLoading &&
      !comparisonError
    )
      loadComparison();
  }, [
    page,
    live,
    latest,
    comparison,
    modelVersion,
    comparisonLoading,
    comparisonError,
    loadComparison,
  ]);

  const onTrained = useCallback(
    (result: TrainResult) => {
      setPrevious(latest?.metrics ?? null);
      setLatest(result);
      setModelVersion((v) => v + 1);
      setComparisonError(null);
      refreshJobs();
    },
    [latest, refreshJobs],
  );

  const value = useMemo<AppState>(
    () => ({
      page,
      navigate,
      apiStatus,
      live,
      apiUrl,
      health,
      connect,
      changeApiUrl,
      datasets: live && datasets.length ? datasets : DEMO_DATASETS,
      addDataset: (d) => setDatasets((all) => [...all.filter((x) => x.id !== d.id), d]),
      backends: live && backends.length ? backends : DEMO_BACKENDS,
      backendError: live ? backendError : null,
      refreshBackends,
      jobs: live ? jobs : DEMO_JOBS,
      refreshJobs,
      activeJobs,
      latest: live ? latest : null,
      previous,
      onTrained,
      comparison: live ? (comparison?.data ?? null) : DEMO_COMPARISON,
      comparisonLoading,
      comparisonError,
      loadComparison,
      settings,
      update,
      toasts,
      notify,
      dismiss,
      apiDialogOpen,
      setApiDialogOpen,
    }),
    [
      page,
      navigate,
      apiStatus,
      live,
      apiUrl,
      health,
      connect,
      changeApiUrl,
      datasets,
      backends,
      backendError,
      refreshBackends,
      jobs,
      refreshJobs,
      activeJobs,
      latest,
      previous,
      onTrained,
      comparison,
      comparisonLoading,
      comparisonError,
      loadComparison,
      settings,
      update,
      toasts,
      notify,
      dismiss,
      apiDialogOpen,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
