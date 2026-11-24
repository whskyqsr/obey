import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LIMIT_CATEGORIES, LIMIT_STARTERS, OWN_CATEGORY, limitSentence } from "@obey/contracts";
import { errorMessage } from "../api/client";
import {
  useAddLimitItem,
  useAnswerLimit,
  useAnswerLimitProfile,
  useApplyLimitProfile,
  useFinishLimits,
  useLimitList,
  useLimitProfile,
  useLimitProfileMatches,
  useRemoveLimitItem,
} from "../api/hooks";
import type { LimitAnswer, LimitItem, LimitProfileMatch, LimitRating, LimitSide } from "../api/types";
import {
  BackLink,
  Button,
  Checkbox,
  Dialog,
  Diamond,
  ErrorBox,
  IconButton,
  Loading,
  OverflowMenu,
  PageHeader,
  SegmentedButtons,
  Select,
  TextField,
  cx,
  useSnackbar,
} from "../components/ui";
import { type LimitRow, RATINGS, type Verdict, byCategory, chartImage, limitRows, otherSide, ratingOf, usualSide, verdict } from "../lib/limits";
import { useRel } from "../lib/relationship";
import { useBack } from "../lib/useBack";

/** A rating as a diamond: love filled, like half, curious open, a soft limit in the accent's outline, a hard limit filled accent. */
function RatingMark({ rating, size = 16 }: { rating: LimitRating | null | undefined; size?: number }) {
  if (!rating) return <Diamond state="off" size={size} className="opacity-50" />;
  const label = ratingOf(rating).label;
  return (
    <span role="img" aria-label={label} title={label} className="inline-flex">
      {rating === "love" ? (
        <Diamond state="done" size={size} />
      ) : rating === "like" ? (
        <Diamond state="waiting" size={size} />
      ) : rating === "curious" ? (
        <Diamond state="open" size={size} />
      ) : (
        <span
          aria-hidden
          className={cx("inline-block shrink-0 rotate-45 border-[1.5px] border-primary", rating === "hard" && "bg-primary")}
          style={{ width: size, height: size }}
        />
      )}
    </span>
  );
}

/** The five marks with their names, under the table. */
function Key() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-body-small text-on-surface-variant">
      {RATINGS.map((r) => (
        <span key={r.value} className="inline-flex items-center gap-1.5">
          <RatingMark rating={r.value} size={10} />
          {r.label}
        </span>
      ))}
    </div>
  );
}

async function saveImage(rows: LimitRow[], names: string[], snack: (m: string) => void) {
  try {
    const blob = await chartImage(rows, names);
    const file = new File([blob], "limits.png", { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], title: "Limits" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "limits.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (e) {
    if ((e as Error).name !== "AbortError") snack(errorMessage(e));
  }
}

/** The first item in category order, where a review starts. */
const items0 = (list: { items: LimitItem[] }) => byCategory(list.items)[0]?.[1][0]?.key;

/** The item the fill-in page opens on, when the list sends someone to change one answer. */
let openAt: string | undefined;

const TABS: { value: Verdict | "all"; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "maybe", label: "Maybe" },
  { value: "no", label: "No" },
  { value: "all", label: "All" },
];

/**
 * Mockup 24, with each item said both ways round (limits-sides/4-tabs): once you've both finished, tabs for what you
 * both want, what's worth a talk, what's off the table and every answer; each row is a sentence with your diamond and
 * your partner's.
 */
export function LimitsPage() {
  const { rel, me, partners, solo } = useRel();
  const list = useLimitList(rel.id);
  const navigate = useNavigate();
  const snack = useSnackbar();
  const [picked, setPicked] = useState<Verdict | "all" | null>(null);
  const partner = solo ? undefined : partners[0];
  const self = rel.members.find((m) => m.userId === me.user.id)!;
  const usual = usualSide(self.role, partner?.role);
  const edit = (key?: string) => {
    openAt = key;
    void navigate({ to: "/limits/edit" });
  };

  const data = list.data;
  const mine = data?.people.find((p) => p.userId === me.user.id);
  const theirs = partner ? data?.people.find((p) => p.userId === partner.userId) : undefined;
  const both = !!partner && !!mine?.sides && !!theirs?.sides;
  const total = data?.items.length ?? 0;
  const rows = useMemo(
    () => (data ? limitRows(data, me.user.id, both ? partner!.userId : undefined, partner?.displayName, usual) : []),
    [data, me.user.id, both, partner, usual],
  );
  const counts = { yes: 0, maybe: 0, no: 0 } as Record<Verdict, number>;
  for (const r of rows) {
    const v = verdict(r);
    if (v) counts[v]++;
  }
  const answered = rows.filter((r) => r.mine?.rating || r.mine?.note || (both && (r.theirs?.rating || r.theirs?.note)));
  const tab: Verdict | "all" = picked ?? TABS.find((t) => t.value !== "all" && counts[t.value] > 0)?.value ?? "all";
  const shown = !both || tab === "all" ? answered : rows.filter((r) => verdict(r) === tab);
  const names = both ? [self.displayName, partner!.displayName] : [self.displayName];

  const status = !mine
    ? undefined
    : mine.fromProfile
      ? `Filled in from your limits. Change anything ${partner ? `for ${partner.displayName}` : "here"}, then finish.`
      : both
      ? "You've both finished. Answers you didn't share stay private."
      : !partner
        ? mine.finishedAt
          ? `You've rated ${mine.rated} of ${total}.`
          : `You've rated ${mine.rated} of ${total} so far.`
        : mine.finishedAt
          ? `You've finished. ${partner.displayName} has rated ${theirs?.rated ?? 0} of ${total}; you'll see each other's once they finish.`
          : theirs?.finishedAt
            ? `${partner.displayName} has finished. You'll see each other's once you do.`
            : `You've rated ${mine.rated} of ${total}. ${partner.displayName} sees yours only once you've both finished.`;

  return (
    <>
      <PageHeader
        title="Limits"
        subtitle={status}
        tools={data && <IconButton icon="ios_share" label="Save as image" onClick={() => void saveImage(rows, names, snack)} />}
      />
      {list.isLoading && <Loading />}
      {list.error && <ErrorBox error={list.error} onRetry={() => list.refetch()} />}
      {data && mine && (
        <div className="flex max-w-3xl flex-col gap-6 px-4 pb-12 md:px-6">
          {!mine.finishedAt && (
            <div>
              <Button onClick={() => edit(mine.fromProfile ? items0(data) : undefined)}>
                {mine.fromProfile ? "Review and finish" : mine.rated ? "Carry on" : "Start"}
              </Button>
            </div>
          )}
          {both && (
            <SegmentedButtons
              className="self-start"
              value={tab}
              onChange={(v) => setPicked(v as Verdict | "all")}
              options={TABS.map((t) => ({ value: t.value, label: `${t.label} ${t.value === "all" ? answered.length : counts[t.value]}` }))}
            />
          )}
          <Rows rows={shown} names={both ? ["You", partner!.displayName] : ["You"]} onOpen={(i) => edit(i.key)} />
          {mine.finishedAt && (
            <div>
              <Button variant="tonal" onClick={() => edit()}>
                Change your answers
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** Rows by category, a diamond per person; notes sit under their row, and tapping a row changes your answer. */
function Rows({ rows, names, onOpen }: { rows: LimitRow[]; names: string[]; onOpen(i: LimitItem): void }) {
  const groups = new Map<string, LimitRow[]>();
  for (const r of rows) groups.set(r.item.category, [...(groups.get(r.item.category) ?? []), r]);
  if (!rows.length) return null;
  return (
    <div className="flex flex-col gap-6">
      {[...groups.entries()].map(([category, items]) => (
        <section key={category}>
          <div className="flex items-baseline text-body-medium text-on-surface-variant">
            <h2 className="min-w-0 flex-1">{category}</h2>
            <span>{names.join(" · ")}</span>
          </div>
          <div className="divide-y divide-outline-variant border-b border-outline-variant">
            {items.map((r) => (
              <button
                key={`${r.item.key}-${r.side}`}
                type="button"
                onClick={() => onOpen(r.item)}
                className="state-layer state-row flex min-h-14 w-full items-center gap-3 py-3 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-body-large text-on-surface">{r.text}</span>
                  {[r.mine?.note && { who: "You", note: r.mine.note }, names.length > 1 && r.theirs?.note && { who: names[1], note: r.theirs.note }]
                    .filter((n): n is { who: string; note: string } => !!n)
                    .map((n) => (
                      <span key={n.who} className="mt-1 block font-serif text-[18px] leading-6 text-on-surface-variant italic">
                        “{n.note}” <span className="font-sans text-body-small not-italic">· {n.who}</span>
                      </span>
                    ))}
                </span>
                {[r.mine, r.theirs].slice(0, names.length).map((a, i) => (
                  <span key={i} className="flex w-10 justify-center">
                    <RatingMark rating={a?.rating} size={18} />
                  </span>
                ))}
              </button>
            ))}
          </div>
        </section>
      ))}
      <Key />
    </div>
  );
}

/** Mockup 73, both ways round: one item at a time, a sentence for each side with the five answers under it. */
export function LimitsEditPage() {
  const { rel, me, partners, solo } = useRel();
  const list = useLimitList(rel.id);
  const answer = useAnswerLimit(rel.id, me.user.id);
  const finish = useFinishLimits(rel.id);
  const remove = useRemoveLimitItem(rel.id);
  const snack = useSnackbar();
  const navigate = useNavigate();
  const back = useBack(() => navigate({ to: "/limits" }));
  const [at, setAt] = useState<number | null>(null);
  const [noting, setNoting] = useState<{ item: LimitItem; side: LimitSide } | null>(null);
  const [adding, setAdding] = useState(false);
  const self = rel.members.find((m) => m.userId === me.user.id)!;
  const partner = solo ? undefined : partners[0];
  const usual = usualSide(self.role, partner?.role);
  const sides = [usual, otherSide(usual)] as const;

  if (list.isLoading) return <Loading />;
  if (list.error || !list.data) return <ErrorBox error={list.error} onRetry={() => list.refetch()} />;
  const data = list.data;
  const mine = data.people.find((p) => p.userId === me.user.id)!;
  const answers = mine.sides ?? { dom: {}, sub: {} };
  const rated = (key: string) => !!(answers.dom[key]?.rating || answers.sub[key]?.rating);
  // In category order, so "4 of 12" counts within a category.
  const items = byCategory(data.items).flatMap(([, xs]) => xs);
  const first = () => {
    const asked = openAt ? items.findIndex((i) => i.key === openAt) : -1;
    if (asked >= 0) return asked;
    const unrated = items.findIndex((i) => !rated(i.key));
    return unrated >= 0 ? unrated : items.length;
  };
  const index = at ?? first();
  const item = items[index];
  const set = (i: LimitItem, side: LimitSide, rating: LimitRating | null, note = answers[side][i.key]?.note ?? "") =>
    answer.mutate({ itemKey: i.key, side, rating, note }, { onError: (e) => snack(errorMessage(e)) });
  const go = (n: number) => {
    setAt(Math.max(0, Math.min(items.length, n)));
    window.scrollTo({ top: 0 });
  };
  const done = () => {
    if (mine.finishedAt) return back();
    finish.mutate(undefined, {
      onSuccess: () => {
        snack(partner ? `Finished. ${partner.displayName} sees yours once they've finished too.` : "Finished");
        void navigate({ to: "/limits" });
      },
      onError: (e) => snack(errorMessage(e)),
    });
  };
  const inCategory = item ? items.filter((i) => i.category === item.category) : [];
  const step = item ? inCategory.indexOf(item) + 1 : 0;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pt-3 pb-8 md:px-6 md:pt-6">
      <div className="-mx-2 flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <BackLink label="Limits" onClick={back} />
        </div>
        {item?.custom && item.createdBy === me.user.id && (
          <OverflowMenu
            items={[
              {
                label: "Remove from the list",
                icon: "delete",
                danger: true,
                onClick: () => remove.mutate(item.key, { onSuccess: () => snack(`Removed “${item.title}”`), onError: (e) => snack(errorMessage(e)) }),
              },
            ]}
          />
        )}
      </div>
      <div className="eyebrow mt-1">{item ? `${item.category} · ${step} of ${inCategory.length}` : `${mine.rated} of ${items.length} rated`}</div>
      <div className="mt-3 h-[3px] bg-outline-variant" aria-hidden>
        <div className="h-full bg-on-surface transition-[width]" style={{ width: `${(Math.min(index, items.length) / Math.max(1, items.length)) * 100}%` }} />
      </div>

      {item ? (
        <>
          <ItemStep
            item={item}
            answers={answers}
            sides={sides}
            optional={otherSide(usual)}
            partnerName={partner?.displayName}
            onRate={(side, rating) => {
              set(item, side, rating);
              if (rating && answers[otherSide(side)][item.key]?.rating) go(index + 1);
            }}
            onNote={(side) => setNoting({ item, side })}
            onPrevious={index > 0 ? () => go(index - 1) : undefined}
            onNext={() => go(index + 1)}
          />
        </>
      ) : (
        <>
          <h1 className="mt-12 font-serif text-[56px] leading-[60px] text-on-surface">{mine.finishedAt ? "All saved" : "That's all of them"}</h1>
          <p className="mt-3 text-body-large text-on-surface-variant">
            You've rated {mine.rated} of {items.length}.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button busy={finish.isPending} onClick={done}>
              {mine.finishedAt ? "Done" : "Finish"}
            </Button>
            <Button variant="tonal" onClick={() => setAdding(true)}>
              Add your own
            </Button>
            {items.length > 0 && (
              <Button variant="text" onClick={() => go(0)}>
                Start again from the top
              </Button>
            )}
          </div>
        </>
      )}
      <div className="flex-1" />
      {partner && (
        <p className="mt-12 text-center text-body-medium text-on-surface-variant">{partner.displayName} sees your answers only once you've both finished.</p>
      )}

      {noting && (
        <NoteDialog
          title={limitSentence(noting.item.sentences[noting.side], partner?.displayName)}
          answer={answers[noting.side][noting.item.key]}
          onClose={() => setNoting(null)}
          onSave={(note) => set(noting.item, noting.side, answers[noting.side][noting.item.key]?.rating ?? null, note)}
        />
      )}
      {adding && (
        <AddDialog
          category={OWN_CATEGORY}
          onClose={() => setAdding(false)}
          onAdded={(_, key) => {
            openAt = key;
            setAt(null);
          }}
        />
      )}
    </div>
  );
}

type Answers = Record<LimitSide, Record<string, LimitAnswer>>;

/** One item: its name, then a sentence for each side with the five answers under it, and Previous and Next. */
function ItemStep({
  item,
  answers,
  sides,
  optional,
  partnerName,
  onRate,
  onNote,
  onPrevious,
  onNext,
}: {
  item: LimitItem;
  answers: Answers;
  sides: readonly LimitSide[];
  /** The side marked "Optional", if any. */
  optional?: LimitSide;
  partnerName?: string;
  onRate(side: LimitSide, rating: LimitRating | null): void;
  onNote(side: LimitSide): void;
  onPrevious?: () => void;
  onNext(): void;
}) {
  const rated = !!(answers.dom[item.key]?.rating || answers.sub[item.key]?.rating);
  return (
    <>
      <h1 className="mt-12 font-serif text-[56px] leading-[60px] break-words text-on-surface">{item.title}</h1>
      {sides.map((side) => {
        const a = answers[side][item.key];
        const text = limitSentence(item.sentences[side], partnerName);
        return (
          <section key={side} className="mt-7">
            <div className="flex items-baseline gap-4">
              <h2 className="min-w-0 flex-1 text-body-large text-on-surface">
                {text}
                {side === optional && <span className="ml-2 text-body-medium text-on-surface-variant">Optional</span>}
              </h2>
              <button type="button" onClick={() => onNote(side)} className="text-label-large text-primary">
                {a?.note ? "Change the note" : "Add a note"}
              </button>
            </div>
            <div role="radiogroup" aria-label={text} className="mt-3 grid grid-cols-5 gap-1.5">
              {RATINGS.map((r) => {
                const on = a?.rating === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => onRate(side, on ? null : r.value)}
                    className={cx(
                      "state-layer flex h-16 flex-col items-center justify-center gap-2 rounded-lg border px-1 text-body-small whitespace-nowrap text-on-surface",
                      on ? "border-on-surface bg-surface-container" : "border-outline-variant bg-surface-container-lowest",
                    )}
                  >
                    <RatingMark rating={r.value} size={13} />
                    {r.label}
                  </button>
                );
              })}
            </div>
            {a?.note && <p className="mt-3 font-serif text-[20px] leading-7 text-on-surface-variant italic">“{a.note}”</p>}
          </section>
        );
      })}
      <div className="mt-7 flex items-center justify-end gap-4">
        {onPrevious && (
          <button type="button" onClick={onPrevious} className="text-label-large text-on-surface-variant">
            Previous
          </button>
        )}
        <button type="button" onClick={onNext} className="text-label-large text-on-surface-variant">
          {rated ? "Next" : "Skip"}
        </button>
      </div>
    </>
  );
}

const PROFILE_ITEMS: LimitItem[] = byCategory(LIMIT_STARTERS.map((s) => ({ ...s, custom: false, createdBy: null }))).flatMap(([, xs]) => xs);

/**
 * Your own limits (limits-sides/5-your-limits), from Settings: the same steps as in a dynamic, said about "your partner",
 * with your current role's side first and neither marked optional. They fill in each new dynamic's list as a draft; when
 * you change them, Fealty asks which dynamics to update too and never copies on its own.
 */
export function LimitsProfilePage() {
  const { rel, me, partners, solo } = useRel();
  const profile = useLimitProfile();
  const answer = useAnswerLimitProfile();
  const matches = useLimitProfileMatches();
  const snack = useSnackbar();
  const navigate = useNavigate();
  const back = useBack(() => navigate({ to: "/settings" }));
  const [at, setAt] = useState<number | null>(null);
  const [noting, setNoting] = useState<{ item: LimitItem; side: LimitSide } | null>(null);
  const [changed, setChanged] = useState<Map<string, { itemKey: string; side: LimitSide }>>(new Map());
  const [asking, setAsking] = useState<LimitProfileMatch[] | null>(null);
  const self = rel.members.find((m) => m.userId === me.user.id);
  const usual = usualSide(self?.role ?? "dominant", solo ? undefined : partners[0]?.role);
  const sides = [usual, otherSide(usual)] as const;

  if (profile.isLoading) return <Loading />;
  if (profile.error || !profile.data) return <ErrorBox error={profile.error} onRetry={() => profile.refetch()} />;
  const answers = profile.data.sides;
  const items = PROFILE_ITEMS;
  const rated = (key: string) => !!(answers.dom[key]?.rating || answers.sub[key]?.rating);
  const first = () => {
    const unrated = items.findIndex((i) => !rated(i.key));
    return unrated >= 0 ? unrated : items.length;
  };
  const index = at ?? first();
  const item = items[index];
  const set = (i: LimitItem, side: LimitSide, rating: LimitRating | null, note = answers[side][i.key]?.note ?? "") => {
    setChanged((m) => new Map(m).set(`${i.key}:${side}`, { itemKey: i.key, side }));
    answer.mutate({ itemKey: i.key, side, rating, note }, { onError: (e) => snack(errorMessage(e)) });
  };
  const go = (n: number) => {
    setAt(Math.max(0, Math.min(items.length, n)));
    window.scrollTo({ top: 0 });
  };
  /** Leaving: if anything changed, ask which dynamics to bring along. */
  const leave = () => {
    if (!changed.size) return back();
    matches.mutate([...changed.values()], {
      onSuccess: (found) => (found.length ? setAsking(found) : back()),
      onError: (e) => snack(errorMessage(e)),
    });
  };
  const inCategory = item ? items.filter((i) => i.category === item.category) : [];
  const step = item ? inCategory.indexOf(item) + 1 : 0;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pt-3 pb-8 md:px-6 md:pt-6">
      <div className="-mx-2">
        <BackLink label="Settings" onClick={leave} />
      </div>
      <div className="eyebrow mt-1">
        {item ? `Your limits · ${item.category} · ${step} of ${inCategory.length}` : `Your limits · ${profile.data.rated} of ${items.length} rated`}
      </div>
      <div className="mt-3 h-[3px] bg-outline-variant" aria-hidden>
        <div className="h-full bg-on-surface transition-[width]" style={{ width: `${(Math.min(index, items.length) / Math.max(1, items.length)) * 100}%` }} />
      </div>

      {item ? (
        <ItemStep
          item={item}
          answers={answers}
          sides={sides}
          onRate={(side, rating) => {
            set(item, side, rating);
            if (rating && answers[otherSide(side)][item.key]?.rating) go(index + 1);
          }}
          onNote={(side) => setNoting({ item, side })}
          onPrevious={index > 0 ? () => go(index - 1) : undefined}
          onNext={() => go(index + 1)}
        />
      ) : (
        <>
          <h1 className="mt-12 font-serif text-[56px] leading-[60px] text-on-surface">All saved</h1>
          <p className="mt-3 text-body-large text-on-surface-variant">
            You've rated {profile.data.rated} of {items.length}.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button busy={matches.isPending} onClick={leave}>
              Done
            </Button>
            <Button variant="text" onClick={() => go(0)}>
              Start again from the top
            </Button>
          </div>
        </>
      )}

      {noting && (
        <NoteDialog
          title={limitSentence(noting.item.sentences[noting.side], null)}
          answer={answers[noting.side][noting.item.key]}
          onClose={() => setNoting(null)}
          onSave={(note) => set(noting.item, noting.side, answers[noting.side][noting.item.key]?.rating ?? null, note)}
        />
      )}
      {asking && (
        <UpdateDynamicsDialog
          matches={asking}
          changes={[...changed.values()]}
          onClose={() => {
            setAsking(null);
            setChanged(new Map());
            back();
          }}
        />
      )}
    </div>
  );
}

/** After changing your limits: which dynamics to bring the changes to. Ones you've finished start unticked, since your partner would see the change. */
function UpdateDynamicsDialog({ matches, changes, onClose }: { matches: LimitProfileMatch[]; changes: { itemKey: string; side: LimitSide }[]; onClose(): void }) {
  const apply = useApplyLimitProfile();
  const snack = useSnackbar();
  const [picked, setPicked] = useState(() => new Set(matches.filter((m) => !m.finished).map((m) => m.relationshipId)));
  return (
    <Dialog
      open
      onClose={onClose}
      title="Update your limits with them too?"
      actions={
        <>
          <Button variant="outlined" onClick={onClose}>
            Not now
          </Button>
          <Button
            busy={apply.isPending}
            disabled={!picked.size}
            onClick={() =>
              apply.mutate(
                { changes, relationshipIds: [...picked] },
                {
                  onSuccess: () => {
                    snack(picked.size === 1 ? "Updated" : `Updated ${picked.size}`);
                    onClose();
                  },
                  onError: (e) => snack(errorMessage(e)),
                },
              )
            }
          >
            Update
          </Button>
        </>
      }
    >
      <p>
        You changed {changes.length} {changes.length === 1 ? "answer" : "answers"}.
      </p>
      <div className="mt-4 divide-y divide-outline-variant border-b border-outline-variant">
        {[...matches].sort((a, b) => Number(a.finished) - Number(b.finished)).map((m) => (
          <div key={m.relationshipId} className="flex min-h-14 items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <Checkbox
                checked={picked.has(m.relationshipId)}
                onChange={(on) =>
                  setPicked((p) => {
                    const next = new Set(p);
                    if (on) next.add(m.relationshipId);
                    else next.delete(m.relationshipId);
                    return next;
                  })
                }
                label={<span className="text-on-surface">{m.name}</span>}
              />
            </div>
            <span className="shrink-0 text-body-small text-on-surface-variant">
              {m.differ} differ{m.finished ? " · finished" : ""}
            </span>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

function NoteDialog({ title, answer, onClose, onSave }: { title: string; answer: LimitAnswer | undefined; onClose(): void; onSave(note: string): void }) {
  const [note, setNote] = useState(answer?.note ?? "");
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSave(note.trim());
              onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <TextField label="Note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Only soft ones, and not for long" />
    </Dialog>
  );
}

function AddDialog({ category, onClose, onAdded }: { category: string; onClose(): void; onAdded(category: string, key: string): void }) {
  const { rel } = useRel();
  const add = useAddLimitItem(rel.id);
  const snack = useSnackbar();
  const [title, setTitle] = useState("");
  const [cat, setCat] = useState(category);
  return (
    <Dialog
      open
      onClose={onClose}
      title="Add your own"
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            busy={add.isPending}
            disabled={!title.trim()}
            onClick={() =>
              add.mutate(
                { title: title.trim(), category: cat },
                {
                  onSuccess: (item) => {
                    onAdded(item.category, item.key);
                    onClose();
                  },
                  onError: (e) => snack(errorMessage(e)),
                },
              )
            }
          >
            Add
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField label="What" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
        <Select label="Category" value={cat} onChange={(e) => setCat(e.target.value)}>
          {[...LIMIT_CATEGORIES, OWN_CATEGORY].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <p className="text-body-medium text-on-surface-variant">You both see it on the list and can each rate it.</p>
      </div>
    </Dialog>
  );
}
