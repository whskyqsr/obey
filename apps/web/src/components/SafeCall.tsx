import { useState } from "react";
import { useCallSafeWord, useClearSafeCall, useSafeCalls } from "../api/hooks";
import type { SafeCall } from "../api/types";
import { fmtTime } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { Dialog, Icon, TextArea, cx, useSnackbar } from "./ui";

const LEVELS = [
  { level: "yellow", label: "Yellow", line: "Slow down and check in with me", tone: "bg-[#F6D57A] text-[#3A2E00]", icon: "pan_tool" },
  { level: "red", label: "Red", line: "Stop. Tasks that slip are excused until it's cleared", tone: "bg-error text-on-error", icon: "front_hand" },
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
    <Dialog open={open} onClose={onClose} title="Use your safe word">
      <p className="-mt-2 mb-5">{who} is told straight away, even during quiet hours.</p>
      <div className="flex flex-col gap-3">
        {LEVELS.map((l) => (
          <button
            key={l.level}
            type="button"
            disabled={call.isPending}
            onClick={() => pick(l.level)}
            className={cx("state-layer flex items-center gap-4 rounded-[20px] px-5 py-4 text-left disabled:opacity-60", l.tone)}
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/35">
              <Icon name={l.icon} filled />
            </span>
            <span>
              <span className="block text-title-large">{l.label}</span>
              <span className="block text-body-medium opacity-90">{l.line}</span>
            </span>
          </button>
        ))}
        <TextArea label="Add a note (optional)" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Dialog>
  );
}

/** Shown to everyone in the dynamic while a safe call is open; anyone can clear it. */
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
  return (
    <div
      role="alert"
      className={cx(
        "mx-4 mt-3 flex flex-col gap-2 rounded-[20px] px-4 pt-4 pb-3 md:mx-6",
        red ? (mine ? "bg-error-container text-on-error-container" : "bg-error text-on-error") : "bg-[#F6D57A] text-[#3A2E00]",
      )}
    >
      <div className="flex items-start gap-3">
        <Icon name={red ? "front_hand" : "pan_tool"} filled className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="text-title-medium">
            {mine ? "You" : memberName(c.callerId)} called {c.level} at {fmtTime(c.createdAt)}
          </div>
          {c.note && <div className="text-body-medium">“{c.note}”</div>}
          <div className="text-body-medium opacity-90">
            {mine && `${partners.map((p) => p.displayName).join(" and ") || "Your partner"} has been told. `}
            {red ? "Tasks that slip are excused until one of you clears it." : "Slow down and check in."}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {mine && (
          <button
            type="button"
            disabled={change.isPending}
            onClick={() => change.mutate({ level: other, note: "" })}
            className="state-layer h-10 rounded-full px-4 text-label-large"
          >
            Change to {other}
          </button>
        )}
        <button
          type="button"
          disabled={clear.isPending}
          onClick={() => clear.mutate(c.id)}
          className={cx("state-layer h-10 rounded-full px-5 text-label-large", red ? (mine ? "bg-error text-on-error" : "bg-on-error text-error") : "bg-[#3A2E00] text-[#F6D57A]")}
        >
          {mine ? "I'm okay now" : "Clear it"}
        </button>
      </div>
    </div>
  );
}
