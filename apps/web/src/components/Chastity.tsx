import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useChastity, useChastityAsk, useDecideChastityAsk, useEndLock, useKeyboxUrl, useLockTime, useLockUp, usePhotoAsk, useStartLock } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { ChastityEvent, ChastityLock, Member } from "../api/types";
import { useReadOnly, useRel } from "../lib/relationship";
import { shrinkPhoto } from "./Proof";
import { Button, Chip, Diamond, Dialog, Spinner, Switch, TextField, cx, useSnackbar } from "./ui";

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
export const LOCK_TIME_OPTIONS = [
  { value: "", label: "None" },
  ...[60, 180, 360, 720, 1440, 2880, 4320, 10080].map((m) => ({ value: String(m), label: fmtMinutes(m) })),
];

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

/** "3d 4h", "5h 20m", "12m": the big serif clock. */
export function fmtClock(ms: number) {
  const m = Math.max(0, Math.round(ms / MIN));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m % 60}m`;
  return `${m % 60}m`;
}

/** "Thu 1:00 AM" */
export const fmtWhen = (iso: string) => `${new Date(iso).toLocaleDateString(undefined, { weekday: "short" })} ${clock(iso)}`;

/** The big clock and the line under it: time left, or time locked so far when there's no end the viewer can see. */
function lockLines(l: ChastityLock, now: number, wearerName: string) {
  const started = l.startedAt ? new Date(l.startedAt).getTime() : now;
  if (l.status === "break" && l.breakEndsAt) {
    const left = new Date(l.breakEndsAt).getTime() - now;
    return left > 0
      ? { big: fmtClock(left), small: `hygiene break · relock by ${clock(l.breakEndsAt)}` }
      : { big: "Relock", small: `the break ended at ${clock(l.breakEndsAt)}` };
  }
  if (l.endsAt) {
    return { big: fmtClock(new Date(l.endsAt).getTime() - now), small: `until ${fmtWhen(l.endsAt)}${l.hideTime ? ` · hidden from ${wearerName}` : ""}` };
  }
  return { big: fmtClock(now - started), small: l.timeHidden ? "locked so far · the time left is hidden" : "locked so far · until released" };
}

function LockClock({ l, page }: { l: ChastityLock; page: boolean }) {
  const now = useNow();
  const { memberName } = useRel();
  const t = lockLines(l, now, memberName(l.wearerId));
  return (
    <div className={page ? "py-2 text-center" : ""}>
      <div className={cx("font-serif leading-none text-on-surface", page ? "text-[88px] tracking-[-0.02em]" : "text-[44px]")}>{t.big}</div>
      <div className={cx("text-body-medium text-on-surface-variant", page ? "mt-3" : "mt-1")}>{t.small}</div>
    </div>
  );
}

/** What the page header says about a lock, from the side of whoever is looking. */
export function lockHeading(l: ChastityLock, meId: string, memberName: (id: string) => string) {
  if (l.wearerId === meId) {
    return { eyebrow: l.startedAt ? `Locked since ${fmtWhen(l.startedAt)}${l.keyMode === "keybox" ? " · keybox" : ""}` : undefined };
  }
  const state = l.status === "break" ? "is on a hygiene break" : l.status === "pending" ? "has been asked to lock" : "is locked";
  const key = l.keyholderId === meId ? (l.keyMode === "keybox" ? " · you hold the keybox code" : " · you hold the key") : "";
  return { subtitle: `${memberName(l.wearerId)} ${state}${key}.` };
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
          <img src={url} alt="" className="size-16 rounded-sm object-cover blur-md" />
          <div className="flex-1 text-body-medium text-on-surface-variant">Sealed. It stays hidden from you.</div>
          <Button variant="outlined" onClick={() => input.current?.click()}>
            Retake
          </Button>
        </div>
      ) : (
        <Button icon="photo_camera" busy={busy} onClick={() => input.current?.click()} className="self-start">
          Take the photo
        </Button>
      )}
    </div>
  );
}

/** The wearer locking up, or relocking after a break: the keybox steps, then "I'm locked". */
function LockUp({ l, relock }: { l: ChastityLock; relock?: boolean }) {
  const { rel, memberName } = useRel();
  const lockUp = useLockUp(rel.id);
  const decline = useEndLock(rel.id);
  const snack = useSnackbar();
  const [photo, setPhoto] = useState<Blob | null>(null);
  const keybox = l.keyMode === "keybox";
  const kh = memberName(l.keyholderId);
  return (
    <div className="flex flex-col gap-3">
      {keybox && (
        <>
          <div className="rounded-md border border-outline-variant bg-surface-container-lowest p-5">
            <div className="eyebrow">Step 1</div>
            <p className="mt-2 text-body-large text-on-surface">Scramble the keybox code without looking.</p>
          </div>
          <div className="rounded-md border border-outline-variant bg-surface-container-lowest p-5">
            <div className="eyebrow">Step 2</div>
            <p className="mt-2 text-body-large text-on-surface">
              Photograph the code. It's sealed straight away: only {kh} can see it, until the lock ends or you call red.
            </p>
            <div className="mt-4">
              <KeyboxPicker photo={photo} onPhoto={setPhoto} />
            </div>
          </div>
        </>
      )}
      <Button
        className="mt-3 h-12 w-full"
        disabled={keybox && !photo}
        busy={lockUp.isPending}
        onClick={() =>
          lockUp.mutate(
            { lockId: l.id, photo: photo ?? undefined },
            { onSuccess: () => snack(relock ? "Relocked" : "You're locked"), onError: (e) => snack(errorMessage(e)) },
          )
        }
      >
        {relock ? "I've relocked" : "I'm locked"}
      </Button>
      {!relock && (
        <Button
          variant="plain"
          className="h-12 w-full"
          busy={decline.isPending}
          onClick={() => decline.mutate(l.id, { onError: (e) => snack(errorMessage(e)) })}
        >
          Not now
        </Button>
      )}
    </div>
  );
}

function KeyboxDialog({ l, onClose }: { l: ChastityLock; onClose(): void }) {
  const url = useKeyboxUrl(l.id, true);
  return (
    <Dialog open onClose={onClose} title="Keybox code" actions={<Button onClick={onClose}>Close</Button>}>
      <div className="flex min-h-40 items-center justify-center">
        {url.isLoading ? (
          <Spinner />
        ) : url.data ? (
          <img src={url.data} alt="Keybox code" className="max-h-[60dvh] w-full rounded-md object-contain" />
        ) : (
          "The photo couldn't load."
        )}
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
            <p className="text-body-small">
              The lock's clock keeps running. When the break is over, you relock{l.keyMode === "keybox" ? " and seal a new code" : ""}.
            </p>
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
                {
                  onSuccess: () => (onClose(), snack(sign > 0 ? `Added ${fmtMinutes(minutes)}` : `Took off ${fmtMinutes(minutes)}`)),
                  onError: (e) => snack(errorMessage(e)),
                },
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
          <Button
            variant="text"
            busy={end.isPending}
            onClick={() => end.mutate(l.id, { onSuccess: () => (onClose(), snack("Released")), onError: (e) => snack(errorMessage(e)) })}
          >
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
    <div className="flex flex-col gap-3 rounded-md border border-outline-variant bg-surface-container-lowest p-5 text-on-surface">
      <p className="text-body-large">
        {e.kind === "break" ? (
          <>
            {name} asks for a <b className="font-semibold">hygiene break</b>, {e.minutes} minutes.
          </>
        ) : (
          <>
            {name} asks to be <b className="font-semibold">released</b>.
          </>
        )}
      </p>
      {e.note && <p className="text-body-medium text-on-surface-variant italic">“{e.note}”</p>}
      {changing && (
        <div className="flex flex-wrap gap-2">
          {[10, 15, 20, 30, 45].map((m) => (
            <Chip key={m} selected={minutes === m} onClick={() => setMinutes(m)}>
              {m} min
            </Chip>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {e.kind === "break" ? (
          <>
            <Button busy={decide.isPending} onClick={() => answer(true, changing ? minutes : e.minutes!)}>
              {changing ? `Allow ${minutes} min` : "Allow"}
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
        <Button variant="outlined" onClick={() => answer(false)}>
          Not now
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
  const kh = memberName(l.keyholderId);

  if (l.status === "pending") {
    if (wearer && !readOnly) {
      const length = l.minutes ? `For ${fmtMinutes(l.minutes)}` : l.timeHidden ? "For a time" : "Until released";
      return (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className={cx("font-serif text-on-surface", page ? "text-headline-large" : "text-headline-medium")}>{kh} asked you to lock.</h2>
            <p className="mt-2 text-body-large text-on-surface-variant">
              {length}
              {l.keyMode === "keybox" ? ", keybox" : `, ${kh} keeps the key`}.{l.timeHidden ? " The time left will be hidden from you." : ""}
            </p>
          </div>
          <LockUp l={l} />
        </div>
      );
    }
    return (
      <Waiting
        l={l}
        text={keyholder ? `Waiting for ${memberName(l.wearerId)} to lock up` : `${memberName(l.wearerId)} has been asked to lock up`}
        canTakeBack={keyholder && !readOnly}
      />
    );
  }

  const keyboxSealed = wearer && l.hasKeybox && !l.canSeeKeybox;
  const buttons = !readOnly && (
    <div className={cx("flex gap-2", page && wearer ? "flex-col" : "flex-wrap")}>
      {wearer && l.status === "active" && (
        <>
          <Button variant="outlined" className={cx(page && "h-12")} disabled={asked("break")} onClick={() => setDialog("ask-break")}>
            {asked("break") ? "Hygiene break asked" : "Ask for a hygiene break"}
          </Button>
          <Button variant="outlined" className={cx(page && "h-12")} disabled={asked("release_ask")} onClick={() => setDialog("ask-release")}>
            {asked("release_ask") ? "Release asked" : "Ask to be released"}
          </Button>
        </>
      )}
      {keyholder && l.endsAt && (
        <>
          <Button variant="outlined" onClick={() => setDialog("add")}>
            Add time
          </Button>
          <Button variant="outlined" onClick={() => setDialog("remove")}>
            Take off time
          </Button>
        </>
      )}
      {keyholder && l.status === "active" && (
        <Button variant="outlined" onClick={() => setDialog("photo")}>
          Ask for a photo
        </Button>
      )}
      {l.canSeeKeybox && (
        <Button variant="outlined" onClick={() => setDialog("keybox")}>
          Show keybox code
        </Button>
      )}
      {keyholder && (
        <div className="basis-full">
          <Button onClick={() => setDialog("release")}>Release</Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      {!page && (
        <div className="text-body-medium text-on-surface-variant">
          {wearer ? (l.status === "break" ? "You're on a hygiene break" : "You're locked") : `${memberName(l.wearerId)} is ${l.status === "break" ? "on a hygiene break" : "locked"}`}
        </div>
      )}
      <LockClock l={l} page={page} />
      {keyholder && !readOnly && asks.map((e) => <AskToAnswer key={e.id} e={e} l={l} />)}
      {keyboxSealed && (
        <div className="flex items-center gap-4 rounded-md border border-outline-variant bg-surface-container-lowest p-4">
          <div aria-hidden className="size-16 shrink-0 rounded-sm bg-outline-variant blur-[3px]" />
          <div>
            <div className="text-body-large text-on-surface">Keybox code is sealed.</div>
            <div className="text-body-medium text-on-surface-variant">Only {kh} can see it until the lock ends.</div>
          </div>
        </div>
      )}
      {wearer && l.status === "break" && !readOnly && <LockUp l={l} relock />}
      {buttons}
      {wearer && asks.length > 0 && <p className="-mt-2 text-body-small text-on-surface-variant">Waiting for {kh} to answer.</p>}
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
    <div className="flex items-center gap-3 border-y border-outline-variant py-3">
      <div className="min-w-0 flex-1">
        <div className="text-body-large text-on-surface">{text}</div>
        <div className="text-body-small text-on-surface-variant">
          {l.minutes ? `For ${fmtMinutes(l.minutes)}` : "Until released"}
          {l.keyMode === "keybox" ? " · keybox" : ""}
        </div>
      </div>
      {canTakeBack && (
        <Button variant="outlined" busy={end.isPending} onClick={() => end.mutate(l.id, { onError: (e) => snack(errorMessage(e)) })}>
          Take back
        </Button>
      )}
    </div>
  );
}

/** On Today: a line per lock that opens the Chastity page, with any ask to answer, an ask to lock up, or a relock. */
export function ChastityToday() {
  const { rel, me, features, memberName } = useRel();
  const readOnly = useReadOnly();
  const view = useChastity(rel.id, features.chastity);
  const now = useNow();
  const navigate = useNavigate();
  if (!features.chastity || !view.data) return null;
  const mine = view.data.open.filter((l) => l.wearerId === me.user.id || l.keyholderId === me.user.id);
  if (!mine.length) return null;
  return (
    <div className="flex flex-col gap-4 px-4 pb-6 md:px-6">
      {mine.map((l) => {
        const wearer = l.wearerId === me.user.id;
        if (l.status === "pending") return <LockCard key={l.id} l={l} events={view.data.events} />;
        const t = lockLines(l, now, memberName(l.wearerId));
        const asks = view.data.events.filter((e) => e.lockId === l.id && e.status === "pending" && (e.kind === "break" || e.kind === "release_ask"));
        return (
          <div key={l.id} className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => void navigate({ to: "/chastity" })}
              className="state-layer state-row flex items-baseline gap-3 border-y border-outline-variant py-3 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-body-large text-on-surface">
                  {wearer ? (l.status === "break" ? "You're on a hygiene break" : "You're locked") : `${memberName(l.wearerId)} is ${l.status === "break" ? "on a hygiene break" : "locked"}`}
                </span>
                <span className="block text-body-medium text-on-surface-variant">{t.small}</span>
              </span>
              <span className="font-serif text-[28px] leading-none text-on-surface">{t.big}</span>
            </button>
            {!wearer && !readOnly && asks.map((e) => <AskToAnswer key={e.id} e={e} l={l} />)}
            {wearer && l.status === "break" && !readOnly && <LockUp l={l} relock />}
          </div>
        );
      })}
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
  const { rel } = useRel();
  const start = useStartLock(rel.id);
  const snack = useSnackbar();
  const [wearerId, setWearerId] = useState(wearers[0]!.userId);
  const [length, setLength] = useState<number | "custom" | "open">(3 * 1440);
  const [custom, setCustom] = useState(() => toLocalInput(new Date(Date.now() + 3 * DAY)));
  const [hide, setHide] = useState(false);
  const [keybox, setKeybox] = useState(false);
  const name = wearers.find((w) => w.userId === wearerId)!.displayName;
  const timed = length !== "open";
  const minutes = length === "open" ? null : length === "custom" ? Math.round((new Date(custom).getTime() - Date.now()) / MIN) : length;
  const valid = minutes === null || (minutes >= 15 && minutes <= 90 * 1440);
  const keyRow = (on: boolean, title: string, body: string | null, pick: () => void) => (
    <button type="button" onClick={pick} className="state-layer state-row flex w-full items-center gap-4 border-b border-outline-variant py-3 text-left">
      <Diamond state={on ? "done" : "open"} size={16} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-body-large text-on-surface">{title}</span>
        {body && <span className="block text-body-medium text-on-surface-variant">{body}</span>}
      </span>
    </button>
  );
  return (
    <Dialog open onClose={onClose} title={`Lock ${name}`}>
      <div className="flex flex-col gap-4 pb-4">
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
          <div className="mb-2 text-body-medium text-on-surface-variant">For how long</div>
          <div className="flex flex-wrap gap-2">
            {LENGTHS.map((m) => (
              <Chip key={m} selected={length === m} onClick={() => setLength(m)}>
                {fmtMinutes(m)}
              </Chip>
            ))}
            <Chip selected={length === "custom"} onClick={() => setLength("custom")}>
              Set time
            </Chip>
            <Chip selected={length === "open"} onClick={() => setLength("open")}>
              Until I release
            </Chip>
          </div>
        </div>
        {length === "custom" && (
          <TextField
            type="datetime-local"
            label="Unlocks"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            error={valid ? undefined : "Pick a time from 15 minutes to 90 days away"}
          />
        )}
        {timed && (
          <div className="border-b border-outline-variant pb-3">
            <Switch checked={hide} onChange={setHide} label={`Hide the time left from ${name}`} />
          </div>
        )}
        <div>
          <div className="text-body-medium text-on-surface-variant">Who has the key?</div>
          {keyRow(!keybox, "I keep it", null, () => setKeybox(false))}
          {keyRow(keybox, "Keybox", `${name} scrambles the code without looking and photographs it. Only you see the photo.`, () => setKeybox(true))}
        </div>
        <p className="text-body-medium text-on-surface-variant">{name} taps “I'm locked” to start the clock. Asks lapse after 7 days.</p>
        <Button
          className="h-12 w-full"
          disabled={!valid}
          busy={start.isPending}
          onClick={() =>
            start.mutate(
              { wearerId, minutes, hideTime: timed && hide, keyMode: keybox ? "keybox" : "keyholder" },
              { onSuccess: () => (onClose(), snack(`Asked ${name} to lock`)), onError: (e) => snack(errorMessage(e)) },
            )
          }
        >
          Ask {name} to lock
        </Button>
      </div>
    </Dialog>
  );
}

/** One line of a lock's history: what happened, and any reason given. */
export function eventText(e: ChastityEvent, wearerName: string): { title: string; note?: string } {
  switch (e.kind) {
    case "started":
      return { title: e.minutes ? `Locked for ${fmtMinutes(e.minutes)}` : "Locked" };
    case "time":
      if (e.minutes === null) return { title: "Time changed", note: e.note ?? undefined };
      return { title: `${e.minutes > 0 ? "+" : "−"}${fmtMinutes(e.minutes)}`, note: e.note ?? undefined };
    case "release_ask":
      return {
        title: `${wearerName} asked to be released${e.status === "declined" ? ": not yet" : e.status === "approved" ? ": released" : ""}`,
        note: e.note ?? undefined,
      };
    case "break":
      return {
        title: `Hygiene break, ${e.minutes} min${e.status === "pending" ? " (asked)" : e.status === "declined" ? ": declined" : e.status === "overdue" ? ": not relocked in time" : ""}`,
        note: e.note ?? undefined,
      };
    case "photo_ask":
      return { title: "Photo asked for" };
    case "relocked":
      return { title: e.note ? `Relocked, ${e.note.toLowerCase()}` : "Relocked" };
    case "ended":
      return { title: e.note ?? "Released" };
  }
}
