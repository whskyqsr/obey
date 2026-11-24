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
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { useMenu } from "../lib/menu";
import { DynamicSwitcher } from "./DynamicSwitcher";
import { useReadOnly } from "../lib/relationship";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ---------- Icon (Material Symbols Rounded, light weight)

export function Icon({ name, filled, className, size }: { name: string; filled?: boolean; className?: string; size?: number }) {
  return (
    <span aria-hidden className={cx("icon", filled && "filled", className)} style={size ? { fontSize: size } : undefined}>
      {name}
    </span>
  );
}

// ---------- The diamond: Letters' one shape, the checkbox and the "you are here" marker

export type DiamondState = "open" | "done" | "owed" | "waiting" | "off";

/** A diamond in the state of a task: open, done (filled ink), owed or missed (accent), waiting (half), off (muted). */
export function Diamond({ state = "open", size = 14, className }: { state?: DiamondState; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-block shrink-0 rotate-45 border-[1.5px]",
        state === "open" && "border-on-surface",
        state === "done" && "border-on-surface bg-on-surface",
        state === "owed" && "border-primary bg-primary-container",
        state === "waiting" && "border-on-surface bg-[linear-gradient(135deg,var(--md-on-surface)_50%,transparent_50%)]",
        state === "off" && "border-outline",
        className,
      )}
      style={{ width: size, height: size }}
    />
  );
}

// ---------- Buttons

type Variant = "filled" | "tonal" | "outlined" | "text" | "elevated" | "danger";
const VARIANTS: Record<Variant, string> = {
  // Letters: ink is the main action, a hairline the second, the accent stays for what needs attention.
  filled: "bg-on-surface text-surface",
  tonal: "border border-outline-variant bg-surface-container-lowest text-on-surface",
  outlined: "border border-on-surface text-on-surface",
  text: "text-primary px-3",
  elevated: "border border-outline-variant bg-surface-container-lowest text-on-surface",
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
        "state-layer inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-sm px-5 text-label-large whitespace-nowrap",
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
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: string;
  label: string;
  variant?: "standard" | "filled" | "tonal";
  filled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cx(
        "state-layer inline-flex size-10 shrink-0 items-center justify-center rounded-full disabled:opacity-40",
        variant === "standard" && "text-on-surface",
        variant === "filled" && "bg-on-surface text-surface",
        variant === "tonal" && "border border-outline-variant bg-surface-container-lowest text-on-surface",
        className,
      )}
    >
      <Icon name={icon} filled={filled} />
    </button>
  );
}

/** An overflow menu (⋮). Items close it when chosen. */
export function OverflowMenu({
  label = "More options",
  icon = "more_horiz",
  items,
}: {
  label?: string;
  /** The trigger's icon, when the menu isn't just "more" (Location's pause). */
  icon?: string;
  items: { label: string; icon: string; onClick(): void; danger?: boolean }[];
}) {
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
      <IconButton icon={icon} label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} />
      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-40 mt-1 min-w-44 overflow-hidden rounded-md border border-outline-variant bg-surface-container-lowest py-1 shadow-elev-2"
        >
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

/**
 * Where a page's "new" action goes: the header mounts a slot, and [Fab] puts its button there. Only the newest header
 * counts, so a dialog or sheet with its own header doesn't steal it.
 */
type Slots = { narrow: HTMLElement | null; wide: HTMLElement | null };
let headerSlots: Slots = { narrow: null, wide: null };
const slotListeners = new Set<() => void>();
function setHeaderSlot(which: keyof Slots, el: HTMLElement) {
  if (headerSlots[which] === el) return;
  headerSlots = { ...headerSlots, [which]: el };
  slotListeners.forEach((l) => l());
}
function useHeaderSlots() {
  return useSyncExternalStore(
    (l) => (slotListeners.add(l), () => slotListeners.delete(l)),
    () => headerSlots,
  );
}
/** Phones: in the top line with the header icons. Wider screens: beside the title. */
function HeaderSlot({ wide }: { wide?: boolean }) {
  return (
    <span
      className={wide ? "hidden items-center gap-2 md:flex" : "contents"}
      ref={(el) => {
        if (el) setHeaderSlot(wide ? "wide" : "narrow", el);
      }}
    />
  );
}

/**
 * A page's way to start something new. It sits in the page header, as in the mockups: a + (or the given icon) on
 * phones, and a small labelled button on wider screens. Without a header it floats at the bottom right.
 */
export function Fab({
  icon,
  label,
  onClick,
  extended = true,
  className,
}: {
  icon: string;
  label: string;
  onClick(): void;
  extended?: boolean;
  className?: string;
}) {
  const slots = useHeaderSlots();
  // Every FAB starts something new, and nothing new goes into an ended dynamic.
  if (useReadOnly()) return null;
  if (slots.narrow?.isConnected && slots.wide?.isConnected) {
    return (
      <>
        {createPortal(
          <IconButton icon={icon === "edit" ? "add" : icon} label={label} onClick={onClick} className={cx("md:hidden", className)} />,
          slots.narrow,
        )}
        {createPortal(
          <button
            type="button"
            onClick={onClick}
            aria-label={label}
            className={cx(
              "state-layer inline-flex h-10 items-center gap-2 rounded-md border border-on-surface px-4 text-label-large text-on-surface",
              className,
            )}
          >
            <Icon name="add" size={18} />
            {/* "New rule" and "New protocol" share one header; a plain "New" keeps it from changing width between tabs. */}
            {label.startsWith("New ") ? "New" : label}
          </button>,
          slots.wide,
        )}
      </>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cx(
        "state-layer fixed right-4 bottom-[calc(84px+env(safe-area-inset-bottom))] in-data-nobar:bottom-[calc(16px+env(safe-area-inset-bottom))] z-20 inline-flex h-14 items-center gap-3 rounded-full bg-on-surface text-surface shadow-elev-2 md:right-8 md:bottom-8",
        extended ? "px-4 pr-5" : "w-14 justify-center",
        className,
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
        "block w-full rounded-lg p-4 text-left",
        // Letters: a card is a sheet of paper with a hairline, never a filled block.
        variant === "filled" && "border border-outline-variant bg-surface-container-lowest",
        variant === "elevated" && "border border-outline-variant bg-surface-container-lowest",
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
  plain,
}: {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  icon?: string;
  className?: string;
  /** A filter pill: the ink border alone marks the chosen one, no tick. */
  plain?: boolean;
}) {
  const Comp = onClick ? "button" : "span";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-pressed={onClick ? !!selected : undefined}
      className={cx(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-label-large",
        selected ? "border-on-surface bg-surface-container-lowest text-on-surface" : "border-outline-variant text-on-surface-variant",
        onClick && "state-layer",
        className,
      )}
    >
      {selected && onClick && !plain ? <Icon name="check" size={18} /> : icon ? <Icon name={icon} size={18} /> : null}
      {children}
    </Comp>
  );
}

export function Badge({ children, tone = "primary" }: { children: ReactNode; tone?: "primary" | "error" | "tertiary" | "neutral" }) {
  return (
    <span
      className={cx(
        // Letters: a hairline pill, not a filled chip; the tone only colours the text and the line.
        "inline-flex h-5 items-center rounded-full border px-2 text-label-small tabular-nums",
        tone === "primary" && "border-outline-variant text-on-surface-variant",
        tone === "error" && "border-error/50 text-error",
        tone === "tertiary" && "border-outline-variant text-on-surface-variant",
        tone === "neutral" && "border-outline-variant text-outline",
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
    <div role="radiogroup" className={cx("inline-flex h-10 gap-0.5 rounded-full border border-outline-variant p-[3px]", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              "state-layer flex min-w-12 flex-1 items-center justify-center gap-1.5 rounded-full px-3.5 text-label-large",
              on ? "bg-on-surface text-surface" : "text-on-surface-variant",
            )}
          >
            {o.icon ? <Icon name={o.icon} size={18} /> : null}
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

// ---------- Form fields (outlined, hairline)

/** Letters fields: a small label above, the value, and one hairline under it that darkens on focus. */
const fieldBox =
  "peer w-full rounded-none border-0 border-b border-outline-variant bg-transparent px-0 text-body-large text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60 hover:border-outline focus:border-on-surface focus:shadow-[0_1px_0_var(--md-on-surface)] disabled:opacity-40";

function FieldShell({ label, id, children, help, error }: { label?: string; id: string; children: ReactNode; help?: string; error?: string }) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-body-small text-on-surface-variant">
          {label}
        </label>
      )}
      <div className="relative">{children}</div>
      {(error || help) && <div className={cx("text-body-small", error ? "text-error" : "text-on-surface-variant")}>{error || help}</div>}
    </div>
  );
}

export function TextField({
  label,
  help,
  error,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  help?: string;
  error?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <FieldShell label={label} id={id} help={help} error={error}>
        <input id={id} data-field {...rest} className={cx(fieldBox, "h-10", error && "border-error")} />
      </FieldShell>
    </div>
  );
}

export function TextArea({
  label,
  help,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  help?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <FieldShell label={label} id={id} help={help}>
        <textarea id={id} data-field rows={3} {...rest} className={cx(fieldBox, "resize-none py-1.5")} />
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
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  help?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <FieldShell label={label} id={id} help={help}>
        <select id={id} data-field {...rest} className={cx(fieldBox, "h-10 appearance-none pr-8")}>
          {children}
        </select>
        <Icon name="arrow_drop_down" className="pointer-events-none absolute top-2 right-0 text-on-surface-variant" />
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
          "relative h-7 w-12 shrink-0 rounded-full border transition-colors",
          checked ? "border-on-surface bg-on-surface" : "border-outline bg-surface-container-lowest",
        )}
      >
        <span
          className={cx(
            "absolute top-1/2 -translate-y-1/2 rounded-full transition-all",
            checked ? "left-[23px] size-5 bg-surface" : "left-1 size-5 bg-outline-variant",
          )}
        />
      </button>
    </label>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 py-1 text-body-large">
      <input type="checkbox" className="diamond" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

// ---------- Dialog and bottom sheet

export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
  sheetOnMobile = true,
}: {
  open: boolean;
  onClose(): void;
  title?: ReactNode;
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
        style={{ ["--field-bg" as string]: "var(--md-surface)" }}
        className={cx(
          "relative flex max-h-[90dvh] w-full flex-col border-outline-variant bg-surface text-on-surface shadow-elev-3",
          sheetOnMobile
            ? "animate-sheet-up rounded-t-xl border-t pb-[env(safe-area-inset-bottom)] md:max-w-[560px] md:animate-fade-in md:rounded-xl md:border"
            : "max-w-[560px] animate-fade-in rounded-xl border",
        )}
      >
        {sheetOnMobile && <div className="mx-auto mt-3 h-1 w-8 rounded-full bg-outline-variant md:hidden" />}
        <div className="overflow-y-auto px-6 pt-6 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {title && <h2 className="mb-4 text-headline-small">{title}</h2>}
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
  const [msg, setMsg] = useState<{
    text: string;
    key: number;
    action?: SnackAction;
  } | null>(null);
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
            className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] left-1/2 z-[60] flex min-h-12 w-[min(92vw,560px)] -translate-x-1/2 animate-fade-in items-center gap-2 rounded-md bg-inverse-surface px-4 py-3 text-body-medium text-inverse-on-surface shadow-elev-3 md:bottom-6"
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

/** A secondary page's header: back, then the title, with optional actions at the end. Main pages use PageHeader. */
/** A text link back to where you came from, as in the mockups: "‹ Us". */
export function BackLink({ label, onClick }: { label: string; onClick(): void }) {
  return (
    <button type="button" onClick={onClick} className="state-layer -ml-1 flex h-10 items-center gap-1 rounded-md pr-2 text-body-large text-on-surface-variant">
      <Icon name="chevron_left" size={22} />
      {label}
    </button>
  );
}

/**
 * A page opened from another one: a way back named for where it goes, the page's icons on the right, and the title in
 * the serif below.
 */
export function SubHeader({ title, onBack, back = "Back", actions }: { title: ReactNode; onBack(): void; back?: string; actions?: ReactNode }) {
  return (
    <header className="px-4 pt-3 pb-4 md:px-6 md:pt-6">
      <div className="-mx-2 flex min-h-10 items-center gap-1 px-2">
        <div className="min-w-0 flex-1">
          <BackLink label={back} onClick={onBack} />
        </div>
        {actions}
        <HeaderSlot />
      </div>
      <div className="mt-2 flex items-end gap-2">
        <h1 className="min-w-0 flex-1 text-display-small text-on-surface md:text-display-medium">{title}</h1>
        <HeaderSlot wide />
      </div>
    </header>
  );
}

/**
 * A main page's header. On phones a top line leads with the dynamic switcher (Today, Week, Us) or a way back to Us
 * (the pages listed there), and ends with the page's header icons (`tools`) and, for subs and switches, the safe-word
 * hand. Then the title in the serif, with `actions` beside it.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  tools,
  hero,
}: {
  /** Today's greeting: the large serif line from the mockups. */
  hero?: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  tools?: ReactNode;
}) {
  const menu = useMenu();
  const navigate = useNavigate();
  const hand = menu?.safeWord && (
    <button
      type="button"
      aria-label="Safe word"
      title="Safe word"
      onClick={menu.safeWord}
      className="state-layer flex size-10 shrink-0 items-center justify-center rounded-full text-on-surface"
    >
      <Icon name="front_hand" />
    </button>
  );
  return (
    <>
      <header className="px-4 pt-3 pb-4 md:px-6 md:pt-6">
        <div className={cx("-mx-2 flex min-h-10 items-center gap-1", !tools && !hand && "md:hidden")}>
          <div className="min-w-0 flex-1 md:hidden">
            {menu?.lead === "switcher" && <DynamicSwitcher chip />}
            {menu?.lead === "back" && <BackLink label={menu.back?.label ?? "Us"} onClick={menu.back?.go ?? (() => void navigate({ to: "/us" }))} />}
          </div>
          <div className="hidden flex-1 md:block" />
          {tools}
          <HeaderSlot />
          {hand}
        </div>
        <div className="mt-2 flex items-end gap-2 md:mt-0">
          <div className="min-w-0 flex-1">
            <h1
              className={
                hero
                  ? "mt-4 font-serif text-[52px] leading-[1.05] tracking-[-0.01em] text-on-surface"
                  : "text-display-small text-on-surface md:text-display-medium"
              }
            >
              {title}
            </h1>
            {subtitle && <p className={hero ? "mt-3 text-body-large text-on-surface-variant" : "mt-1 text-body-medium text-on-surface-variant"}>{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-1">{actions}</div>}
          <HeaderSlot wide />
        </div>
      </header>
      {menu?.banner}
    </>
  );
}

export function Section({ title, children, action }: { title: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="px-4 pb-6 md:px-6">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="eyebrow flex-1">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ icon, title, body, action }: { icon: string; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 border-y border-outline-variant px-6 py-10 text-center">
      <Icon name={icon} size={32} className="text-outline" />
      <div className="text-title-large text-on-surface">{title}</div>
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
    <div className="m-4 flex items-start gap-3 rounded-lg bg-error-container p-4 text-on-error-container">
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

/** A full-screen form with "Cancel · title · Save" across the top, as in mockup 76. */
export function FormSheet({
  title,
  onClose,
  onSave,
  saving,
  canSave,
  children,
}: {
  title: string;
  onClose(): void;
  onSave(): void;
  saving: boolean;
  canSave: boolean;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-surface" role="dialog" aria-modal aria-label={title}>
      <div className="mx-auto flex w-full max-w-xl flex-col px-4 pb-10 md:px-6">
        <div className="sticky top-0 z-10 grid h-16 grid-cols-[1fr_auto_1fr] items-center bg-surface">
          <button type="button" onClick={onClose} className="justify-self-start text-body-large text-on-surface-variant">
            Cancel
          </button>
          <h1 className="text-title-medium text-on-surface">{title}</h1>
          <button type="button" disabled={!canSave || saving} onClick={onSave} className="justify-self-end text-body-large text-primary disabled:opacity-40">
            Save
          </button>
        </div>
        <div className="flex flex-col gap-6">{children}</div>
      </div>
    </div>
  );
}
