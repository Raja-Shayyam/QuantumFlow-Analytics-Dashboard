import { useEffect, useId, useRef, type ReactNode } from "react";

export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const paths: Record<string, string> = {
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  sliders: "M4 7h10M18 7h2M14 5v4M4 17h2M10 17h10M6 15v4M4 12h5M13 12h7M9 10v4",
  database: "M5 6c0 2 14 2 14 0s-14-2-14 0v12c0 2 14 2 14 0V6M5 12c0 2 14 2 14 0",
  chart: "M4 19V5M4 19h16M7 15l4-4 3 2 5-7",
  cpu: "M9 9h6v6H9zM3 10h3M3 14h3M18 10h3M18 14h3M10 3v3M14 3v3M10 18v3M14 18v3M6 6h12v12H6z",
  search: "M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm5-2 4 4",
  bell: "M6 9a6 6 0 0 1 12 0c0 7 3 7 3 7H3s3 0 3-7M10 20h4",
  arrowUp: "M12 19V5M6 11l6-6 6 6",
  arrowDown: "M12 5v14M6 13l6 6 6-6",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  zap: "m13 2-9 12h8l-1 8 9-12h-8z",
  activity: "M3 12h4l2-7 4 14 2-7h6",
  upload: "M12 16V4m-5 5 5-5 5 5M5 20h14",
  check: "m5 12 4 4L19 6",
  alert:
    "M12 9v4m0 4h.01M10.3 4.2 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5v-5m0-3h.01",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",
  play: "m9 7 8 5-8 5z",
  refresh: "M20 6v5h-5M4 18v-5h5M18 9a7 7 0 0 0-12-2M6 15a7 7 0 0 0 12 2",
  chevronDown: "m8 10 4 4 4-4",
  chevronLeft: "m14 7-5 5 5 5",
  chevronRight: "m10 7 5 5-5 5",
  menu: "M4 7h16M4 12h16M4 17h16",
  x: "M6 6l12 12M18 6 6 18",
  plug: "M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0zM12 16v5",
  sparkles:
    "m12 3 1.4 4.1L17 9l-3.6 1.9L12 15l-1.4-4.1L7 9l3.6-1.9zM19 15l.7 2.1L22 18l-2.3.9L19 21l-.7-2.1L16 18l2.3-.9z",
  eye: "M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6Zm9 2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5",
  layers: "m12 3 9 5-9 5-9-5zM3 13l9 5 9-5",
  beaker: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3M7.5 14h9",
  server: "M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5",
  terminal: "m5 8 4 4-4 4M12 17h7",
  command: "M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z",
  target:
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2",
};

export function Icon({
  name,
  size = 18,
  className = "",
}: {
  name: keyof typeof paths | string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  onClick,
  loading = false,
  disabled = false,
  icon,
  title,
  type = "button",
  className = "",
}: {
  children?: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "quantum";
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  title?: string;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      className={`btn btn-${variant} btn-${size} ${className}`}
      onClick={onClick}
      disabled={loading || disabled}
      title={title}
      aria-busy={loading || undefined}
    >
      {loading ? (
        <span className="spinner" aria-hidden="true" />
      ) : icon ? (
        <Icon name={icon} size={size === "sm" ? 14 : 16} />
      ) : null}
      {children}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  onClick,
  badge,
  active,
}: {
  icon: string;
  label: string;
  onClick?: () => void;
  badge?: number;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-btn ${active ? "active" : ""}`}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <Icon name={icon} size={18} />
      {!!badge && <span className="icon-btn-badge">{badge > 9 ? "9+" : badge}</span>}
    </button>
  );
}

export function Badge({
  tone,
  children,
  pulse = false,
  dot = true,
}: {
  tone: Tone;
  children: ReactNode;
  pulse?: boolean;
  dot?: boolean;
}) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot && <i className={pulse ? "pulse" : ""} />}
      {children}
    </span>
  );
}

export function Card({
  children,
  className = "",
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "aside";
}) {
  return <Tag className={`card ${className}`}>{children}</Tag>;
}

export function CardHeader({
  title,
  subtitle,
  actions,
  icon,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: string;
}) {
  return (
    <header className="card-header">
      {icon && (
        <span className="card-icon">
          <Icon name={icon} size={16} />
        </span>
      )}
      <div className="card-heading">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="card-actions">{actions}</div>}
    </header>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function SampleTag() {
  return <span className="sample-tag">Sample data</span>;
}

export function Field({
  label,
  value,
  hint,
  children,
  htmlFor,
}: {
  label: ReactNode;
  value?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="field">
      <div className="field-label">
        <label htmlFor={htmlFor}>{label}</label>
        {value !== undefined && <span className="field-value">{value}</span>}
      </div>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  marks,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
  marks?: [string, string];
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="slider">
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        style={{ "--pct": `${pct}%` } as React.CSSProperties}
      />
      <div className="slider-marks">
        <span>{marks?.[0] ?? min}</span>
        <span>{marks?.[1] ?? max}</span>
      </div>
    </div>
  );
}

export function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="toggle-row">
      <div>
        <label htmlFor={id}>{label}</label>
        {description && <p>{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={value}
        className={`switch ${value ? "on" : ""}`}
        onClick={() => onChange(!value)}
      >
        <span />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? "active" : ""}
          onClick={() => onChange(o.value)}
          title={o.hint}
        >
          <i />
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function CheckGroup<T extends string>({
  values,
  options,
  onChange,
  label,
}: {
  values: T[];
  options: T[];
  onChange: (v: T[]) => void;
  label: string;
}) {
  return (
    <div className="check-group" role="group" aria-label={label}>
      {options.map((o) => {
        const checked = values.includes(o);
        return (
          <label key={o} className={checked ? "checked" : ""}>
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onChange(checked ? values.filter((v) => v !== o) : [...values, o])}
            />
            <span className="check-box">{checked && <Icon name="check" size={12} />}</span>
            {o}
          </label>
        );
      })}
    </div>
  );
}

export function Select({
  id,
  value,
  onChange,
  children,
  label,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  label?: string;
}) {
  return (
    <div className="select">
      <select id={id} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
      <Icon name="chevronDown" size={16} />
    </div>
  );
}

export function Progress({
  value,
  label,
  detail,
  indeterminate = false,
}: {
  value: number;
  label: string;
  detail?: string;
  indeterminate?: boolean;
}) {
  return (
    <div
      className={`progress ${indeterminate ? "indeterminate" : ""}`}
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="progress-text">
        <span>{label}</span>
        {!indeterminate && <b>{detail ?? `${Math.round(value * 100)}%`}</b>}
      </div>
      <div className="progress-track">
        <i style={{ width: `${Math.max(3, value * 100)}%` }} />
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Callout({
  tone = "info",
  icon = "info",
  title,
  children,
  action,
}: {
  tone?: Tone;
  icon?: string;
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`callout callout-${tone}`} role={tone === "danger" ? "alert" : undefined}>
      <Icon name={icon} size={18} />
      <div>
        {title && <b>{title}</b>}
        <p>{children}</p>
      </div>
      {action}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    requestAnimationFrame(() =>
      ref.current?.querySelector<HTMLElement>("input, button, [tabindex]")?.focus(),
    );
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className={`modal modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? (title ? titleId : undefined)}
      >
        {title && (
          <header className="modal-header">
            <h2 id={titleId}>{title}</h2>
            <IconButton icon="x" label="Close" onClick={onClose} />
          </header>
        )}
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}
