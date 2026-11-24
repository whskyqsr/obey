import { Link } from "@tanstack/react-router";
import { useBalances, useEvents, useLibrary, useMonth, useStats } from "../api/hooks";
import type { CalendarEvent } from "../api/types";
import { addDays, fmtDate, fmtTime, localDateOf, today } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { Avatar } from "./Avatar";
import { useOwed } from "./Owed";
import { excerpt } from "../pages/Notes";

/**
 * The desktop Today's right column (mockup desktop-13): the partner, their last journal entry, this week's numbers and
 * what's coming up, set on hairlines without boxes.
 */
export function PartnerColumn() {
  const { rel, me, isDom, solo, features, memberName } = useRel();
  const partner = rel.members.find((m) => m.userId !== me.user.id) ?? rel.members.find((m) => m.userId === me.user.id)!;
  // The numbers are about whoever earns: the submissive (for a Dominant), else yourself.
  const earner = isDom && !solo ? partner.userId : me.user.id;
  const week = useStats(rel.id, 7, earner);
  const month = useStats(rel.id, 30, partner.userId);
  const balances = useBalances(rel.id);
  const owed = useOwed(earner);
  const notes = useLibrary(rel.id, "notes", features.journal);
  const t = today();
  const events = useEvents(rel.id, t, addDays(t, 14));
  const review = useMonth(rel.id, t.slice(0, 7), features.review);

  const entry = (notes.data ?? [])
    .filter((n) => n.kind === "journal" && n.authorId === partner.userId && n.bodyMd.trim())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const streak = dayStreak(month.data?.buckets ?? []);
  const w = week.data?.totals;
  const due = w ? w.done + w.missed : 0;
  const onTime = w && due > 0 ? Math.round((w.onTime / due) * 100) : null;
  const balance = balances.data?.find((b) => b.userId === earner)?.balance;
  const coming = (events.data ?? []).filter((e) => Date.parse(e.endsAt) >= Date.now()).slice(0, 3);
  const opens = review.data && !review.data.reviewOpen ? review.data.reviewOpensOn : null;

  return (
    <div className="flex flex-col gap-10 px-10 pt-12 pb-10">
      <div className="flex items-center gap-4">
        <Avatar userId={partner.userId} name={partner.displayName} version={partner.avatarVersion ?? null} size={72} serif />
        <div className="min-w-0">
          <div className="truncate font-serif text-[30px] leading-9 text-on-surface">{partner.userId === me.user.id ? "You" : partner.displayName}</div>
          {streak > 1 && (
            <div className="flex items-center gap-1.5 text-body-medium text-on-surface-variant">
              <span className="size-1.5 rounded-full bg-tertiary" aria-hidden />
              {streak} day streak
            </div>
          )}
        </div>
      </div>

      {features.journal && entry && (
        <section>
          <h2 className="eyebrow">Last journal entry</h2>
          <p className="mt-3 line-clamp-4 font-serif text-[22px] leading-8 text-on-surface">“{excerpt(entry.bodyMd, 140)}”</p>
          <Link to="/journal" className="mt-2 inline-block text-label-large text-primary">
            {partner.userId === me.user.id ? "Read it" : "Read and reply"}
          </Link>
        </section>
      )}

      {w && (
        <section>
          <h2 className="eyebrow">This week</h2>
          <div className="mt-3 flex gap-8">
            <Figure value={onTime === null ? "–" : `${onTime}%`} label="done on time" />
            {features.points && balance !== undefined && <Figure value={String(balance)} label="points" />}
            {features.consequences && <Figure value={String(owed.owed.length)} label="owed" />}
          </div>
        </section>
      )}

      {(coming.length > 0 || opens) && (
        <section>
          <h2 className="eyebrow">Coming up</h2>
          <div className="mt-2 flex flex-col divide-y divide-outline-variant">
            {coming.map((e) => (
              <ComingRow key={e.id} title={e.title} sub={planLine(e, rel.members, me.user.id, memberName)} />
            ))}
            {opens && <ComingRow title="Monthly review opens" sub={fmtDate(opens, { month: "short", day: "numeric" })} />}
          </div>
        </section>
      )}
    </div>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-serif text-[44px] leading-[52px] text-on-surface tabular-nums">{value}</div>
      <div className="text-body-medium text-on-surface-variant">{label}</div>
    </div>
  );
}

function ComingRow({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="py-3">
      <div className="text-body-large text-on-surface">{title}</div>
      <div className="text-body-medium text-on-surface-variant">{sub}</div>
    </div>
  );
}

/** "Fri 7–10 PM · Kitten". */
function planLine(e: CalendarEvent, members: { userId: string }[], myId: string, memberName: (id: string) => string) {
  const day = fmtDate(localDateOf(new Date(e.startsAt)), { weekday: "short" });
  const when = e.allDay ? `${day}, all day` : `${day} ${fmtTime(e.startsAt)}–${fmtTime(e.endsAt)}`;
  const whose = e.withPartner || members.length < 2 ? null : e.authorId === myId ? "You" : memberName(e.authorId);
  return [when, whose].filter(Boolean).join(" · ");
}

/** Days in a row, counting back from yesterday (today counts once something's done), with tasks due and none missed. */
function dayStreak(buckets: { start: string; done: number; missed: number }[]) {
  const t = today();
  let n = 0;
  for (const b of [...buckets].reverse()) {
    if (b.start === t && b.missed === 0) {
      if (b.done > 0) n++;
      continue;
    }
    if (b.missed > 0) break;
    if (b.done > 0) n++;
  }
  return n;
}
