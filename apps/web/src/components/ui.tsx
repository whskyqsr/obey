import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ---------- Icon (Material Symbols Rounded)

export function Icon({ name, filled, className, size }: { name: string; filled?: boolean; className?: string; size?: number }) {
  return (
    <span aria-hidden className={cx("icon", filled && "filled", className)} style={size ? { fontSize: size } : undefined}>
      {name}
    </span>
  );
}

// ---------- Buttons

type Variant = "filled" | "tonal" | "outlined" | "text" | "elevated" | "danger";
const VARIANTS: Record<Variant, string> = {
  filled: "bg-primary text-on-primary hover:shadow-elev-1",
  tonal: "bg-secondary-container text-on-secondary-container hover:shadow-elev-1",
  outlined: "border border-outline text-primary",
  text: "text-primary px-3",
  elevated: "bg-surface-container-low text-primary shadow-elev-1 hover:shadow-elev-2",
  danger: "bg-error text-on-error",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: string;
  busy?: boolean;
}

export function Button({ variant = "filled", icon, busy, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      className={cx(
        "state-layer inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full px-6 text-label-large transition-shadow",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none",
        icon && variant !== "text" && "pl-4",
        VARIANTS[variant],
        className,
      )}
    >
      {busy ? <Spinner size={18} /> : icon ? <Icon name={icon} size={18} /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  variant = "standard",
  filled,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string; variant?: "standard" | "filled" | "tonal"; filled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cx(
        "state-layer inline-flex size-10 shrink-0 items-center justify-center rounded-full disabled:opacity-40",
        variant === "standard" && "text-on-surface-variant",
        variant === "filled" && "bg-primary text-on-primary",
        variant === "tonal" && "bg-secondary-container text-on-secondary-container",
        className,
      )}
    >
      <Icon name={icon} filled={filled} />
    </button>
  );
}

/** An overflow menu (⋮). Items close it when chosen. */
export function OverflowMenu({ label = "More options", items }: { label?: string; items: { label: string; icon: string; onClick(): void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <IconButton icon="more_vert" label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} />
      {open && (
        <div role="menu" className="absolute top-full right-0 z-30 mt-1 min-w-44 overflow-hidden rounded-xs bg-surface-container py-2 shadow-lg">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className={cx("state-layer flex h-12 w-full items-center gap-3 px-3 text-left text-label-large", it.danger ? "text-error" : "text-on-surface")}
            >
              <Icon name={it.icon} size={20} className={it.danger ? "" : "text-on-surface-variant"} />
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Fab({ icon, label, onClick, extended = true }: { icon: string; label: string; onClick(): void; extended?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cx(
        "state-layer fixed right-4 bottom-24 z-20 inline-flex h-14 items-center gap-3 rounded-lg bg-primary-container text-on-primary-container shadow-elev-3 md:right-8 md:bottom-8",
        extended ? "px-4 pr-5" : "w-14 justify-center",
      )}
    >
      <Icon name={icon} />
      {extended && <span className="text-label-large">{label}</span>}
    </button>
  );
}

export function Spinner({ size = 24 }: { size?: number }) {
  return (
    <span
      role="progressbar"
      className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent"
      style={{ width: size, height: size }}
    />
  );
}

// ---------- Surfaces

export function Card({
  children,
  className,
  variant = "filled",
  onClick,
}: {
  children: ReactNode;
  className?: string;
  variant?: "filled" | "elevated" | "outlined";
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      type={onClick ? "button" : undefined}
      className={cx(
        "block w-full rounded-md p-4 text-left",
        variant === "filled" && "bg-surface-container-highest",
        variant === "elevated" && "bg-surface-container-low shadow-elev-1",
        variant === "outlined" && "border border-outline-variant bg-surface",
        onClick && "state-layer cursor-pointer",
        className,
      )}
    >
      {children}
    </Comp>
  );
}

export function Chip({
  children,
  selected,
  onClick,
  icon,
  className,
}: {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  icon?: string;
  className?: string;
}) {
  const Comp = onClick ? "button" : "span";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-pressed={onClick ? !!selected : undefined}
      className={cx(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm px-3 text-label-large",
        selected ? "bg-secondary-container text-on-secondary-container" : "border border-outline-variant text-on-surface-variant",
        onClick && "state-layer",
        className,
      )}
    >
      {selected && onClick ? <Icon name="check" size={18} /> : icon ? <Icon name={icon} size={18} /> : null}
      {children}
    </Comp>
  );
}

export function Badge({ children, tone = "primary" }: { children: ReactNode; tone?: "primary" | "error" | "tertiary" | "neutral" }) {
  return (
    <span
      className={cx(
        "inline-flex h-5 items-center rounded-full px-2 text-label-small",
        tone === "primary" && "bg-primary-container text-on-primary-container",
        tone === "error" && "bg-error-container text-on-error-container",
        tone === "tertiary" && "bg-tertiary-container text-on-tertiary-container",
        tone === "neutral" && "bg-surface-container-highest text-on-surface-variant",
      )}
    >
      {children}
    </span>
  );
}

export function SegmentedButtons<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange(v: T): void;
  options: { value: T; label: string; icon?: string }[];
  className?: string;
}) {
  return (
    <div role="radiogroup" className={cx("inline-flex h-10 overflow-hidden rounded-full border border-outline", className)}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              "state-layer flex min-w-12 flex-1 items-center justify-center gap-1.5 px-3 text-label-large",
              i > 0 && "border-l border-outline",
              on ? "bg-secondary-container text-on-secondary-container" : "text-on-surface",
            )}
          >
            {on ? <Icon name="check" size={18} /> : o.icon ? <Icon name={o.icon} size={18} /> : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cx("border-0 border-t border-outline-variant", className)} />;
}

export function ListItem({
  headline,
  supporting,
  leading,
  trailing,
  onClick,
  overline,
}: {
  headline: ReactNode;
  supporting?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  overline?: ReactNode;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cx("flex w-full items-center gap-4 px-4 py-3 text-left", onClick && "state-layer")}
    >
      {leading}
      <div className="min-w-0 flex-1">
        {overline && <div className="text-label-medium text-on-surface-variant">{overline}</div>}
        <div className="text-body-large text-on-surface">{headline}</div>
        {supporting && <div className="text-body-medium text-on-surface-variant">{supporting}</div>}
      </div>
      {trailing}
    </Comp>
  );
}

// ---------- Form fields (M3 outlined text field)

const fieldBox =
  "peer w-full rounded-xs border border-outline bg-transparent px-4 text-body-large text-on-surface outline-none transition-colors hover:border-on-surface focus:border-2 focus:border-primary focus:px-[15px] disabled:opacity-40";

function FieldShell({ label, id, children, help, error }: { label?: string; id: string; children: ReactNode; help?: string; error?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        {children}
        {label && (
          <label
            htmlFor={id}
            className="pointer-events-none absolute -top-2 left-3 bg-[var(--field-bg,var(--md-surface))] px-1 text-body-small text-on-surface-variant peer-focus:text-primary"
          >
            {label}
          </label>
        )}
      </div>
      {(error || help) && (
        <div className={cx("px-4 text-body-small", error ? "text-error" : "text-on-surface-variant")}>{error || help}</div>
      )}
    </div>
  );
}

export function TextField({
  label,
  help,
  error,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; help?: string; error?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <FieldShell label={label} id={id} help={help} error={error}>
        <input id={id} {...rest} className={cx(fieldBox, "h-14", error && "border-error")} />
      </FieldShell>
    </div>
  );
}

export function TextArea({
  label,
  help,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; help?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <FieldShell label={label} id={id} help={help}>
        <textarea id={id} rows={3} {...rest} className={cx(fieldBox, "py-3")} />
      </FieldShell>
    </div>
  );
}

export function Select({
  label,
  help,
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string; help?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <FieldShell label={label} id={id} help={help}>
        <select id={id} {...rest} className={cx(fieldBox, "h-14 appearance-none pr-10")}>
          {children}
        </select>
        <Icon name="arrow_drop_down" className="pointer-events-none absolute top-4 right-3 text-on-surface-variant" />
      </FieldShell>
    </div>
  );
}

export function Switch({ checked, onChange, label, help }: { checked: boolean; onChange(v: boolean): void; label: ReactNode; help?: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-4 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-body-large text-on-surface">{label}</div>
        {help && <div className="text-body-medium text-on-surface-variant">{help}</div>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative h-8 w-13 shrink-0 rounded-full border-2 transition-colors",
          checked ? "border-primary bg-primary" : "border-outline bg-surface-container-highest",
        )}
      >
        <span
          className={cx(
            "absolute top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full transition-all",
            checked ? "left-[22px] size-6 bg-on-primary text-primary" : "left-1.5 size-4 bg-outline",
          )}
        >
          {checked && <Icon name="check" size={16} />}
        </span>
      </button>
    </label>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 py-1 text-body-large">
      <input type="checkbox" className="size-[18px] accent-[var(--md-primary)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

// ---------- Dialog and bottom sheet

export function Dialog({
  open,
  onClose,
  title,
  icon,
  children,
  actions,
  sheetOnMobile = true,
}: {
  open: boolean;
  onClose(): void;
  title?: ReactNode;
  icon?: string;
  children: ReactNode;
  actions?: ReactNode;
  /** On small screens render as a modal bottom sheet. */
  sheetOnMobile?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>("input,textarea,select,button")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className={cx("fixed inset-0 z-50 flex justify-center", sheetOnMobile ? "items-end md:items-center" : "items-center p-4")}>
      <div className="absolute inset-0 animate-fade-in bg-scrim/40" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        style={{ ["--field-bg" as string]: "var(--md-surface-container-high)" }}
        className={cx(
          "relative flex max-h-[90dvh] w-full flex-col bg-surface-container-high text-on-surface shadow-elev-3",
          sheetOnMobile
            ? "animate-sheet-up rounded-t-xl pb-[env(safe-area-inset-bottom)] md:max-w-[560px] md:animate-fade-in md:rounded-xl"
            : "max-w-[560px] animate-fade-in rounded-xl",
        )}
      >
        {sheetOnMobile && <div className="mx-auto mt-4 h-1 w-8 rounded-full bg-on-surface-variant/40 md:hidden" />}
        <div className="overflow-y-auto px-6 pt-6 pb-2">
          {icon && <Icon name={icon} className="mb-4 block text-center text-secondary" />}
          {title && <h2 className={cx("mb-4 text-headline-small", icon && "text-center")}>{title}</h2>}
          <div className="text-body-medium text-on-surface-variant">{children}</div>
        </div>
        {actions && <div className="flex flex-wrap justify-end gap-2 px-6 pt-2 pb-6">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---------- Snackbar

type SnackAction = { label: string; onClick(): void };
const SnackContext = createContext<(msg: string, action?: SnackAction) => void>(() => {});

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; key: number; action?: SnackAction } | null>(null);
  const show = useCallback((text: string, action?: SnackAction) => setMsg({ text, key: Date.now(), action }), []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), msg.action ? 6000 : 4000);
    return () => clearTimeout(t);
  }, [msg]);
  return (
    <SnackContext.Provider value={show}>
      {children}
      {msg &&
        createPortal(
          <div
            key={msg.key}
            role="status"
            className="fixed bottom-24 left-1/2 z-[60] flex min-h-12 w-[min(92vw,560px)] -translate-x-1/2 animate-fade-in items-center gap-2 rounded-xs bg-inverse-surface px-4 py-3 text-body-medium text-inverse-on-surface shadow-elev-3 md:bottom-6"
          >
            <span className="flex-1">{msg.text}</span>
            {msg.action ? (
              <button
                type="button"
                className="text-label-large text-inverse-primary"
                onClick={() => {
                  msg.action!.onClick();
                  setMsg(null);
                }}
              >
                {msg.action.label}
              </button>
            ) : (
              <button type="button" className="text-label-large text-inverse-primary" onClick={() => setMsg(null)}>
                Dismiss
              </button>
            )}
          </div>,
          document.body,
        )}
    </SnackContext.Provider>
  );
}

export const useSnackbar = () => useContext(SnackContext);

// ---------- Page scaffolding

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex items-end gap-2 px-4 pt-6 pb-4 md:px-6">
      <div className="min-w-0 flex-1">
        <h1 className="text-headline-medium text-on-surface md:text-headline-large">{title}</h1>
        {subtitle && <p className="mt-1 text-body-medium text-on-surface-variant">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-1">{actions}</div>}
    </header>
  );
}

export function Section({ title, children, action }: { title: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="px-4 pb-6 md:px-6">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="flex-1 text-title-medium text-on-surface-variant">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ icon, title, body, action }: { icon: string; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg bg-surface-container-low px-6 py-10 text-center">
      <Icon name={icon} size={40} className="text-primary" />
      <div className="text-title-medium text-on-surface">{title}</div>
      {body && <div className="max-w-sm text-body-medium text-on-surface-variant">{body}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex justify-center p-10 text-primary">
      <Spinner size={32} />
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="m-4 flex items-start gap-3 rounded-md bg-error-container p-4 text-on-error-container">
      <Icon name="error" />
      <div className="flex-1 text-body-medium">{error instanceof Error ? error.message : String(error)}</div>
      {onRetry && (
        <button type="button" className="text-label-large underline" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
