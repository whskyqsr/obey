import { useState, type ReactNode } from "react";
import { useAskCurfew, useChangePlanEnd, useConfirmMiss, useCurfew, useDecideCurfew, useDismissClashes, useExcuseCurfew, useHomeForCurfew, useLibrary } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { CurfewClash, CurfewNight, CurfewRequest } from "../api/types";
import { fmtDate, fmtTime, localDateOf } from "../lib/dates";
import { plusLabel, plusMinutes, timeAfter, toHHMM } from "../lib/curfewTimes";
import { useRel } from "../lib/relationship";
import { Button, Chip, Dialog, Icon, IconButton, TextField, cx, useSnackbar } from "./ui";

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

/** Who a sub asks: the Dominant's name, or "your Dominant" when there's more than one. */
export function useAskWho() {
  const { rel, me } = useRel();
  const doms = rel.members.filter((m) => m.userId !== me.user.id && m.role !== "submissive");
  return doms.length === 1 ? doms[0]!.displayName : "your Dominant";
}

/** Today's curfew strip, from an hour before curfew until it ends, asks for more time, and plans that run into one (for a Dominant). */
export function CurfewStrip() {
  const { rel, features, isDom } = useRel();
  const curfew = useCurfew(rel.id, features.location);
  if (!features.location || !curfew.data) return null;
  const { night, clashes, requests } = curfew.data;
  const asks = isDom ? requests : [];
  if (!night && !clashes.length && !asks.length) return null;
  return (
    <div className="flex flex-col gap-3 px-4 pb-4 md:px-6">
      {night && <Night night={night} request={requests.find((r) => r.occurrenceId === night.occurrenceId)} />}
      {asks.map((r) => (
        <Ask key={r.id} request={r} />
      ))}
      {clashes.map((c) => (
        <Clash key={c.occurrenceId} clash={c} />
      ))}
    </div>
  );
}

function Night({ night, request }: { night: CurfewNight; request?: CurfewRequest }) {
  const { rel, me, isDom, memberName, features } = useRel();
  const snack = useSnackbar();
  const home = useHomeForCurfew(rel.id);
  const excuse = useExcuseCurfew(rel.id);
  const confirm = useConfirmMiss(rel.id);
  const curfew = useCurfew(rel.id);
  const consequences = useLibrary(rel.id, "consequences", isDom && features.consequences);
  const askWho = useAskWho();
  const [asking, setAsking] = useState(false);
  const mine = night.assigneeId === me.user.id;
  const who = memberName(night.assigneeId);
  const due = fmtTime(night.dueAt);
  const until = fmtTime(night.endsAt);
  const started = Date.now() >= Date.parse(night.dueAt);
  const fail = (e: unknown) => snack(errorMessage(e));
  // Before curfew and not yet home, a sub can ask for more time once.
  const canAsk = mine && !started && !night.arrivedAt && night.status === "pending" && !request;
  const sheet = asking && <MoreTimeSheet night={night} onClose={() => setAsking(false)} />;
  const waiting = request && !started ? ` · asked ${mine ? askWho : "you"} for ${fmtTime(request.untilAt)}` : "";

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
  const more = canAsk && (
    <Button variant="tonal" icon="more_time" onClick={() => setAsking(true)}>
      More time
    </Button>
  );
  if (night.canTap && !started)
    return (
      <>
        <Strip
          tone="neutral"
          icon="bedtime"
          title={`Curfew at ${due}`}
          body={`Stay in until ${until}${waiting}`}
          actions={
            <div className="flex shrink-0 items-center gap-1">
              {canAsk && <IconButton icon="more_time" label="More time" onClick={() => setAsking(true)} />}
              <Button
                variant="tonal"
                icon="home"
                busy={home.isPending}
                onClick={() => home.mutate(night.occurrenceId, { onSuccess: () => snack("You're home for curfew"), onError: fail })}
              >
                I'm home
              </Button>
            </div>
          }
        />
        {sheet}
      </>
    );
  return (
    <>
      <Strip
        tone="soon"
        icon="directions_walk"
        title={started ? `Curfew started at ${due}` : `Curfew in ${Math.max(1, Math.round((Date.parse(night.dueAt) - Date.now()) / 60_000))} min`}
        body={waiting ? `Be home by ${due}${waiting}` : `Be home by ${due}, stay in until ${until}`}
        actions={more}
      />
      {sheet}
    </>
  );
}

/** Ready-made times plus "Pick a time"; [value] is an ISO instant. */
function TimeChoices({
  options,
  value,
  onChange,
  after,
  before,
}: {
  options: { label: string; at: string }[];
  value: string | null;
  onChange(at: string): void;
  /** Picked times land on the first such time after this. */
  after: string;
  before?: string;
}) {
  const [picking, setPicking] = useState(false);
  const custom = value && !options.some((o) => o.at === value);
  const valid = (at: string) => Date.parse(at) > Date.parse(after) && (!before || Date.parse(at) < Date.parse(before));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {options
          .filter((o) => valid(o.at))
          .map((o) => (
            <Chip
              key={o.at}
              selected={value === o.at && !picking}
              onClick={() => {
                setPicking(false);
                onChange(o.at);
              }}
            >
              {o.label}
            </Chip>
          ))}
        <Chip icon="schedule" selected={picking || !!custom} onClick={() => setPicking(true)}>
          Pick a time
        </Chip>
      </div>
      {(picking || custom) && (
        <TextField
          label="Time"
          type="time"
          value={value ? toHHMM(value) : ""}
          onChange={(e) => {
            if (!e.target.value) return;
            const at = timeAfter(after, e.target.value);
            if (valid(at)) onChange(at);
          }}
        />
      )}
    </div>
  );
}

function Summary({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-surface-container px-4 py-3">
      <Icon name={icon} filled className="text-primary" />
      <div>
        <div className="text-title-medium text-on-surface">{title}</div>
        <div className="text-body-medium">{body}</div>
      </div>
    </div>
  );
}

/** "More time tonight": a sub asks for a later home-by. */
function MoreTimeSheet({ night, onClose }: { night: CurfewNight; onClose(): void }) {
  const { rel } = useRel();
  const snack = useSnackbar();
  const ask = useAskCurfew(rel.id);
  const who = useAskWho();
  const options = [30, 60, 120].map((m) => ({ label: plusLabel(m), at: plusMinutes(night.dueAt, m) }));
  const [until, setUntil] = useState<string | null>(options[1]!.at);
  const [reason, setReason] = useState("");
  const due = fmtTime(night.dueAt);
  return (
    <Dialog
      open
      onClose={onClose}
      icon="more_time"
      title="More time tonight"
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            busy={ask.isPending}
            disabled={!until}
            onClick={() =>
              until &&
              ask.mutate(
                { occurrenceId: night.occurrenceId, until, reason: reason.trim() || null },
                {
                  onSuccess: () => {
                    onClose();
                    snack(`Asked ${who}`);
                  },
                  onError: (e) => snack(errorMessage(e)),
                },
              )
            }
          >
            Ask {who}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p>
          Curfew is {due}. Ask {who} to make it:
        </p>
        <TimeChoices options={options} value={until} onChange={setUntil} after={night.dueAt} before={night.endsAt} />
        {until && <Summary icon="home" title={`Home by ${fmtTime(until)} tonight`} body={`Still in until ${fmtTime(night.endsAt)}`} />}
        <TextField label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={280} />
        <p className="text-body-small">
          Only tonight. If {who} hasn't answered by {due}, curfew stays at {due}.
        </p>
      </div>
    </Dialog>
  );
}

/** "On Friday night", or "tonight" for the night under way or about to start. */
function nightLabel(dueAt: string) {
  const night = localDateOf(new Date(Date.parse(dueAt) - 12 * 3_600_000));
  const now = localDateOf(new Date(Date.now() - 6 * 3_600_000));
  return night === now ? "tonight" : `on ${fmtDate(night, { weekday: "long" })} night`;
}

/** A sub's ask, for a Dominant: approve, approve a different time, or decline. */
function Ask({ request }: { request: CurfewRequest }) {
  const { rel, memberName } = useRel();
  const snack = useSnackbar();
  const decide = useDecideCurfew(rel.id);
  const [changing, setChanging] = useState(false);
  const who = memberName(request.requestedBy);
  const done = (msg: string) => ({ onSuccess: () => snack(msg), onError: (e: unknown) => snack(errorMessage(e)) });
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-secondary-container px-4 py-4 text-on-secondary-container">
      <div className="text-title-medium">
        {who} asks to be home by {fmtTime(request.untilAt)} {nightLabel(request.fromDueAt)}
      </div>
      <div className="text-body-medium">
        Curfew {fmtTime(request.fromDueAt)} <Icon name="arrow_forward" size={16} className="align-[-3px]" /> {fmtTime(request.untilAt)}
        {request.eventTitle && ` · for ${request.eventTitle}`}
      </div>
      {request.reason && <div className="text-body-medium italic opacity-85">"{request.reason}"</div>}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button icon="check" busy={decide.isPending} onClick={() => decide.mutate({ id: request.id, approve: true }, done("Curfew moved"))}>
          Approve
        </Button>
        <Button variant="outlined" onClick={() => setChanging(true)}>
          Change
        </Button>
        <Button variant="text" onClick={() => decide.mutate({ id: request.id, approve: false }, done("Declined"))}>
          Decline
        </Button>
      </div>
      {changing && <ChangeSheet request={request} onClose={() => setChanging(false)} />}
    </div>
  );
}

/** Approving a different time than asked: half-hour steps up to it, or any time in between. */
function ChangeSheet({ request, onClose }: { request: CurfewRequest; onClose(): void }) {
  const { rel, memberName } = useRel();
  const snack = useSnackbar();
  const decide = useDecideCurfew(rel.id);
  const steps: { label: string; at: string }[] = [];
  for (let m = 30; Date.parse(plusMinutes(request.fromDueAt, m)) < Date.parse(request.untilAt) && steps.length < 3; m += 30) {
    const at = plusMinutes(request.fromDueAt, m);
    steps.push({ label: fmtTime(at), at });
  }
  const options = [...steps, { label: `${fmtTime(request.untilAt)} · asked`, at: request.untilAt }];
  const [until, setUntil] = useState<string | null>(options[0]!.at);
  return (
    <Dialog
      open
      onClose={onClose}
      icon="bedtime"
      title={`Home by, ${nightLabel(request.fromDueAt)}`}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            busy={decide.isPending}
            disabled={!until}
            onClick={() =>
              until &&
              decide.mutate(
                { id: request.id, approve: true, until },
                {
                  onSuccess: () => {
                    onClose();
                    snack("Curfew moved");
                  },
                  onError: (e) => snack(errorMessage(e)),
                },
              )
            }
          >
            Approve {until ? fmtTime(until) : ""}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TimeChoices options={options} value={until} onChange={setUntil} after={request.fromDueAt} />
        {until && <Summary icon="home" title={`Home by ${fmtTime(until)}`} body={`${memberName(request.requestedBy)} asked for ${fmtTime(request.untilAt)}`} />}
      </div>
    </Dialog>
  );
}

function Clash({ clash }: { clash: CurfewClash }) {
  const { rel } = useRel();
  const snack = useSnackbar();
  const excuse = useExcuseCurfew(rel.id);
  const dismiss = useDismissClashes(rel.id);
  const [moving, setMoving] = useState(false);
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
            Excuse that night
          </Button>
          <Button variant="outlined" onClick={() => setMoving(true)}>
            Change the end
          </Button>
          <Button
            variant="text"
            onClick={() => dismiss.mutate({ id: clash.eventId, occurrenceIds: [clash.occurrenceId] }, { onSuccess: () => snack("Curfew stays that night"), onError: fail })}
          >
            Leave it
          </Button>
        </div>
      </div>
      {moving && <PlanEndSheet clash={clash} onClose={() => setMoving(false)} />}
    </div>
  );
}

/** A Dominant moving when a plan ends, to curfew or earlier; its author is told. */
function PlanEndSheet({ clash, onClose }: { clash: CurfewClash; onClose(): void }) {
  const { rel } = useRel();
  const snack = useSnackbar();
  const change = useChangePlanEnd(rel.id);
  const options = [
    { label: `At curfew · ${fmtTime(clash.dueAt)}`, at: clash.dueAt },
    { label: fmtTime(plusMinutes(clash.dueAt, -30)), at: plusMinutes(clash.dueAt, -30) },
  ];
  const [endsAt, setEndsAt] = useState<string | null>(clash.dueAt);
  const day = fmtDate(localDateOf(new Date(clash.eventStartsAt)));
  return (
    <Dialog
      open
      onClose={onClose}
      icon="event"
      title={`When does ${clash.eventTitle} end?`}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            busy={change.isPending}
            disabled={!endsAt}
            onClick={() =>
              endsAt &&
              change.mutate(
                { id: clash.eventId, endsAt },
                {
                  onSuccess: () => {
                    onClose();
                    snack("Plan changed");
                  },
                  onError: (e) => snack(errorMessage(e)),
                },
              )
            }
          >
            Change end
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TimeChoices options={options} value={endsAt} onChange={setEndsAt} after={clash.eventStartsAt} before={clash.eventEndsAt} />
        {endsAt && <Summary icon="event" title={`${day}, ${fmtTime(clash.eventStartsAt)} – ${fmtTime(endsAt)}`} body={`Was until ${fmtTime(clash.eventEndsAt)}`} />}
        <p className="text-body-small">They're told the plan now ends at {endsAt ? fmtTime(endsAt) : "the new time"}.</p>
      </div>
    </Dialog>
  );
}
