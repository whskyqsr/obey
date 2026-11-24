import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { errorMessage } from "../api/client";
import { useMonth, usePastMonths, useSaveMonthReview, useSetFocus, useTasks } from "../api/hooks";
import type { MonthFocus, MonthReview, MonthSummary, Task } from "../api/types";
import { Button, Chip, Diamond, ErrorBox, FormSheet, Icon, IconButton, Loading, PageHeader, TextArea, TextField, cx, useSnackbar } from "../components/ui";
import { fmtDate, today } from "../lib/dates";
import { useRel } from "../lib/relationship";

const monthOf = (date: string) => date.slice(0, 7);
const nextMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};
const monthName = (month: string, year = false) =>
  new Date(`${month}-15T12:00:00`).toLocaleDateString(undefined, year ? { month: "long", year: "numeric" } : { month: "long" });
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
  const { rel, me, features } = useRel();
  const navigate = useNavigate();
  const current = monthOf(today());
  const [month, setMonth] = useState(current);
  const summary = useMonth(rel.id, month);
  const past = usePastMonths(rel.id);
  const [changing, setChanging] = useState(false);
  useEffect(() => setChanging(false), [month]);
  const viewingPast = month !== current;
  const s = summary.data;
  const mine = s?.reviews.find((r) => r.userId === me.user.id);
  const revealed = !!s?.reviewOpen && !!mine && s.waitingOn.length === 0 && s.reviews.length > 1 && !changing;
  const name = monthName(month);
  const title = revealed ? `${name}, together.` : s?.reviewOpen ? `Looking back on ${name}` : viewingPast ? monthName(month, true) : `${name} so far`;
  const eyebrow = !s
    ? "Monthly review"
    : s.reviewOpen
      ? viewingPast
        ? `Monthly review · ${month.slice(0, 4)}`
        : "Monthly review · open now"
      : `Monthly review · opens ${fmtDate(s.reviewOpensOn, { month: "short", day: "numeric" })}`;

  return (
    <>
      <PageHeader
        title={
          <>
            <span className="eyebrow mb-2 block font-sans">{eyebrow}</span>
            {title}
          </>
        }
        subtitle={revealed ? `${s!.reviews.length > 2 ? "You all" : "You both"} finished. Here's what you each said.` : undefined}
        tools={
          <>
            {viewingPast && (
              <button type="button" onClick={() => setMonth(current)} className="state-layer rounded-md px-2 py-2 text-label-large text-primary">
                This month
              </button>
            )}
            {features.stats && s?.subjectId && (
              <IconButton icon="show_chart" label={`See ${name} in Stats`} onClick={() => navigate({ to: "/stats", search: { month, who: s.subjectId! } })} />
            )}
          </>
        }
      />
      <div className="mx-auto w-full max-w-5xl px-4 pb-10 md:px-6">
        {summary.isPending ? (
          <Loading />
        ) : summary.error ? (
          <ErrorBox error={summary.error} onRetry={() => summary.refetch()} />
        ) : (
          <div className="grid gap-10 md:grid-cols-[3fr_2fr] md:gap-16">
            <div className="flex min-w-0 flex-col gap-10">
              {revealed ? (
                <Together s={summary.data} onChange={() => setChanging(true)} />
              ) : (
                <>
                  {summary.data.reviewOpen && <Questions s={summary.data} mine={mine} onSent={() => setChanging(false)} />}
                  <Focus s={summary.data} />
                </>
              )}
              <TheMonth s={summary.data} />
              {summary.data.reviewOpen && !viewingPast && <NextFocus month={nextMonth(month)} />}
            </div>
            {!!past.data?.length && (
              <section className="min-w-0">
                <h2 className="eyebrow">Past months</h2>
                <ul className="mt-2">
                  {past.data.map((p) => (
                    <li key={p.month} className="border-b border-outline-variant">
                      <button
                        type="button"
                        onClick={() => (setMonth(p.month), window.scrollTo({ top: 0 }))}
                        className="state-layer -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 py-3 text-left"
                      >
                        <span className="min-w-0 flex-1">
                          <span className={cx("block text-body-large", p.month === month ? "text-primary" : "text-on-surface")}>
                            {monthName(p.month, monthOf(p.month) < current.slice(0, 4))}
                          </span>
                          <span className="block truncate text-body-medium text-on-surface-variant">{p.goal ?? "No focus set"}</span>
                        </span>
                        {p.myRating != null && <span className="text-body-medium text-on-surface-variant">{p.myRating}/5</span>}
                        <span className="w-10 text-right text-body-medium text-on-surface-variant">{pct(p.rate)}</span>
                        <Icon name="chevron_right" className="text-on-surface-variant" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/** The month's focus and how its tasks are going. */
function Focus({ s }: { s: MonthSummary }) {
  const { isDom, memberName, rel } = useRel();
  const [editing, setEditing] = useState(false);
  const f = s.focus;
  const isCurrent = s.month === monthOf(today());
  const canEdit = isDom && !rel.endedAt;
  return (
    <section>
      <div className="flex items-center gap-2">
        <h2 className="eyebrow flex-1">Focus</h2>
        {f && canEdit && <IconButton icon="edit" label="Change the focus" onClick={() => setEditing(true)} />}
      </div>
      {f ? (
        <>
          <p className="mt-2 font-serif text-[26px] leading-8 text-on-surface">{f.goal}</p>
          <p className="mt-1 text-body-medium text-on-surface-variant">
            Set by {f.setBy ? (memberName(f.setBy) === "You" ? "you" : memberName(f.setBy)) : "a former member"}
            {isCurrent && !s.reviewOpen && ` · ${daysLeft(s.month)} days left`}
            {isCurrent && s.reviewOpen && ` · ends ${fmtDate(lastDay(s.month), { month: "short", day: "numeric" })}`}
          </p>
          {s.focusTasks.length > 0 && (
            <ul className="mt-3">
              {s.focusTasks.map((t) => (
                <li key={t.taskId} className="border-b border-outline-variant py-3">
                  <div className="flex items-baseline gap-3">
                    <span className="min-w-0 flex-1 truncate text-body-large text-on-surface">{t.title}</span>
                    <span className="text-body-medium text-on-surface-variant">{pct(t.rate)}</span>
                  </div>
                  <div className="mt-2 h-[3px] bg-outline-variant/60">
                    <div className="h-full bg-on-surface" style={{ width: pct(t.rate ?? 0) }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : canEdit ? (
        <button type="button" onClick={() => setEditing(true)} className="mt-2 text-body-large text-primary">
          Set {monthName(s.month)}'s focus
        </button>
      ) : (
        <p className="mt-2 text-body-large text-on-surface-variant">No focus set for {monthName(s.month)}.</p>
      )}
      {editing && <FocusSheet month={s.month} focus={f} onClose={() => setEditing(false)} />}
    </section>
  );
}

/** The Dominant picks the goal and up to ten tasks that count towards it. */
function FocusFields({
  goal,
  setGoal,
  picked,
  setPicked,
  tasks,
}: {
  goal: string;
  setGoal(g: string): void;
  picked: string[];
  setPicked(p: string[]): void;
  tasks: Task[];
}) {
  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id].slice(0, 10));
  return (
    <>
      <TextField label="Focus" value={goal} maxLength={200} onChange={(e) => setGoal(e.target.value)} placeholder="Be on time without being reminded" />
      {tasks.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="eyebrow">Tasks that count towards it</h3>
          <div className="flex flex-wrap gap-2">
            {tasks.map((t) => (
              <Chip key={t.id} plain selected={picked.includes(t.id)} onClick={() => toggle(t.id)}>
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

function FocusSheet({ month, focus, onClose }: { month: string; focus: MonthFocus | null; onClose(): void }) {
  const { rel } = useRel();
  const tasks = usePickable();
  const save = useSetFocus(rel.id, month);
  const snack = useSnackbar();
  const [goal, setGoal] = useState(focus?.goal ?? "");
  const [picked, setPicked] = useState<string[]>(focus?.taskIds ?? []);
  return (
    <FormSheet
      title={`${monthName(month)}'s focus`}
      onClose={onClose}
      saving={save.isPending}
      canSave={!!goal.trim()}
      onSave={() => save.mutate({ goal, taskIds: picked }, { onSuccess: onClose, onError: (e) => snack(errorMessage(e)) })}
    >
      <FocusFields goal={goal} setGoal={setGoal} picked={picked} setPicked={setPicked} tasks={tasks} />
    </FormSheet>
  );
}

/** How the sub's month went: the numbers in a line, the mood line, and the way to Stats. */
function TheMonth({ s }: { s: MonthSummary }) {
  const { memberName, features } = useRel();
  const navigate = useNavigate();
  if (!s.subjectId) return null;
  const t = s.totals;
  const isCurrent = s.month === monthOf(today());
  const who = memberName(s.subjectId);
  const any = t.done + t.missed + t.excused > 0;
  return (
    <section>
      <h2 className="eyebrow">{who === "You" ? "Your month" : `${who}'s month`}</h2>
      <p className="mt-2 text-body-large text-on-surface">
        {any
          ? `${pct(t.rate)} of tasks done${isCurrent ? " so far" : ""} · ${t.done} done, ${t.missed} missed`
          : isCurrent
            ? "Nothing finished yet this month."
            : `No tasks were due in ${monthName(s.month)}.`}
      </p>
      {s.moods.length > 0 && <MonthMoodLine month={s.month} moods={s.moods} />}
      <div className={cx("flex items-center gap-3 border-t border-outline-variant pt-2 text-body-medium", s.moods.length === 0 && "mt-3")}>
        <span className="flex-1 text-on-surface-variant">{s.moods.length > 0 ? "Mood" : ""}</span>
        {features.stats && (
          <button type="button" onClick={() => navigate({ to: "/stats", search: { month: s.month, who: s.subjectId! } })} className="text-primary">
            See {monthName(s.month)} in Stats
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * The sub's moods across the month as a line. Deliberately no average and nothing set against last month, so mood
 * never reads as a score.
 */
function MonthMoodLine({ month, moods }: { month: string; moods: MonthSummary["moods"] }) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const days = new Date(y, m, 0).getDate();
  const W = 300;
  const H = 64;
  const pts = moods.map((e) => {
    const d = new Date(e.at);
    const x = ((d.getDate() - 1 + (d.getHours() * 60 + d.getMinutes()) / 1440) / days) * W;
    return { x, y: H - 6 - ((e.mood - 1) / 4) * (H - 12) };
  });
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="mt-4 mb-1 h-20 w-full overflow-visible"
      role="img"
      aria-label={`${moods.length} moods this month`}
    >
      {pts.length > 1 ? (
        <polyline
          points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          className="stroke-on-surface"
          strokeWidth={1.5}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : (
        <circle cx={pts[0]!.x} cy={pts[0]!.y} r={3} className="fill-on-surface" />
      )}
    </svg>
  );
}

type Draft = { rating: number; wentWell: string; workOn: string };
const QUESTIONS = [
  { key: "wentWell", q: "What went well?" },
  { key: "workOn", q: "What to work on" },
  { key: "rating", q: "How well was the focus kept?" },
] as const;

/**
 * The review's questions as rows, a filled diamond for each one answered. A row opens in place to answer it; nothing
 * is sent until Send, and the others' answers show once you've sent yours.
 */
function Questions({ s, mine, onSent }: { s: MonthSummary; mine?: MonthReview; onSent(): void }) {
  const { rel, me, memberName } = useRel();
  const save = useSaveMonthReview(rel.id, s.month);
  const snack = useSnackbar();
  const saved: Draft = { rating: mine?.rating ?? 0, wentWell: mine?.wentWell ?? "", workOn: mine?.workOn ?? "" };
  const [draft, setDraft] = useState<Draft>(saved);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => setDraft({ rating: mine?.rating ?? 0, wentWell: mine?.wentWell ?? "", workOn: mine?.workOn ?? "" }), [mine, s.month]);
  const dirty = draft.rating !== saved.rating || draft.wentWell.trim() !== saved.wentWell || draft.workOn.trim() !== saved.workOn;
  const answered = (k: (typeof QUESTIONS)[number]["key"]) => (k === "rating" ? draft.rating > 0 : !!draft[k].trim());
  const finished = rel.members.filter((m) => m.userId !== me.user.id && !s.waitingOn.includes(m.userId)).map((m) => memberName(m.userId));
  const waiting = s.waitingOn.filter((id) => id !== me.user.id).map(memberName);
  const readOnly = !!rel.endedAt;
  return (
    <section className="flex flex-col gap-6">
      <ul>
        {QUESTIONS.map(({ key, q }) => (
          <li key={key} className="border-b border-outline-variant last:border-b-0">
            <button
              type="button"
              disabled={readOnly}
              aria-expanded={open === key}
              onClick={() => setOpen(open === key ? null : key)}
              className="state-layer -mx-2 flex w-[calc(100%+1rem)] items-center gap-4 rounded-md px-2 py-4 text-left"
            >
              <Diamond state={answered(key) ? "done" : "open"} size={18} className="mx-1" />
              <span className="min-w-0 flex-1 text-body-large text-on-surface">{q}</span>
              {answered(key) && <span className="text-body-medium text-on-surface-variant">answered</span>}
            </button>
            {open === key && (
              <div className="pb-4 pl-10">
                {key === "rating" ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2" role="radiogroup" aria-label="How well was the focus kept">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          role="radio"
                          aria-checked={draft.rating === n}
                          onClick={() => setDraft({ ...draft, rating: n })}
                          className={cx(
                            "state-layer flex size-11 items-center justify-center rounded-full border font-serif text-[20px]",
                            draft.rating === n ? "border-on-surface bg-on-surface text-surface" : "border-outline-variant text-on-surface",
                          )}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <div className="flex w-[15.5rem] justify-between text-body-small text-on-surface-variant">
                      <span>Not at all</span>
                      <span>Every day</span>
                    </div>
                  </div>
                ) : (
                  <TextArea aria-label={q} autoFocus rows={3} value={draft[key]} maxLength={2000} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && (dirty || !mine) && (
        <Button
          className="w-full"
          busy={save.isPending}
          disabled={!draft.rating}
          onClick={() => save.mutate(draft, { onSuccess: () => (setOpen(null), onSent()), onError: (e) => snack(errorMessage(e)) })}
        >
          {mine ? "Save my answers" : "Send my answers"}
        </Button>
      )}
      {!mine && finished.length > 0 && (
        <Hidden>
          {finished.join(" and ")} {finished.length > 1 ? "have" : "has"} finished. You'll see each other's answers when you finish yours.
        </Hidden>
      )}
      {mine && waiting.length > 0 && <Hidden>Waiting on {waiting.join(" and ")}. You'll see their answers once they've written them.</Hidden>}
    </section>
  );
}

const Hidden = ({ children }: { children: string | (string | number)[] }) => (
  <div className="flex items-start gap-4 rounded-lg border border-outline-variant bg-surface-container px-5 py-4 text-body-large text-on-surface-variant">
    <Icon name="visibility_off" className="mt-0.5 shrink-0" />
    <p>{children}</p>
  </div>
);

/** Everyone has answered: each person's words, then each rating beside how the tasks went. */
function Together({ s, onChange }: { s: MonthSummary; onChange(): void }) {
  const { rel, me, memberName } = useRel();
  const isSub = (id: string) => rel.members.find((m) => m.userId === id)?.role === "submissive";
  const order = [...s.reviews].sort((a, b) => Number(isSub(b.userId)) - Number(isSub(a.userId)));
  const who = (id: string) => (id === me.user.id ? "You" : memberName(id));
  const quotes = (k: "wentWell" | "workOn", title: string) => {
    const said = order.filter((r) => r[k].trim());
    if (!said.length) return null;
    return (
      <section>
        <h2 className="eyebrow">{title}</h2>
        <div className="mt-3 flex flex-col gap-5">
          {said.map((r) => (
            <blockquote key={r.userId} className={cx("border-l-2 pl-5", isSub(r.userId) ? "border-primary" : "border-on-surface")}>
              <p className="font-serif text-[22px] leading-7 whitespace-pre-wrap text-on-surface italic">“{r[k].trim()}”</p>
              <footer className="mt-1 text-body-medium text-on-surface-variant">{who(r.userId)}</footer>
            </blockquote>
          ))}
        </div>
      </section>
    );
  };
  return (
    <>
      {quotes("wentWell", "What went well")}
      {quotes("workOn", "What to work on")}
      <section>
        <h2 className="eyebrow">{s.focus ? `Focus: ${s.focus.goal}` : "How it went"}</h2>
        <div className="mt-3 flex flex-wrap gap-x-10 gap-y-4">
          {order.map((r) => (
            <div key={r.userId}>
              <div className="font-serif text-[44px] leading-none text-on-surface">
                {r.rating}
                <span className="text-[22px] text-on-surface-variant">/5</span>
              </div>
              <div className="mt-2 text-body-medium text-on-surface-variant">
                {r.userId === me.user.id ? "Your rating" : `${memberName(r.userId)}'s rating`}
              </div>
            </div>
          ))}
          {s.totals.rate != null && (
            <div>
              <div className="font-serif text-[44px] leading-none text-on-surface">{pct(s.totals.rate)}</div>
              <div className="mt-2 text-body-medium text-on-surface-variant">tasks done</div>
            </div>
          )}
        </div>
        {!rel.endedAt && (
          <button type="button" onClick={onChange} className="mt-5 text-body-medium text-on-surface-variant underline-offset-4 hover:underline">
            Change my answers
          </button>
        )}
      </section>
    </>
  );
}

/** Once the review is open, the Dominant sets next month's focus from here. */
function NextFocus({ month }: { month: string }) {
  const { rel, isDom } = useRel();
  const next = useMonth(rel.id, month);
  const [editing, setEditing] = useState(false);
  const focus = next.data?.focus ?? null;
  if (!isDom || rel.endedAt || next.isPending) return null;
  return (
    <section>
      {focus ? (
        <>
          <div className="flex items-center gap-2">
            <h2 className="eyebrow flex-1">{monthName(month)}'s focus</h2>
            <IconButton icon="edit" label={`Change ${monthName(month)}'s focus`} onClick={() => setEditing(true)} />
          </div>
          <p className="mt-1 font-serif text-[22px] leading-7 text-on-surface">{focus.goal}</p>
        </>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="text-body-large text-primary">
          Set {monthName(month)}'s focus
        </button>
      )}
      {editing && <FocusSheet month={month} focus={focus} onClose={() => setEditing(false)} />}
    </section>
  );
}
