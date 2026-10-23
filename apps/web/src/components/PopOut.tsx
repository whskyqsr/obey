import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { usePendingReschedules } from "../api/hooks";
import type { Occurrence } from "../api/types";
import { fmtTime, localDateOf, today } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { useTodayOccurrences } from "../lib/today";
import { isCounted } from "./Count";
import { mmss, nextDeadline } from "./Countdown";
import { isPlaced } from "./Location";
import { isOpen } from "./OccurrenceCard";
import { isRitual } from "./Ritual";
import { useQuickComplete } from "./TaskRow";
import { Button, Icon, IconButton, cx } from "./ui";

/** Chrome and Edge's always-on-top window (Document Picture-in-Picture). */
type PipApi = { requestWindow(o: { width: number; height: number }): Promise<Window> };
const pipApi = (): PipApi | undefined => (window as unknown as { documentPictureInPicture?: PipApi }).documentPictureInPicture;
export const canPopOut = () => typeof window !== "undefined" && !!pipApi();

const HOUR = 60 * 60_000;

/** A task the little window can tick done: nothing to add and open now. The rest open in the main window. */
const tickable = (o: Occurrence, now: number) =>
  o.status === "pending" && !o.proofRequired && !o.askMood && !o.asksJournal && !isRitual(o) && !isCounted(o) && !isPlaced(o) && isOpen(o, now);

/** Copies the page's styles and theme into the little window, and keeps them in step (a theme change, a new style). */
function mirrorStyles(pip: Window) {
  const copy = () => {
    pip.document.head.replaceChildren(...[...document.head.querySelectorAll('style, link[rel="stylesheet"]')].map((n) => n.cloneNode(true)));
    const theme = document.documentElement.getAttribute("data-theme");
    if (theme) pip.document.documentElement.setAttribute("data-theme", theme);
    else pip.document.documentElement.removeAttribute("data-theme");
    pip.document.title = "Today";
  };
  copy();
  const watch = new MutationObserver(copy);
  watch.observe(document.head, { childList: true, subtree: true, characterData: true });
  watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => watch.disconnect();
}

/** "Pop out Today": a button for the page header, and the little window it opens. */
export function PopOutButton() {
  const [pip, setPip] = useState<Window | null>(null);

  useEffect(() => {
    if (!pip) return;
    const stop = mirrorStyles(pip);
    const closed = () => setPip(null);
    pip.addEventListener("pagehide", closed);
    return () => {
      stop();
      pip.removeEventListener("pagehide", closed);
    };
  }, [pip]);

  // Leaving the page (signing out, say) closes it with the app.
  useEffect(() => () => pip?.close(), [pip]);

  const open = async () => {
    if (pip) return pip.focus();
    const api = pipApi();
    if (!api) return;
    const w = await api.requestWindow({ width: 360, height: 440 });
    w.document.body.className = "bg-surface text-on-surface";
    setPip(w);
  };

  return (
    <>
      <Button variant="text" icon="picture_in_picture_alt" onClick={open} title="A small window that stays on top of your other windows">
        Pop out
      </Button>
      {pip && createPortal(<PopOutToday close={() => pip.close()} />, pip.document.body)}
    </>
  );
}

function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function Ring({ done, total }: { done: number; total: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid size-14 shrink-0 place-items-center">
      <svg viewBox="0 0 52 52" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="26" cy="26" r={r} fill="none" strokeWidth="5" className="stroke-primary-container" />
        <circle cx="26" cy="26" r={r} fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-primary" strokeDasharray={`${total ? (done / total) * c : 0} ${c}`} />
      </svg>
      <span className="text-label-large">
        {done}/{total}
      </span>
    </div>
  );
}

/** What the little window shows: today's tasks with a circle to tick, the countdown, or a Dominant's summary. */
function PopOutToday({ close }: { close(): void }) {
  const { me, isDom, rel, memberName } = useRel();
  const occ = useTodayOccurrences();
  const pending = usePendingReschedules(rel.id);
  const navigate = useNavigate();
  const quickComplete = useQuickComplete();
  const now = useNow();
  const t = today();
  const list = (occ.data ?? []).filter((o) => o.status !== "cancelled" && o.status !== "excused" && !o.curfew);
  const todays = list.filter((o) => localDateOf(new Date(o.dueAt)) === t).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const mine = todays.filter((o) => o.assigneeId === me.user.id);
  const theirs = todays.filter((o) => o.assigneeId !== me.user.id);
  const settled = (o: Occurrence) => o.status === "completed" || o.status === "submitted";
  const shown = mine.length || !isDom ? mine : theirs;
  const done = shown.filter(settled).length;
  const next = shown.find((o) => o.status === "pending" && new Date(o.dueAt).getTime() > now);
  const deadline = nextDeadline(list, me.user.id, isDom, now);
  const toReview = isDom ? list.filter((o) => o.status === "submitted" && o.assigneeId !== me.user.id).length : 0;
  const asks = isDom ? new Set((pending.data ?? []).filter((r) => r.requestedBy !== me.user.id).map((r) => r.groupId ?? r.id)).size : 0;

  // Anything that needs more than a tap opens in the main window.
  const openMain = (to: { to: string; params?: Record<string, string> }) => {
    window.focus();
    navigate(to as never);
  };
  const openTask = (o: Occurrence) => openMain({ to: "/tasks/$taskId", params: { taskId: o.seriesId } });
  const partner = !mine.length && isDom ? theirs[0]?.assigneeId : undefined;

  return (
    <div className="flex h-dvh flex-col bg-surface text-on-surface">
      <header className="flex items-center gap-2 bg-surface-container px-3 py-2">
        <img src="/icon.svg" alt="" className="size-5" />
        <span className="flex-1 text-title-small">Fealty · Today</span>
        <IconButton icon="open_in_new" label="Open Fealty" onClick={() => openMain({ to: "/" })} />
        <IconButton icon="close" label="Close" onClick={close} />
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <div className="flex items-center gap-3">
          <Ring done={done} total={shown.length} />
          <div className="min-w-0">
            <div className="text-title-medium">{shown.length ? `${done} of ${shown.length} done` : "Nothing due today"}</div>
            {partner && <div className="truncate text-body-medium text-on-surface-variant">{memberName(partner)}'s day</div>}
            {next && <div className="truncate text-body-medium text-on-surface-variant">Next: {next.title}</div>}
          </div>
        </div>
        {deadline && (
          <button
            type="button"
            onClick={() => openTask(deadline)}
            className={cx(
              "flex items-center gap-3 rounded-lg px-4 py-3 text-left",
              new Date(deadline.dueAt).getTime() - now <= HOUR / 4 ? "bg-error-container text-on-error-container" : "bg-tertiary-container text-on-tertiary-container",
            )}
          >
            <Icon name="timer" />
            <span className="min-w-0 flex-1 truncate text-title-small">{deadline.title}</span>
            <span className="text-title-medium tabular-nums">{mmss(new Date(deadline.dueAt).getTime() - now)}</span>
          </button>
        )}
        {(toReview > 0 || asks > 0) && (
          <div className="flex flex-wrap gap-2">
            {toReview > 0 && (
              <button type="button" onClick={() => openMain({ to: "/" })} className="flex items-center gap-2 rounded-md bg-secondary-container px-3 py-2 text-label-large text-on-secondary-container">
                <Icon name="rate_review" size={18} /> {toReview} to review
              </button>
            )}
            {asks > 0 && (
              <button type="button" onClick={() => openMain({ to: "/" })} className="flex items-center gap-2 rounded-md border border-outline-variant px-3 py-2 text-label-large text-on-surface-variant">
                <Icon name="more_time" size={18} /> {asks} {asks === 1 ? "asks" : "ask"} for time
              </button>
            )}
          </div>
        )}
        <ul className="flex flex-col">
          {shown.map((o) => {
            const ok = o.assigneeId === me.user.id && tickable(o, now);
            const due = new Date(o.dueAt).getTime() - now;
            return (
              <li key={o.id} className="flex items-center gap-3 py-1.5">
                <button
                  type="button"
                  aria-label={settled(o) ? `${o.title} is done` : ok ? `Mark ${o.title} done` : `Open ${o.title}`}
                  disabled={settled(o)}
                  onClick={() => (ok ? quickComplete(o) : openTask(o))}
                  className={cx("grid size-8 shrink-0 place-items-center rounded-full", settled(o) ? "text-primary" : ok ? "text-on-surface-variant hover:bg-on-surface/8" : "text-outline hover:bg-on-surface/8")}
                >
                  <Icon name={settled(o) ? "check_circle" : "radio_button_unchecked"} filled={settled(o)} />
                </button>
                <button type="button" onClick={() => openTask(o)} className={cx("min-w-0 flex-1 truncate text-left text-body-large", o.status === "completed" && "text-on-surface-variant line-through", o.status === "missed" && "text-on-surface-variant")}>
                  {o.title}
                </button>
                <span className={cx("text-body-medium tabular-nums", o.status === "missed" ? "text-error" : o.status === "pending" && due > 0 && due < HOUR ? "text-primary" : "text-on-surface-variant")}>
                  {o.status === "missed" ? "Missed" : o.status === "submitted" ? "Sent" : o.status === "pending" && due > 0 && due < HOUR ? `in ${Math.max(1, Math.floor(due / 60_000))} min` : fmtTime(o.dueAt)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
