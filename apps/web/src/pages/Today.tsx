import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useDecideReschedule, useOccurrences, usePendingReschedules } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Occurrence, RescheduleRequest } from "../api/types";
import { DayRescheduleSheet } from "../components/DayRescheduleSheet";
import { isOverdue } from "../components/OccurrenceCard";
import { ExcuseAction, ReviewActions, RowGroup, TaskRow } from "../components/TaskRow";
import { Button, Empty, ErrorBox, Fab, Icon, Loading, PageHeader, Section, useSnackbar } from "../components/ui";
import { addDays, fmtDate, fmtDateTime, fmtRelative, localDateOf, today } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { useNeedsYou, useTodayOccurrences } from "../lib/today";

const byDue = (a: Occurrence, b: Occurrence) => a.dueAt.localeCompare(b.dueAt);
const dueDay = (o: Occurrence) => localDateOf(new Date(o.dueAt));

export function TodayPage() {
  const { me, isDom, features, rel, memberName } = useRel();
  const navigate = useNavigate();
  const t = today();
  const occ = useTodayOccurrences();
  const needs = useNeedsYou();

  const groups = useMemo(() => {
    const list = (occ.data ?? []).filter((o) => o.status !== "cancelled");
    const now = Date.now();
    const later = new Map<string, Occurrence[]>();
    for (const o of list.filter((o) => dueDay(o) > t && o.status === "pending").sort(byDue)) later.set(dueDay(o), [...(later.get(dueDay(o)) ?? []), o]);
    return {
      overdue: list.filter((o) => isOverdue(o, now) && dueDay(o) < t).sort(byDue),
      today: list.filter((o) => dueDay(o) === t).sort(byDue),
      later: [...later.entries()].slice(0, 3),
    };
  }, [occ.data, t]);

  const [daySheet, setDaySheet] = useState(false);
  const pending = usePendingReschedules(rel.id);
  // Whole-day extensions cover the user's own open tasks for today; ones already asked about aren't offered again.
  const myOpenToday = useMemo(() => {
    const asked = new Set((pending.data ?? []).map((r) => r.occurrenceId));
    return groups.today.filter((o) => o.status === "pending" && o.assigneeId === me.user.id && !asked.has(o.id));
  }, [groups.today, me.user.id, pending.data]);
  const name = me.user.displayName.split(" ")[0];

  // The Dom's "Needs you" rows are taken out of the rest of today.
  const decided = new Set([...needs.review, ...needs.missed].map((o) => o.id));
  const restOfToday = isDom ? groups.today.filter((o) => !decided.has(o.id)) : groups.today;
  const todays = groups.today.filter((o) => o.status !== "excused");
  const doneToday = todays.filter((o) => o.status === "completed" || o.status === "submitted").length;
  const partner = rel.members.find((m) => m.userId !== me.user.id);

  return (
    <>
      <PageHeader
        title={`Hi${name ? `, ${name}` : ""}`}
        subtitle={[
          fmtDate(t, { weekday: "long", month: "long", day: "numeric" }),
          isDom && partner && todays.length ? `${memberName(partner.userId)} has done ${doneToday} of ${todays.length}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      />
      {!isDom && occ.data && todays.length > 0 && <Progress today={todays} done={doneToday} points={features.points} />}
      {isDom ? (
        <>
          {needs.count > 0 && (
            <Section title={`Needs you · ${needs.count}`}>
              <div className="flex flex-col gap-2">
                <PendingRequests bare />
                {(needs.review.length > 0 || needs.missed.length > 0) && (
                  <RowGroup>
                    {needs.review.map((o) => (
                      <TaskRow key={o.id} o={o} showDate={dueDay(o) !== t} actions={<ReviewActions o={o} />} />
                    ))}
                    {needs.missed.map((o) => (
                      <TaskRow key={o.id} o={o} showDate={dueDay(o) !== t} actions={<ExcuseAction o={o} />} />
                    ))}
                  </RowGroup>
                )}
              </div>
            </Section>
          )}
        </>
      ) : (
        <PendingRequests />
      )}
      {occ.isLoading && <Loading />}
      {occ.error && <ErrorBox error={occ.error} onRetry={() => occ.refetch()} />}
      {occ.data && (
        <>
          {groups.overdue.length > 0 && (
            <Section title="Overdue">
              <RowGroup>
                {groups.overdue.map((o) => (
                  <TaskRow key={o.id} o={o} showDate />
                ))}
              </RowGroup>
            </Section>
          )}
          <Section
            title={isDom && needs.count > 0 ? "Rest of today" : "Today"}
            action={
              myOpenToday.length > 1 ? (
                <Button variant="text" icon="more_time" onClick={() => setDaySheet(true)}>
                  More time
                </Button>
              ) : undefined
            }
          >
            {restOfToday.length ? (
              <RowGroup>
                {restOfToday.map((o) => (
                  <TaskRow key={o.id} o={o} />
                ))}
              </RowGroup>
            ) : (
              <Empty icon="spa" title="Nothing due today" body={isDom ? "Add one with the button below." : "Enjoy it while it lasts."} />
            )}
          </Section>
          {groups.later.length > 0 && (
            <Section title="Later">
              <div className="flex flex-col gap-2">
                {groups.later.map(([day, items]) => (
                  <LaterDay key={day} day={day} items={items} />
                ))}
                <Button variant="text" icon="calendar_month" className="self-start" onClick={() => navigate({ to: "/calendar" })}>
                  See the week
                </Button>
              </div>
            </Section>
          )}
        </>
      )}
      <DayRescheduleSheet tasks={myOpenToday} open={daySheet} onClose={() => setDaySheet(false)} />
      {isDom && <Fab icon="add" label="New task" onClick={() => navigate({ to: "/tasks/$taskId", params: { taskId: "new" } })} />}
    </>
  );
}

/** "1 of 5 done", what's next and the points still on the table today. */
function Progress({ today: list, done, points }: { today: Occurrence[]; done: number; points: boolean }) {
  const now = Date.now();
  const open = list.filter((o) => o.status === "pending");
  const next = open.find((o) => new Date(o.dueAt).getTime() >= now);
  const left = open.reduce((sum, o) => sum + Math.max(0, o.points), 0);
  const r = 22;
  const c = 2 * Math.PI * r;
  const frac = list.length ? done / list.length : 0;
  return (
    <div className="mx-4 mb-6 flex items-center gap-4 rounded-xl bg-primary-container p-4 text-on-primary-container md:mx-6">
      <svg viewBox="0 0 56 56" className="size-14 shrink-0 -rotate-90" aria-hidden>
        <circle cx="28" cy="28" r={r} fill="none" strokeWidth="6" className="stroke-on-primary-container/15" />
        <circle cx="28" cy="28" r={r} fill="none" strokeWidth="6" strokeLinecap="round" className="stroke-primary" strokeDasharray={`${c * frac} ${c}`} />
      </svg>
      <div className="min-w-0">
        <div className="text-title-large">{done === list.length ? "All done for today" : `${done} of ${list.length} done`}</div>
        <div className="text-body-medium">
          {[next ? `Next: ${next.title} ${fmtRelative(next.dueAt)}` : open.length ? `${open.length} still open` : null, points && left ? `${left} pts left today` : null]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
    </div>
  );
}

/** A later day, collapsed to its task names until opened. */
function LaterDay({ day, items }: { day: string; items: Occurrence[] }) {
  const [open, setOpen] = useState(false);
  const label = day === addDays(today(), 1) ? "Tomorrow" : fmtDate(day, { weekday: "long", month: "short", day: "numeric" });
  return (
    <div className="overflow-hidden rounded-lg bg-surface-container-low">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="state-layer flex w-full items-center gap-3 px-4 py-3 text-left">
        <div className="min-w-0 flex-1">
          <div className="text-title-medium text-on-surface">
            {label} · {items.length} {items.length === 1 ? "task" : "tasks"}
          </div>
          {!open && <div className="truncate text-body-medium text-on-surface-variant">{items.map((o) => o.title).join(", ")}</div>}
        </div>
        <Icon name={open ? "expand_less" : "expand_more"} className="text-on-surface-variant" />
      </button>
      {open && (
        <RowGroup>
          {items.map((o) => (
            <TaskRow key={o.id} o={o} />
          ))}
        </RowGroup>
      )}
    </div>
  );
}

/** One card per request; a whole-day request (shared groupId) is one card listing each task. */
function PendingRequests({ bare }: { bare?: boolean }) {
  const { rel, me, isDom, memberName } = useRel();
  const snack = useSnackbar();
  const pending = usePendingReschedules(rel.id);
  const decide = useDecideReschedule(rel.id);

  const cards = useMemo(() => {
    const map = new Map<string, RescheduleRequest[]>();
    for (const r of pending.data ?? []) {
      // The Dom decides others' requests; everyone sees their own as "waiting".
      if (!isDom && r.requestedBy !== me.user.id) continue;
      const key = r.groupId ?? r.id;
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.values()];
  }, [pending.data, isDom, me.user.id]);

  if (!cards.length) return null;
  const mine = (r: RescheduleRequest) => r.requestedBy === me.user.id;

  function act(r: RescheduleRequest, approve: boolean, n: number) {
    decide.mutate(
      { id: r.id, approve },
      {
        onSuccess: () => snack(`${approve ? "Approved" : "Declined"}${n > 1 ? ` ${n} tasks` : ""}`),
        onError: (e) => snack(errorMessage(e)),
      },
    );
  }

  const body = (
    <div className="flex flex-col gap-2">
      {cards.map((rows) => {
        const r = rows[0]!;
        const who = mine(r) ? "You asked" : `${memberName(r.requestedBy)} asks`;
        const single = rows.length === 1;
        return (
          <div key={r.groupId ?? r.id} className="flex flex-col gap-3 rounded-md bg-tertiary-container p-4 text-on-tertiary-container">
            <div>
              <div className="text-title-medium">
                {single ? (
                  <>
                    {who} for more time on “{r.title}”{r.scope === "following" ? " (this and following)" : ""}
                  </>
                ) : (
                  <>
                    {who} for more time on {rows.length} tasks today
                  </>
                )}
              </div>
              {single ? (
                <div className="text-body-medium">
                  {fmtDateTime(r.fromDueAt)} → {fmtDateTime(r.toDueAt)}
                </div>
              ) : (
                <ul className="mt-2 flex flex-col gap-1">
                  {rows.map((x) => (
                    <li key={x.id} className="flex flex-wrap justify-between gap-x-3 text-body-medium">
                      <span className="font-medium">{x.title}</span>
                      <span>
                        {fmtDateTime(x.fromDueAt)} → {fmtDateTime(x.toDueAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {r.reason && <div className="mt-2 text-body-medium italic">“{r.reason}”</div>}
            </div>
            {isDom && !mine(r) && (
              <div className="flex gap-2">
                <Button icon="check" disabled={decide.isPending} onClick={() => act(r, true, rows.length)}>
                  {single ? "Approve" : "Approve all"}
                </Button>
                <Button variant="text" className="text-on-tertiary-container" disabled={decide.isPending} onClick={() => act(r, false, rows.length)}>
                  Decline
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
  return bare ? body : <Section title={isDom ? "Extension requests" : "Waiting for approval"}>{body}</Section>;
}
