import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { errorMessage } from "../api/client";
import { useMonth, usePastMonths, useSaveMonthReview, useSetFocus, useTasks } from "../api/hooks";
import type { MonthFocus, MonthReview, MonthSummary, Task } from "../api/types";
import { Avatar } from "../components/Avatar";
import { MOOD_LABELS, MOODS } from "../components/Mood";
import { Button, Chip, Dialog, Empty, ErrorBox, Icon, IconButton, Loading, PageHeader, TextArea, TextField, cx, useSnackbar } from "../components/ui";
import { fmtDate, today } from "../lib/dates";
import { useRel } from "../lib/relationship";

const monthOf = (date: string) => date.slice(0, 7);
const nextMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};
const monthName = (month: string, year = false) => new Date(`${month}-15T12:00:00`).toLocaleDateString(undefined, year ? { month: "long", year: "numeric" } : { month: "long" });
const pct = (rate: number | null) => (rate == null ? "–" : `${Math.round(rate * 100)}%`);
const lastDay = (month: string) => {
  const d = new Date(`${nextMonth(month)}-01T12:00:00`);
  d.setDate(d.getDate() - 1);
  return `${month}-${String(d.getDate()).padStart(2, "0")}`;
};
const daysLeft = (month: string) => {
  const end = new Date(`${nextMonth(month)}-01T00:00:00`);
  return Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86_400_000));
};

/** A focus for each month, how it's going, and a look back on it together at the end. */
export function MonthReviewPage() {
  const { rel } = useRel();
  const current = monthOf(today());
  const [month, setMonth] = useState(current);
  const summary = useMonth(rel.id, month);
  const past = usePastMonths(rel.id);
  const viewingPast = month !== current;

  return (
    <>
      <PageHeader
        title="Monthly review"
        subtitle={monthName(month, true) + (summary.data?.reviewOpen && !viewingPast ? " · review open" : "")}
        actions={
          viewingPast ? (
            <Button variant="text" icon="arrow_back" onClick={() => setMonth(current)}>
              This month
            </Button>
          ) : undefined
        }
      />
      <div className="mx-auto w-full max-w-5xl px-4 pb-10 md:px-6">
        {summary.isPending ? (
          <Loading />
        ) : summary.error ? (
          <ErrorBox error={summary.error} onRetry={() => summary.refetch()} />
        ) : (
          <div className="grid gap-4 md:grid-cols-[3fr_2fr]">
            <div className="flex min-w-0 flex-col gap-4">
              <FocusCard s={summary.data} />
              <ProgressCard s={summary.data} />
              {summary.data.reviewOpen && <LookBack s={summary.data} />}
              {summary.data.reviewOpen && !viewingPast && <NextFocus month={nextMonth(month)} />}
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              {!summary.data.reviewOpen && <ReviewSoon s={summary.data} />}
              {!!past.data?.length && (
                <section className="flex flex-col gap-2">
                  <h2 className="mt-1 text-title-medium text-on-surface">Past months</h2>
                  <ul className="overflow-hidden rounded-lg bg-surface-container-low">
                    {past.data.map((p) => (
                      <li key={p.month} className="border-t border-surface-container-highest first:border-t-0">
                        <button
                          type="button"
                          onClick={() => (setMonth(p.month), window.scrollTo({ top: 0 }))}
                          className={cx("state-layer flex w-full items-center gap-3 px-4 py-3 text-left", p.month === month && "bg-secondary-container")}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-body-large text-on-surface">{monthName(p.month, monthOf(p.month) < current.slice(0, 4))}</span>
                            <span className="block truncate text-body-medium text-on-surface-variant">{p.goal ?? "No focus set"}</span>
                          </span>
                          {p.myRating != null && (
                            <span className="rounded-sm bg-secondary-container px-2 py-0.5 text-label-medium text-on-secondary-container">{p.myRating} of 5</span>
                          )}
                          <span className="w-10 text-right text-body-medium text-on-surface-variant">{pct(p.rate)}</span>
                          <Icon name="chevron_right" className="text-on-surface-variant" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function FocusCard({ s }: { s: MonthSummary }) {
  const { isDom, memberName, rel } = useRel();
  const tasks = useTasks(rel.id);
  const [editing, setEditing] = useState(false);
  const f = s.focus;
  const isCurrent = s.month === monthOf(today());
  if (!f)
    return (
      <section className="flex flex-col items-start gap-3 rounded-lg bg-surface-container-low p-4">
        <h2 className="text-title-medium text-on-surface">Focus for {monthName(s.month)}</h2>
        <p className="text-body-medium text-on-surface-variant">
          {isDom ? "Pick one thing to work on this month, and the tasks that count towards it." : "No focus has been set for this month yet."}
        </p>
        {isDom && !rel.endedAt && (
          <Button icon="flag" onClick={() => setEditing(true)}>
            Set a focus
          </Button>
        )}
        {editing && <FocusDialog month={s.month} focus={null} onClose={() => setEditing(false)} />}
      </section>
    );
  const titles = new Map((tasks.data ?? []).map((t) => [t.id, t.title]));
  return (
    <section className="flex flex-col gap-3 rounded-lg bg-primary-container p-4 text-on-primary-container">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-label-medium tracking-wide uppercase opacity-80">Focus for {monthName(s.month)}</div>
          <p className="mt-2 text-headline-small">{f.goal}</p>
          <p className="mt-2 text-body-medium opacity-80">
            Set by {f.setBy ? (memberName(f.setBy) === "You" ? "you" : memberName(f.setBy)) : "a former member"}
            {isCurrent && !s.reviewOpen && ` · ${daysLeft(s.month)} days left`}
            {isCurrent && s.reviewOpen && ` · ends ${fmtDate(lastDay(s.month), { month: "short", day: "numeric" })}`}
          </p>
        </div>
        {isDom && !rel.endedAt && <IconButton icon="edit" label="Change the focus" onClick={() => setEditing(true)} />}
      </div>
      {f.taskIds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {f.taskIds.map((id) => (
            <span key={id} className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-current px-3 text-label-large">
              <Icon name="check_circle" size={18} />
              {titles.get(id) ?? s.focusTasks.find((t) => t.taskId === id)?.title ?? "A task"}
            </span>
          ))}
        </div>
      )}
      {editing && <FocusDialog month={s.month} focus={f} onClose={() => setEditing(false)} />}
    </section>
  );
}

/** The Dominant picks the goal and up to ten tasks that count towards it. */
function FocusFields({ goal, setGoal, picked, setPicked, tasks }: { goal: string; setGoal(g: string): void; picked: string[]; setPicked(p: string[]): void; tasks: Task[] }) {
  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id].slice(0, 10));
  return (
    <>
      <TextField label="Focus" value={goal} maxLength={200} onChange={(e) => setGoal(e.target.value)} placeholder="Be on time without being reminded" />
      {tasks.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-body-small text-on-surface-variant">Tasks that count towards it</p>
          <div className="flex flex-wrap gap-2">
            {tasks.map((t) => (
              <Chip key={t.id} selected={picked.includes(t.id)} icon={picked.includes(t.id) ? "check" : undefined} onClick={() => toggle(t.id)}>
                {t.title}
              </Chip>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** The sub's own regular tasks; the month's numbers are about them. */
const usePickable = () => {
  const { rel, me } = useRel();
  const tasks = useTasks(rel.id);
  const sub = rel.members.find((m) => m.role === "submissive")?.userId ?? rel.members.find((m) => m.role === "switch" && m.userId !== me.user.id)?.userId;
  return (tasks.data ?? []).filter((t) => t.active && !t.draft && !t.assignedConsequenceId && t.assigneeId === sub);
};

function FocusDialog({ month, focus, onClose }: { month: string; focus: MonthFocus | null; onClose(): void }) {
  const { rel } = useRel();
  const tasks = usePickable();
  const save = useSetFocus(rel.id, month);
  const snack = useSnackbar();
  const [goal, setGoal] = useState(focus?.goal ?? "");
  const [picked, setPicked] = useState<string[]>(focus?.taskIds ?? []);
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Focus for ${monthName(month)}`}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            busy={save.isPending}
            disabled={!goal.trim()}
            onClick={() => save.mutate({ goal, taskIds: picked }, { onSuccess: onClose, onError: (e) => snack(errorMessage(e)) })}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FocusFields goal={goal} setGoal={setGoal} picked={picked} setPicked={setPicked} tasks={tasks} />
      </div>
    </Dialog>
  );
}

/** The focus tasks and mood for the month. The full numbers live in Stats, which counts the same calendar month. */
function ProgressCard({ s }: { s: MonthSummary }) {
  const { memberName, features } = useRel();
  const navigate = useNavigate();
  const t = s.totals;
  if (!s.subjectId || t.done + t.missed + t.excused === 0)
    return s.subjectId ? (
      s.month === monthOf(today()) ? (
        <Empty icon="insights" title="Nothing finished yet this month" body="This fills in as tasks are done or missed." />
      ) : (
        <Empty icon="insights" title={`No tasks were due in ${monthName(s.month)}`} />
      )
    ) : null;
  const isCurrent = s.month === monthOf(today());
  const who = memberName(s.subjectId);
  const summary = (
    <span className="min-w-0 flex-1">
      <span className="block text-title-small text-on-surface">All of {monthName(s.month)}'s tasks</span>
      <span className="block text-body-medium text-on-surface-variant">
        {pct(t.rate)} done{isCurrent ? " so far" : ""} · {t.done} done, {t.missed} missed
      </span>
    </span>
  );
  return (
    <section className="flex flex-col gap-3 rounded-lg bg-surface-container-low pt-4 pb-1">
      <h2 className="px-4 text-title-medium text-on-surface">
        {isCurrent ? `How ${monthName(s.month)} is going` : `How ${monthName(s.month)} went`}
        {who !== "You" && <span className="text-on-surface-variant"> for {who}</span>}
      </h2>
      {s.focusTasks.length > 0 && (
        <div className="flex flex-col gap-3 px-4">
          <p className="text-body-small text-on-surface-variant">Tasks for the focus</p>
          {s.focusTasks.map((f) => (
            <div key={f.taskId} className="flex items-center gap-3 text-body-medium text-on-surface">
              <span className="w-36 shrink-0 truncate">{f.title}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-container-highest">
                <span className="block h-full rounded-full bg-primary" style={{ width: pct(f.rate ?? 0) }} />
              </span>
              <span className="w-10 text-right">{pct(f.rate)}</span>
            </div>
          ))}
        </div>
      )}
      {s.moods.length > 0 && (
        <div className="px-4">
          <MonthMoodLine month={s.month} moods={s.moods} />
        </div>
      )}
      {features.stats ? (
        <button
          type="button"
          aria-label={`See ${monthName(s.month)}'s stats`}
          onClick={() => navigate({ to: "/stats", search: { month: s.month, who: s.subjectId! } })}
          className="state-layer flex items-center gap-3 border-t border-surface-container-highest px-4 py-3 text-left"
        >
          {summary}
          <span className="shrink-0 text-label-large text-primary">Stats</span>
          <Icon name="chevron_right" className="-ml-2 text-primary" />
        </button>
      ) : (
        <div className="flex border-t border-surface-container-highest px-4 py-3">{summary}</div>
      )}
    </section>
  );
}

/**
 * The sub's moods across the month as a line, one point per answer. Deliberately no average and nothing set against
 * last month, so mood never reads as a score.
 */
function MonthMoodLine({ month, moods }: { month: string; moods: MonthSummary["moods"] }) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const days = new Date(y, m, 0).getDate();
  const W = 300;
  const H = 56;
  const pts = moods.map((e) => {
    const d = new Date(e.at);
    const x = ((d.getDate() - 1 + (d.getHours() * 60 + d.getMinutes()) / 1440) / days) * W;
    return { x, y: H - 4 - ((e.mood - 1) / 4) * (H - 8), mood: e.mood };
  });
  return (
    <div className="flex flex-col gap-1">
      <p className="text-body-small text-on-surface-variant">Mood this month</p>
      <div className="flex items-stretch gap-2">
        <div className="flex flex-col justify-between text-on-surface-variant">
          <Icon name={MOODS[4]!} size={16} />
          <Icon name={MOODS[0]!} size={16} />
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-14 flex-1 overflow-visible" role="img" aria-label={`${moods.length} moods this month`}>
          <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="stroke-outline-variant" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
          {pts.length > 1 && (
            <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" className="stroke-primary" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          )}
          {pts.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={3} className={p.mood <= 2 ? "fill-tertiary" : "fill-primary"} vectorEffect="non-scaling-stroke">
              <title>{MOOD_LABELS[p.mood - 1]}</title>
            </circle>
          ))}
        </svg>
      </div>
    </div>
  );
}

function ReviewSoon({ s }: { s: MonthSummary }) {
  const { isDom, partners } = useRel();
  const dom = partners.find((p) => p.role !== "submissive")?.displayName;
  return (
    <section className="flex items-start gap-3 rounded-lg bg-surface-container-low p-4">
      <Icon name="event_upcoming" className="text-on-surface-variant" />
      <div>
        <h2 className="text-title-medium text-on-surface">Review opens {fmtDate(s.reviewOpensOn, { month: "short", day: "numeric" })}</h2>
        <p className="text-body-medium text-on-surface-variant">
          You'll both look back on {monthName(s.month)} and {isDom ? "you set" : `${dom ?? "your Dominant"} sets`} {monthName(nextMonth(s.month))}'s focus.
        </p>
      </div>
    </section>
  );
}

/** Each person's answers. Your own form until you've sent it; the others' only once you have. */
function LookBack({ s }: { s: MonthSummary }) {
  const { me, rel, memberName } = useRel();
  const mine = s.reviews.find((r) => r.userId === me.user.id);
  const [editing, setEditing] = useState(!mine);
  useEffect(() => setEditing(!mine), [mine, s.month]);
  const waiting = s.waitingOn.filter((id) => id !== me.user.id).map(memberName);
  if (editing && !rel.endedAt) return <ReviewForm s={s} mine={mine} onDone={() => setEditing(false)} />;
  return (
    <section className="flex flex-col gap-4 rounded-lg bg-surface-container-low p-4">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-title-medium text-on-surface">{monthName(s.month)}, looking back</h2>
        {mine && !rel.endedAt && <IconButton icon="edit" label="Change your answers" onClick={() => setEditing(true)} />}
      </div>
      {[...s.reviews]
        .sort((a, b) => Number(a.userId === me.user.id) - Number(b.userId === me.user.id))
        .map((r, i) => (
          <Answers key={r.userId} r={r} divider={i > 0} />
        ))}
      {!mine && <p className="text-body-medium text-on-surface-variant">You see the others' answers once you've given yours.</p>}
      {mine && waiting.length > 0 && (
        <p className="flex items-center gap-2 text-body-medium text-on-surface-variant">
          <Icon name="hourglass_top" size={20} />
          Waiting on {waiting.join(" and ")}. You'll see their answers once they've written them.
        </p>
      )}
    </section>
  );
}

function Answers({ r, divider }: { r: MonthReview; divider: boolean }) {
  const { rel, memberName } = useRel();
  const m = rel.members.find((x) => x.userId === r.userId);
  return (
    <div className={cx("flex flex-col gap-3", divider && "border-t border-surface-container-highest pt-4")}>
      <div className="flex items-center gap-3">
        <Avatar userId={r.userId} name={m?.displayName ?? "?"} version={m?.avatarVersion ?? null} size={32} />
        <div>
          <div className="text-title-small text-on-surface">{memberName(r.userId)}</div>
          <div className="text-body-medium text-on-surface-variant">Kept the focus {r.rating} of 5</div>
        </div>
      </div>
      {r.wentWell && <Answer q="What went well">{r.wentWell}</Answer>}
      {r.workOn && <Answer q="What to work on">{r.workOn}</Answer>}
    </div>
  );
}

const Answer = ({ q, children }: { q: string; children: ReactNode }) => (
  <div>
    <div className="text-body-small text-on-surface-variant">{q}</div>
    <p className="text-body-large whitespace-pre-wrap text-on-surface">{children}</p>
  </div>
);

function ReviewForm({ s, mine, onDone }: { s: MonthSummary; mine?: MonthReview; onDone(): void }) {
  const { rel, me } = useRel();
  const save = useSaveMonthReview(rel.id, s.month);
  const snack = useSnackbar();
  const [rating, setRating] = useState(mine?.rating ?? 0);
  const [wentWell, setWentWell] = useState(mine?.wentWell ?? "");
  const [workOn, setWorkOn] = useState(mine?.workOn ?? "");
  const others = rel.members.filter((m) => m.userId !== me.user.id && s.waitingOn.includes(m.userId)).map((m) => m.displayName);
  return (
    <section className="flex flex-col gap-4 rounded-lg bg-surface-container-low p-4">
      <h2 className="text-title-medium text-on-surface">Look back on {monthName(s.month)}</h2>
      {others.length > 0 && (
        <p className="text-body-medium text-on-surface-variant">
          {others.join(" and ")} {others.length > 1 ? "see" : "sees"} your answers once they've written theirs, and you see theirs.
        </p>
      )}
      <div className="flex flex-col gap-2">
        <p className="text-body-large text-on-surface">How well was the focus kept?</p>
        <div className="flex gap-2" role="radiogroup" aria-label="How well was the focus kept">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              onClick={() => setRating(n)}
              className={cx(
                "state-layer flex size-12 items-center justify-center rounded-full text-title-medium",
                rating === n ? "bg-primary text-on-primary" : "border border-outline-variant text-on-surface",
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex w-[17rem] justify-between text-body-small text-on-surface-variant">
          <span>Not at all</span>
          <span>Every day</span>
        </div>
      </div>
      <TextArea label="What went well" value={wentWell} maxLength={2000} onChange={(e) => setWentWell(e.target.value)} />
      <TextArea label="What to work on" value={workOn} maxLength={2000} onChange={(e) => setWorkOn(e.target.value)} />
      <div className="flex justify-end gap-2">
        {mine && (
          <Button variant="text" onClick={onDone}>
            Cancel
          </Button>
        )}
        <Button busy={save.isPending} disabled={!rating} onClick={() => save.mutate({ rating, wentWell, workOn }, { onSuccess: onDone, onError: (e) => snack(errorMessage(e)) })}>
          {mine ? "Save" : "Send"}
        </Button>
      </div>
    </section>
  );
}

/** Once the review is open, the Dominant sets next month's focus from here. */
function NextFocus({ month }: { month: string }) {
  const { rel, isDom } = useRel();
  const next = useMonth(rel.id, month);
  const tasks = usePickable();
  const save = useSetFocus(rel.id, month);
  const snack = useSnackbar();
  const [goal, setGoal] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const focus = next.data?.focus;
  useEffect(() => {
    if (focus) {
      setGoal(focus.goal);
      setPicked(focus.taskIds);
    }
  }, [focus]);
  if (!isDom || rel.endedAt || next.isPending) return null;
  if (focus && !editing)
    return (
      <section className="flex items-start gap-3 rounded-lg bg-surface-container-low p-4">
        <Icon name="flag" className="text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="text-title-medium text-on-surface">Focus for {monthName(month)}</h2>
          <p className="text-body-medium text-on-surface-variant">{focus.goal}</p>
        </div>
        <IconButton icon="edit" label={`Change ${monthName(month)}'s focus`} onClick={() => setEditing(true)} />
      </section>
    );
  return (
    <section className="flex flex-col gap-4 rounded-lg bg-surface-container-low p-4">
      <h2 className="text-title-medium text-on-surface">Focus for {monthName(month)}</h2>
      <FocusFields goal={goal} setGoal={setGoal} picked={picked} setPicked={setPicked} tasks={tasks} />
      <div className="flex justify-end gap-2">
        {focus && (
          <Button variant="text" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        )}
        <Button
          busy={save.isPending}
          disabled={!goal.trim()}
          onClick={() =>
            save.mutate({ goal, taskIds: picked }, { onSuccess: () => (setEditing(false), snack(`${monthName(month)}'s focus is set`)), onError: (e) => snack(errorMessage(e)) })
          }
        >
          Start {monthName(month)}
        </Button>
      </div>
    </section>
  );
}
