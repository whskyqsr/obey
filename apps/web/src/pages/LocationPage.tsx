import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Member, Place } from "../api/types";
import { useCurfew, useOccurrences, usePauseLocation, usePlaces } from "../api/hooks";
import { errorMessage } from "../api/client";
import { usePlaceLookup } from "../components/Location";
import { PlaceDialog, PlacesMap, fmtRadius } from "../components/PlaceMap";
import { Icon, IconButton, OverflowMenu, PageHeader, useSnackbar } from "../components/ui";
import { fmtDateTime, fmtTime, today } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { AskLocationButton } from "./Places";
import { fmtClock } from "./Curfew";

/** For a Dominant: whether this person's phone can check location tasks, with a nudge to set it up if not. */
export function LocationReadiness({ member }: { member: Member }) {
  const name = member.displayName;
  const line = member.locationPaused
    ? `${name} paused location ${member.locationPausedUntil ? `until ${fmtDateTime(member.locationPausedUntil)}` : "until they turn it back on"}. Location tasks due meanwhile are excused.`
    : member.locationStatus === "ready"
      ? null
      : member.locationStatus === "foreground_only"
        ? `${name}'s phone only lets Fealty see location while it's open.`
        : member.locationStatus === "denied" || member.locationStatus === "services_off"
          ? `Location is turned off for Fealty on ${name}'s phone.`
          : `${name} hasn't set up location yet. It needs the Fealty Android app, with location allowed all the time.`;
  if (!line) return null;
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-body-large text-on-surface">{line}</p>
      {!member.locationPaused && <AskLocationButton name={name} />}
    </div>
  );
}

const stay = (m: number) => (m >= 60 && m % 60 === 0 ? `${m / 60} hr` : `${m} min`);
const placeIcon = (name: string) =>
  /home/i.test(name)
    ? "home"
    : /gym|fitness/i.test(name)
      ? "fitness_center"
      : /work|office/i.test(name)
        ? "work"
        : /school|class/i.test(name)
          ? "school"
          : "location_on";

/** "Sun–Thu" with a weekend time, else "Every night". */
const nights = (weekend: string | null) => (weekend ? "Sun–Thu" : "Every night");

/**
 * Mockup 22: whether sharing is on, the places on a map, curfew, and the places on hairlines. Pausing sits behind the
 * pause icon. Below, what's watched today.
 */
export function LocationPage() {
  const { rel, me, self, isDom, solo, memberName } = useRel();
  const navigate = useNavigate();
  const snack = useSnackbar();
  const pause = usePauseLocation(rel.id);
  const places = usePlaces(rel.id);
  const placeOf = usePlaceLookup();
  const day = today();
  const occurrences = useOccurrences(rel.id, day, day);
  const [editing, setEditing] = useState<{ place: Place | null } | null>(null);
  const placeTasks = (occurrences.data ?? []).filter((o) => o.placeId && o.status === "pending");
  const watching = placeTasks.filter((o) => o.assigneeId === me.user.id);
  const others = rel.members.filter((m) => m.userId !== me.user.id);
  const who = others.map((m) => memberName(m.userId)).join(" and ") || "Your partner";
  const ready = self?.locationStatus === "ready";
  const curfew = useCurfew(rel.id);
  const c = curfew.data?.settings?.enabled ? curfew.data.settings : null;
  const onCurfew = !!c && c.assigneeId === me.user.id;
  const ended = rel.endedAt !== null;
  const canEdit = isDom && !ended;
  // A sub (or switch, or someone on their own) carries the phone that checks in; a Dominant only does if a task or curfew names them.
  const watched = !ended && (solo || self?.role !== "dominant" || watching.length > 0 || onCurfew);
  const watchedOthers = others.filter((m) => m.role !== "dominant");
  const endOfDay = () => {
    const d = new Date();
    d.setHours(23, 59, 0, 0);
    return d.toISOString();
  };
  const setPause = (until: string | null | false, msg: string) => pause.mutate(until, { onSuccess: () => snack(msg), onError: (e) => snack(errorMessage(e)) });
  const paused = !!self?.locationPaused;

  const status = !watched
    ? watchedOthers.length
      ? `You see arrivals and curfew, never where ${watchedOthers.length === 1 ? watchedOthers[0]!.displayName : "they"} ${watchedOthers.length === 1 ? "is" : "are"}.`
      : undefined
    : paused
      ? `Paused ${self!.locationPausedUntil ? `until ${fmtDateTime(self!.locationPausedUntil)}` : "until you turn it back on"}. Location tasks due meanwhile are excused.`
      : ready
        ? `Sharing is on.${solo ? "" : ` ${who} never sees where you are, only arrivals and curfew.`}`
        : "Not set up on this device. Location tasks check in from the Fealty Android app; here you tap I'm here when you arrive.";

  const pauseTool = watched ? (
    paused ? (
      <IconButton icon="play_arrow" label="Turn location back on" onClick={() => setPause(false, "Location is back on")} />
    ) : (
      <OverflowMenu
        icon="pause"
        label="Pause location"
        items={[
          { label: "Pause for an hour", icon: "schedule", onClick: () => setPause(new Date(Date.now() + 3_600_000).toISOString(), "Paused for an hour") },
          { label: "Pause for the rest of today", icon: "today", onClick: () => setPause(endOfDay(), "Paused for the rest of today") },
          { label: "Pause until I turn it back on", icon: "pause", onClick: () => setPause(null, "Paused until you turn it back on") },
        ]}
      />
    )
  ) : undefined;

  const list = places.data ?? [];
  const today_ = watched ? watching : placeTasks.filter((o) => o.assigneeId !== me.user.id);

  return (
    <>
      <PageHeader title="Location" subtitle={status} tools={pauseTool} />
      <div className="flex max-w-3xl flex-col gap-10 px-4 pb-16 md:px-6">
        {!watched && watchedOthers.map((m) => <LocationReadiness key={m.userId} member={m} />)}
        {watched && paused && onCurfew && <p className="-mt-6 text-body-large text-on-surface-variant">Curfew still counts: tap I'm home on Today instead.</p>}

        {list.length > 0 && <PlacesMap places={list} className="h-64 rounded-lg border border-outline-variant md:h-80" />}

        {(c || canEdit) && (
          <section>
            <h2 className="eyebrow">Curfew</h2>
            <button
              type="button"
              onClick={() => navigate({ to: "/curfew" })}
              className="state-layer mt-2 flex w-full items-center gap-4 border-b border-outline-variant py-4 text-left"
            >
              {c ? (
                <span className="min-w-0 flex-1">
                  <span className="block text-body-large text-on-surface">
                    {fmtClock(c.time)} until {fmtClock(c.until)}
                  </span>
                  <span className="block text-body-medium text-on-surface-variant">
                    {[
                      nights(c.weekendTime),
                      c.weekendTime ? `Fri–Sat ${fmtClock(c.weekendTime)}` : null,
                      `at ${placeOf(c.placeId)?.name ?? "Home"}`,
                      others.length > 1 || isDom ? memberName(c.assigneeId) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              ) : (
                <span className="min-w-0 flex-1 text-body-large text-on-surface-variant">Off</span>
              )}
              <Icon name="chevron_right" className="text-on-surface-variant" />
            </button>
          </section>
        )}

        <section>
          <h2 className="eyebrow">Places</h2>
          <div className="mt-2 flex flex-col divide-y divide-outline-variant border-b border-outline-variant">
            {list.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={!canEdit}
                onClick={() => setEditing({ place: p })}
                className="state-layer flex w-full items-center gap-5 py-4 text-left disabled:cursor-default"
              >
                <Icon name={placeIcon(p.name)} className="text-on-surface" />
                <span className="min-w-0 flex-1">
                  <span className="block text-body-large text-on-surface">{p.name}</span>
                  <span className="block truncate text-body-medium text-on-surface-variant">
                    {p.taskTitles.length ? `Used by ${p.taskTitles.join(", ")}` : `${fmtRadius(p.radiusM)} around`}
                  </span>
                </span>
              </button>
            ))}
            {list.length === 0 && !canEdit && <p className="py-4 text-body-large text-on-surface-variant">No places yet.</p>}
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditing({ place: null })}
                className="state-layer flex w-full items-center gap-5 py-4 text-left text-primary"
              >
                <Icon name="add" />
                <span className="text-body-large">Add a place</span>
              </button>
            )}
          </div>
        </section>

        {(watched || watchedOthers.length > 0) && (
          <section>
            <h2 className="eyebrow">Watching today</h2>
            <div className="mt-2 flex flex-col divide-y divide-outline-variant border-b border-outline-variant">
              {today_.length === 0 && <p className="py-4 text-body-large text-on-surface-variant">No location tasks left today.</p>}
              {today_.map((o) => (
                <div key={o.id} className="py-4">
                  <div className="text-body-large text-on-surface">{placeOf(o.placeId)?.name ?? "A place"}</div>
                  <div className="text-body-medium text-on-surface-variant">
                    {o.title} · by {fmtTime(o.dueAt)}
                    {o.stayMinutes ? `, stay ${stay(o.stayMinutes)}` : ""}
                    {!watched && watchedOthers.length > 1 && ` · ${memberName(o.assigneeId)}`}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
      <PlaceDialog place={editing?.place ?? null} open={!!editing} onClose={() => setEditing(null)} />
    </>
  );
}
