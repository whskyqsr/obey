import { useMemo } from "react";
import { useDecideReschedule, useOccurrences, usePendingReschedules } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Occurrence } from "../api/types";
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
  const name = me.user.displayName.split(" ")[0];

  return (
    <>
      <PageHeader
        title={`Hi${name ? `, ${name}` : ""}`}
        subtitle={`${fmtDate(t, { weekday: "long", month: "long", day: "numeric" })} · ${todayOpen} open today${groups.overdue.length ? `, ${groups.overdue.length} overdue` : ""}`}
      />
      {isDom && <PendingRequests />}
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
          <Section title="Today">
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

function PendingRequests() {
  const { rel, memberName } = useRel();
  const snack = useSnackbar();
  const pending = usePendingReschedules(rel.id);
  const decide = useDecideReschedule(rel.id);
  if (!pending.data?.length) return null;
  return (
    <Section title="Extension requests">
      <div className="flex flex-col gap-2">
        {pending.data.map((r) => (
          <div key={r.id} className="flex flex-col gap-3 rounded-md bg-tertiary-container p-4 text-on-tertiary-container">
            <div>
              <div className="text-title-medium">
                {memberName(r.requestedBy)} asks to move {r.scope === "following" ? "this and following" : "a task"}
              </div>
              <div className="text-body-medium">
                {fmtDateTime(r.fromDueAt)} → {fmtDateTime(r.toDueAt)}
              </div>
              {r.reason && <div className="mt-1 text-body-medium italic">“{r.reason}”</div>}
            </div>
            <div className="flex gap-2">
              <Button
                icon="check"
                disabled={decide.isPending}
                onClick={() => decide.mutate({ id: r.id, approve: true }, { onSuccess: () => snack("Approved"), onError: (e) => snack(errorMessage(e)) })}
              >
                Approve
              </Button>
              <Button
                variant="text"
                className="text-on-tertiary-container"
                disabled={decide.isPending}
                onClick={() => decide.mutate({ id: r.id, approve: false }, { onSuccess: () => snack("Declined"), onError: (e) => snack(errorMessage(e)) })}
              >
                Decline
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
