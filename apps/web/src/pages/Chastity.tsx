import { useState } from "react";
import { useChastity } from "../api/hooks";
import type { ChastityEvent, ChastityLock } from "../api/types";
import { LockCard, StartLockDialog, eventIcon, eventText, fmtLockTime, fmtSpan } from "../components/Chastity";
import { Button, Empty, ErrorBox, Icon, Loading, PageHeader, Section, cx } from "../components/ui";
import { fmtDateTime } from "../lib/dates";
import { useReadOnly, useRel } from "../lib/relationship";

/** One lock's history, newest first. */
function EventLog({ events, wearerName }: { events: ChastityEvent[]; wearerName: string }) {
  if (!events.length) return null;
  return (
    <div className="overflow-hidden rounded-lg bg-surface-container-low">
      {events.map((e, i) => {
        const t = eventText(e, wearerName);
        return (
          <div key={e.id} className={cx("flex items-center gap-4 px-4 py-3", i > 0 && "border-t border-outline-variant")}>
            <Icon name={eventIcon[e.kind]} className="text-on-surface-variant" />
            <div className="min-w-0 flex-1">
              <div className="text-body-large text-on-surface">{t.title}</div>
              <div className="text-body-small text-on-surface-variant">{fmtDateTime(e.createdAt)}</div>
            </div>
            {t.pill && <div className={cx("text-title-small", t.neg ? "text-error" : "text-primary")}>{t.pill}</div>}
          </div>
        );
      })}
    </div>
  );
}

function PastLock({ l }: { l: ChastityLock }) {
  const { memberName } = useRel();
  const length = l.startedAt && l.endedAt ? fmtSpan(new Date(l.endedAt).getTime() - new Date(l.startedAt).getTime()) : null;
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <Icon name={l.status === "ended" ? "lock_open" : "block"} className="text-on-surface-variant" />
      <div className="min-w-0 flex-1">
        <div className="text-body-large text-on-surface">
          {memberName(l.wearerId)}
          {length ? `, ${length}` : l.status === "declined" ? ", declined" : ", not started"}
        </div>
        <div className="text-body-small text-on-surface-variant">
          {l.startedAt ? `${fmtLockTime(l.startedAt)} to ${l.endedAt ? fmtLockTime(l.endedAt) : "?"}` : fmtDateTime(l.createdAt)}
          {l.endReason === "released" ? " · released early" : l.endReason === "time" ? " · time's up" : ""}
        </div>
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

  return (
    <>
      <PageHeader
        title="Chastity"
        subtitle="Locks, time added and taken off, and asks to be let out."
        actions={
          wearers.length > 0 && (
            <Button icon="lock" onClick={() => setStarting(true)}>
              Lock
            </Button>
          )
        }
      />
      <div className="flex flex-col gap-6 px-4 pb-24 md:px-6">
        {view.isLoading && <Loading />}
        {view.error && <ErrorBox error={view.error} onRetry={() => view.refetch()} />}
        {view.data && !open.length && (
          <Empty
            icon="lock_open"
            title="Nobody is locked"
            body={isDom ? "Ask to lock someone, for a set time or until you release them." : "When you're asked to lock up, it shows here and on Today."}
          />
        )}
        {open.map((l) => (
          <div key={l.id} className="flex flex-col gap-3">
            <LockCard l={l} events={view.data!.events} page />
            <EventLog events={view.data!.events.filter((e) => e.lockId === l.id)} wearerName={memberName(l.wearerId)} />
          </div>
        ))}
        {!!view.data?.past.length && (
          <Section title="Past locks">
            <div className="overflow-hidden rounded-lg bg-surface-container-low">
              {view.data.past.map((l, i) => (
                <div key={l.id} className={cx(i > 0 && "border-t border-outline-variant")}>
                  <PastLock l={l} />
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
      {starting && <StartLockDialog wearers={wearers} onClose={() => setStarting(false)} />}
    </>
  );
}
