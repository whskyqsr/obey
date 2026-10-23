import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  useAgreement,
  useCurfew,
  useDecideReschedule,
  useDelays,
  useEvents,
  useLibraryChanges,
  usePendingReschedules,
  usePlanChanges,
  useReviewOccurrence,
  useSeenDelay,
  useSeenLibraryChanges,
  useSeenPlanChange,
} from "../api/hooks";
import { errorMessage } from "../api/client";
import type { CalendarEvent, DelayUsed, LibraryChange, RescheduleRequest } from "../api/types";
import { addDays, fmtDateTime, fmtTime, fromLocalInput, localDateOf, toLocalInput, today } from "../lib/dates";
import { planTone } from "../lib/planColors";
import { useRel } from "../lib/relationship";
import { useNeedsYou } from "../lib/today";
import { Clash } from "./CurfewStrip";
import { useNoteAfter } from "./DecisionNote";
import { EventDialog, eventOn, eventWhen } from "./EventDialog";
import { MOOD_LABELS } from "./Mood";
import { MoodRow, RedemptionRow, SceneCheckRow } from "./NeedsYou";
import { MissActions, ReviewActions, RowGroup, TaskRow } from "./TaskRow";
import { Button, Dialog, Icon, IconButton, Section, TextField, cx, useSnackbar } from "./ui";

type Tone = "primary" | "secondary" | "tertiary" | "error" | "neutral";
const TONE: Record<Tone, string> = {
  primary: "bg-primary-container text-on-primary-container",
  secondary: "bg-secondary-container text-on-secondary-container",
  tertiary: "bg-tertiary-container text-on-tertiary-container",
  error: "bg-error-container text-on-error-container",
  neutral: "bg-surface-container-highest text-on-surface-variant",
};

/** One row of the list: a kind of thing waiting, how many, and what they are once opened. A link row opens a page instead. */
type Group = { key: string; icon: string; tone: Tone; title: string; sub: string; count: number; action?: ReactNode; body?: ReactNode; to?: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const names = (list: string[]) => list.join(", ");

/**
 * Everything on Today that waits on this person, one row per kind with a count, so a busy day doesn't turn into a wall of
 * cards. Opening a row shows the same actions as before; updates that need no decision clear in one tap.
 */
export function TodayInbox() {
  const { rel, me, isDom, features, memberName } = useRel();
  const snack = useSnackbar();
  const live = !rel.endedAt;
  const needs = useNeedsYou();
  const requests = useRequestCards();
  const review = useReviewOccurrence(rel.id);
  const curfew = useCurfew(rel.id, features.location);
  const clashes = usePlanClashes();
  const agreement = useAgreement(rel.id, features.agreement && live);
  const delays = useDelays(rel.id, isDom && rel.reschedulePolicy === "allowance");
  const seenDelay = useSeenDelay(rel.id);
  const planChanges = usePlanChanges(rel.id);
  const seenPlan = useSeenPlanChange(rel.id);
  const library = useLibraryChanges(rel.id, features.rules || features.protocols);
  const seenLibrary = useSeenLibraryChanges(rel.id);
  const [toggled, setToggled] = useState<Set<string>>(new Set());

  const fail = (e: unknown) => snack(errorMessage(e));
  const all = async (label: string, run: Promise<unknown>[]) => {
    try {
      await Promise.all(run);
      snack(label);
    } catch (e) {
      fail(e);
    }
  };

  const groups: Group[] = [];
  if (requests.length) {
    const titles = names(requests.map((rows) => (rows.length === 1 ? rows[0]!.title : plural(rows.length, "task"))));
    groups.push({
      key: "requests",
      icon: "more_time",
      tone: "tertiary",
      title: isDom ? `${plural(requests.length, "request")} for more time` : "Waiting for approval",
      sub: titles,
      count: requests.length,
      body: <PendingRequests cards={requests} />,
    });
  }
  if (isDom && needs.review.length) {
    const list = needs.review;
    groups.push({
      key: "review",
      icon: "task_alt",
      tone: "primary",
      title: `Approve ${plural(list.length, "task")}`,
      sub: names(list.map((o) => o.title)),
      count: list.length,
      action:
        list.length > 1 ? (
          <Button
            variant="outlined"
            disabled={review.isPending}
            onClick={() =>
              all(
                `Approved ${list.length}`,
                list.map((o) => review.mutateAsync({ id: o.id, approve: true })),
              )
            }
          >
            Approve all
          </Button>
        ) : undefined,
      body: (
        <RowGroup>
          {list.map((o) => (
            <TaskRow key={o.id} o={o} showDate={localDateOf(new Date(o.dueAt)) !== today()} actions={<ReviewActions o={o} />} />
          ))}
        </RowGroup>
      ),
    });
  }
  if (isDom && needs.missed.length) {
    const list = needs.missed;
    groups.push({
      key: "missed",
      icon: "close",
      tone: "error",
      title: plural(list.length, "missed task"),
      sub: names(list.map((o) => `${o.title}${localDateOf(new Date(o.dueAt)) !== today() ? ", yesterday" : ""}`)),
      count: list.length,
      body: (
        <RowGroup>
          {list.map((o) => (
            <TaskRow key={o.id} o={o} showDate={localDateOf(new Date(o.dueAt)) !== today()} actions={<MissActions o={o} />} />
          ))}
        </RowGroup>
      ),
    });
  }
  const curfewClashes = isDom && features.location ? (curfew.data?.clashes ?? []) : [];
  if (curfewClashes.length) {
    groups.push({
      key: "curfew",
      icon: "event_busy",
      tone: "secondary",
      title: curfewClashes.length === 1 ? "1 plan runs past curfew" : `${curfewClashes.length} plans run past curfew`,
      sub: names(curfewClashes.map((c) => c.eventTitle)),
      count: curfewClashes.length,
      body: (
        <div className="flex flex-col gap-2">
          {curfewClashes.map((c) => (
            <Clash key={c.occurrenceId} clash={c} />
          ))}
        </div>
      ),
    });
  }
  if (clashes.length) {
    groups.push({
      key: "clashes",
      icon: "event_busy",
      tone: "secondary",
      title: clashes.length === 1 ? "1 plan overlaps tasks" : `${clashes.length} plans overlap tasks`,
      sub: names(clashes.map((e) => e.title)),
      count: clashes.length,
      body: <PlanClashes clashing={clashes} />,
    });
  }
  const v = agreement.data?.proposal;
  if (v) {
    const toAnswer = v.status === "proposed" && !v.agreements.some((a) => a.userId === me.user.id);
    const sentBack = v.status === "changes_requested" && v.proposedBy === me.user.id && v.feedback;
    if (toAnswer || sentBack)
      groups.push({
        key: "agreement",
        icon: "handshake",
        tone: "secondary",
        title: `Agreement version ${v.number}`,
        sub: toAnswer
          ? `Proposed by ${v.proposedBy ? memberName(v.proposedBy) : "someone"}${v.note ? ` · “${v.note}”` : ""}`
          : `${v.feedback!.userId ? memberName(v.feedback!.userId) : "Someone"} asked for changes${v.feedback!.note ? ` · “${v.feedback!.note}”` : ""}`,
        count: 1,
        to: "/agreement",
      });
  }
  if (isDom && needs.lowMoods.length) {
    const list = needs.lowMoods;
    groups.push({
      key: "moods",
      icon: "sentiment_dissatisfied",
      tone: "error",
      title: plural(list.length, "low check-in"),
      sub: names(list.map((o) => `${memberName(o.assigneeId)} felt ${MOOD_LABELS[o.mood! - 1]!.toLowerCase()} after ${o.title}`)),
      count: list.length,
      body: (
        <RowGroup>
          {list.map((o) => (
            <MoodRow key={o.id} o={o} />
          ))}
        </RowGroup>
      ),
    });
  }
  if (needs.sceneChecks.length) {
    const list = needs.sceneChecks;
    groups.push({
      key: "sceneChecks",
      icon: "favorite",
      tone: "error",
      title: list.length === 1 ? `Check in with ${memberName(list[0]!.check.userId)}` : `${plural(list.length, "check-in")} after a scene`,
      sub: names(list.map(({ check: c }) => (c.note ? `${memberName(c.userId)} still needs something` : `${memberName(c.userId)} felt ${MOOD_LABELS[c.mood - 1]!.toLowerCase()}`))),
      count: list.length,
      body: (
        <RowGroup>
          {list.map((x) => (
            <SceneCheckRow key={`${x.scene.id}:${x.check.userId}`} x={x} />
          ))}
        </RowGroup>
      ),
    });
  }
  if (isDom && needs.redemptions.length) {
    const list = needs.redemptions;
    groups.push({
      key: "rewards",
      icon: "redeem",
      tone: "primary",
      title: `${plural(list.length, "reward")} to give`,
      sub: names(list.map((e) => e.note)),
      count: list.length,
      body: (
        <RowGroup>
          {list.map((e) => (
            <RedemptionRow key={e.id} e={e} />
          ))}
        </RowGroup>
      ),
    });
  }
  // Updates: nothing to decide, so each kind clears in one tap.
  const delayList = delays.data ?? [];
  if (delayList.length) {
    const who = new Set(delayList.map((d) => d.requestedBy));
    groups.push({
      key: "delays",
      icon: "schedule",
      tone: "neutral",
      title: who.size === 1 ? `${memberName(delayList[0]!.requestedBy)} used ${plural(delayList.length, "delay")}` : plural(delayList.length, "delay used", "delays used"),
      sub: names(delayList.flatMap((d) => d.items.map((x) => x.title))),
      count: delayList.length,
      action: (
        <Button
          variant="outlined"
          disabled={seenDelay.isPending}
          onClick={() =>
            all(
              "Marked seen",
              delayList.map((d) => seenDelay.mutateAsync(d.id)),
            )
          }
        >
          Mark all seen
        </Button>
      ),
      body: (
        <RowGroup>
          {delayList.map((d) => (
            <DelayRow key={d.id} d={d} onSeen={() => seenDelay.mutate(d.id, { onError: fail })} />
          ))}
        </RowGroup>
      ),
    });
  }
  const changed = planChanges.data ?? [];
  if (changed.length) {
    groups.push({
      key: "plans",
      icon: "event",
      tone: "neutral",
      title: changed.length === 1 ? "1 plan changed" : `${changed.length} plans changed`,
      sub: names(changed.map((e) => (e.previousEndsAt ? `${e.title} now ends ${fmtTime(e.endsAt)}` : e.title))),
      count: changed.length,
      action: (
        <Button
          variant="outlined"
          disabled={seenPlan.isPending}
          onClick={() =>
            all(
              "Marked seen",
              changed.map((e) => seenPlan.mutateAsync(e.id)),
            )
          }
        >
          Mark all seen
        </Button>
      ),
      body: (
        <RowGroup>
          {changed.map((e) => (
            <PlanChangeRow key={e.id} e={e} onSeen={() => seenPlan.mutate(e.id, { onError: fail })} />
          ))}
        </RowGroup>
      ),
    });
  }
  const libList = (library.data ?? []).filter((c) => features[c.kind]);
  if (libList.length) {
    const kinds = new Set(libList.map((c) => c.kind));
    groups.push({
      key: "library",
      icon: "gavel",
      tone: "neutral",
      title: kinds.size === 2 ? "Rules and protocols changed" : kinds.has("rules") ? "Rules changed" : "Protocols changed",
      sub: librarySummary(libList, memberName),
      count: libList.length,
      action: (
        <Button
          variant="outlined"
          disabled={seenLibrary.isPending}
          onClick={() =>
            seenLibrary.mutate(
              libList.map((c) => c.id),
              { onSuccess: () => snack("Marked seen"), onError: fail },
            )
          }
        >
          Mark all seen
        </Button>
      ),
      body: (
        <RowGroup>
          {libList.map((c) => (
            <LibraryChangeRow key={c.id} c={c} onSeen={() => seenLibrary.mutate([c.id], { onError: fail })} />
          ))}
        </RowGroup>
      ),
    });
  }

  if (!groups.length) return null;
  const total = groups.reduce((n, g) => n + g.count, 0);
  // With only one kind waiting there's nothing to fold away, so it starts open.
  const isOpen = (key: string) => toggled.has(key) !== (groups.length === 1);
  const toggle = (key: string) =>
    setToggled((s) => {
      const next = new Set(s);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  return (
    <Section title={`${isDom ? "Needs you" : "For you"} · ${total}`}>
      <div className="flex flex-col gap-0.5 overflow-hidden rounded-lg">
        {groups.map((g) => (
          <GroupRow key={g.key} g={g} open={isOpen(g.key)} onToggle={() => toggle(g.key)} />
        ))}
      </div>
    </Section>
  );
}

function GroupRow({ g, open, onToggle }: { g: Group; open: boolean; onToggle(): void }) {
  const head = (
    <>
      <span className={cx("flex size-10 shrink-0 items-center justify-center rounded-full", TONE[g.tone])}>
        <Icon name={g.icon} size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-title-medium text-on-surface">{g.title}</div>
        {!(open && g.body) && g.sub && <div className="truncate text-body-medium text-on-surface-variant">{g.sub}</div>}
      </div>
    </>
  );
  if (g.to)
    return (
      <Link to={g.to} className="state-layer flex min-h-16 items-center gap-4 bg-surface-container-low px-4 py-2">
        {head}
        <Icon name="chevron_right" className="text-on-surface-variant" />
      </Link>
    );
  return (
    <div className="bg-surface-container-low">
      <div className="flex min-h-16 items-center">
        <button type="button" aria-expanded={open} onClick={onToggle} className="state-layer flex min-w-0 flex-1 items-center gap-4 self-stretch py-2 pr-4 pl-4 text-left">
          {head}
          {!open && <span className="rounded-full bg-primary px-2 py-0.5 text-label-medium text-on-primary tabular-nums">{g.count}</span>}
          <Icon name={open ? "expand_less" : "expand_more"} className="text-on-surface-variant" />
        </button>
      </div>
      {open && g.body && (
        <div className="flex flex-col gap-2 px-2 pb-2">
          {g.body}
          {g.action && <div className="flex justify-end">{g.action}</div>}
        </div>
      )}
    </div>
  );
}

/** "Sam changed 1 rule, added 1 protocol". */
function librarySummary(list: LibraryChange[], memberName: (id: string) => string) {
  const by = new Set(list.map((c) => c.changedBy));
  const counts = new Map<string, number>();
  for (const c of list) counts.set(`${c.verb} ${c.kind}`, (counts.get(`${c.verb} ${c.kind}`) ?? 0) + 1);
  const parts = [...counts].map(([k, n]) => {
    const [verb, kind] = k.split(" ") as [string, string];
    return `${verb} ${plural(n, kind.slice(0, -1))}`;
  });
  const first = list[0]!.changedBy;
  return `${by.size === 1 && first ? memberName(first) : "Changes"}${by.size === 1 && first ? " " : ": "}${parts.join(", ")}`;
}

function LibraryChangeRow({ c, onSeen }: { c: LibraryChange; onSeen(): void }) {
  const { memberName } = useRel();
  const kind = c.kind === "rules" ? "rule" : "protocol";
  const text = (
    <div className="min-w-0 flex-1">
      <div className="truncate text-body-large text-on-surface">{c.title}</div>
      <div className="text-body-medium text-on-surface-variant">
        {c.changedBy ? memberName(c.changedBy) : "Someone"} {c.verb} this {kind} · {dayAndTime(c.createdAt)}
      </div>
    </div>
  );
  return (
    <div className="flex min-h-16 items-center gap-2 bg-surface-container py-2 pr-2 pl-4">
      {c.verb === "removed" ? (
        text
      ) : c.kind === "protocols" ? (
        <Link to="/protocols/$protocolId" params={{ protocolId: c.itemId }} className="min-w-0 flex-1 hover:underline">
          {text}
        </Link>
      ) : (
        <Link to="/rules" className="min-w-0 flex-1 hover:underline">
          {text}
        </Link>
      )}
      <IconButton icon="close" label="Seen" onClick={onSeen} />
    </div>
  );
}

/** "6:00 PM" today, "Thu, Oct 22, 6:00 PM" another day. */
const dayAndTime = (at: string) => (localDateOf(new Date(at)) === today() ? fmtTime(at) : fmtDateTime(at));

/** A delay the sub took from their weekly allowance: no decision needed, but the Dominant hears about each. */
function DelayRow({ d, onSeen }: { d: DelayUsed; onSeen(): void }) {
  const { memberName } = useRel();
  const one = d.items.length === 1 ? d.items[0]! : null;
  return (
    <div className="flex min-h-16 items-center gap-2 bg-surface-container py-2 pr-2 pl-4">
      <div className="min-w-0 flex-1">
        <div className="text-body-large text-on-surface">
          {one ? (
            <>
              {one.title} · {dayAndTime(one.fromDueAt)} <Icon name="arrow_forward" size={16} className="align-[-3px]" /> {fmtTime(one.toDueAt)}
            </>
          ) : (
            `${memberName(d.requestedBy)} moved ${d.items.length} tasks`
          )}
        </div>
        <div className="text-body-medium text-on-surface-variant">
          {d.reason && <span className="italic">“{d.reason}” · </span>}
          {d.left} of {d.allowance} left this week
        </div>
      </div>
      <IconButton icon="close" label="Got it" onClick={onSeen} />
    </div>
  );
}

/** One of my plans someone else changed (a Dominant moving the end). */
function PlanChangeRow({ e, onSeen }: { e: CalendarEvent; onSeen(): void }) {
  const { memberName } = useRel();
  return (
    <div className="flex min-h-16 items-center gap-2 bg-surface-container py-2 pr-2 pl-4">
      <div className="min-w-0 flex-1">
        <div className="text-body-large text-on-surface">
          {e.changedBy ? memberName(e.changedBy) : "Someone"} changed {e.title}
        </div>
        <div className="text-body-medium text-on-surface-variant">
          {eventWhen(e)}
          {e.previousEndsAt && ` · was until ${fmtTime(e.previousEndsAt)}`}
        </div>
        {e.changeNote && <div className="text-body-medium italic text-on-surface-variant">“{e.changeNote}”</div>}
      </div>
      <IconButton icon="close" label="Got it" onClick={onSeen} />
    </div>
  );
}

/** Extension requests as cards: the Dom decides others'; everyone sees their own as waiting. A whole-day request (shared groupId) is one card. */
function useRequestCards() {
  const { rel, me, isDom } = useRel();
  const pending = usePendingReschedules(rel.id);
  return useMemo(() => {
    const map = new Map<string, RescheduleRequest[]>();
    for (const r of pending.data ?? []) {
      if (!isDom && r.requestedBy !== me.user.id) continue;
      const key = r.groupId ?? r.id;
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.values()];
  }, [pending.data, isDom, me.user.id]);
}

function PendingRequests({ cards }: { cards: RescheduleRequest[][] }) {
  const { rel, me, isDom, memberName } = useRel();
  const snack = useSnackbar();
  const decide = useDecideReschedule(rel.id);
  const noteAfter = useNoteAfter();
  const [instead, setInstead] = useState<RescheduleRequest | null>(null);
  const [insteadAt, setInsteadAt] = useState("");
  const mine = (r: RescheduleRequest) => r.requestedBy === me.user.id;

  function act(r: RescheduleRequest, approve: boolean, n: number) {
    decide.mutate(
      { id: r.id, approve },
      {
        onSuccess: () =>
          noteAfter(`${approve ? "Approved" : "Declined"}${n > 1 ? ` ${n} tasks` : ""}`, {
            relId: rel.id,
            occurrenceId: r.occurrenceId,
            to: memberName(r.requestedBy),
            about: `${approve ? "approving" : "declining"} the request for “${r.title}”`,
          }),
        onError: (e) => snack(errorMessage(e)),
      },
    );
  }
  /** "Reschedule instead": the Dom picks the new deadline for this one task, whatever was asked. */
  function openInstead(r: RescheduleRequest) {
    setInsteadAt(toLocalInput(new Date(new Date(r.kind === "cancel" ? r.fromDueAt : r.toDueAt).getTime() + (r.kind === "cancel" ? 86_400_000 : 0)).toISOString()));
    setInstead(r);
  }
  function moveInstead() {
    if (!instead || !insteadAt) return;
    decide.mutate(
      { id: instead.id, approve: true, dueAt: fromLocalInput(insteadAt), item: true },
      { onSuccess: () => (snack(`Moved “${instead.title}”`), setInstead(null)), onError: (e) => snack(errorMessage(e)) },
    );
  }
  const change = (x: RescheduleRequest) => (x.kind === "cancel" ? "Call off" : `${fmtDateTime(x.fromDueAt)} → ${fmtDateTime(x.toDueAt)}`);

  return (
    <div className="flex flex-col gap-2">
      {cards.map((rows) => {
        const r = rows[0]!;
        const who = mine(r) ? "You asked" : `${memberName(r.requestedBy)} asks`;
        const single = rows.length === 1;
        const canDecide = isDom && !mine(r);
        return (
          <div key={r.groupId ?? r.id} className="flex flex-col gap-3 rounded-md bg-tertiary-container p-4 text-on-tertiary-container">
            <div>
              <div className="text-title-medium">
                {single && r.kind === "cancel" ? (
                  <>
                    {who} to call off “{r.title}”
                  </>
                ) : single ? (
                  <>
                    {who} for more time on “{r.title}”{r.scope === "following" ? " (this and following)" : ""}
                  </>
                ) : rows.some((x) => x.kind === "cancel") ? (
                  <>
                    {who} about {rows.length} tasks
                  </>
                ) : (
                  <>
                    {who} for more time on {rows.length} tasks today
                  </>
                )}
              </div>
              {single ? (
                <div className="text-body-medium">{r.kind === "cancel" ? `Due ${fmtDateTime(r.fromDueAt)}` : change(r)}</div>
              ) : (
                <ul className="mt-2 flex flex-col gap-1">
                  {rows.map((x) => (
                    <li key={x.id} className="flex flex-wrap items-center justify-between gap-x-3 text-body-medium">
                      <span className="font-medium">{x.title}</span>
                      <span className="flex items-center gap-1">
                        {change(x)}
                        {canDecide && <IconButton icon="edit_calendar" label={`Pick a time for ${x.title}`} onClick={() => openInstead(x)} />}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {r.reason && <div className="mt-2 text-body-medium italic">“{r.reason}”</div>}
            </div>
            {canDecide && (
              <div className="flex flex-wrap gap-2">
                <Button icon="check" disabled={decide.isPending} onClick={() => act(r, true, rows.length)}>
                  {single ? "Approve" : "Approve all"}
                </Button>
                {single && (
                  <Button variant="tonal" icon="edit_calendar" disabled={decide.isPending} onClick={() => openInstead(r)}>
                    {r.kind === "cancel" ? "Reschedule instead" : "Other time"}
                  </Button>
                )}
                <Button variant="text" className="text-on-tertiary-container" disabled={decide.isPending} onClick={() => act(r, false, rows.length)}>
                  Decline
                </Button>
              </div>
            )}
          </div>
        );
      })}
      <Dialog
        open={instead !== null}
        onClose={() => setInstead(null)}
        title={instead?.kind === "cancel" ? "Reschedule instead" : "Pick another time"}
        actions={
          <>
            <Button variant="text" onClick={() => setInstead(null)}>
              Cancel
            </Button>
            <Button busy={decide.isPending} disabled={!insteadAt} onClick={moveInstead}>
              Move it
            </Button>
          </>
        }
      >
        <p className="mb-3">
          “{instead?.title}” moves to this deadline{instead?.kind === "cancel" ? " instead of being called off" : ""}. The rest of the request stays for you to decide.
        </p>
        <TextField type="datetime-local" label="New deadline" value={insteadAt} onChange={(e) => setInsteadAt(e.target.value)} />
      </Dialog>
    </div>
  );
}

/** Plans today or tomorrow that run into tasks, so they get moved before they're missed. */
function usePlanClashes() {
  const { rel } = useRel();
  const t = today();
  const events = useEvents(rel.id, t, addDays(t, 1));
  return (events.data ?? []).filter((e) => e.conflictIds.length > 0 && new Date(e.endsAt).getTime() > Date.now() && (eventOn(e, t) || eventOn(e, addDays(t, 1))));
}

function PlanClashes({ clashing }: { clashing: CalendarEvent[] }) {
  const { rel } = useRel();
  const [open, setOpen] = useState<CalendarEvent | null>(null);
  return (
    <div className="flex flex-col gap-0.5 overflow-hidden rounded-md">
      {clashing.map((e) => (
        <div key={e.id} className={cx("flex items-center gap-3 px-4 py-3", planTone(e, rel).bg, planTone(e, rel).text)}>
          <div className="min-w-0 flex-1">
            <div className="truncate text-title-small">{e.title}</div>
            <div className="text-body-small opacity-80">
              {eventWhen(e)} · overlaps {e.conflictIds.length === 1 ? "a task" : `${e.conflictIds.length} tasks`}
            </div>
          </div>
          <Button variant="text" onClick={() => setOpen(e)}>
            Sort it out
          </Button>
        </div>
      ))}
      <EventDialog event={open} open={open !== null} onClose={() => setOpen(null)} />
    </div>
  );
}
