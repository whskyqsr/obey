import { useState } from "react";
import { useChastity } from "../api/hooks";
import type { ChastityEvent, ChastityLock } from "../api/types";
import { LockCard, StartLockDialog, eventText, fmtLockTime, fmtSpan, fmtWhen, lockHeading } from "../components/Chastity";
import { Button, ErrorBox, Loading, PageHeader, cx } from "../components/ui";
import { fmtDateTime } from "../lib/dates";
import { useReadOnly, useRel } from "../lib/relationship";

/** Hairline rows under a small heading, as in the mockups' HISTORY. */
function Rows({ title, children }: { title: string; children: React.ReactNode[] }) {
  return (
    <section>
      <h2 className="eyebrow mb-1">{title}</h2>
      {children.map((c, i) => (
        <div key={i} className={cx("py-3", i < children.length - 1 && "border-b border-outline-variant")}>
          {c}
        </div>
      ))}
    </section>
  );
}

/** One lock's history, newest first. */
function EventLog({ events, wearerName }: { events: ChastityEvent[]; wearerName: string }) {
  if (!events.length) return null;
  return (
    <Rows title="History">
      {events.map((e) => {
        const t = eventText(e, wearerName);
        return (
          <div key={e.id}>
            <div className="text-body-large text-on-surface">{t.title}</div>
            <div className="text-body-medium text-on-surface-variant">
              {t.note ? `${t.note} · ` : ""}
              {fmtWhen(e.createdAt)}
            </div>
          </div>
        );
      })}
    </Rows>
  );
}

function PastLock({ l }: { l: ChastityLock }) {
  const { memberName } = useRel();
  const length = l.startedAt && l.endedAt ? fmtSpan(new Date(l.endedAt).getTime() - new Date(l.startedAt).getTime()) : null;
  return (
    <div>
      <div className="text-body-large text-on-surface">
        {memberName(l.wearerId)}
        {length ? `, ${length}` : l.status === "declined" ? ", declined" : ", not started"}
      </div>
      <div className="text-body-medium text-on-surface-variant">
        {l.startedAt ? `${fmtLockTime(l.startedAt)} to ${l.endedAt ? fmtLockTime(l.endedAt) : "?"}` : fmtDateTime(l.createdAt)}
        {l.endReason === "released" ? " · released early" : l.endReason === "time" ? " · time's up" : ""}
      </div>
    </div>
  );
}

export function ChastityPage() {
  const { rel, me, isDom, memberName } = useRel();
  const readOnly = useReadOnly();
  const view = useChastity(rel.id, true);
  const [starting, setStarting] = useState(false);
  const open = view.data?.open ?? [];
  // Anyone else in the dynamic who isn't already locked or asked.
  const wearers = isDom && !readOnly ? rel.members.filter((m) => m.userId !== me.user.id && !open.some((l) => l.wearerId === m.userId)) : [];
  // One lock: the header says whose it is. A wearer asked to lock gets the ask's own heading instead.
  const only = open.length === 1 && !(open[0]!.status === "pending" && open[0]!.wearerId === me.user.id) ? open[0] : undefined;
  const heading: { eyebrow?: string; subtitle?: string } = only ? lockHeading(only, me.user.id, memberName) : view.data && !open.length ? { subtitle: "Nobody is locked." } : {};

  return (
    <>
      <PageHeader title="Chastity" eyebrow={heading.eyebrow} subtitle={heading.subtitle} />
      <div className="flex max-w-[640px] flex-col gap-8 px-4 pb-24 md:px-6">
        {view.isLoading && <Loading />}
        {view.error && <ErrorBox error={view.error} onRetry={() => view.refetch()} />}
        {wearers.length > 0 && (
          <div>
            <Button variant={open.length ? "outlined" : "filled"} onClick={() => setStarting(true)}>
              {wearers.length === 1 ? `Lock ${wearers[0]!.displayName}` : "Lock someone"}
            </Button>
          </div>
        )}
        {open.map((l) => (
          <div key={l.id} className="flex flex-col gap-8">
            {!only && open.length > 1 && <div className="text-body-medium text-on-surface-variant">{lockHeading(l, me.user.id, memberName).subtitle}</div>}
            <LockCard l={l} events={view.data!.events} page />
            <EventLog events={view.data!.events.filter((e) => e.lockId === l.id)} wearerName={memberName(l.wearerId)} />
          </div>
        ))}
        {!!view.data?.past.length && (
          <Rows title="Past locks">
            {view.data.past.map((l) => (
              <PastLock key={l.id} l={l} />
            ))}
          </Rows>
        )}
      </div>
      {starting && <StartLockDialog wearers={wearers} onClose={() => setStarting(false)} />}
    </>
  );
}
