import { useState } from "react";
import { useAcceptRoleSwap, useAskRoleSwap, useEndRoleSwap } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Member, Relationship, RoleSwap } from "../api/types";
import { ROLE_LABEL, useReadOnly, useRel } from "../lib/relationship";
import { Avatar } from "./Avatar";
import { Button, Chip, Dialog, Icon, Switch, TextField, useSnackbar } from "./ui";

/** "Sun, Oct 26 at 8:00 PM" */
export function fmtSwapEnd(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} at ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

/** "Sun 8:00 PM" for the banner. */
const shortEnd = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { weekday: "short" })} ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
};

/** Who the signed-in person would swap with: the one member in the opposite role. Switches already do both. */
export function swapPartner(rel: Relationship, myId: string): Member | undefined {
  const self = rel.members.find((m) => m.userId === myId);
  if (!self || self.role === "switch") return undefined;
  const want = self.role === "dominant" ? "submissive" : "dominant";
  const others = rel.members.filter((m) => m.role === want);
  return others.length === 1 ? others[0] : undefined;
}

/** The coming Sunday at 8 PM, as a datetime-local value. */
function defaultEnd() {
  const d = new Date();
  d.setDate(d.getDate() + (7 - d.getDay() || 7));
  d.setHours(20, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Becomes({ m, label, to }: { m: Member; label: string; to: "dominant" | "submissive" }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-surface-container-highest px-4 py-3">
      <Avatar userId={m.userId} name={m.displayName} version={m.avatarVersion} />
      <div className="min-w-0 flex-1">
        <div className="text-body-large text-on-surface">{label}</div>
        <div className="flex items-center gap-1 text-body-medium">
          <span className="line-through">{ROLE_LABEL[m.role]}</span>
          <Icon name="arrow_forward" size={16} />
          <span className="font-medium text-on-surface">{ROLE_LABEL[to]}</span>
        </div>
      </div>
    </div>
  );
}

/** Asking to swap: who becomes what, for how long, and whether the submissive's tasks pause. */
export function SwapDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const { rel, me, self } = useRel();
  const partner = swapPartner(rel, me.user.id);
  const ask = useAskRoleSwap(rel.id);
  const snack = useSnackbar();
  const [timed, setTimed] = useState(true);
  const [end, setEnd] = useState(defaultEnd);
  const [pause, setPause] = useState(true);
  if (!partner || !self || self.role === "switch") return null;
  const sub = self.role === "submissive" ? self : partner;
  const subName = sub.userId === me.user.id ? "your" : `${partner.displayName}'s`;
  const endsAt = timed && end ? new Date(end) : null;
  const valid = !timed || (endsAt !== null && endsAt.getTime() > Date.now());
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Swap roles with ${partner.displayName}`}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            busy={ask.isPending}
            onClick={() =>
              ask.mutate(
                { endsAt: endsAt?.toISOString() ?? null, pauseTasks: pause },
                { onSuccess: () => (onClose(), snack(`Asked ${partner.displayName}`)), onError: (e) => snack(errorMessage(e)) },
              )
            }
          >
            Ask {partner.displayName}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Becomes m={self} label={`${self.displayName} (you)`} to={self.role === "dominant" ? "submissive" : "dominant"} />
          <Becomes m={partner} label={partner.displayName} to={partner.role === "dominant" ? "submissive" : "dominant"} />
        </div>
        <div>
          <div className="mb-2 text-title-small text-on-surface">For how long</div>
          <div className="flex flex-wrap gap-2">
            <Chip selected={timed} onClick={() => setTimed(true)}>
              Until a set time
            </Chip>
            <Chip selected={!timed} onClick={() => setTimed(false)}>
              Until we swap back
            </Chip>
          </div>
        </div>
        {timed && <TextField type="datetime-local" label="Swap back on" value={end} onChange={(e) => setEnd(e.target.value)} />}
        <Switch
          checked={pause}
          onChange={setPause}
          label={`Pause ${subName} tasks meanwhile`}
          help={timed ? "They pick up again when you swap back" : "They pick up again when either of you swaps back"}
        />
        <p className="text-body-small">{partner.displayName} has to accept first. Points, rules and history stay as they are, and either of you can end the swap at any time.</p>
      </div>
    </Dialog>
  );
}

/** Ending a swap early, or taking back or declining a request. */
export function EndSwapDialog({ open, onClose, swap }: { open: boolean; onClose(): void; swap: RoleSwap }) {
  const { rel, me, memberName } = useRel();
  const end = useEndRoleSwap(rel.id);
  const snack = useSnackbar();
  const other = swap.requestedBy === me.user.id ? swap.partnerId : swap.requestedBy;
  const active = swap.status === "active";
  // While it's on, roles are swapped: whoever is the submissive now goes back to being the Dominant.
  const iGoBack = rel.members.find((m) => m.userId === me.user.id)?.role === "submissive";
  const back = iGoBack
    ? `You go back to being the Dominant and ${memberName(other)} the Submissive.`
    : `${memberName(other)} goes back to being the Dominant and you the Submissive.`;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      sheetOnMobile={false}
      title={active ? "End the swap now?" : "Take back your request?"}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            {active ? "Keep it" : "Keep asking"}
          </Button>
          <Button
            variant="text"
            busy={end.isPending}
            onClick={() =>
              end.mutate(undefined, { onSuccess: () => (onClose(), snack(active ? "Your roles are back" : "Request taken back")), onError: (e) => snack(errorMessage(e)) })
            }
          >
            {active ? "End swap" : "Take back"}
          </Button>
        </>
      }
    >
      {active ? `${back}${swap.pauseTasks ? " Paused tasks pick up again." : ""} ${memberName(other)} gets a notification.` : `${memberName(other)} won't be asked any more.`}
    </Dialog>
  );
}

/**
 * On Today: a request to answer, a request you're waiting on, or the swap under way with the way out. Shown to the two
 * people in it.
 */
export function RoleSwapCard() {
  const { rel, me, memberName } = useRel();
  const readOnly = useReadOnly();
  const accept = useAcceptRoleSwap(rel.id);
  const decline = useEndRoleSwap(rel.id);
  const snack = useSnackbar();
  const [ending, setEnding] = useState(false);
  const swap = rel.roleSwap;
  if (!swap || readOnly || (swap.requestedBy !== me.user.id && swap.partnerId !== me.user.id)) return null;
  const other = swap.requestedBy === me.user.id ? swap.partnerId : swap.requestedBy;
  const mine = rel.members.find((m) => m.userId === me.user.id);
  const otherIsDom = rel.members.find((m) => m.userId === other)?.role === "dominant";

  if (swap.status === "pending" && swap.partnerId === me.user.id) {
    const willBe = mine?.role === "dominant" ? "the Submissive" : "the Dominant";
    const pausesMine = swap.pauseTasks && mine?.role === "submissive";
    return (
      <div className="px-4 pb-4 md:px-6">
        <div className="flex flex-col gap-2 rounded-xl bg-secondary-container px-4 py-4 text-on-secondary-container">
          <div className="text-title-medium">{memberName(other)} asked to swap roles</div>
          <p className="text-body-medium">
            You'd be {willBe} {swap.endsAt ? `until ${fmtSwapEnd(swap.endsAt)}` : "until one of you swaps back"}.
            {pausesMine ? " Your tasks pause until then." : swap.pauseTasks ? ` ${memberName(other)}'s tasks pause until then.` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button busy={accept.isPending} onClick={() => accept.mutate(undefined, { onSuccess: () => snack("Your roles are swapped"), onError: (e) => snack(errorMessage(e)) })}>
              Accept
            </Button>
            <Button
              variant="text"
              className="text-on-secondary-container"
              busy={decline.isPending}
              onClick={() => decline.mutate(undefined, { onError: (e) => snack(errorMessage(e)) })}
            >
              Decline
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const line =
    swap.status === "pending"
      ? `Waiting for ${memberName(other)} to accept your role swap`
      : swap.endsAt
        ? `Roles swapped until ${shortEnd(swap.endsAt)}`
        : "Roles swapped until you swap back";
  const sub =
    swap.status === "pending"
      ? swap.endsAt
        ? `Until ${fmtSwapEnd(swap.endsAt)}`
        : "Until one of you swaps back"
      : [
          otherIsDom ? `${memberName(other)} is the Dominant for now` : "You're the Dominant for now",
          swap.pauseTasks ? (mine?.role === "dominant" ? "your own tasks are paused" : `${memberName(other)}'s tasks are paused`) : null,
        ]
          .filter(Boolean)
          .join(" · ");
  return (
    <div className="px-4 pb-4 md:px-6">
      <div className="flex items-center gap-3 rounded-xl bg-tertiary-container px-4 py-3 text-on-tertiary-container">
        <Icon name="swap_horiz" className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-title-small">{line}</div>
          <div className="text-body-small opacity-85">{sub}</div>
        </div>
        <Button variant="text" className="shrink-0 text-on-tertiary-container" onClick={() => setEnding(true)}>
          {swap.status === "pending" ? "Take back" : "End"}
        </Button>
      </div>
      <EndSwapDialog open={ending} onClose={() => setEnding(false)} swap={swap} />
    </div>
  );
}
