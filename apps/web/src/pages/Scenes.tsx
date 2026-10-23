import { useState } from "react";
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
import type { AftercarePlan, Scene, SceneSide } from "../api/types";
import { Avatar } from "../components/Avatar";
import { CommentThread } from "../components/Comments";
import { MOOD_LABELS, MOODS, MoodPicker } from "../components/Mood";
import { Button, Chip, Dialog, Empty, ErrorBox, Fab, Icon, IconButton, Loading, PageHeader, SegmentedButtons, TextArea, TextField, cx, useSnackbar } from "../components/ui";
import { fmtDateTime, fromLocalInput, toLocalInput } from "../lib/dates";
import { useReadOnly, useRel } from "../lib/relationship";
import { useBack } from "../lib/useBack";
import { useConfirm } from "../lib/useConfirm";

type Safeword = Scene["safeword"];

/** "Fri, Oct 17, 9:00 PM", in the viewer's time. */
const when = (s: Scene) => fmtDateTime(s.occurredAt);
const sceneName = (s: Scene) => s.title || "Untitled scene";

/** "Yellow called" / "Red called", or nothing. */
export function SafewordBadge({ safeword }: { safeword: Safeword }) {
  if (safeword === "none") return null;
  return (
    <span
      className={cx(
        "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-label-large",
        safeword === "red" ? "bg-error-container text-on-error-container" : "bg-tertiary-container text-on-tertiary-container",
      )}
    >
      <Icon name="health_and_safety" size={16} />
      {safeword === "red" ? "Red" : "Yellow"} called
    </span>
  );
}

function Chips({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((a) => (
        <Chip key={a}>{a}</Chip>
      ))}
    </div>
  );
}

function MoodMark({ mood, size = 18 }: { mood: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Icon name={MOODS[mood - 1]!} filled size={size} className="text-primary" />
      {MOOD_LABELS[mood - 1]}
    </span>
  );
}

function Person({ userId, size = 24 }: { userId: string; size?: number }) {
  const { rel } = useRel();
  const m = rel.members.find((x) => x.userId === userId);
  return <Avatar userId={userId} name={m?.displayName ?? "?"} version={m?.avatarVersion ?? null} size={size} />;
}

export function ScenesPage() {
  const { rel } = useRel();
  const readOnly = useReadOnly();
  const scenes = useScenes(rel.id);
  const [logging, setLogging] = useState(false);
  const navigate = useNavigate();
  return (
    <>
      <PageHeader
        title="Scenes"
        subtitle="Only your dynamic sees these"
        actions={
          <Button variant="tonal" icon="volunteer_activism" onClick={() => navigate({ to: "/aftercare" })}>
            Aftercare
          </Button>
        }
      />
      <div className="flex flex-col gap-3 px-4 pb-28 md:px-6">
        {scenes.isLoading && <Loading />}
        {scenes.error && <ErrorBox error={scenes.error} onRetry={() => scenes.refetch()} />}
        {scenes.data?.length === 0 && (
          <Empty
            icon="auto_awesome"
            title="No scenes yet"
            body="Log one afterwards: what you did, whether a safeword was called and the aftercare given. Each of you then writes how it went."
          />
        )}
        {scenes.data?.map((s) => (
          <SceneCard key={s.id} s={s} />
        ))}
      </div>
      {!readOnly && <Fab icon="add" label="Log a scene" onClick={() => setLogging(true)} />}
      {logging && <SceneDialog onClose={() => setLogging(false)} />}
    </>
  );
}

function SceneCard({ s }: { s: Scene }) {
  const { rel, me, memberName } = useRel();
  return (
    <Link to="/scenes/$sceneId" params={{ sceneId: s.id }} className="state-layer flex flex-col gap-2 rounded-lg bg-surface-container-low p-4 text-on-surface">
      <div className="flex items-center justify-between gap-2">
        <span className="text-body-medium text-on-surface-variant">{when(s)}</span>
        <SafewordBadge safeword={s.safeword} />
      </div>
      <div className="text-title-large">{sceneName(s)}</div>
      <Chips items={s.aftercare} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-medium text-on-surface-variant">
        {rel.members.map((m) => {
          const side = s.sides.find((x) => x.userId === m.userId);
          const shared = s.shared.includes(m.userId);
          return (
            <span key={m.userId} className="inline-flex items-center gap-1.5">
              <Person userId={m.userId} />
              {side ? (
                <MoodMark mood={side.mood} />
              ) : shared ? (
                <>
                  <Icon name="check_circle" filled size={18} className="text-primary" />
                  Shared
                </>
              ) : (
                <>
                  <Icon name="schedule" size={18} />
                  {m.userId === me.user.id ? "Add your side" : `${memberName(m.userId)} hasn't yet`}
                </>
              )}
            </span>
          );
        })}
      </div>
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
          <Chip key={a} selected={value.includes(a)} onClick={() => toggle(a)}>
            {a}
          </Chip>
        ))}
        {!adding && (
          <Chip icon="add" onClick={() => setAdding(true)}>
            Other
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
    <Dialog
      open
      onClose={onClose}
      icon="auto_awesome"
      title={scene ? "Edit scene" : "Log a scene"}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={save.isPending} disabled={!at} onClick={submit}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField label="Name (optional)" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        <TextField type="datetime-local" label="When" value={at} onChange={(e) => setAt(e.target.value)} />
        <TextArea label="What we did (optional)" value={what} maxLength={4000} rows={3} onChange={(e) => setWhat(e.target.value)} />
        <div className="flex flex-col gap-2">
          <span className="text-body-medium text-on-surface-variant">Safeword</span>
          <SegmentedButtons<Safeword>
            value={safeword}
            onChange={setSafeword}
            options={[
              { value: "none", label: "None" },
              { value: "yellow", label: "Yellow" },
              { value: "red", label: "Red" },
            ]}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-body-medium text-on-surface-variant">Aftercare given</span>
          <AftercarePicker value={aftercare} onChange={setAftercare} />
        </div>
        {!scene && others.length > 0 && (
          <p className="text-body-small text-on-surface-variant">
            {others.join(" and ")} {others.length === 1 ? "is" : "are"} asked to add their side. You each see the other's once you've both written.
          </p>
        )}
      </div>
    </Dialog>
  );
}

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
  const othersShared = others.filter((m) => s.shared.includes(m.userId));
  const othersWaiting = others.filter((m) => !s.shared.includes(m.userId));
  const checkOpen = Date.now() >= Date.parse(s.checkFrom);
  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-1 bg-surface px-2 md:px-4">
        <IconButton icon="arrow_back" label="Back" onClick={back} />
        <div className="flex-1" />
        {!readOnly && s.loggedBy === me.user.id && (
          <IconButton
            icon="delete"
            label="Delete"
            onClick={() =>
              confirm(
                `Delete “${sceneName(s)}”?`,
                () => del.mutate(s.id, { onSuccess: () => navigate({ to: "/scenes" }), onError: (e) => snack(errorMessage(e)) }),
                "Both sides, the check-ins and comments go with it.",
              )
            }
          />
        )}
        {!readOnly && (
          <Button variant="tonal" icon="edit" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </header>
      <div className="flex flex-col gap-4 px-4 pb-10 md:px-6">
        <div>
          <h1 className="text-headline-medium text-on-surface">{sceneName(s)}</h1>
          <div className="text-body-medium text-on-surface-variant">
            {when(s)}
            {s.loggedBy && ` · logged by ${s.loggedBy === me.user.id ? "you" : memberName(s.loggedBy)}`}
          </div>
        </div>
        {(s.safeword !== "none" || s.aftercare.length > 0 || s.what) && (
          <div className="flex flex-col gap-2 rounded-lg bg-surface-container-low p-4 text-on-surface">
            <div className="flex flex-wrap gap-2">
              <SafewordBadge safeword={s.safeword} />
              {s.aftercare.map((a) => (
                <Chip key={a}>{a}</Chip>
              ))}
            </div>
            {s.what && <p className="text-body-large whitespace-pre-wrap">{s.what}</p>}
          </div>
        )}
        {!mine && !readOnly && <YourSide s={s} />}
        {mine && <SideView side={mine} />}
        {s.sides
          .filter((x) => x.userId !== me.user.id)
          .map((x) => (
            <SideView key={x.userId} side={x} />
          ))}
        {!mine && othersShared.length > 0 && (
          <div className="flex items-center gap-3 rounded-lg bg-surface-container px-4 py-3 text-body-medium text-on-surface-variant">
            <Icon name="lock" />
            {othersShared.map((m) => m.displayName).join(" and ")} {othersShared.length === 1 ? "has" : "have"} written their side. You'll see it once you share yours.
          </div>
        )}
        {mine && othersWaiting.length > 0 && (
          <p className="text-body-medium text-on-surface-variant">Waiting for {othersWaiting.map((m) => m.displayName).join(" and ")} to share their side.</p>
        )}
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
    <section className="flex flex-col gap-3 rounded-lg bg-surface-container-low p-4" aria-label="Your side">
      <div>
        <h2 className="text-title-large text-on-surface">Your side</h2>
        <p className="text-body-medium text-on-surface-variant">How do you feel about it now?</p>
      </div>
      <MoodPicker value={mood} onChange={setMood} />
      <TextArea label="What worked" value={worked} maxLength={2000} rows={2} onChange={(e) => setWorked(e.target.value)} />
      <TextArea label="What to change next time" value={change} maxLength={2000} rows={2} onChange={(e) => setChange(e.target.value)} />
      <TextArea label="Anything you still need (optional)" value={need} maxLength={2000} rows={2} onChange={(e) => setNeed(e.target.value)} />
      <div className="flex justify-end">
        <Button
          busy={share.isPending}
          disabled={mood === null}
          onClick={() =>
            mood && share.mutate({ id: s.id, body: { mood, worked: worked.trim(), change: change.trim(), need: need.trim() } }, { onError: (e) => snack(errorMessage(e)) })
          }
        >
          {to ? `Share with ${to}` : "Save"}
        </Button>
      </div>
    </section>
  );
}

function SideView({ side }: { side: SceneSide }) {
  const { me, memberName } = useRel();
  const rows: [string, string][] = [
    ["What worked", side.worked],
    ["Next time", side.change],
    ["Still needs", side.need],
  ];
  return (
    <section className="flex flex-col gap-2 rounded-lg bg-surface-container-low p-4 text-on-surface">
      <div className="flex items-center gap-2">
        <Person userId={side.userId} size={28} />
        <span className="text-title-medium">{side.userId === me.user.id ? "You" : memberName(side.userId)}</span>
        <span className="text-body-medium text-on-surface-variant">
          <MoodMark mood={side.mood} size={20} />
        </span>
      </div>
      {rows
        .filter(([, text]) => text)
        .map(([label, text]) => (
          <div key={label}>
            <div className="text-body-small text-on-surface-variant">{label}</div>
            <div className="text-body-large whitespace-pre-wrap">{text}</div>
          </div>
        ))}
    </section>
  );
}

/** The day-after check-ins, and mine to give once it opens. */
function NextDay({ s }: { s: Scene }) {
  const { me } = useRel();
  const readOnly = useReadOnly();
  const mine = s.checks.find((c) => c.userId === me.user.id);
  return (
    <section className="flex flex-col gap-2 rounded-lg bg-surface-container-low p-4 text-on-surface">
      <div className="flex items-center gap-2">
        <Icon name="wb_sunny" className="text-tertiary" />
        <span className="text-title-medium">Next day</span>
      </div>
      {s.checks.map((c) => (
        <div key={c.userId} className="flex flex-wrap items-center gap-2 text-body-medium">
          <Person userId={c.userId} />
          <MoodMark mood={c.mood} />
          {c.note && <span className="text-on-surface-variant">· “{c.note}”</span>}
        </div>
      ))}
      {!mine && !readOnly && Date.now() >= Date.parse(s.checkFrom) && (
        <>
          <p className="text-body-medium text-on-surface-variant">How are you feeling now?</p>
          <CheckIn s={s} />
        </>
      )}
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
    <div className="flex flex-col gap-2">
      <MoodPicker value={mood} onChange={setMood} />
      {mood !== null && (
        <div className="flex items-end gap-2">
          <TextField label="Anything you still need? (optional)" value={note} maxLength={500} className="flex-1" onChange={(e) => setNote(e.target.value)} />
          <Button
            busy={check.isPending}
            onClick={() =>
              check.mutate({ id: s.id, mood, note: note.trim() }, { onSuccess: () => (snack("Saved with the scene"), onDone?.()), onError: (e) => snack(errorMessage(e)) })
            }
          >
            Save
          </Button>
        </div>
      )}
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
      <h2 className="text-title-medium text-on-surface">Comments{list.length > 0 && ` · ${list.length}`}</h2>
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

/** What each person needs afterwards; everyone edits only their own. */
export function AftercarePage() {
  const { rel, me, memberName } = useRel();
  const readOnly = useReadOnly();
  const plans = useAftercarePlans(rel.id);
  const navigate = useNavigate();
  const back = useBack(() => navigate({ to: "/scenes" }));
  const [editing, setEditing] = useState<AftercarePlan | null>(null);
  const list = [...(plans.data ?? [])].sort((a, b) => Number(a.userId === me.user.id) - Number(b.userId === me.user.id));
  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-1 bg-surface px-2 md:px-4">
        <IconButton icon="arrow_back" label="Back" onClick={back} />
      </header>
      <div className="flex flex-col gap-3 px-4 pb-10 md:px-6">
        <div>
          <h1 className="text-headline-medium text-on-surface">Aftercare</h1>
          <p className="text-body-medium text-on-surface-variant">What each of you needs afterwards. It's shown to the others when a scene is logged.</p>
        </div>
        {plans.isLoading && <Loading />}
        {plans.error && <ErrorBox error={plans.error} onRetry={() => plans.refetch()} />}
        {list.map((p) => {
          const isMe = p.userId === me.user.id;
          return (
            <section key={p.userId} className="flex flex-col gap-2 rounded-lg bg-surface-container-low p-4 text-on-surface">
              <div className="flex items-center gap-2">
                <Person userId={p.userId} size={28} />
                <span className="text-title-medium">{isMe ? `${me.user.displayName} (you)` : memberName(p.userId)}</span>
              </div>
              <Chips items={p.needs} />
              {p.note && <p className="text-body-large whitespace-pre-wrap">{p.note}</p>}
              {!p.needs.length && !p.note && <p className="text-body-medium text-on-surface-variant">{isMe ? "You haven't written yours yet." : "Not written yet."}</p>}
              {p.updatedAt && (
                <span className="text-body-small text-on-surface-variant">
                  Updated {fmtDateTime(p.updatedAt)}
                  {!isMe && ` · only ${memberName(p.userId)} edits this`}
                </span>
              )}
              {isMe && !readOnly && (
                <Button variant="outlined" icon="edit" className="self-start" onClick={() => setEditing(p)}>
                  {p.updatedAt ? "Edit yours" : "Write yours"}
                </Button>
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
    <Dialog
      open
      onClose={onClose}
      icon="volunteer_activism"
      title="Your aftercare"
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={save.isPending} onClick={() => save.mutate({ needs, note: note.trim() }, { onSuccess: onClose, onError: (e) => snack(errorMessage(e)) })}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <AftercarePicker value={needs} onChange={setNeeds} />
        <TextArea label="Anything else (optional)" value={note} maxLength={1000} rows={3} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Dialog>
  );
}
