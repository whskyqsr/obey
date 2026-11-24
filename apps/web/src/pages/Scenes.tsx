import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { AFTERCARE } from "@obey/contracts";
import {
  useAddSceneComment,
  useAftercarePlans,
  useDeleteScene,
  useDeleteSceneComment,
  useSaveAftercarePlan,
  useSaveScene,
  useScene,
  useSceneCheck,
  useSceneComments,
  useScenes,
  useShareSide,
} from "../api/hooks";
import { errorMessage } from "../api/client";
import { useOpenOnNew } from "../lib/newParam";
import type { AftercarePlan, Scene, SceneSide } from "../api/types";
import { CommentThread } from "../components/Comments";
import { MOOD_LABELS, MoodPicker } from "../components/Mood";
import { BackLink, Button, Chip, ErrorBox, Fab, Icon, Loading, OverflowMenu, PageHeader, SubHeader, TextArea, TextField, useSnackbar } from "../components/ui";
import { fmtDate, fmtDateTime, fromLocalInput, localDateOf, toLocalInput, today } from "../lib/dates";
import { useReadOnly, useRel } from "../lib/relationship";
import { useBack } from "../lib/useBack";
import { useConfirm } from "../lib/useConfirm";

type Safeword = Scene["safeword"];

const sceneName = (s: Scene) => s.title || "Untitled";
const feeling = (mood: number) => `feeling ${MOOD_LABELS[mood - 1]!.toLowerCase()}`;
/** "Nov 19", with the year only when it isn't this one. */
const shortDay = (iso: string) => {
  const d = localDateOf(new Date(iso));
  return fmtDate(d, d.slice(0, 4) === today().slice(0, 4) ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
};
const safewordLine = (w: Safeword) => (w === "none" ? "no safeword used" : `${w} called`);

/** "Yellow called" / "Red called", or nothing: in the accent, as text. */
export function SafewordBadge({ safeword }: { safeword: Safeword }) {
  if (safeword === "none") return null;
  return <span className="text-label-large text-primary">{safeword === "red" ? "Red" : "Yellow"} called</span>;
}

/** Mockup 77: your aftercare plan at the top, then each scene on a hairline. */
export function ScenesPage() {
  const { rel, me, partners, memberName } = useRel();
  const readOnly = useReadOnly();
  const scenes = useScenes(rel.id);
  const plans = useAftercarePlans(rel.id);
  const [logging, setLogging] = useState(false);
  const [editingPlan, setEditingPlan] = useState<AftercarePlan | null>(null);
  useOpenOnNew(() => setLogging(true), !readOnly);
  const mine = plans.data?.find((p) => p.userId === me.user.id);
  const others = (plans.data ?? []).filter((p) => p.userId !== me.user.id);
  const names = partners.map((p) => p.displayName).join(" and ");
  return (
    <>
      <PageHeader title="Scenes" subtitle="Only your dynamic sees these." />
      <div className="flex max-w-3xl flex-col gap-6 px-4 pb-28 md:px-6">
        {mine && (
          <section className="rounded-lg border border-outline-variant bg-surface-container-lowest p-6">
            <h2 className="eyebrow">Your aftercare plan</h2>
            <PlanText plan={mine} empty="Not written yet." />
            {!readOnly && (
              <button type="button" onClick={() => setEditingPlan(mine)} className="mt-2 text-left text-body-large text-primary">
                {mine.updatedAt ? "Edit" : "Write yours"}
                {names && ` · ${names} ${partners.length === 1 ? "sees" : "see"} this after each scene`}
              </button>
            )}
          </section>
        )}
        {others.some((p) => p.needs.length || p.note) && (
          <Link to="/aftercare" className="-mt-2 text-body-large text-on-surface-variant">
            {others.map((p) => `${memberName(p.userId)}'s aftercare plan`).join(" · ")} ›
          </Link>
        )}
        {scenes.isLoading && <Loading />}
        {scenes.error && <ErrorBox error={scenes.error} onRetry={() => scenes.refetch()} />}
        {scenes.data && scenes.data.length > 0 && (
          <div className="divide-y divide-outline-variant">
            {scenes.data.map((s) => (
              <SceneRow key={s.id} s={s} />
            ))}
          </div>
        )}
        {scenes.data?.length === 0 && <p className="text-body-large text-on-surface-variant">No scenes yet.</p>}
      </div>
      {!readOnly && <Fab icon="add" label="Log a scene" onClick={() => setLogging(true)} />}
      {logging && <SceneDialog onClose={() => setLogging(false)} />}
      {editingPlan && <PlanDialog plan={editingPlan} onClose={() => setEditingPlan(null)} />}
    </>
  );
}

/** A plan's needs joined by middots, then its note. */
function PlanText({ plan, empty }: { plan: AftercarePlan; empty: string }) {
  if (!plan.needs.length && !plan.note) return <p className="mt-2 text-body-large text-on-surface-variant">{empty}</p>;
  return (
    <div className="mt-2 text-body-large text-on-surface">
      {plan.needs.length > 0 && <p>{plan.needs.map((n) => n.charAt(0).toUpperCase() + n.slice(1)).join(" · ")}</p>}
      {plan.note && <p className="mt-1 whitespace-pre-wrap">{plan.note}</p>}
    </div>
  );
}

function SceneRow({ s }: { s: Scene }) {
  const { me } = useRel();
  const mineShared = s.shared.includes(me.user.id);
  const all = s.shared.length >= 2 && mineShared;
  const line = [
    shortDay(s.occurredAt),
    s.safeword !== "none" ? safewordLine(s.safeword) : null,
    all ? "both sides shared" : mineShared ? "waiting on theirs" : "your side missing",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link to="/scenes/$sceneId" params={{ sceneId: s.id }} className="state-layer flex flex-col gap-1 py-5">
      <span className="font-serif text-[30px] leading-9 text-on-surface">{sceneName(s)}</span>
      <span className="text-body-large text-on-surface-variant">{line}</span>
    </Link>
  );
}

/** Aftercare to pick from: the usual ones plus anything already chosen, and "Other" for the rest. */
function AftercarePicker({ value, onChange }: { value: string[]; onChange(v: string[]): void }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const options = [...AFTERCARE, ...value.filter((v) => !(AFTERCARE as readonly string[]).includes(v))];
  const toggle = (a: string) => onChange(value.includes(a) ? value.filter((x) => x !== a) : [...value, a]);
  const add = () => {
    const t = text.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setText("");
    setAdding(false);
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {options.map((a) => (
          <Chip key={a} plain selected={value.includes(a)} onClick={() => toggle(a)} className="h-10 px-5 text-body-large">
            {a.charAt(0).toUpperCase() + a.slice(1)}
          </Chip>
        ))}
        {!adding && (
          <Chip plain onClick={() => setAdding(true)} className="h-10 px-5 text-body-large">
            + Other
          </Chip>
        )}
      </div>
      {adding && (
        <div className="flex items-center gap-2">
          <TextField
            label="Other"
            value={text}
            maxLength={60}
            autoFocus
            className="flex-1"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.preventDefault(), add());
            }}
          />
          <Button variant="text" onClick={add}>
            Add
          </Button>
        </div>
      )}
    </div>
  );
}

/** A full-screen form with "Cancel · title · Save" across the top, as in mockup 76. */
function FormSheet({
  title,
  onClose,
  onSave,
  saving,
  canSave,
  children,
}: {
  title: string;
  onClose(): void;
  onSave(): void;
  saving: boolean;
  canSave: boolean;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-surface" role="dialog" aria-modal aria-label={title}>
      <div className="mx-auto flex w-full max-w-xl flex-col px-4 pb-10 md:px-6">
        <div className="sticky top-0 z-10 grid h-16 grid-cols-[1fr_auto_1fr] items-center bg-surface">
          <button type="button" onClick={onClose} className="justify-self-start text-body-large text-on-surface-variant">
            Cancel
          </button>
          <h1 className="text-title-medium text-on-surface">{title}</h1>
          <button type="button" disabled={!canSave || saving} onClick={onSave} className="justify-self-end text-body-large text-primary disabled:opacity-40">
            Save
          </button>
        </div>
        <div className="flex flex-col gap-6">{children}</div>
      </div>
    </div>
  );
}

/** Logging a scene, or changing one. Kept short: only when is needed. */
function SceneDialog({ scene, onClose }: { scene?: Scene; onClose(): void }) {
  const { rel, me, partners } = useRel();
  const snack = useSnackbar();
  const save = useSaveScene(rel.id);
  const navigate = useNavigate();
  const [title, setTitle] = useState(scene?.title ?? "");
  const [at, setAt] = useState(toLocalInput(scene?.occurredAt ?? new Date().toISOString()));
  const [what, setWhat] = useState(scene?.what ?? "");
  const [safeword, setSafeword] = useState<Safeword>(scene?.safeword ?? "none");
  const [aftercare, setAftercare] = useState<string[]>(scene?.aftercare ?? []);
  const others = partners.filter((p) => p.userId !== me.user.id).map((p) => p.displayName);
  const submit = () =>
    save.mutate(
      {
        id: scene?.id,
        body: {
          title: title.trim(),
          occurredAt: fromLocalInput(at),
          timezone: scene?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
          what: what.trim(),
          safeword,
          aftercare,
        },
      },
      {
        onSuccess: (s) => {
          onClose();
          if (!scene) navigate({ to: "/scenes/$sceneId", params: { sceneId: s.id } });
        },
        onError: (e) => snack(errorMessage(e)),
      },
    );
  return (
    <FormSheet title={scene ? "Edit scene" : "Log a scene"} onClose={onClose} onSave={submit} saving={save.isPending} canSave={!!at}>
      <TextField label="Name (optional)" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      <TextField type="datetime-local" label="When" value={at} onChange={(e) => setAt(e.target.value)} />
      <TextArea label="What we did (optional)" value={what} maxLength={4000} rows={2} onChange={(e) => setWhat(e.target.value)} />
      <div className="flex flex-col gap-2">
        <span className="text-body-medium text-on-surface-variant">Safeword</span>
        <div role="radiogroup" aria-label="Safeword" className="flex flex-wrap gap-2">
          {(["none", "yellow", "red"] as const).map((w) => (
            <Chip key={w} plain selected={safeword === w} onClick={() => setSafeword(w)} className="h-10 px-5 text-body-large">
              {w === "none" ? "None" : w === "yellow" ? "Yellow" : "Red"}
            </Chip>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-body-medium text-on-surface-variant">Aftercare given</span>
        <AftercarePicker value={aftercare} onChange={setAftercare} />
      </div>
      {!scene && others.length > 0 && (
        <p className="text-body-large text-on-surface-variant">
          Next, each of you writes your own side. You won't see {others.join(" and ")}'s until you share yours. The next morning you'll each be asked how you
          feel.
        </p>
      )}
    </FormSheet>
  );
}

/** Mockup 21: the scene, your side, the others' (hidden until you share yours) and the morning after. */
export function ScenePage({ sceneId }: { sceneId: string }) {
  const { rel, me, memberName } = useRel();
  const readOnly = useReadOnly();
  const q = useScene(rel.id, sceneId);
  const navigate = useNavigate();
  const back = useBack(() => navigate({ to: "/scenes" }));
  const snack = useSnackbar();
  const del = useDeleteScene(rel.id);
  const [confirm, confirmEl] = useConfirm();
  const [editing, setEditing] = useState(false);
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const s = q.data;
  const mine = s.sides.find((x) => x.userId === me.user.id);
  const others = rel.members.filter((m) => m.userId !== me.user.id);
  const checkOpen = Date.now() >= Date.parse(s.checkFrom);
  const day = fmtDate(localDateOf(new Date(s.occurredAt)), { weekday: "long", month: "short", day: "numeric" });
  const toForm = () => document.getElementById("your-side")?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <div className="flex max-w-3xl flex-col px-4 pt-3 pb-12 md:px-6 md:pt-6">
      <div className="-mx-2 flex items-center">
        <div className="min-w-0 flex-1">
          <BackLink label="Scenes" onClick={back} />
        </div>
        {!readOnly && (
          <OverflowMenu
            items={[
              { label: "Edit", icon: "edit", onClick: () => setEditing(true) },
              ...(s.loggedBy === me.user.id
                ? [
                    {
                      label: "Delete",
                      icon: "delete",
                      danger: true,
                      onClick: () =>
                        confirm(
                          `Delete “${sceneName(s)}”?`,
                          () => del.mutate(s.id, { onSuccess: () => navigate({ to: "/scenes" }), onError: (e) => snack(errorMessage(e)) }),
                          "Both sides, the check-ins and comments go with it.",
                        ),
                    },
                  ]
                : []),
            ]}
          />
        )}
      </div>
      <div className="eyebrow mt-3">
        {day} · {safewordLine(s.safeword)}
      </div>
      <h1 className="mt-2 font-serif text-[56px] leading-[60px] break-words text-on-surface">{sceneName(s)}</h1>
      {s.aftercare.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {s.aftercare.map((a, i) => (
            <Chip key={a} className="h-10 px-5 text-body-large">
              {i === 0 ? `Aftercare: ${a}` : a}
            </Chip>
          ))}
        </div>
      )}
      {s.what && <p className="mt-5 text-body-large whitespace-pre-wrap text-on-surface-variant">{s.what}</p>}
      <div className="mt-8 flex flex-col gap-8">
        {mine ? <SideView side={mine} /> : !readOnly && <YourSide s={s} />}
        {others.map((m) => {
          const side = s.sides.find((x) => x.userId === m.userId);
          if (side) return <SideView key={m.userId} side={side} />;
          if (s.shared.includes(m.userId))
            return (
              <section
                key={m.userId}
                className="flex flex-col items-center gap-2 rounded-lg border border-outline-variant bg-surface-container px-6 py-8 text-center"
              >
                <Icon name="visibility_off" className="text-on-surface-variant" />
                <h2 className="font-serif text-[28px] leading-9 text-on-surface">{m.displayName}'s side is hidden</h2>
                <p className="text-body-large text-on-surface-variant">{m.displayName} has written it. You'll both see each other's once you share yours.</p>
                {!readOnly && (
                  <Button className="mt-2" onClick={toForm}>
                    Share my side
                  </Button>
                )}
              </section>
            );
          return (
            <p key={m.userId} className="text-body-large text-on-surface-variant">
              {memberName(m.userId)} hasn't written their side yet.
            </p>
          );
        })}
        {(checkOpen || s.checks.length > 0) && <NextDay s={s} />}
        <SceneComments sceneId={s.id} />
      </div>
      {editing && <SceneDialog scene={s} onClose={() => setEditing(false)} />}
      {confirmEl}
    </div>
  );
}

/** Written alone and shared once; the others' sides open up then. */
function YourSide({ s }: { s: Scene }) {
  const { rel, me, partners } = useRel();
  const snack = useSnackbar();
  const share = useShareSide(rel.id);
  const [mood, setMood] = useState<number | null>(null);
  const [worked, setWorked] = useState("");
  const [change, setChange] = useState("");
  const [need, setNeed] = useState("");
  const to = partners
    .filter((p) => p.userId !== me.user.id)
    .map((p) => p.displayName)
    .join(" and ");
  return (
    <section id="your-side" className="flex scroll-mt-4 flex-col gap-4" aria-label="Your side">
      <h2 className="eyebrow">Your side</h2>
      <MoodPicker value={mood} onChange={setMood} />
      <TextArea label="What worked" value={worked} maxLength={2000} rows={2} onChange={(e) => setWorked(e.target.value)} />
      <TextArea label="What to change next time" value={change} maxLength={2000} rows={2} onChange={(e) => setChange(e.target.value)} />
      <TextArea label="Anything you still need (optional)" value={need} maxLength={2000} rows={2} onChange={(e) => setNeed(e.target.value)} />
      <div>
        <Button
          busy={share.isPending}
          disabled={mood === null}
          onClick={() =>
            mood &&
            share.mutate(
              { id: s.id, body: { mood, worked: worked.trim(), change: change.trim(), need: need.trim() } },
              { onError: (e) => snack(errorMessage(e)) },
            )
          }
        >
          {to ? `Share with ${to}` : "Save"}
        </Button>
      </div>
    </section>
  );
}

/** A side as the mockup shows it: an eyebrow with the mood, then the words in the serif. */
function SideView({ side }: { side: SceneSide }) {
  const { me, memberName } = useRel();
  const who = side.userId === me.user.id ? "Your side" : `${memberName(side.userId)}'s side`;
  const rows: [string | null, string][] = [
    [null, side.worked],
    ["Next time", side.change],
    ["Still needs", side.need],
  ];
  return (
    <section className="flex flex-col gap-3">
      <h2 className="eyebrow">
        {who} · {feeling(side.mood)}
      </h2>
      {rows
        .filter(([, text]) => text)
        .map(([label, text]) => (
          <div key={label ?? "worked"}>
            {label && <div className="text-body-medium text-on-surface-variant">{label}</div>}
            <p className="font-serif text-[26px] leading-9 whitespace-pre-wrap text-on-surface">{text}</p>
          </div>
        ))}
    </section>
  );
}

/** The morning-after check-ins on hairlines, and mine to give once it opens. */
function NextDay({ s }: { s: Scene }) {
  const { rel, me, memberName } = useRel();
  const readOnly = useReadOnly();
  return (
    <section className="flex flex-col">
      <h2 className="eyebrow">The morning after</h2>
      <div className="mt-2 divide-y divide-outline-variant">
        {rel.members.map((m) => {
          const c = s.checks.find((x) => x.userId === m.userId);
          if (c)
            return (
              <div key={m.userId} className="py-3">
                <div className="text-body-large text-on-surface">
                  {m.userId === me.user.id ? "You" : memberName(m.userId)} · {feeling(c.mood)}
                </div>
                {c.note && <div className="text-body-medium text-on-surface-variant">“{c.note}”</div>}
              </div>
            );
          if (m.userId === me.user.id && !readOnly && Date.now() >= Date.parse(s.checkFrom))
            return (
              <div key={m.userId} className="py-3">
                <CheckIn s={s} />
              </div>
            );
          return (
            <p key={m.userId} className="py-3 text-body-large text-on-surface-variant">
              {m.userId === me.user.id ? "You haven't answered yet" : `${memberName(m.userId)} hasn't answered yet`}
            </p>
          );
        })}
      </div>
    </section>
  );
}

/** "How are you feeling after last night?": a mood, and a note if you like. Used here and on Today. */
export function CheckIn({ s, onDone }: { s: Scene; onDone?(): void }) {
  const { rel } = useRel();
  const snack = useSnackbar();
  const check = useSceneCheck(rel.id);
  const [mood, setMood] = useState<number | null>(null);
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-col gap-4">
      <MoodPicker value={mood} onChange={setMood} />
      <TextField label="Anything you still need? (optional)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      <div>
        <Button
          busy={check.isPending}
          disabled={mood === null}
          onClick={() =>
            mood !== null &&
            check.mutate(
              { id: s.id, mood, note: note.trim() },
              { onSuccess: () => (snack("Saved with the scene"), onDone?.()), onError: (e) => snack(errorMessage(e)) },
            )
          }
        >
          Send
        </Button>
      </div>
    </div>
  );
}

export function SceneComments({ sceneId }: { sceneId: string }) {
  const { rel } = useRel();
  const snack = useSnackbar();
  const comments = useSceneComments(rel.id, sceneId);
  const add = useAddSceneComment(rel.id);
  const del = useDeleteSceneComment(rel.id);
  const list = comments.data ?? [];
  return (
    <section className="flex flex-col gap-3" aria-label="Comments">
      <h2 className="eyebrow">Comments{list.length > 0 && ` · ${list.length}`}</h2>
      <CommentThread
        list={list}
        open
        adding={add.isPending}
        onAdd={(body, done) => add.mutate({ sceneId, body }, { onSuccess: done, onError: (e) => snack(errorMessage(e)) })}
        onDelete={(c) => del.mutate(c, { onError: (e) => snack(errorMessage(e)) })}
      />
    </section>
  );
}

/** What each person needs afterwards, on hairlines; everyone edits only their own. */
export function AftercarePage() {
  const { rel, me, memberName } = useRel();
  const readOnly = useReadOnly();
  const plans = useAftercarePlans(rel.id);
  const navigate = useNavigate();
  const back = useBack(() => navigate({ to: "/scenes" }));
  const [editing, setEditing] = useState<AftercarePlan | null>(null);
  const list = [...(plans.data ?? [])].sort((a, b) => Number(b.userId === me.user.id) - Number(a.userId === me.user.id));
  return (
    <div className="flex flex-col">
      <SubHeader title="Aftercare" back="Scenes" onBack={back} />
      <div className="flex max-w-3xl flex-col gap-8 px-4 pb-10 md:px-6">
        {plans.isLoading && <Loading />}
        {plans.error && <ErrorBox error={plans.error} onRetry={() => plans.refetch()} />}
        {list.map((p) => {
          const isMe = p.userId === me.user.id;
          return (
            <section key={p.userId} className="border-b border-outline-variant pb-6">
              <h2 className="eyebrow">{isMe ? "Your aftercare plan" : `${memberName(p.userId)}'s aftercare plan`}</h2>
              <PlanText plan={p} empty={isMe ? "You haven't written yours yet." : "Not written yet."} />
              {p.updatedAt && <p className="mt-2 text-body-medium text-on-surface-variant">Updated {fmtDateTime(p.updatedAt)}</p>}
              {isMe && !readOnly && (
                <button type="button" onClick={() => setEditing(p)} className="mt-2 text-label-large text-primary">
                  {p.updatedAt ? "Edit" : "Write yours"}
                </button>
              )}
            </section>
          );
        })}
      </div>
      {editing && <PlanDialog plan={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PlanDialog({ plan, onClose }: { plan: AftercarePlan; onClose(): void }) {
  const { rel } = useRel();
  const snack = useSnackbar();
  const save = useSaveAftercarePlan(rel.id);
  const [needs, setNeeds] = useState(plan.needs);
  const [note, setNote] = useState(plan.note);
  return (
    <FormSheet
      title="Your aftercare"
      onClose={onClose}
      saving={save.isPending}
      canSave
      onSave={() => save.mutate({ needs, note: note.trim() }, { onSuccess: onClose, onError: (e) => snack(errorMessage(e)) })}
    >
      <div className="flex flex-col gap-2">
        <span className="text-body-medium text-on-surface-variant">What you need afterwards</span>
        <AftercarePicker value={needs} onChange={setNeeds} />
      </div>
      <TextArea label="Anything else (optional)" value={note} maxLength={1000} rows={3} onChange={(e) => setNote(e.target.value)} />
    </FormSheet>
  );
}
