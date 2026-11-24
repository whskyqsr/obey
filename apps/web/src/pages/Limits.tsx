import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LIMIT_CATEGORIES, OWN_CATEGORY } from "@obey/contracts";
import { errorMessage } from "../api/client";
import { useAddLimitItem, useAnswerLimit, useFinishLimits, useLimitList, useRemoveLimitItem } from "../api/hooks";
import type { LimitAnswer, LimitItem, LimitList, LimitRating, Member } from "../api/types";
import {
  BackLink,
  Button,
  Dialog,
  Diamond,
  ErrorBox,
  IconButton,
  Loading,
  OverflowMenu,
  PageHeader,
  Select,
  TextField,
  cx,
  useSnackbar,
} from "../components/ui";
import { RATINGS, byCategory, chartImage, ratingOf, together } from "../lib/limits";
import { ROLE_LABEL, useRel } from "../lib/relationship";
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

async function saveImage(list: LimitList, people: Member[], snack: (m: string) => void) {
  try {
    const dark = document.documentElement.classList.contains("dark") || matchMedia("(prefers-color-scheme: dark)").matches;
    const blob = await chartImage(
      list,
      people.map((m) => ({ userId: m.userId, name: m.displayName })),
      dark,
    );
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

/** The item the fill-in page opens on, when the list sends someone to change one answer. */
let openAt: string | undefined;

/** Mockup 24: what you both want, what's worth a talk and what's off the table, then every answer as diamonds. */
export function LimitsPage() {
  const { rel, me, partners, solo } = useRel();
  const list = useLimitList(rel.id);
  const navigate = useNavigate();
  const snack = useSnackbar();
  const partner = solo ? undefined : partners[0];
  const self = rel.members.find((m) => m.userId === me.user.id)!;
  const edit = (key?: string) => {
    openAt = key;
    void navigate({ to: "/limits/edit" });
  };

  const data = list.data;
  const mine = data?.people.find((p) => p.userId === me.user.id);
  const theirs = partner ? data?.people.find((p) => p.userId === partner.userId) : undefined;
  const both = !!partner && !!mine?.answers && !!theirs?.answers;
  const people = both ? [self, partner!] : [self];
  const total = data?.items.length ?? 0;

  const status = !mine
    ? undefined
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
        tools={data && <IconButton icon="ios_share" label="Save as image" onClick={() => void saveImage(data, people, snack)} />}
      />
      {list.isLoading && <Loading />}
      {list.error && <ErrorBox error={list.error} onRetry={() => list.refetch()} />}
      {data && mine && (
        <div className="flex max-w-3xl flex-col gap-8 px-4 pb-12 md:px-6">
          {!mine.finishedAt && (
            <div>
              <Button onClick={() => edit()}>{mine.rated ? "Carry on" : "Start"}</Button>
            </div>
          )}
          {both && <Together list={data} a={mine.answers!} b={theirs!.answers!} />}
          <Table list={data} people={people} onOpen={(i) => edit(i.key)} />
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

function PillGroup({ title, items, tone }: { title: string; items: LimitItem[]; tone: "ink" | "outline" | "accent" }) {
  if (!items.length) return null;
  return (
    <section>
      <h2 className="eyebrow">{title}</h2>
      <div className="mt-3 flex flex-wrap gap-2.5">
        {items.map((i) => (
          <span
            key={i.key}
            className={cx(
              "rounded-full border px-5 py-2 text-body-large",
              tone === "ink" && "border-on-surface bg-on-surface text-surface",
              tone === "outline" && "border-on-surface text-on-surface",
              tone === "accent" && "border-primary text-primary",
            )}
          >
            {i.title}
          </span>
        ))}
      </div>
    </section>
  );
}

function Together({ list, a, b }: { list: LimitList; a: Record<string, LimitAnswer>; b: Record<string, LimitAnswer> }) {
  const { off, want, talk } = useMemo(() => together(list.items, a, b), [list.items, a, b]);
  return (
    <>
      <PillGroup title="You both want" items={want} tone="ink" />
      <PillGroup title="Worth talking about" items={talk} tone="outline" />
      <PillGroup title="Off the table" items={off} tone="accent" />
    </>
  );
}

/** Every rated item by category, a column of diamonds per person; tapping a row changes your answer. */
function Table({ list, people, onOpen }: { list: LimitList; people: Member[]; onOpen(i: LimitItem): void }) {
  const { me } = useRel();
  const answersOf = (m: Member) => list.people.find((p) => p.userId === m.userId)?.answers ?? {};
  const notes = people.flatMap((m) =>
    list.items
      .filter((i) => answersOf(m)[i.key]?.note)
      .map((i) => ({ item: i, who: m.userId === me.user.id ? "You" : m.displayName, note: answersOf(m)[i.key]!.note })),
  );
  const groups = byCategory(list.items)
    .map(([category, items]) => [category, items.filter((i) => people.some((m) => answersOf(m)[i.key]?.rating))] as const)
    .filter(([, items]) => items.length);
  if (!groups.length) return null;
  return (
    <div className="flex flex-col gap-6 border-t border-outline-variant pt-6">
      {groups.map(([category, items]) => (
        <section key={category}>
          <div className="flex items-baseline text-body-medium text-on-surface-variant">
            <h2 className="min-w-0 flex-1">{category}</h2>
            <span>{people.map((m) => (m.userId === me.user.id ? "You" : m.displayName)).join(" · ")}</span>
          </div>
          <div className="divide-y divide-outline-variant border-b border-outline-variant">
            {items.map((i) => (
              <button key={i.key} type="button" onClick={() => onOpen(i)} className="state-layer flex min-h-14 w-full items-center gap-3 py-3 text-left">
                <span className="min-w-0 flex-1 text-body-large text-on-surface">{i.title}</span>
                {people.map((m) => (
                  <span key={m.userId} className="flex w-10 justify-center">
                    <RatingMark rating={answersOf(m)[i.key]?.rating} size={18} />
                  </span>
                ))}
              </button>
            ))}
          </div>
        </section>
      ))}
      <Key />
      {notes.length > 0 && (
        <section>
          <h2 className="eyebrow">Notes</h2>
          <div className="mt-2 divide-y divide-outline-variant">
            {notes.map((r) => (
              <p key={`${r.item.key}-${r.who}`} className="py-3 text-body-large text-on-surface">
                {r.item.title} <span className="text-on-surface-variant">· {r.who}</span>
                <span className="mt-1 block font-serif text-[20px] leading-7 italic">“{r.note}”</span>
              </p>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Mockup 73: one item at a time, the five answers as rows, then on to the next. */
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
  const [noting, setNoting] = useState<LimitItem | null>(null);
  const [adding, setAdding] = useState(false);
  const self = rel.members.find((m) => m.userId === me.user.id)!;
  const partner = solo ? undefined : partners[0];

  if (list.isLoading) return <Loading />;
  if (list.error || !list.data) return <ErrorBox error={list.error} onRetry={() => list.refetch()} />;
  const data = list.data;
  const mine = data.people.find((p) => p.userId === me.user.id)!;
  const answers = mine.answers ?? {};
  // In category order, so "4 of 12" counts within a category.
  const items = byCategory(data.items).flatMap(([, xs]) => xs);
  const first = () => {
    const asked = openAt ? items.findIndex((i) => i.key === openAt) : -1;
    if (asked >= 0) return asked;
    const unrated = items.findIndex((i) => !answers[i.key]?.rating);
    return unrated >= 0 ? unrated : items.length;
  };
  const index = at ?? first();
  const item = items[index];
  const set = (i: LimitItem, rating: LimitRating | null, note = answers[i.key]?.note ?? "") =>
    answer.mutate({ itemKey: i.key, rating, note }, { onError: (e) => snack(errorMessage(e)) });
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
          <h1 className="mt-12 font-serif text-[56px] leading-[60px] break-words text-on-surface">{item.title}</h1>
          <p className="mt-3 text-body-large text-on-surface-variant">For you, as the {ROLE_LABEL[self.role]}.</p>
          <div role="radiogroup" aria-label={item.title} className="mt-6 flex flex-col gap-3">
            {RATINGS.map((r) => {
              const on = answers[item.key]?.rating === r.value;
              return (
                <button
                  key={r.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    set(item, on ? null : r.value);
                    if (!on) go(index + 1);
                  }}
                  className={cx(
                    "state-layer flex h-16 items-center gap-5 rounded-lg border px-6 text-left text-body-large text-on-surface",
                    on ? "border-on-surface bg-surface-container" : "border-outline-variant bg-surface-container-lowest",
                  )}
                >
                  {r.value === "hard" ? (
                    <span aria-hidden className={cx("inline-block size-4 shrink-0 rotate-45 border-[1.5px] border-primary", on && "bg-primary")} />
                  ) : (
                    <Diamond state={on ? "done" : "open"} size={16} />
                  )}
                  {r.value === "soft" ? "Soft limit, go slow" : r.label}
                </button>
              );
            })}
          </div>
          {answers[item.key]?.note && <p className="mt-4 font-serif text-[20px] leading-7 text-on-surface-variant italic">“{answers[item.key]!.note}”</p>}
          <div className="mt-6 flex items-center gap-4">
            <button type="button" onClick={() => setNoting(item)} className="text-label-large text-primary">
              {answers[item.key]?.note ? "Change the note" : "Add a note"}
            </button>
            <span className="flex-1" />
            {index > 0 && (
              <button type="button" onClick={() => go(index - 1)} className="text-label-large text-on-surface-variant">
                Previous
              </button>
            )}
            <button type="button" onClick={() => go(index + 1)} className="text-label-large text-on-surface-variant">
              {answers[item.key]?.rating ? "Next" : "Skip"}
            </button>
          </div>
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
          item={noting}
          answer={answers[noting.key]}
          onClose={() => setNoting(null)}
          onSave={(note) => set(noting, answers[noting.key]?.rating ?? null, note)}
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

function NoteDialog({ item, answer, onClose, onSave }: { item: LimitItem; answer: LimitAnswer | undefined; onClose(): void; onSave(note: string): void }) {
  const [note, setNote] = useState(answer?.note ?? "");
  return (
    <Dialog
      open
      onClose={onClose}
      title={item.title}
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
