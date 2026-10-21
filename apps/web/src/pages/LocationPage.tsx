import { useNavigate } from "@tanstack/react-router";
import type { Member } from "../api/types";
import { useCurfew, useOccurrences, usePauseLocation } from "../api/hooks";
import { errorMessage } from "../api/client";
import { usePlaceLookup } from "../components/Location";
import { Button, Chip, Icon, IconButton, useSnackbar } from "../components/ui";
import { fmtDateTime, fmtTime, today } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { useBack } from "../lib/useBack";
import { AskLocationButton } from "./Places";

const Card = ({ icon, tone, title, body, children }: { icon: string; tone: "ok" | "warn"; title: string; body: string; children?: React.ReactNode }) => (
  <div className="flex flex-col gap-3 rounded-lg bg-surface-container-low p-4">
    <div className="flex items-start gap-3">
      <Icon name={icon} filled className={tone === "ok" ? "text-primary" : "text-on-surface-variant"} />
      <div className="min-w-0 flex-1">
        <div className="text-body-large text-on-surface">{title}</div>
        <div className="text-body-medium text-on-surface-variant">{body}</div>
      </div>
    </div>
    {children}
  </div>
);

/** For a Dominant: whether this person's phone can check location tasks, with a nudge to set it up if not. */
export function LocationReadiness({ member }: { member: Member }) {
  const name = member.displayName;
  if (member.locationPaused)
    return (
      <Card
        icon="pause_circle"
        tone="warn"
        title={`${name} paused location`}
        body={
          member.locationPausedUntil
            ? `Until ${fmtDateTime(member.locationPausedUntil)}. Location tasks due meanwhile are excused.`
            : "Until they turn it back on. Location tasks due meanwhile are excused."
        }
      />
    );
  if (member.locationStatus === "ready")
    return (
      <Card icon="check_circle" tone="ok" title={`Location is set up on ${name}'s phone`} body={`Fealty only learns when ${name} arrives at or leaves a place a task names.`} />
    );
  const why =
    member.locationStatus === "foreground_only"
      ? `${name}'s phone only lets Fealty see location while it's open.`
      : member.locationStatus === "denied" || member.locationStatus === "services_off"
        ? `Location is turned off for Fealty on ${name}'s phone.`
        : `${name} hasn't set up location yet.`;
  return (
    <Card icon="location_off" tone="warn" title={why} body="Location tasks need the Fealty Android app, with location allowed all the time.">
      <div>
        <AskLocationButton name={name} />
      </div>
    </Card>
  );
}

/** For the person being watched: what's watched today, and pausing it. */
export function LocationPage() {
  const { rel, me, self, memberName } = useRel();
  const navigate = useNavigate();
  const snack = useSnackbar();
  const back = useBack(() => navigate({ to: "/dynamic" }));
  const pause = usePauseLocation(rel.id);
  const placeOf = usePlaceLookup();
  const day = today();
  const occurrences = useOccurrences(rel.id, day, day);
  const watching = (occurrences.data ?? []).filter((o) => o.placeId && o.assigneeId === me.user.id && o.status === "pending");
  const doms = rel.members.filter((m) => m.userId !== me.user.id).map((m) => memberName(m.userId));
  const who = doms.join(" and ") || "Your partner";
  const ready = self?.locationStatus === "ready";
  const curfew = useCurfew(rel.id);
  const onCurfew = curfew.data?.settings?.enabled && curfew.data.settings.assigneeId === me.user.id;
  const endOfDay = () => {
    const d = new Date();
    d.setHours(23, 59, 0, 0);
    return d.toISOString();
  };
  const setPause = (until: string | null | false, msg: string) => pause.mutate(until, { onSuccess: () => snack(msg), onError: (e) => snack(errorMessage(e)) });

  return (
    <div className="flex flex-col pb-10">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-1 bg-surface px-2 md:px-4">
        <IconButton icon="arrow_back" label="Back" onClick={back} />
        <h1 className="text-title-large text-on-surface">Location</h1>
      </header>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 md:px-6">
        {ready ? (
          <Card icon="check_circle" tone="ok" title="On, allowed all the time" body={`${who} sees when you arrive at or leave a place a task names, and nothing else.`} />
        ) : (
          <Card
            icon="location_off"
            tone="warn"
            title="Not set up on your phone"
            body="Location tasks check in on their own from the Fealty Android app, with location allowed all the time. Here you can tap I'm here when you arrive."
          />
        )}

        <h2 className="px-1 pt-2 text-title-small text-primary">Watching today</h2>
        {watching.length === 0 ? (
          <p className="px-1 text-body-medium text-on-surface-variant">No location tasks left today.</p>
        ) : (
          <ul className="overflow-hidden rounded-lg bg-surface-container-low">
            {watching.map((o) => (
              <li key={o.id} className="flex items-center gap-4 border-t border-surface-container-highest px-4 py-3 first:border-t-0">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-container text-on-primary-container">
                  <Icon name="location_on" filled />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body-large text-on-surface">{placeOf(o.placeId)?.name ?? "A place"}</span>
                  <span className="block text-body-medium text-on-surface-variant">
                    {o.title} · by {fmtTime(o.dueAt)}
                    {o.stayMinutes ? `, stay ${o.stayMinutes >= 60 && o.stayMinutes % 60 === 0 ? `${o.stayMinutes / 60} hr` : `${o.stayMinutes} min`}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-3 rounded-lg bg-surface-container-low p-4">
          <div className="text-body-large text-on-surface">Pause</div>
          {self?.locationPaused ? (
            <>
              <p className="text-body-medium text-on-surface-variant">
                Paused {self.locationPausedUntil ? `until ${fmtDateTime(self.locationPausedUntil)}` : "until you turn it back on"}. Location tasks due meanwhile are excused.
              </p>
              <div>
                <Button icon="play_arrow" busy={pause.isPending} onClick={() => setPause(false, "Location is back on")}>
                  Turn back on
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-body-medium text-on-surface-variant">
                Stops watching every place. Location tasks due while paused are excused, and {who} is told you paused.
                {onCurfew && " Curfew still counts: tap I'm home on Today instead."}
              </p>
              <div className="flex flex-wrap gap-2">
                <Chip onClick={() => setPause(new Date(Date.now() + 3_600_000).toISOString(), "Paused for an hour")}>1 hour</Chip>
                <Chip onClick={() => setPause(endOfDay(), "Paused for the rest of today")}>Rest of today</Chip>
                <Chip onClick={() => setPause(null, "Paused until you turn it back on")}>Until I turn it back on</Chip>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
