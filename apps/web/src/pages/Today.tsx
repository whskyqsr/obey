import { useMemo, useState } from "react";
import { useDecideReschedule, useOccurrences, usePendingReschedules } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Occurrence, RescheduleRequest } from "../api/types";
import { DayRescheduleSheet } from "../components/DayRescheduleSheet";
import { OccurrenceCard, isOverdue } from "../components/OccurrenceCard";
import { Button, Empty, ErrorBox, Loading, PageHeader, Section, useSnackbar } from "../components/ui";
import { addDays, fmtDate, fmtDateTime, localDateOf, today } from "../lib/dates";
import { useRel } from "../lib/relationship";

const byDue = (a: Occurrence, b: Occurrence) => a.dueAt.localeCompare(b.dueAt);

export function TodayPage() {
  const { rel, me, isDom } = useRel();
  const t = today();
  const occ = useOccurrences(rel.id, addDays(t, -30), addDays(t, 7));

  const groups = useMemo(() => {
    const list = occ.data ?? [];
    const now = Date.now();
    const dueDay = (o: Occurrence) => localDateOf(new Date(o.dueAt));
    return {
      overdue: list.filter((o) => isOverdue(o, now) && dueDay(o) < t).sort(byDue),
      review: list.filter((o) => o.status === "submitted").sort(byDue),
      today: list.filter((o) => dueDay(o) === t && o.status !== "submitted" && o.status !== "cancelled").sort(byDue),
      upcoming: list.filter((o) => dueDay(o) > t && o.status === "pending").sort(byDue).slice(0, 8),
    };
  }, [occ.data, t]);

  const todayOpen = groups.today.filter((o) => o.status === "pending").length;
  const [daySheet, setDaySheet] = useState(false);
  // Whole-day extensions cover the user's own open tasks for today (and anything overdue from today).
  const myOpenToday = useMemo(
    () => groups.today.filter((o) => o.status === "pending" && o.assigneeId === me.user.id),
    [groups.today, me.user.id],
  );
  const name = me.user.displayName.split(" ")[0];

  return (
    <>
      <PageHeader
        title={`Hi${name ? `, ${name}` : ""}`}
        subtitle={`${fmtDate(t, { weekday: "long", month: "long", day: "numeric" })} · ${todayOpen} open today${groups.overdue.length ? `, ${groups.overdue.length} overdue` : ""}`}
      />
      <PendingRequests />
      {occ.isLoading && <Loading />}
      {occ.error && <ErrorBox error={occ.error} onRetry={() => occ.refetch()} />}
      {occ.data && (
        <>
          {groups.overdue.length > 0 && (
            <Section title="Overdue">
              <List items={groups.overdue} showDate />
            </Section>
          )}
          {groups.review.length > 0 && (
            <Section title={isDom ? "Needs your review" : "Waiting for review"}>
              <List items={groups.review} showDate />
            </Section>
          )}
          <Section
            title="Today"
            action={
              myOpenToday.length > 1 ? (
                <Button variant="tonal" icon="more_time" onClick={() => setDaySheet(true)}>
                  More time for today
                </Button>
              ) : undefined
            }
          >
            {groups.today.length ? (
              <List items={groups.today} />
            ) : (
              <Empty icon="spa" title="Nothing due today" body={isDom ? "Add a task from the Tasks tab." : "Enjoy it while it lasts."} />
            )}
          </Section>
          {groups.upcoming.length > 0 && (
            <Section title="Coming up">
              <List items={groups.upcoming} showDate />
            </Section>
          )}
        </>
      )}
      <DayRescheduleSheet tasks={myOpenToday} open={daySheet} onClose={() => setDaySheet(false)} />
    </>
  );
}

function List({ items, showDate }: { items: Occurrence[]; showDate?: boolean }) {
  return (
    <div className="grid gap-2 lg:grid-cols-2">
      {items.map((o) => (
        <OccurrenceCard key={o.id} o={o} showDate={showDate} />
      ))}
    </div>
  );
}

/** One card per request; a whole-day request (shared groupId) is one card listing each task. */
function PendingRequests() {
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

  return (
    <Section title={isDom ? "Extension requests" : "Waiting for approval"}>
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
    </Section>
  );
}
