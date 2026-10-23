import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LIMIT_CATEGORIES, OWN_CATEGORY } from "@obey/contracts";
import { errorMessage } from "../api/client";
import { useAddLimitItem, useAnswerLimit, useFinishLimits, useLimitList, useRemoveLimitItem } from "../api/hooks";
import type { LimitAnswer, LimitItem, LimitList, LimitPerson, LimitRating, Member } from "../api/types";
import { Avatar } from "../components/Avatar";
import { Button, Dialog, Empty, ErrorBox, Icon, IconButton, Loading, PageHeader, SegmentedButtons, Select, TextField, cx, useSnackbar } from "../components/ui";
import { fmtDate, localDateOf } from "../lib/dates";
import { RATINGS, byCategory, chartImage, ratingOf, together } from "../lib/limits";
import { ROLE_LABEL, useRel } from "../lib/relationship";
import { useBack } from "../lib/useBack";

type Tab = "me" | "partner" | "together";

function Legend({ className }: { className?: string }) {
  return (
    <div className={cx("flex flex-wrap gap-x-4 gap-y-1", className)}>
      {RATINGS.map((r) => (
        <span key={r.value} className="inline-flex items-center gap-1.5 text-body-medium text-on-surface">
          <Dot rating={r.value} />
          {r.label}
        </span>
      ))}
    </div>
  );
}

function Dot({ rating, size = 12 }: { rating: LimitRating | null | undefined; size?: number }) {
  return rating ? (
    <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: ratingOf(rating).color }} aria-label={ratingOf(rating).label} />
  ) : (
    <span className="inline-block shrink-0 rounded-full border-2 border-outline" style={{ width: size, height: size }} aria-label="Skipped" />
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

/** Each person's limits, and the two side by side once both have finished. */
export function LimitsPage() {
  const { rel, me, partners, solo } = useRel();
  const list = useLimitList(rel.id);
  const navigate = useNavigate();
  const snack = useSnackbar();
  const [tab, setTab] = useState<Tab>("me");
  const [chart, setChart] = useState(false);
  const partner = partners[0];
  const self = rel.members.find((m) => m.userId === me.user.id)!;
  const edit = () => navigate({ to: "/limits/edit" });

  const data = list.data;
  const mine = data?.people.find((p) => p.userId === me.user.id);
  const theirs = partner ? data?.people.find((p) => p.userId === partner.userId) : undefined;
  const bothShown = !!mine?.answers && !!theirs?.answers;
  const shownPeople = tab === "together" || chart ? (bothShown ? [self, partner!] : [self]) : tab === "partner" && partner ? [partner] : [self];

  return (
    <>
      <PageHeader
        title="Limits"
        subtitle={solo ? "For you, in your own role" : `${self.displayName} and ${partner?.displayName ?? "your partner"}`}
        actions={
          data && (
            <>
              <IconButton icon="download" label="Save as image" onClick={() => void saveImage(data, shownPeople, snack)} />
              <IconButton icon="edit" label="Change your answers" onClick={edit} />
            </>
          )
        }
      />
      {list.isLoading && <Loading />}
      {list.error && <ErrorBox error={list.error} onRetry={() => list.refetch()} />}
      {data && mine && (
        <div className="flex flex-col gap-4 px-4 pb-10 md:px-6">
          {!mine.finishedAt && (
            <div className="flex flex-col gap-2 rounded-xl bg-secondary-container p-4 text-on-secondary-container">
              <div className="text-title-medium">{mine.rated ? `You've rated ${mine.rated} of ${data.items.length}` : "Fill in your limits"}</div>
              <p className="text-body-medium">
                Rate each item for yourself, as the {ROLE_LABEL[self.role]}: love it, like it, curious, a soft limit or a hard limit. Skip anything you'd rather not say.
                {partner ? ` ${partner.displayName} sees your answers once you've both finished.` : ""}
              </p>
              <div>
                <Button onClick={edit}>{mine.rated ? "Carry on" : "Start"}</Button>
              </div>
            </div>
          )}
          {!solo && partner && (
            <SegmentedButtons<Tab>
              value={tab}
              onChange={setTab}
              options={[
                { value: "me", label: self.displayName },
                { value: "partner", label: partner.displayName },
                { value: "together", label: "Together" },
              ]}
              className="w-full max-w-xl [&>button]:flex-none [&>button]:basis-1/3"
            />
          )}
          {chart ? (
            <Chart list={data} people={shownPeople} onClose={() => setChart(false)} />
          ) : tab === "together" && partner ? (
            bothShown ? (
              <Together list={data} a={self} b={partner} answersA={mine.answers!} answersB={theirs!.answers!} onChart={() => setChart(true)} />
            ) : (
              <Waiting mine={mine} theirs={theirs} partner={partner} />
            )
          ) : tab === "partner" && partner ? (
            theirs?.answers ? (
              <Person list={data} member={partner} person={theirs} onChart={() => setChart(true)} />
            ) : (
              <Waiting mine={mine} theirs={theirs} partner={partner} />
            )
          ) : (
            <Person list={data} member={self} person={mine} onChart={() => setChart(true)} />
          )}
        </div>
      )}
    </>
  );
}

function Waiting({ mine, theirs, partner }: { mine: LimitPerson; theirs: LimitPerson | undefined; partner: Member }) {
  const navigate = useNavigate();
  return (
    <Empty
      icon="visibility_off"
      title="Shown once you've both finished"
      body={
        theirs?.finishedAt
          ? `${partner.displayName} has finished. Yours are next.`
          : mine.finishedAt
            ? `You've finished. ${partner.displayName} has rated ${theirs?.rated ?? 0} so far.`
            : `Neither of you sees the other's answers until you've both finished, so nobody answers to match.`
      }
      action={!mine.finishedAt && <Button onClick={() => navigate({ to: "/limits/edit" })}>Finish yours</Button>}
    />
  );
}

function Pills({ icon, color, title, items }: { icon: string; color: string; title: string; items: LimitItem[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-title-small text-on-surface">
        <span style={{ color }} className="inline-flex">
          <Icon name={icon} filled size={20} />
        </span>
        {title}
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((i) => (
          <span key={i.key} className="rounded-full border px-3 py-1 text-body-medium text-on-surface" style={{ borderColor: color, background: `${color}22` }}>
            {i.title}
          </span>
        ))}
      </div>
    </div>
  );
}

function Person({ list, member, person, onChart }: { list: LimitList; member: Member; person: LimitPerson; onChart(): void }) {
  const answers = person.answers ?? {};
  const pick = (r: LimitRating) => list.items.filter((i) => answers[i.key]?.rating === r);
  const notes = list.items.filter((i) => answers[i.key]?.note);
  return (
    <>
      <div className="flex flex-col gap-4 rounded-xl bg-surface-container-low p-4">
        <div className="flex items-center gap-3">
          <Avatar userId={member.userId} name={member.displayName} version={member.avatarVersion} size={48} />
          <div>
            <div className="text-title-large text-on-surface">{member.displayName}</div>
            <div className="text-body-medium text-on-surface-variant">
              {[
                ROLE_LABEL[member.role],
                person.updatedAt ? `updated ${fmtDate(localDateOf(new Date(person.updatedAt)), { month: "short", day: "numeric" })}` : "nothing rated yet",
              ].join(" · ")}
            </div>
          </div>
        </div>
        <Pills icon="block" color={ratingOf("hard").color} title="Hard limits" items={pick("hard")} />
        <Pills icon="do_not_disturb_on" color={ratingOf("soft").color} title="Soft limits, go slow" items={pick("soft")} />
        <Pills icon="favorite" color={ratingOf("love").color} title="Loves" items={pick("love")} />
      </div>
      <div className="flex flex-col gap-3 rounded-xl bg-surface-container-low p-4">
        <div className="flex items-center">
          <div className="flex-1 text-title-medium text-on-surface">Everything</div>
          <Button variant="text" onClick={onChart}>
            Chart view
          </Button>
        </div>
        <Legend />
        {byCategory(list.items).map(([category, items]) => {
          const rated = items.filter((i) => answers[i.key]?.rating);
          if (!rated.length) return null;
          return (
            <div key={category}>
              <div className="mt-2 mb-1 text-label-large tracking-wide text-on-surface-variant uppercase">{category}</div>
              <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {rated.map((i) => (
                  <div key={i.key} className="flex items-center gap-2 text-body-medium text-on-surface">
                    <Dot rating={answers[i.key]!.rating} />
                    {i.title}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {notes.length > 0 && <Notes list={notes} rows={notes.map((i) => ({ item: i, who: null, note: answers[i.key]!.note }))} />}
      </div>
    </>
  );
}

function Notes({ rows }: { list: LimitItem[]; rows: { item: LimitItem; who: string | null; note: string }[] }) {
  return (
    <div className="mt-2 flex flex-col gap-1">
      <div className="text-label-large tracking-wide text-on-surface-variant uppercase">Notes</div>
      {rows.map((r) => (
        <p key={`${r.item.key}-${r.who}`} className="text-body-medium text-on-surface">
          <span className="font-medium">{r.item.title}</span>
          {r.who ? ` · ${r.who}` : ""}: “{r.note}”
        </p>
      ))}
    </div>
  );
}

function Together({
  list,
  a,
  b,
  answersA,
  answersB,
  onChart,
}: {
  list: LimitList;
  a: Member;
  b: Member;
  answersA: Record<string, LimitAnswer>;
  answersB: Record<string, LimitAnswer>;
  onChart(): void;
}) {
  const { off, want, talk } = useMemo(() => together(list.items, answersA, answersB), [list.items, answersA, answersB]);
  const row = (i: LimitItem, side?: ReactNode) => (
    <div key={i.key} className="flex min-h-12 items-center gap-3 bg-surface-container-low px-4 py-2">
      <span className="flex gap-1">
        <Dot rating={answersA[i.key]?.rating} size={14} />
        <Dot rating={answersB[i.key]?.rating} size={14} />
      </span>
      <span className="min-w-0 flex-1 text-body-large text-on-surface">{i.title}</span>
      {side && <span className="text-body-small text-on-surface-variant">{side}</span>}
    </div>
  );
  const group = (title: string, tone: string, items: LimitItem[], side: (i: LimitItem) => ReactNode, empty: string) => (
    <section>
      <h2 className={cx("mb-2 text-title-small", tone)}>{title}</h2>
      {items.length ? (
        <div className="flex flex-col gap-0.5 overflow-hidden rounded-lg">{items.map((i) => row(i, side(i)))}</div>
      ) : (
        <p className="text-body-medium text-on-surface-variant">{empty}</p>
      )}
    </section>
  );
  const hardBy = (i: LimitItem) =>
    [answersA[i.key]?.rating === "hard" ? a.displayName : null, answersB[i.key]?.rating === "hard" ? b.displayName : null].filter(Boolean).join(" and ");
  const why = (i: LimitItem) => {
    const ra = answersA[i.key]?.rating;
    const rb = answersB[i.key]?.rating;
    if (ra === "soft" || rb === "soft") return "Go slow";
    if (ra === "curious" && rb !== "curious") return `${a.displayName}'s curious`;
    if (rb === "curious" && ra !== "curious") return `${b.displayName}'s curious`;
    return "Both curious";
  };
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-body-medium text-on-surface-variant">
          Left dot {a.displayName}, right dot {b.displayName}.
        </p>
        <Button variant="text" onClick={onChart}>
          Chart view
        </Button>
      </div>
      {group("Off the table", "text-error", off, hardBy, "Neither of you marked a hard limit.")}
      {group("You both want", "text-[#2E7D5B]", want, () => null, "Nothing you both love or like yet.")}
      {group("Worth talking about", "text-[#A77A00]", talk, why, "Nothing in between.")}
    </div>
  );
}

/** The KinkList-style chart: a column of dots for each person, by category. */
function Chart({ list, people, onClose }: { list: LimitList; people: Member[]; onClose(): void }) {
  const snack = useSnackbar();
  const answersOf = (m: Member) => list.people.find((p) => p.userId === m.userId)?.answers ?? {};
  const notes = people.flatMap((m) =>
    list.items.filter((i) => answersOf(m)[i.key]?.note).map((i) => ({ item: i, who: people.length > 1 ? m.displayName : null, note: answersOf(m)[i.key]!.note })),
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <IconButton icon="arrow_back" label="Back" onClick={onClose} />
        <Legend className="flex-1" />
        <Button variant="tonal" icon="download" onClick={() => void saveImage(list, people, snack)}>
          Save as image
        </Button>
      </div>
      <div className="gap-4 md:columns-2 xl:columns-3">
        {byCategory(list.items).map(([category, items]) => {
          const shown = items.filter((i) => people.some((m) => answersOf(m)[i.key]?.rating));
          if (!shown.length) return null;
          return (
            <div key={category} className="mb-4 break-inside-avoid rounded-xl bg-surface-container-low p-4">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex-1 text-title-medium text-on-surface">{category}</div>
                {people.map((m) => (
                  <span key={m.userId} className="w-6 text-center text-label-medium text-on-surface-variant">
                    {m.displayName.charAt(0).toUpperCase()}
                  </span>
                ))}
              </div>
              {shown.map((i) => (
                <div key={i.key} className="flex items-center gap-2 py-1">
                  <span className="min-w-0 flex-1 truncate text-body-medium text-on-surface">{i.title}</span>
                  {people.map((m) => (
                    <span key={m.userId} className="flex w-6 justify-center">
                      <Dot rating={answersOf(m)[i.key]?.rating} size={14} />
                    </span>
                  ))}
                </div>
              ))}
            </div>
          );
        })}
        {notes.length > 0 && (
          <div className="mb-4 break-inside-avoid rounded-xl bg-surface-container p-4">
            <Notes list={[]} rows={notes} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Filling in your own answers, one category at a time. */
export function LimitsEditPage() {
  const { rel, me, partners } = useRel();
  const list = useLimitList(rel.id);
  const answer = useAnswerLimit(rel.id, me.user.id);
  const finish = useFinishLimits(rel.id);
  const remove = useRemoveLimitItem(rel.id);
  const snack = useSnackbar();
  const navigate = useNavigate();
  const back = useBack(() => navigate({ to: "/limits" }));
  const [page, setPage] = useState(0);
  const [noting, setNoting] = useState<LimitItem | null>(null);
  const [adding, setAdding] = useState(false);
  const self = rel.members.find((m) => m.userId === me.user.id)!;
  const partner = partners[0];

  if (list.isLoading) return <Loading />;
  if (list.error || !list.data) return <ErrorBox error={list.error} onRetry={() => list.refetch()} />;
  const data = list.data;
  const mine = data.people.find((p) => p.userId === me.user.id)!;
  const answers = mine.answers ?? {};
  const groups = byCategory(data.items);
  const at = Math.min(page, groups.length - 1);
  const [category, items] = groups[at]!;
  const set = (i: LimitItem, rating: LimitRating | null, note = answers[i.key]?.note ?? "") =>
    answer.mutate({ itemKey: i.key, rating, note }, { onError: (e) => snack(errorMessage(e)) });
  const done = () => {
    if (mine.finishedAt) return back();
    finish.mutate(undefined, {
      onSuccess: () => {
        snack(partner ? `Finished. ${partner.displayName} sees yours once they've finished too.` : "Finished");
        navigate({ to: "/limits" });
      },
      onError: (e) => snack(errorMessage(e)),
    });
  };
  const go = (n: number) => {
    setPage(n);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 bg-surface">
        <div className="flex items-center gap-2 px-2 py-2 md:px-4">
          <IconButton icon="close" label="Close" onClick={back} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-title-large text-on-surface">Your limits</h1>
            <div className="text-body-medium text-on-surface-variant">
              For you as the {ROLE_LABEL[self.role]} · {mine.rated} of {data.items.length}
            </div>
          </div>
          <Button variant="text" busy={finish.isPending} onClick={done}>
            {mine.finishedAt ? "Done" : "Finish"}
          </Button>
        </div>
        <div className="mx-4 h-1.5 overflow-hidden rounded-full bg-surface-container-highest md:mx-6">
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(mine.rated / Math.max(1, data.items.length)) * 100}%` }} />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pt-4 pb-6 md:px-6">
        <div className="flex flex-col gap-2 rounded-xl bg-surface-container-low p-4">
          <Legend />
          <p className="text-body-medium text-on-surface-variant">
            Tap one for each, and tap it again to clear it. Skip anything you'd rather not say.
            {partner ? ` ${partner.displayName} sees your answers once you've both finished.` : ""}
          </p>
        </div>
        <div className="flex items-baseline">
          <h2 className="flex-1 text-headline-small text-on-surface">{category}</h2>
          <span className="text-body-medium text-on-surface-variant">
            {items.filter((i) => answers[i.key]?.rating).length} of {items.length}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 overflow-hidden rounded-xl">
          {items.map((i) => {
            const mineNow = answers[i.key];
            return (
              <div key={i.key} className="flex flex-col gap-2 bg-surface-container-low px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 text-body-large text-on-surface">{i.title}</span>
                  <IconButton icon="edit_note" label={`Note on “${i.title}”`} onClick={() => setNoting(i)} className={mineNow?.note ? "text-primary" : "text-on-surface-variant"} />
                  {i.custom && i.createdBy === me.user.id && (
                    <IconButton
                      icon="delete"
                      label={`Remove “${i.title}”`}
                      onClick={() => remove.mutate(i.key, { onSuccess: () => snack(`Removed “${i.title}”`), onError: (e) => snack(errorMessage(e)) })}
                    />
                  )}
                </div>
                <div role="radiogroup" aria-label={i.title} className="flex gap-2">
                  {RATINGS.map((r) => {
                    const on = mineNow?.rating === r.value;
                    return (
                      <button
                        key={r.value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={r.label}
                        title={r.label}
                        onClick={() => set(i, on ? null : r.value)}
                        className="flex size-11 items-center justify-center rounded-full"
                      >
                        <span
                          className={cx("block size-8 rounded-[10px] border-[3px] transition-transform", on && "scale-110 outline-2 outline-offset-2")}
                          style={{ borderColor: r.color, background: on ? r.color : "transparent", outlineColor: r.color, opacity: on ? 1 : 0.7 }}
                        />
                      </button>
                    );
                  })}
                </div>
                {mineNow?.note && <p className="text-body-medium text-on-surface-variant italic">“{mineNow.note}”</p>}
              </div>
            );
          })}
        </div>
        <div>
          <Button variant="text" icon="add" onClick={() => setAdding(true)}>
            Add your own
          </Button>
        </div>
      </div>

      <footer className="sticky bottom-0 flex gap-3 bg-surface-container px-4 py-3 md:px-6">
        <Button variant="outlined" icon="arrow_back" className="flex-1" disabled={at === 0} onClick={() => go(at - 1)}>
          {at > 0 ? groups[at - 1]![0] : "Back"}
        </Button>
        {at < groups.length - 1 ? (
          <Button className="flex-1" onClick={() => go(at + 1)}>
            {groups[at + 1]![0]}
            <Icon name="arrow_forward" size={18} />
          </Button>
        ) : (
          <Button className="flex-1" icon="check" busy={finish.isPending} onClick={done}>
            {mine.finishedAt ? "Done" : "Finish"}
          </Button>
        )}
      </footer>

      {noting && (
        <NoteDialog item={noting} answer={answers[noting.key]} onClose={() => setNoting(null)} onSave={(note) => set(noting, answers[noting.key]?.rating ?? null, note)} />
      )}
      {adding && (
        <AddDialog
          category={category}
          onClose={() => setAdding(false)}
          onAdded={(c) => {
            const n = groups.findIndex(([g]) => g === c);
            setPage(n >= 0 ? n : groups.length);
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

function AddDialog({ category, onClose, onAdded }: { category: string; onClose(): void; onAdded(category: string): void }) {
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
                    onAdded(item.category);
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
