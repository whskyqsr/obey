import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Place } from "../api/types";
import { useAskLocation, usePlaces } from "../api/hooks";
import { errorMessage } from "../api/client";
import { PlaceDialog } from "../components/PlaceMap";
import { Button, Empty, ErrorBox, Icon, IconButton, Loading, useSnackbar } from "../components/ui";
import { useRel } from "../lib/relationship";
import { useBack } from "../lib/useBack";
import { LocationReadiness } from "./LocationPage";

const fmtRadius = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m % 1000 ? 1 : 0)} km` : `${m} m`);

/** The dynamic's saved places, for location tasks. Everyone sees them; a Dominant adds and changes them. */
export function PlacesPage() {
  const { rel, isDom, me } = useRel();
  const navigate = useNavigate();
  const back = useBack(() => navigate({ to: "/dynamic" }));
  const places = usePlaces(rel.id);
  const [editing, setEditing] = useState<{ place: Place | null } | null>(null);
  const canEdit = isDom && rel.endedAt === null;
  const subs = rel.members.filter((m) => m.userId !== me.user.id && m.role !== "dominant");

  return (
    <div className="flex flex-col pb-10">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-1 bg-surface px-2 md:px-4">
        <IconButton icon="arrow_back" label="Back" onClick={back} />
        <h1 className="text-title-large text-on-surface">Places</h1>
      </header>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 md:px-6">
        {isDom && subs.map((m) => <LocationReadiness key={m.userId} member={m} />)}
        {places.isPending ? (
          <Loading />
        ) : places.error ? (
          <ErrorBox error={places.error} onRetry={() => places.refetch()} />
        ) : places.data.length === 0 ? (
          <Empty
            icon="location_on"
            title="No places yet"
            body={canEdit ? "Save the places tasks can ask for: the gym, work, home." : "Places a Dominant saves for location tasks show here."}
          />
        ) : (
          <ul className="overflow-hidden rounded-lg bg-surface-container-low">
            {places.data.map((p) => (
              <li key={p.id} className="border-t border-surface-container-highest first:border-t-0">
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setEditing({ place: p })}
                  className="state-layer flex w-full items-center gap-4 px-4 py-3 text-left disabled:cursor-default"
                >
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-primary-container text-on-primary-container">
                    <Icon name="location_on" filled />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-body-large text-on-surface">{p.name}</span>
                    <span className="block truncate text-body-medium text-on-surface-variant">{[p.address, fmtRadius(p.radiusM)].filter(Boolean).join(" · ")}</span>
                    <span className="block truncate text-body-medium text-on-surface-variant">
                      {p.taskTitles.length ? `Used by ${p.taskTitles.join(", ")}` : "Not used by any task"}
                    </span>
                  </span>
                  {canEdit && <Icon name="chevron_right" className="text-on-surface-variant" />}
                </button>
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <div>
            <Button variant="tonal" icon="add_location_alt" onClick={() => setEditing({ place: null })}>
              Add a place
            </Button>
          </div>
        )}
      </div>
      <PlaceDialog place={editing?.place ?? null} open={!!editing} onClose={() => setEditing(null)} />
    </div>
  );
}

/** For a Dominant: whether a sub's phone can check location tasks, and a nudge to set it up if not. */
export function AskLocationButton({ name }: { name: string }) {
  const { rel } = useRel();
  const snack = useSnackbar();
  const ask = useAskLocation(rel.id);
  return (
    <Button
      variant="tonal"
      icon="send"
      busy={ask.isPending}
      onClick={() => ask.mutate(undefined, { onSuccess: () => snack(`Asked ${name} to set up location`), onError: (e) => snack(errorMessage(e)) })}
    >
      Ask {name} to set it up
    </Button>
  );
}
