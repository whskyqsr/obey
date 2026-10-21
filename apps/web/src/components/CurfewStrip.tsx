import type { ReactNode } from "react";
import { useConfirmMiss, useCurfew, useDismissClashes, useExcuseCurfew, useHomeForCurfew, useLibrary } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { CurfewClash, CurfewNight } from "../api/types";
import { fmtDate, fmtTime, localDateOf } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { Button, Icon, IconButton, cx, useSnackbar } from "./ui";

type Tone = "neutral" | "soon" | "home" | "broken";

const TONE: Record<Tone, { box: string; badge: string }> = {
  neutral: { box: "bg-surface-container-high text-on-surface", badge: "text-on-surface" },
  soon: { box: "bg-tertiary-container text-on-tertiary-container", badge: "bg-tertiary text-on-tertiary" },
  home: { box: "bg-surface-container-high text-on-surface", badge: "bg-primary text-on-primary" },
  broken: { box: "bg-error-container text-on-error-container", badge: "bg-error text-on-error" },
};

function Strip({ tone, icon, title, body, actions }: { tone: Tone; icon: string; title: string; body: string; actions?: ReactNode }) {
  const t = TONE[tone];
  return (
    <div className={cx("flex items-center gap-4 rounded-xl px-4 py-3", t.box)}>
      <span className={cx("flex size-12 shrink-0 items-center justify-center rounded-full", t.badge)}>
        <Icon name={icon} filled={tone !== "neutral"} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-title-medium">{title}</div>
        <div className="text-body-medium opacity-80">{body}</div>
      </div>
      {actions}
    </div>
  );
}

/** Today's curfew strip, from an hour before curfew until it ends, and plans that run into one (for a Dominant). */
export function CurfewStrip() {
  const { rel, features } = useRel();
  const curfew = useCurfew(rel.id, features.location);
  if (!features.location || !curfew.data) return null;
  const { night, clashes } = curfew.data;
  if (!night && !clashes.length) return null;
  return (
    <div className="flex flex-col gap-3 px-4 pb-4 md:px-6">
      {night && <Night night={night} />}
      {clashes.map((c) => (
        <Clash key={c.occurrenceId} clash={c} />
      ))}
    </div>
  );
}

function Night({ night }: { night: CurfewNight }) {
  const { rel, me, isDom, memberName, features } = useRel();
  const snack = useSnackbar();
  const home = useHomeForCurfew(rel.id);
  const excuse = useExcuseCurfew(rel.id);
  const confirm = useConfirmMiss(rel.id);
  const curfew = useCurfew(rel.id);
  const consequences = useLibrary(rel.id, "consequences", isDom && features.consequences);
  const mine = night.assigneeId === me.user.id;
  const who = memberName(night.assigneeId);
  const due = fmtTime(night.dueAt);
  const until = fmtTime(night.endsAt);
  const started = Date.now() >= Date.parse(night.dueAt);
  const fail = (e: unknown) => snack(errorMessage(e));

  if (night.status === "missed") {
    const why = night.leftAt ? `Left home at ${fmtTime(night.leftAt)}` : `Not home by ${due}`;
    const s = curfew.data?.settings;
    const cost = [
      features.points && s?.missPenalty ? `−${s.missPenalty} pts` : null,
      features.consequences && s?.consequenceId ? consequences.data?.find((c) => c.id === s.consequenceId)?.title : null,
    ].filter(Boolean);
    return (
      <Strip
        tone="broken"
        icon="wrong_location"
        title={mine ? "You broke curfew" : `${who} broke curfew`}
        body={[why, cost.join(", ")].filter(Boolean).join(" · ")}
        actions={
          isDom &&
          !mine && (
            <div className="flex shrink-0">
              <IconButton
                icon="event_available"
                label="Excuse this night"
                onClick={() => excuse.mutate(night.occurrenceId, { onSuccess: () => snack("Excused"), onError: fail })}
              />
              <IconButton icon="check" label="Leave it missed" onClick={() => confirm.mutate(night.occurrenceId, { onSuccess: () => snack("Left as missed"), onError: fail })} />
            </div>
          )
        }
      />
    );
  }
  if (night.arrivedAt)
    return (
      <Strip
        tone="home"
        icon="home"
        title={mine ? "Home for curfew" : `${who} is home for curfew`}
        body={`Since ${fmtTime(night.arrivedAt)} · ${mine ? "stay" : "in"} until ${until}`}
      />
    );
  if (!mine) return <Strip tone="neutral" icon="bedtime" title={started ? `Curfew started at ${due}` : `Curfew at ${due}`} body={`${who} isn't home yet · in until ${until}`} />;
  if (night.canTap && !started)
    return (
      <Strip
        tone="neutral"
        icon="bedtime"
        title={`Curfew at ${due}`}
        body={`Stay in until ${until}`}
        actions={
          <Button
            variant="tonal"
            icon="home"
            busy={home.isPending}
            onClick={() => home.mutate(night.occurrenceId, { onSuccess: () => snack("You're home for curfew"), onError: fail })}
          >
            I'm home
          </Button>
        }
      />
    );
  return (
    <Strip
      tone="soon"
      icon="directions_walk"
      title={started ? `Curfew started at ${due}` : `Curfew in ${Math.max(1, Math.round((Date.parse(night.dueAt) - Date.now()) / 60_000))} min`}
      body={`Be home by ${due}, stay in until ${until}`}
    />
  );
}

function Clash({ clash }: { clash: CurfewClash }) {
  const { rel } = useRel();
  const snack = useSnackbar();
  const excuse = useExcuseCurfew(rel.id);
  const dismiss = useDismissClashes(rel.id);
  const fail = (e: unknown) => snack(errorMessage(e));
  const when = `${fmtDate(localDateOf(new Date(clash.eventStartsAt)))}, ${fmtTime(clash.eventStartsAt)} – ${fmtTime(clash.eventEndsAt)}`;
  return (
    <div className="flex gap-4 rounded-xl bg-error-container/50 px-4 py-3 text-on-surface">
      <Icon name="event_busy" className="mt-0.5 text-on-surface-variant" />
      <div className="min-w-0 flex-1">
        <div className="text-title-medium">{clash.eventTitle}</div>
        <div className="text-body-medium text-on-surface-variant">
          {when} · runs past curfew ({fmtTime(clash.dueAt)})
        </div>
        <div className="mt-3 flex flex-wrap gap-x-1 gap-y-2">
          <Button busy={excuse.isPending} onClick={() => excuse.mutate(clash.occurrenceId, { onSuccess: () => snack("Curfew excused that night"), onError: fail })}>
            Excuse curfew that night
          </Button>
          <Button
            variant="text"
            onClick={() => dismiss.mutate({ id: clash.eventId, occurrenceIds: [clash.occurrenceId] }, { onSuccess: () => snack("Curfew stays that night"), onError: fail })}
          >
            Leave it
          </Button>
        </div>
      </div>
    </div>
  );
}
