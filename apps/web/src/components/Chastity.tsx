import { useEffect, useRef, useState } from "react";
import { useChastity, useChastityAsk, useDecideChastityAsk, useEndLock, useKeyboxUrl, useLockTime, useLockUp, usePhotoAsk, useStartLock } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { ChastityEvent, ChastityLock, Member } from "../api/types";
import { useReadOnly, useRel } from "../lib/relationship";
import { shrinkPhoto } from "./Proof";
import { Button, Chip, Dialog, Icon, Spinner, Switch, TextField, cx, useSnackbar } from "./ui";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "2 days 4 hours", "3 hours 10 minutes", "12 minutes": the two largest units. */
export function fmtSpan(ms: number) {
  const m = Math.max(0, Math.round(ms / MIN));
  const parts: [number, string][] = [
    [Math.floor(m / 1440), "day"],
    [Math.floor((m % 1440) / 60), "hour"],
    [m % 60, "minute"],
  ];
  const first = parts.findIndex(([n]) => n > 0);
  if (first < 0) return "less than a minute";
  return parts
    .slice(first, first + 2)
    .filter(([n]) => n > 0)
    .map(([n, u]) => `${n} ${u}${n === 1 ? "" : "s"}`)
    .join(" ");
}

/** "1 day", "6 hours", "45 minutes", for an amount of minutes. */
export const fmtMinutes = (minutes: number) => fmtSpan(Math.abs(minutes) * MIN);

/** Lock-time choices for a consequence or reward; "" means it doesn't touch the lock. */
export const LOCK_TIME_OPTIONS = [{ value: "", label: "None" }, ...[60, 180, 360, 720, 1440, 2880, 4320, 10080].map((m) => ({ value: String(m), label: fmtMinutes(m) }))];

/** "Sat, Oct 25 at 8:00 PM" */
export function fmtLockTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} at ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}
const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** Re-renders every half minute, for the countdowns. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

function Ring({ frac, icon }: { frac: number | null; icon: string }) {
  const r = 32;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-[72px] shrink-0">
      <svg viewBox="0 0 72 72" className="absolute inset-0 -rotate-90">
        <circle cx="36" cy="36" r={r} fill="none" stroke="var(--md-secondary-container)" strokeWidth="6" />
        {frac !== null && <circle cx="36" cy="36" r={r} fill="none" stroke="var(--md-primary)" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${c * frac} ${c}`} />}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-primary">
        <Icon name={icon} filled />
      </div>
    </div>
  );
}

/** What a lock card says: time left (or locked for, when open-ended or hidden), and the end. */
function lockLines(l: ChastityLock, now: number) {
  const started = l.startedAt ? new Date(l.startedAt).getTime() : now;
  const day = Math.floor((now - started) / DAY) + 1;
  if (l.status === "break" && l.breakEndsAt) {
    const left = new Date(l.breakEndsAt).getTime() - now;
    return {
      big: left > 0 ? `Break: ${fmtSpan(left)} left` : "Break is over",
      small: left > 0 ? `Relock by ${clock(l.breakEndsAt)}` : `It was due back at ${clock(l.breakEndsAt)}`,
      frac: null,
      icon: "shower",
    };
  }
  if (l.endsAt) {
    const end = new Date(l.endsAt).getTime();
    const total = Math.max(end - started, MIN);
    return {
      big: `${fmtSpan(end - now)} left`,
      small: `Until ${fmtLockTime(l.endsAt)} · day ${day} of ${Math.max(day, Math.ceil(total / DAY))}`,
      frac: Math.min(1, Math.max(0, (now - started) / total)),
      icon: "lock",
    };
  }
  return { big: `Locked ${fmtSpan(now - started)}`, small: l.timeHidden ? "The time left is hidden" : "Until released", frac: null, icon: "lock" };
}

function LockSummary({ l, who }: { l: ChastityLock; who: string }) {
  const now = useNow();
  const t = lockLines(l, now);
  return (
    <div className="flex items-center gap-4">
      <Ring frac={t.frac} icon={t.icon} />
      <div className="min-w-0 flex-1">
        <div className="text-body-medium text-on-surface-variant">{who}</div>
        <div className="text-title-large text-on-surface">{t.big}</div>
        <div className="text-body-medium text-on-surface-variant">{t.small}</div>
      </div>
    </div>
  );
}

/** Takes or shows a photo of the keybox code; the code itself never goes through the app as text. */
function KeyboxPicker({ photo, onPhoto }: { photo: Blob | null; onPhoto(b: Blob | null): void }) {
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!photo) return setUrl(null);
    const u = URL.createObjectURL(photo);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [photo]);
  return (
    <div className="flex flex-col gap-2">
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          try {
            onPhoto(await shrinkPhoto(f));
          } finally {
            setBusy(false);
          }
        }}
      />
      {url ? (
        <div className="flex items-center gap-3">
          <img src={url} alt="" className="size-16 rounded-md object-cover blur-md" />
          <div className="flex-1 text-body-medium">Photo taken. It stays hidden from you.</div>
          <Button variant="text" onClick={() => input.current?.click()}>
            Retake
          </Button>
        </div>
      ) : (
        <Button variant="tonal" icon="add_a_photo" busy={busy} onClick={() => input.current?.click()}>
          Photograph the keybox code
        </Button>
      )}
    </div>
  );
}

/** The wearer locking up, or relocking after a break. */
function LockUp({ l, relock }: { l: ChastityLock; relock?: boolean }) {
  const { rel, memberName } = useRel();
  const lockUp = useLockUp(rel.id);
  const decline = useEndLock(rel.id);
  const snack = useSnackbar();
  const [photo, setPhoto] = useState<Blob | null>(null);
  const keybox = l.keyMode === "keybox";
  return (
    <div className="flex flex-col gap-3">
      {keybox && (
        <>
          <p className="text-body-medium">
            Scramble the keybox to a new code without looking, then photograph it. You won't see the code until you're released. {memberName(l.keyholderId)} can see it any time,
            and a Red safe call shows it to you at once.
          </p>
          <KeyboxPicker photo={photo} onPhoto={setPhoto} />
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          icon="lock"
          disabled={keybox && !photo}
          busy={lockUp.isPending}
          onClick={() =>
            lockUp.mutate({ lockId: l.id, photo: photo ?? undefined }, { onSuccess: () => snack(relock ? "Relocked" : "You're locked"), onError: (e) => snack(errorMessage(e)) })
          }
        >
          {relock ? "I've relocked" : "I'm locked"}
        </Button>
        {!relock && (
          <Button variant="text" busy={decline.isPending} onClick={() => decline.mutate(l.id, { onError: (e) => snack(errorMessage(e)) })}>
            Not now
          </Button>
        )}
      </div>
    </div>
  );
}

function KeyboxDialog({ l, onClose }: { l: ChastityLock; onClose(): void }) {
  const url = useKeyboxUrl(l.id, true);
  return (
    <Dialog open onClose={onClose} title="Keybox code" actions={<Button onClick={onClose}>Close</Button>}>
      <div className="flex min-h-40 items-center justify-center">
        {url.isLoading ? <Spinner /> : url.data ? <img src={url.data} alt="Keybox code" className="max-h-[60dvh] w-full rounded-md object-contain" /> : "The photo couldn't load."}
      </div>
    </Dialog>
  );
}

const ASK_BREAK = [10, 20, 30];

function AskDialog({ l, kind, onClose }: { l: ChastityLock; kind: "release" | "break"; onClose(): void }) {
  const { rel, memberName } = useRel();
  const ask = useChastityAsk(rel.id);
  const snack = useSnackbar();
  const [minutes, setMinutes] = useState(20);
  const [note, setNote] = useState("");
  const name = memberName(l.keyholderId);
  return (
    <Dialog
      open
      onClose={onClose}
      title={kind === "release" ? "Ask to be released" : "Ask for a hygiene break"}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            busy={ask.isPending}
            onClick={() =>
              ask.mutate(
                { lockId: l.id, kind, minutes: kind === "break" ? minutes : undefined, note: note.trim() || undefined },
                { onSuccess: () => (onClose(), snack(`Asked ${name}`)), onError: (e) => snack(errorMessage(e)) },
              )
            }
          >
            Ask {name}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {kind === "break" && (
          <>
            <div className="flex flex-wrap gap-2">
              {ASK_BREAK.map((m) => (
                <Chip key={m} selected={minutes === m} onClick={() => setMinutes(m)}>
                  {m} minutes
                </Chip>
              ))}
            </div>
            <p className="text-body-small">The lock's clock keeps running. When the break is over, you relock{l.keyMode === "keybox" ? " and seal a new code" : ""}.</p>
          </>
        )}
        <TextField label={`Tell ${name} why (optional)`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </div>
    </Dialog>
  );
}

const TIME_CHOICES = [60, 360, 1440, 3 * 1440];

function TimeDialog({ l, sign, onClose }: { l: ChastityLock; sign: 1 | -1; onClose(): void }) {
  const { rel } = useRel();
  const change = useLockTime(rel.id);
  const snack = useSnackbar();
  const [minutes, setMinutes] = useState(1440);
  const [note, setNote] = useState("");
  return (
    <Dialog
      open
      onClose={onClose}
      title={sign > 0 ? "Add time" : "Take off time"}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            busy={change.isPending}
            onClick={() =>
              change.mutate(
                { lockId: l.id, minutes: sign * minutes, note: note.trim() || undefined },
                { onSuccess: () => (onClose(), snack(sign > 0 ? `Added ${fmtMinutes(minutes)}` : `Took off ${fmtMinutes(minutes)}`)), onError: (e) => snack(errorMessage(e)) },
              )
            }
          >
            {sign > 0 ? "Add" : "Take off"} {fmtMinutes(minutes)}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {TIME_CHOICES.map((m) => (
            <Chip key={m} selected={minutes === m} onClick={() => setMinutes(m)}>
              {fmtMinutes(m)}
            </Chip>
          ))}
        </div>
        <TextField label="Why (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </div>
    </Dialog>
  );
}

const PHOTO_DUE = [30, 60, 180];

function PhotoAskDialog({ l, onClose }: { l: ChastityLock; onClose(): void }) {
  const { rel, memberName } = useRel();
  const ask = usePhotoAsk(rel.id);
  const snack = useSnackbar();
  const [minutes, setMinutes] = useState(60);
  return (
    <Dialog
      open
      onClose={onClose}
      title="Ask for a photo"
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            busy={ask.isPending}
            onClick={() =>
              ask.mutate(
                { lockId: l.id, dueAt: new Date(Date.now() + minutes * MIN).toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
                { onSuccess: () => (onClose(), snack(`Asked ${memberName(l.wearerId)}`)), onError: (e) => snack(errorMessage(e)) },
              )
            }
          >
            Ask
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="text-title-small">Within</div>
        <div className="flex flex-wrap gap-2">
          {PHOTO_DUE.map((m) => (
            <Chip key={m} selected={minutes === m} onClick={() => setMinutes(m)}>
              {fmtMinutes(m)}
            </Chip>
          ))}
        </div>
        <p className="text-body-small">{memberName(l.wearerId)} gets a task with photo proof, and you approve it. Missing it counts like any missed task.</p>
      </div>
    </Dialog>
  );
}

function ReleaseDialog({ l, onClose }: { l: ChastityLock; onClose(): void }) {
  const { rel, memberName } = useRel();
  const end = useEndLock(rel.id);
  const snack = useSnackbar();
  return (
    <Dialog
      open
      onClose={onClose}
      sheetOnMobile={false}
      title={`Release ${memberName(l.wearerId)}?`}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Keep locked
          </Button>
          <Button variant="text" busy={end.isPending} onClick={() => end.mutate(l.id, { onSuccess: () => (onClose(), snack("Released")), onError: (e) => snack(errorMessage(e)) })}>
            Release
          </Button>
        </>
      }
    >
      The lock ends now{l.keyMode === "keybox" ? ` and ${memberName(l.wearerId)} can see the keybox code` : ""}.
    </Dialog>
  );
}

/** A pending ask, for the keyholder to answer. */
function AskToAnswer({ e, l }: { e: ChastityEvent; l: ChastityLock }) {
  const { rel, memberName } = useRel();
  const decide = useDecideChastityAsk(rel.id);
  const snack = useSnackbar();
  const [changing, setChanging] = useState(false);
  const [minutes, setMinutes] = useState(e.minutes ?? 20);
  const name = memberName(l.wearerId);
  const answer = (approve: boolean, m?: number) =>
    decide.mutate({ askId: e.id, approve, minutes: m }, { onSuccess: () => setChanging(false), onError: (err) => snack(errorMessage(err)) });
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-secondary-container px-4 py-4 text-on-secondary-container">
      <div className="text-title-medium">{e.kind === "break" ? `${name} asked for a hygiene break` : `${name} asked to be released`}</div>
      <p className="text-body-medium">
        {e.kind === "break"
          ? `${e.minutes} minutes, then they relock${l.keyMode === "keybox" ? " and seal a new code" : ""}. The lock's clock keeps running.`
          : "Releasing ends the lock now."}
      </p>
      {e.note && <p className="text-body-medium italic opacity-85">“{e.note}”</p>}
      {changing && (
        <div className="flex flex-wrap gap-2">
          {[10, 15, 20, 30, 45].map((m) => (
            <Chip key={m} selected={minutes === m} onClick={() => setMinutes(m)}>
              {m} min
            </Chip>
          ))}
        </div>
      )}
      <div className="mt-1 flex flex-wrap gap-2">
        {e.kind === "break" ? (
          <>
            <Button busy={decide.isPending} onClick={() => answer(true, changing ? minutes : e.minutes!)}>
              Allow {changing ? minutes : e.minutes} min
            </Button>
            {!changing && (
              <Button variant="outlined" onClick={() => setChanging(true)}>
                Change
              </Button>
            )}
          </>
        ) : (
          <Button busy={decide.isPending} onClick={() => answer(true)}>
            Release
          </Button>
        )}
        <Button variant="text" className="text-on-secondary-container" onClick={() => answer(false)}>
          {e.kind === "break" ? "Decline" : "Not yet"}
        </Button>
      </div>
    </div>
  );
}

/** One lock, from the side of whoever is looking: the wearer's asks, or the keyholder's controls. */
export function LockCard({ l, events, page = false }: { l: ChastityLock; events: ChastityEvent[]; page?: boolean }) {
  const { me, memberName } = useRel();
  const readOnly = useReadOnly();
  const [dialog, setDialog] = useState<null | "add" | "remove" | "photo" | "release" | "keybox" | "ask-release" | "ask-break">(null);
  const wearer = l.wearerId === me.user.id;
  const keyholder = l.keyholderId === me.user.id;
  const asks = events.filter((e) => e.lockId === l.id && e.status === "pending" && (e.kind === "break" || e.kind === "release_ask"));
  const asked = (kind: string) => asks.some((e) => e.kind === kind);

  if (l.status === "pending") {
    if (wearer && !readOnly)
      return (
        <div className="flex flex-col gap-2 rounded-xl bg-secondary-container px-4 py-4 text-on-secondary-container">
          <div className="text-title-medium">
            {memberName(l.keyholderId)} wants you locked{l.minutes ? ` for ${fmtMinutes(l.minutes)}` : l.timeHidden ? "" : " until they release you"}
          </div>
          {l.keyMode === "keyholder" && <p className="text-body-medium">{memberName(l.keyholderId)} keeps the key. Tap when you're locked.</p>}
          <LockUp l={l} />
        </div>
      );
    return (
      <Waiting
        l={l}
        text={keyholder ? `Waiting for ${memberName(l.wearerId)} to lock up` : `${memberName(l.wearerId)} has been asked to lock up`}
        canTakeBack={keyholder && !readOnly}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {keyholder && !readOnly && asks.map((e) => <AskToAnswer key={e.id} e={e} l={l} />)}
      <div className={cx("flex flex-col gap-4 rounded-xl p-4", page ? "bg-surface-container-low" : "bg-surface-container-low")}>
        <LockSummary
          l={l}
          who={
            wearer
              ? l.status === "break"
                ? "You're on a hygiene break"
                : "You're locked"
              : `${memberName(l.wearerId)} is ${l.status === "break" ? "on a hygiene break" : "locked"}`
          }
        />
        {wearer && l.status === "break" && !readOnly && <LockUp l={l} relock />}
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            {wearer && l.status === "active" && (
              <>
                <Button variant="tonal" disabled={asked("release_ask")} onClick={() => setDialog("ask-release")}>
                  {asked("release_ask") ? "Release asked" : "Ask for release"}
                </Button>
                <Button variant="outlined" icon="shower" disabled={asked("break")} onClick={() => setDialog("ask-break")}>
                  {asked("break") ? "Break asked" : "Hygiene break"}
                </Button>
              </>
            )}
            {keyholder && (
              <>
                {l.endsAt && (
                  <>
                    <Button variant="tonal" icon="more_time" onClick={() => setDialog("add")}>
                      Add time
                    </Button>
                    <Button variant="outlined" onClick={() => setDialog("remove")}>
                      Take off time
                    </Button>
                  </>
                )}
                {l.status === "active" && (
                  <Button variant="text" icon="photo_camera" onClick={() => setDialog("photo")}>
                    Ask for a photo
                  </Button>
                )}
                <Button variant="text" onClick={() => setDialog("release")}>
                  Release
                </Button>
              </>
            )}
            {l.canSeeKeybox && (
              <Button variant="text" icon="key" onClick={() => setDialog("keybox")}>
                Show keybox code
              </Button>
            )}
          </div>
        )}
        {wearer && asks.length > 0 && <p className="text-body-small text-on-surface-variant">Waiting for {memberName(l.keyholderId)} to answer.</p>}
      </div>
      {dialog === "add" && <TimeDialog l={l} sign={1} onClose={() => setDialog(null)} />}
      {dialog === "remove" && <TimeDialog l={l} sign={-1} onClose={() => setDialog(null)} />}
      {dialog === "photo" && <PhotoAskDialog l={l} onClose={() => setDialog(null)} />}
      {dialog === "release" && <ReleaseDialog l={l} onClose={() => setDialog(null)} />}
      {dialog === "keybox" && <KeyboxDialog l={l} onClose={() => setDialog(null)} />}
      {dialog === "ask-release" && <AskDialog l={l} kind="release" onClose={() => setDialog(null)} />}
      {dialog === "ask-break" && <AskDialog l={l} kind="break" onClose={() => setDialog(null)} />}
    </div>
  );
}

function Waiting({ l, text, canTakeBack }: { l: ChastityLock; text: string; canTakeBack: boolean }) {
  const { rel } = useRel();
  const end = useEndLock(rel.id);
  const snack = useSnackbar();
  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface-container-low px-4 py-3">
      <Icon name="lock_clock" className="shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="text-title-small text-on-surface">{text}</div>
        <div className="text-body-small text-on-surface-variant">
          {l.minutes ? `For ${fmtMinutes(l.minutes)}` : "Until released"}
          {l.keyMode === "keybox" ? " · keybox" : ""}
        </div>
      </div>
      {canTakeBack && (
        <Button variant="text" busy={end.isPending} onClick={() => end.mutate(l.id, { onError: (e) => snack(errorMessage(e)) })}>
          Take back
        </Button>
      )}
    </div>
  );
}

/** On Today, for the wearer and the keyholder: the lock, asks to answer, and locking up. */
export function ChastityToday() {
  const { rel, me, features } = useRel();
  const view = useChastity(rel.id, features.chastity);
  if (!features.chastity || !view.data) return null;
  const mine = view.data.open.filter((l) => l.wearerId === me.user.id || l.keyholderId === me.user.id);
  if (!mine.length) return null;
  return (
    <div className="flex flex-col gap-3 px-4 pb-4 md:px-6">
      {mine.map((l) => (
        <LockCard key={l.id} l={l} events={view.data.events} />
      ))}
    </div>
  );
}

const LENGTHS = [1440, 3 * 1440, 7 * 1440];

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The keyholder asking to lock someone. */
export function StartLockDialog({ wearers, onClose }: { wearers: Member[]; onClose(): void }) {
  const { rel, me } = useRel();
  const start = useStartLock(rel.id);
  const snack = useSnackbar();
  const [wearerId, setWearerId] = useState(wearers[0]!.userId);
  const [timed, setTimed] = useState(true);
  const [length, setLength] = useState<number | "custom">(3 * 1440);
  const [custom, setCustom] = useState(() => toLocalInput(new Date(Date.now() + 3 * DAY)));
  const [hide, setHide] = useState(false);
  const [keybox, setKeybox] = useState(false);
  const name = wearers.find((w) => w.userId === wearerId)!.displayName;
  const minutes = !timed ? null : length === "custom" ? Math.round((new Date(custom).getTime() - Date.now()) / MIN) : length;
  const valid = minutes === null || (minutes >= 15 && minutes <= 90 * 1440);
  const ends = minutes ? new Date(Date.now() + minutes * MIN) : null;
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Lock ${name}`}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            busy={start.isPending}
            onClick={() =>
              start.mutate(
                { wearerId, minutes, hideTime: hide, keyMode: keybox ? "keybox" : "keyholder" },
                { onSuccess: () => (onClose(), snack(`Asked ${name} to lock up`)), onError: (e) => snack(errorMessage(e)) },
              )
            }
          >
            Ask {name} to lock up
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {wearers.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {wearers.map((w) => (
              <Chip key={w.userId} selected={w.userId === wearerId} onClick={() => setWearerId(w.userId)}>
                {w.displayName}
              </Chip>
            ))}
          </div>
        )}
        <div>
          <div className="mb-2 text-title-small text-on-surface">For how long</div>
          <div className="flex flex-wrap gap-2">
            <Chip selected={timed} onClick={() => setTimed(true)}>
              Set time
            </Chip>
            <Chip selected={!timed} onClick={() => setTimed(false)}>
              Until I release
            </Chip>
          </div>
        </div>
        {timed && (
          <>
            <div className="flex flex-wrap gap-2">
              {LENGTHS.map((m) => (
                <Chip key={m} selected={length === m} onClick={() => setLength(m)}>
                  {fmtMinutes(m)}
                </Chip>
              ))}
              <Chip selected={length === "custom"} onClick={() => setLength("custom")}>
                Custom
              </Chip>
            </div>
            {length === "custom" ? (
              <TextField
                type="datetime-local"
                label="Unlocks"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                error={valid ? undefined : "Pick a time from 15 minutes to 90 days away"}
              />
            ) : (
              ends && (
                <p className="text-body-medium text-on-surface-variant">
                  Unlocks about {fmtLockTime(ends.toISOString())}, counted from when {name} locks up.
                </p>
              )
            )}
          </>
        )}
        <div>
          <div className="mb-2 text-title-small text-on-surface">Who has the key?</div>
          <div className="flex flex-wrap gap-2">
            <Chip selected={!keybox} onClick={() => setKeybox(false)}>
              I keep it
            </Chip>
            <Chip selected={keybox} onClick={() => setKeybox(true)}>
              Keybox
            </Chip>
          </div>
          <p className="mt-2 text-body-small">
            {keybox
              ? `${name} scrambles the keybox code without looking and seals a photo of it. You can see it any time; ${name} sees it when released.`
              : `You keep the physical key.`}
          </p>
        </div>
        {timed && <Switch checked={hide} onChange={setHide} label={`Hide the time left from ${name}`} help={`${name} sees only that they're locked`} />}
        <p className="text-body-small">You can add or take off time later, and consequences and rewards can too. A Red safe call always shows {name} the keybox code.</p>
      </div>
    </Dialog>
  );
}

export const eventIcon: Record<ChastityEvent["kind"], string> = {
  started: "lock",
  time: "more_time",
  release_ask: "lock_open",
  break: "shower",
  photo_ask: "photo_camera",
  relocked: "lock",
  ended: "lock_open",
};

/** One line of a lock's history. */
export function eventText(e: ChastityEvent, wearerName: string): { title: string; pill?: string; neg?: boolean } {
  switch (e.kind) {
    case "started":
      return { title: e.minutes ? `Locked for ${fmtMinutes(e.minutes)}` : "Locked" };
    case "time":
      return {
        title: e.note ?? (e.minutes === null ? "Time changed" : e.minutes > 0 ? "Time added" : "Time taken off"),
        pill: e.minutes === null ? undefined : `${e.minutes > 0 ? "+" : "−"}${fmtMinutes(e.minutes)}`,
        neg: (e.minutes ?? 0) > 0,
      };
    case "release_ask":
      return { title: `${wearerName} asked to be released${e.status === "declined" ? ": not yet" : e.status === "approved" ? ": released" : ""}` };
    case "break":
      return {
        title: `Hygiene break, ${e.minutes} min${e.status === "pending" ? " (asked)" : e.status === "declined" ? ": declined" : e.status === "overdue" ? ": not relocked in time" : ""}`,
      };
    case "photo_ask":
      return { title: "Photo asked for" };
    case "relocked":
      return { title: e.note ? `Relocked, ${e.note.toLowerCase()}` : "Relocked" };
    case "ended":
      return { title: e.note ?? "Released" };
  }
}
