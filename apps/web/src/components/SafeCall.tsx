import { useState } from "react";
import { useCallSafeWord, useClearSafeCall, useSafeCalls } from "../api/hooks";
import type { SafeCall } from "../api/types";
import { fmtTime } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { Dialog, Icon, TextArea, cx, useSnackbar } from "./ui";

// Safe call keeps its own yellow and red (allowlisted in the design check): they have to read as yellow and red.
const YELLOW = "#D9A13B";
const LEVELS = [
  { level: "yellow", label: "Yellow", line: "Slow down and check in with me.", color: YELLOW },
  { level: "red", label: "Red", line: "Stop. Anything that slips while it's open is excused.", color: "var(--md-error)" },
] as const;

/** Calling yellow or red, with an optional note. Calling again while one is open changes its level. */
export function SafeWordSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const { rel, partners } = useRel();
  const call = useCallSafeWord(rel.id);
  const snack = useSnackbar();
  const [note, setNote] = useState("");
  const who = partners.map((p) => p.displayName).join(" and ") || "Your partner";
  const pick = (level: SafeCall["level"]) =>
    call.mutate(
      { level, note },
      {
        onSuccess: () => {
          setNote("");
          onClose();
          snack(`${who} has been told`);
        },
      },
    );
  return (
    <Dialog open={open} onClose={onClose} title={<span className="font-serif text-[40px] leading-tight">Safe call</span>}>
      <p className="-mt-2 mb-5 text-body-large">{who} is told straight away, even during quiet hours. Only you can clear it.</p>
      <div className="flex flex-col gap-3 pb-4">
        {LEVELS.map((l) => (
          <button
            key={l.level}
            type="button"
            disabled={call.isPending}
            onClick={() => pick(l.level)}
            style={{ borderColor: l.color }}
            className="state-layer flex items-center gap-4 rounded-md border bg-surface-container-lowest px-5 py-4 text-left disabled:opacity-60"
          >
            <span aria-hidden className="size-3.5 shrink-0 rounded-full" style={{ background: l.color }} />
            <span>
              <span className="block font-serif text-[26px] leading-tight text-on-surface">{l.label}</span>
              <span className="block text-body-large text-on-surface-variant">{l.line}</span>
            </span>
          </button>
        ))}
        <div className="mt-3">
          <TextArea label={`A note for ${who} (optional)`} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
    </Dialog>
  );
}

/** Shown to everyone in the dynamic while a safe call is open, as a band across the top; only whoever called it can clear it. */
export function SafeCallBanner() {
  const { rel, me, memberName, partners } = useRel();
  const calls = useSafeCalls(rel.id);
  const clear = useClearSafeCall(rel.id);
  const change = useCallSafeWord(rel.id);
  const c = calls.data?.active;
  if (!c) return null;
  const mine = c.callerId === me.user.id;
  const red = c.level === "red";
  const other = red ? "yellow" : "red";
  const told = partners.map((p) => p.displayName).join(" and ") || "Your partner";
  const caller = memberName(c.callerId);
  return (
    <div
      role="alert"
      style={red ? undefined : { background: YELLOW }}
      className={cx("flex flex-col gap-3 px-4 py-4 md:mx-6 md:mt-6 md:rounded-md md:px-6", red ? "bg-error text-on-error" : "text-[#2B2108]")}
    >
      <div className="flex items-start gap-3">
        <Icon name="front_hand" className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="text-title-medium font-semibold">
            {mine ? `${red ? "Red" : "Yellow"} · you called it at ${fmtTime(c.createdAt)}` : `${caller} called ${c.level} · ${fmtTime(c.createdAt)}`}
          </div>
          <div className="text-body-medium">
            {mine
              ? `${red ? "Everything is paused" : "Slow down and check in"}. ${told} ${partners.length > 1 ? "have" : "has"} been told.`
              : `${red ? "Stop" : "Slow down"} and check in. Only ${caller} can clear it.`}
          </div>
        </div>
      </div>
      {c.note && <p className="font-serif text-[22px] leading-snug italic">“{c.note}”</p>}
      {mine && (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={change.isPending}
            onClick={() => change.mutate({ level: other, note: "" })}
            className="state-layer h-11 rounded-sm border border-current text-label-large"
          >
            Change to {other}
          </button>
          <button
            type="button"
            disabled={clear.isPending}
            onClick={() => clear.mutate(c.id)}
            className={cx("state-layer h-11 rounded-sm bg-surface-container-lowest text-label-large", red ? "text-error" : "text-on-surface")}
          >
            I'm okay now
          </button>
        </div>
      )}
    </div>
  );
}
