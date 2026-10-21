import { useEffect, useState } from "react";
import type { Occurrence, Place } from "../api/types";
import { useArrive, usePlaces } from "../api/hooks";
import { errorMessage } from "../api/client";
import { useRel } from "../lib/relationship";
import { fmtTime } from "../lib/dates";
import { isOpen } from "./OccurrenceCard";
import { Button, Icon, cx, useSnackbar } from "./ui";

/** A location task: done by getting to a place (and staying, if it says so). */
export const isPlaced = (o: Pick<Occurrence, "placeId">) => o.placeId != null;

/** The relationship's places by id, for showing a task's place by name. */
export function usePlaceLookup(): (id: string | null | undefined) => Place | undefined {
  const { rel, features } = useRel();
  const places = usePlaces(rel.id, features.location);
  return (id) => (id ? places.data?.find((p) => p.id === id) : undefined);
}

/** Re-renders every minute, so a running stay counts up. */
function useMinuteClock(on: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

const minutesBetween = (from: string, to: number) => Math.max(0, Math.floor((to - new Date(from).getTime()) / 60_000));

/** "Be at Gym", "At Gym · 20 of 60 min", "Left Gym early · 35 of 60 min", "Got to Gym 5:42 PM". */
export function placeLine(o: Occurrence, place: Place | undefined, now = Date.now()) {
  const name = place?.name ?? "the place";
  if (o.leftAt && o.arrivedAt) return `Left ${name} early · ${minutesBetween(o.arrivedAt, new Date(o.leftAt).getTime())} of ${o.stayMinutes} min`;
  if (o.status === "pending" && o.arrivedAt && o.stayMinutes) return `At ${name} · ${Math.min(o.stayMinutes, minutesBetween(o.arrivedAt, now))} of ${o.stayMinutes} min`;
  if (o.arrivedAt && (o.status === "completed" || o.status === "submitted")) return `Got to ${name} ${fmtTime(o.arrivedAt)}`;
  if (o.status === "pending") return o.stayMinutes ? `Be at ${name} for ${o.stayMinutes} min` : `Be at ${name}`;
  return null;
}

/** "I'm here" from the browser: one location fix, which the server checks against the place. */
export function useCheckIn() {
  const { rel } = useRel();
  const snack = useSnackbar();
  const arrive = useArrive(rel.id);
  const [busy, setBusy] = useState(false);
  const checkIn = (o: Occurrence) => {
    if (!("geolocation" in navigator)) return snack("This browser can't share your location");
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        arrive.mutate(
          { id: o.id, lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: Math.round(pos.coords.accuracy) },
          {
            onSuccess: (res) =>
              snack(res.status === "pending" ? `Checked in. Stay for ${res.stayMinutes} min` : res.status === "submitted" ? "Checked in; sent for approval" : `Done: ${o.title}`),
            onError: (e) => snack(errorMessage(e)),
            onSettled: () => setBusy(false),
          },
        ),
      (err) => {
        setBusy(false);
        snack(err.code === err.PERMISSION_DENIED ? "Allow location for Fealty in your browser to check in" : "Couldn't find where you are; try again");
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  };
  return { checkIn, busy };
}

/** Whether the person can check in now: their own, still to do, open, and not there yet. */
export const canCheckIn = (o: Occurrence, mine: boolean) => mine && o.status === "pending" && !o.arrivedAt && isOpen(o) && new Date(o.dueAt).getTime() > Date.now();

/** A pin in a ring that fills as a stay runs. Tapping it checks in, when that's possible. */
export function PlaceRing({ o, onTap, disabled }: { o: Occurrence; onTap?(): void; disabled?: boolean }) {
  const place = usePlaceLookup()(o.placeId);
  const staying = o.status === "pending" && !!o.arrivedAt && !!o.stayMinutes;
  const now = useMinuteClock(staying);
  const left = !!o.leftAt;
  const r = 17;
  const c = 2 * Math.PI * r;
  const f = staying ? Math.min(1, minutesBetween(o.arrivedAt!, now) / o.stayMinutes!) : 0;
  return (
    <button
      type="button"
      aria-label={onTap ? `I'm at ${place?.name ?? "the place"} for “${o.title}”` : (placeLine(o, place, now) ?? o.title)}
      title={onTap ? "I'm here" : undefined}
      disabled={disabled || !onTap}
      data-action="done"
      onClick={onTap}
      className={cx("state-layer relative flex size-10 shrink-0 items-center justify-center rounded-full", left && "bg-error-container")}
    >
      <svg viewBox="0 0 40 40" className="absolute inset-0" aria-hidden>
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          strokeWidth={staying ? 3 : 2}
          className={staying ? "stroke-surface-container-highest" : left ? "stroke-transparent" : "stroke-outline"}
        />
        {staying && (
          <circle
            cx="20"
            cy="20"
            r={r}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${c * f} ${c}`}
            transform="rotate(-90 20 20)"
            className="stroke-primary"
          />
        )}
      </svg>
      <Icon
        name={left ? "wrong_location" : "location_on"}
        filled={staying}
        size={20}
        className={cx("relative", left ? "text-on-error-container" : staying ? "text-primary" : "text-on-surface-variant")}
      />
    </button>
  );
}

/** The wide-screen "I'm here" button beside a location task. */
export function CheckInButton({ o, className }: { o: Occurrence; className?: string }) {
  const { checkIn, busy } = useCheckIn();
  return (
    <Button variant="tonal" icon="where_to_vote" busy={busy} onClick={() => checkIn(o)} className={cx("h-8 px-4", className)}>
      I'm here
    </Button>
  );
}
