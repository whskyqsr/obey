import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { SoloSetup } from "@obey/contracts";
import { useMenu } from "../lib/menu";
import { useRel } from "../lib/relationship";
import { storage } from "../lib/storage";
import { Button } from "./ui";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "3 tasks, 4 rules and 2 rewards": what was set up, leaving out what wasn't. */
export function setupList(s: SoloSetup) {
  const parts = [
    s.tasks && plural(s.tasks, "task"),
    s.rules && plural(s.rules, "rule"),
    s.rewards && plural(s.rewards, "reward"),
    s.consequences && plural(s.consequences, "consequence"),
  ].filter((p): p is string => !!p);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : (parts[0] ?? "");
}

const total = (s: SoloSetup) => s.tasks + s.rules + s.rewards + s.consequences;

function useDismissed(key: string) {
  const [gone, setGone] = useState(() => storage.get(key) === "1");
  return [gone, () => (storage.set(key, "1"), setGone(true))] as const;
}

function TodayCard({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="px-4 pb-4 md:px-6">
      <div className="flex flex-col gap-2 rounded-xl bg-secondary-container px-4 py-4 text-on-secondary-container">
        <div className="text-title-medium">{title}</div>
        <p className="text-body-medium">{body}</p>
        <div className="mt-2 flex flex-wrap gap-2">{children}</div>
      </div>
    </div>
  );
}

/**
 * Today's cards around solo mode: a nudge to invite someone while you're on your own, and once a Dominant joins
 * someone who set things up alone, one card each saying who manages it all now.
 */
export function SoloCards() {
  const { rel, me, solo, memberName } = useRel();
  const menu = useMenu();
  const navigate = useNavigate();
  const [inviteGone, hideInvite] = useDismissed(`obey.soloInvite.${rel.id}`);
  const [setupGone, hideSetup] = useDismissed(`obey.soloSetup.${rel.id}`);

  if (solo) {
    if (inviteGone || !menu?.invite) return null;
    return (
      <TodayCard
        title="You're using Fealty on your own"
        body="Set your own tasks, rules and rewards. Invite a partner whenever you're ready, and everything you've set up comes with you."
      >
        <Button onClick={menu.invite}>Invite a partner</Button>
        <Button variant="text" className="text-on-secondary-container" onClick={hideInvite}>
          Not now
        </Button>
      </TodayCard>
    );
  }

  const s = rel.soloSetup;
  const setter = s && rel.members.find((m) => m.userId === s.setById);
  const joiner = s && rel.members.find((m) => m.userId === s.joinerId);
  if (!s || setupGone || setter?.role !== "submissive" || !joiner || joiner.role === "submissive") return null;
  const got = (
    <Button variant="text" className="text-on-secondary-container" onClick={hideSetup}>
      Got it
    </Button>
  );
  if (me.user.id === joiner.userId) {
    const one = total(s) === 1;
    return (
      <TodayCard
        title={`${setter.displayName} set things up on their own`}
        body={`${setupList(s)}. ${one ? "It's yours to manage now: keep it, change it or clear it out." : "They're yours to manage now: keep them, change them or clear them out."}`}
      >
        <Button
          onClick={() => {
            hideSetup();
            navigate({ to: "/tasks" });
          }}
        >
          Look through them
        </Button>
        {got}
      </TodayCard>
    );
  }
  const name = memberName(joiner.userId);
  return (
    <TodayCard
      title={`${name} joined as your ${joiner.role === "switch" ? "Switch" : "Dominant"}`}
      body={`${name} now sets your tasks, rules and rewards. Everything you set up stays as it was until ${name} changes it.`}
    >
      {got}
    </TodayCard>
  );
}
