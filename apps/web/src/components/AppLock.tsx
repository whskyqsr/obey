import { type ReactNode, useEffect, useRef, useState } from "react";
import { signOut } from "../auth/session";
import { checkPin, clearPin, setLockAfter, setPin, useLockConfig } from "../lib/appLock";
import { Button, Diamond, Dialog, Icon, SegmentedButtons, Switch, TextField, cx, useSnackbar } from "./ui";

const MAX_TRIES = 5;

/** Covers the app with a PIN screen when this browser has a lock set and it's due. */
export function AppLockGate({ uid, children }: { uid: string; children: ReactNode }) {
  const config = useLockConfig(uid);
  const [locked, setLocked] = useState(() => !!config);
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    if (!config) setLocked(false);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hiddenAt.current = Date.now();
      else if (config && hiddenAt.current !== null && Date.now() - hiddenAt.current >= config.after * 1000) setLocked(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [config]);

  return (
    <>
      {/* Kept mounted so nothing reloads, but hidden from view and from screen readers while locked. */}
      <div aria-hidden={locked} className={cx(locked && "invisible")}>
        {children}
      </div>
      {locked && config && <LockScreen uid={uid} onUnlock={() => setLocked(false)} />}
    </>
  );
}

function LockScreen({ uid, onUnlock }: { uid: string; onUnlock(): void }) {
  const [pin, setPinText] = useState("");
  const [tries, setTries] = useState(0);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState("");
  const waiting = waitUntil > now;

  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [waiting]);

  const submit = async (value: string) => {
    if (waiting || value.length < 4) return;
    if (await checkPin(uid, value)) return onUnlock();
    const n = tries + 1;
    setTries(n);
    setPinText("");
    if (n % MAX_TRIES === 0) {
      setWaitUntil(Date.now() + 30_000);
      setNow(Date.now());
      setError("Too many tries. Wait 30 seconds.");
    } else setError("That PIN isn't right.");
  };
  const press = (d: string) => {
    if (waiting) return;
    setError("");
    setPinText((p) => (p.length < 8 ? p + d : p));
  };

  // Mockup 39: a diamond per digit (four, or more once a longer PIN is typed), then a keypad of serif numbers.
  const dots = Math.max(4, pin.length);
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-surface p-6">
      <Icon name="lock" size={32} className="text-on-surface-variant" />
      <h1 className="font-serif text-[36px] leading-tight text-on-surface">Enter your PIN</h1>
      <form
        className="flex flex-col items-center gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(pin);
        }}
      >
        <label className="flex gap-5 py-2" aria-label="PIN">
          {Array.from({ length: dots }, (_, i) => (
            <Diamond key={i} state={i < pin.length ? "done" : "open"} size={16} />
          ))}
          <input
            autoFocus
            aria-label="PIN"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            disabled={waiting}
            onChange={(e) => {
              setError("");
              setPinText(e.target.value.replace(/\D/g, "").slice(0, 8));
            }}
            className="sr-only"
          />
        </label>
        <div className="h-5 text-body-medium text-error">{waiting ? `Too many tries. Wait ${Math.ceil((waitUntil - now) / 1000)} s.` : error}</div>
        <div className="grid grid-cols-3 gap-x-10 gap-y-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button key={d} type="button" onClick={() => press(d)} className="state-layer flex size-[72px] items-center justify-center rounded-full font-serif text-[40px] leading-none text-on-surface">
              {d}
            </button>
          ))}
          <button
            type="submit"
            aria-label="Unlock"
            disabled={pin.length < 4 || waiting}
            className="state-layer flex size-[72px] items-center justify-center rounded-full text-on-surface disabled:opacity-30"
          >
            <Icon name="arrow_forward" size={28} />
          </button>
          <button type="button" onClick={() => press("0")} className="state-layer flex size-[72px] items-center justify-center rounded-full font-serif text-[40px] leading-none text-on-surface">
            0
          </button>
          <button
            type="button"
            aria-label="Delete"
            onClick={() => setPinText((p) => p.slice(0, -1))}
            className="state-layer flex size-[72px] items-center justify-center rounded-full text-on-surface"
          >
            <Icon name="backspace" size={28} />
          </button>
        </div>
      </form>
      <Button
        variant="text"
        onClick={() => {
          clearPin(uid);
          void signOut();
        }}
      >
        Forgot PIN? Sign out
      </Button>
    </div>
  );
}

const AFTER = [
  { value: "0", label: "Right away" },
  { value: "60", label: "1 min" },
  { value: "300", label: "5 min" },
];

/** The App lock section of Settings: on or off, when it locks, and changing the PIN. */
export function AppLockSetting({ uid }: { uid: string }) {
  const config = useLockConfig(uid);
  const snack = useSnackbar();
  const [setting, setSetting] = useState(false);
  return (
    <div className="py-1">
      <Switch checked={!!config} onChange={(on) => (on ? setSetting(true) : (clearPin(uid), snack("App lock off")))} label="Lock with a PIN" />
      {config && (
        <div className="flex flex-col gap-3 pb-3">
          <div className="text-body-medium text-on-surface-variant">Lock again when you've been away</div>
          <SegmentedButtons
            value={String(config.after)}
            options={AFTER}
            onChange={(v) => setLockAfter(uid, Number(v))}
            className="w-full max-w-sm [&>button]:flex-1 [&>button]:whitespace-nowrap"
          />
          <Button variant="text" icon="password" className="self-start" onClick={() => setSetting(true)}>
            Change PIN
          </Button>
        </div>
      )}
      <PinDialog
        open={setting}
        onClose={() => setSetting(false)}
        onSave={(pin) => setPin(uid, pin, config?.after ?? 60).then(() => (setSetting(false), snack("PIN saved")))}
      />
    </div>
  );
}

function PinDialog({ open, onClose, onSave }: { open: boolean; onClose(): void; onSave(pin: string): void }) {
  const [pin, setPinText] = useState("");
  const [again, setAgain] = useState("");
  useEffect(() => {
    if (open) (setPinText(""), setAgain(""));
  }, [open]);
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 8);
  const mismatch = again.length >= pin.length && again !== pin && again.length > 0;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Choose a PIN"
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={pin.length < 4 || pin !== again} onClick={() => onSave(pin)}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body-medium text-on-surface-variant">4 to 8 digits. If you forget it, you can sign out and back in.</p>
        <TextField
          label="PIN"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={pin}
          onChange={(e) => setPinText(digits(e.target.value))}
        />
        <TextField
          label="PIN again"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={again}
          onChange={(e) => setAgain(digits(e.target.value))}
          error={mismatch ? "The PINs don't match" : undefined}
        />
      </div>
    </Dialog>
  );
}
