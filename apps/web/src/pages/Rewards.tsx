import { useState } from "react";
import { useAdjustPoints, useBalances, useDeleteLibraryItem, useLedger, useLibrary, useMarkRedeemed, useRedeemReward, useSaveLibraryItem } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { LedgerEntry, Reward, RewardInput } from "../api/types";
import { ItemDialog, type FieldDef } from "../components/ItemDialog";
import { Button, Diamond, Dialog, Empty, ErrorBox, Fab, IconButton, Loading, PageHeader, Section, Select, TextField, cx, useSnackbar } from "../components/ui";
import { ago, fmtDateTime, localDateOf, startOfWeek, today } from "../lib/dates";
import { useTodayOccurrences } from "../lib/today";
import { useAskWho } from "../components/CurfewStrip";
import { LOCK_TIME_OPTIONS, fmtMinutes } from "../components/Chastity";
import { RedeemedDialog } from "../components/NeedsYou";
import { OwedList, useOwed } from "../components/Owed";
import { useMediaQuery } from "../lib/useMediaQuery";
import { useRel } from "../lib/relationship";
import { useConfirm } from "../lib/useConfirm";

const REWARD_FIELDS: FieldDef[] = [
  { key: "title", label: "Reward", type: "text", required: true, max: 200 },
  { key: "bodyMd", label: "Description", type: "textarea", max: 5000 },
  { key: "cost", label: "Cost (points)", type: "number", min: 0 },
  {
    key: "letsOff",
    label: "Gets them out of a consequence",
    type: "switch",
    help: "Redeeming it means picking a consequence of theirs; it's excused when you mark the reward redeemed.",
  },
];

/** Everyone in the dynamic gets a balance, 0 until their first points; anyone else with points (say, someone who left) keeps theirs. */
function withEveryMember(balances: { userId: string; balance: number }[], members: { userId: string }[]) {
  const listed = new Set(balances.map((b) => b.userId));
  return [...balances, ...members.filter((m) => !listed.has(m.userId)).map((m) => ({ userId: m.userId, balance: 0 }))];
}

export function RewardsPage() {
  const { rel, me, isDom, solo, memberName, features } = useRel();
  const snack = useSnackbar();
  const balances = useBalances(rel.id);
  const ledger = useLedger(rel.id);
  const rewards = useLibrary(rel.id, "rewards");
  const save = useSaveLibraryItem(rel.id, "rewards");
  const del = useDeleteLibraryItem(rel.id, "rewards");
  const redeem = useRedeemReward(rel.id);
  const [editing, setEditing] = useState<Reward | "new" | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [confirm, confirmEl] = useConfirm();

  const [lettingOff, setLettingOff] = useState<Reward | null>(null);
  const myBalance = balances.data?.find((b) => b.userId === me.user.id)?.balance ?? 0;
  const domName = useAskWho();
  // Rewards spent but not yet given: a Dominant marks them redeemed; a sub sees what they're waiting on.
  const waiting = (ledger.data ?? []).filter(
    (e) => e.kind === "redemption" && !e.redeemedAt && (solo || (isDom ? e.userId !== me.user.id : e.userId === me.user.id)),
  );
  const current = editing && editing !== "new" ? editing : null;
  const wide = useMediaQuery("(min-width: 1024px)");
  const [historyOpen, setHistoryOpen] = useState(false);
  // Whose consequences show as owed: your own, or for a Dominant, the submissive's.
  const earner = isDom && !solo ? rel.members.find((m) => m.role === "submissive" && m.userId !== me.user.id)?.userId : me.user.id;
  const owed = useOwed(earner);

  return (
    <>
      {/* -mb-10 takes back the page's bottom padding, so the side panel runs to the bottom edge. */}
      <div className="flex lg:-mb-10 lg:min-h-dvh">
        <div className="min-w-0 flex-1 lg:pb-10">
          <PageHeader
            title="Rewards"
            tools={!wide && <IconButton icon="history" label="History" onClick={() => setHistoryOpen(true)} />}
          />

          <Balances balances={balances} rewards={rewards.data ?? []} ledger={ledger.data ?? []} onAdjust={isDom ? () => setAdjusting(true) : undefined} />

          {/* A Dominant's phone leads with what's waiting on them, as in the mockup. */}
          {!wide && isDom && !solo && waiting.length > 0 && (
            <Section title="Waiting on you">
              <Waiting entries={waiting} />
            </Section>
          )}

          <Section title={solo || !isDom ? "Spend" : "Your menu"}>
            {rewards.isLoading && <Loading />}
            {rewards.error && <ErrorBox error={rewards.error} />}
            {rewards.data && !rewards.data.length && (
              <Empty
                icon="redeem"
                title="No rewards yet"
                body={
                  solo
                    ? "Add treats to spend your points on."
                    : isDom
                      ? "Add treats your sub can spend points on."
                      : "Your Dominant hasn't added any rewards yet."
                }
              />
            )}
            {/* A menu, not cards: each reward and its price, with a dotted leader between, dimmed until it's affordable. */}
            <ul className="flex flex-col">
              {rewards.data?.map((r) => {
                const canSpend = (solo || !isDom) && myBalance >= r.cost && !redeem.isPending;
                const spend = () =>
                  r.letsOff
                    ? setLettingOff(r)
                    : confirm(
                        solo
                          ? `Spend ${r.cost} points on “${r.title}”? Mark it redeemed once you've had it.`
                          : `Spend ${r.cost} points on “${r.title}”? ${domName} marks it redeemed once it's given.`,
                        () =>
                          redeem.mutate(
                            { id: r.id },
                            {
                              onSuccess: () => snack(solo ? `Spent ${r.cost} points.` : `Spent ${r.cost} points. ${domName} has been told.`),
                              onError: (e) => snack(errorMessage(e)),
                            },
                          ),
                      );
                const dim = (solo || !isDom) && myBalance < r.cost;
                const notes = [
                  r.bodyMd?.trim() || null,
                  r.letsOff ? "Gets you out of a consequence" : null,
                  features.chastity && r.lockMinutes ? `Takes ${fmtMinutes(r.lockMinutes)} off the lock` : null,
                ].filter(Boolean);
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      disabled={isDom ? false : !canSpend}
                      aria-label={isDom ? `Edit “${r.title}”` : `Spend ${r.cost} points on “${r.title}”`}
                      title={dim ? `${r.cost - myBalance} more points` : undefined}
                      onClick={() => (isDom ? setEditing(r) : spend())}
                      className={cx("state-layer flex w-full flex-col py-3 text-left disabled:cursor-default", dim && "text-outline")}
                    >
                      <span className="flex w-full items-baseline gap-3">
                        <span className={cx("font-serif text-[24px] leading-8", dim ? "text-outline" : "text-on-surface")}>{r.title}</span>
                        <span className="mb-1.5 min-w-6 flex-1 self-end border-b border-dotted border-outline-variant" aria-hidden />
                        <span className={cx("text-body-large tabular-nums", dim ? "text-outline" : "text-on-surface")}>{r.cost}</span>
                      </span>
                      {notes.length > 0 && <span className="text-body-medium text-on-surface-variant">{notes.join(" · ")}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Section>

          {(!isDom || solo) && (owed.owed.length > 0 || owed.excused.length > 0) && (
            <Section title="Owed">
              <OwedList {...owed} />
            </Section>
          )}

          {/* Wide screens: what's waiting and the history sit in a panel on the right, as in the desktop mockup. */}
          {!wide && (!isDom || solo) && waiting.length > 0 && (
            <Section title={isDom ? "Waiting on you" : `Waiting on ${domName}`}>
              <Waiting entries={waiting} />
            </Section>
          )}
          {!wide && (
            <Dialog
              open={historyOpen}
              onClose={() => setHistoryOpen(false)}
              title="History"
              icon="history"
              actions={
                <Button variant="text" onClick={() => setHistoryOpen(false)}>
                  Close
                </Button>
              }
            >
              <div className="max-h-[60vh] overflow-y-auto">
                <History ledger={ledger} />
              </div>
            </Dialog>
          )}
        </div>
        {wide && (
          <aside className="w-[340px] shrink-0 border-l border-outline-variant bg-surface-container-low">
            <div className="sticky top-0 flex max-h-dvh flex-col gap-6 overflow-y-auto px-6 py-8">
              {waiting.length > 0 && (
                <section>
                  <h2 className="eyebrow mb-2">{isDom ? "Waiting on you" : `Waiting on ${domName}`}</h2>
                  <Waiting entries={waiting} />
                </section>
              )}
              <section>
                <h2 className="eyebrow mb-1">History</h2>
                <History ledger={ledger} />
              </section>
            </div>
          </aside>
        )}
      </div>

      {isDom && <Fab icon="add" label="New reward" onClick={() => setEditing("new")} />}

      <ItemDialog
        open={editing !== null}
        title={current ? "Edit reward" : "New reward"}
        fields={
          features.chastity
            ? [
                ...REWARD_FIELDS,
                {
                  key: "lockMinutes",
                  label: "Takes time off their lock",
                  type: "select",
                  options: LOCK_TIME_OPTIONS,
                },
              ]
            : REWARD_FIELDS
        }
        initial={
          current
            ? {
                ...current,
                lockMinutes: current.lockMinutes ? String(current.lockMinutes) : "",
              }
            : {
                title: "",
                bodyMd: "",
                cost: 10,
                letsOff: false,
                lockMinutes: "",
              }
        }
        busy={save.isPending}
        onClose={() => setEditing(null)}
        onDelete={
          current
            ? () =>
                confirm(`Delete “${current.title}”?`, () =>
                  del.mutate(current.id, {
                    onSuccess: () => setEditing(null),
                    onError: (e) => snack(errorMessage(e)),
                  }),
                )
            : undefined
        }
        onSubmit={(v) => {
          const input: RewardInput = {
            title: String(v.title).trim(),
            bodyMd: String(v.bodyMd ?? ""),
            cost: Math.max(0, Number(v.cost) || 0),
            needsApproval: current?.needsApproval ?? true,
            letsOff: Boolean(v.letsOff),
            lockMinutes: features.chastity ? Number(v.lockMinutes) || null : (current?.lockMinutes ?? null),
          };
          save.mutate(
            { id: current?.id, input },
            {
              onSuccess: () => setEditing(null),
              onError: (e) => snack(errorMessage(e)),
            },
          );
        }}
      />
      <AdjustDialog open={adjusting} onClose={() => setAdjusting(false)} />
      {lettingOff && <LetOffDialog reward={lettingOff} onClose={() => setLettingOff(null)} />}
      {confirmEl}
    </>
  );
}

/** A "get out of a consequence" reward: the sub picks which of their consequences it's for. */
function LetOffDialog({ reward, onClose }: { reward: Reward; onClose(): void }) {
  const { rel, me } = useRel();
  const snack = useSnackbar();
  const redeem = useRedeemReward(rel.id);
  const occ = useTodayOccurrences();
  const who = useAskWho();
  const mine = (occ.data ?? []).filter((o) => o.consequence && o.assigneeId === me.user.id && (o.status === "pending" || o.status === "missed"));
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <Dialog
      open
      onClose={onClose}
      icon="redeem"
      title={reward.title}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            busy={redeem.isPending}
            disabled={!picked}
            onClick={() =>
              picked &&
              redeem.mutate(
                { id: reward.id, consequenceOccurrenceId: picked },
                {
                  onSuccess: () => {
                    onClose();
                    snack(`Spent ${reward.cost} points. ${who} has been told.`);
                  },
                  onError: (e) => snack(errorMessage(e)),
                },
              )
            }
          >
            Spend {reward.cost} pts
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {mine.length ? (
          <>
            <p>Which consequence is it for?</p>
            <div className="flex flex-col gap-1">
              {mine.map((o) => (
                <label key={o.id} className="state-layer flex cursor-pointer items-center gap-3 rounded-md px-2 py-2">
                  <input type="radio" name="letoff" checked={picked === o.id} onChange={() => setPicked(o.id)} className="size-5 accent-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="text-body-large text-on-surface">{o.title}</div>
                    <div className="text-body-medium text-on-surface-variant">{o.status === "missed" ? "Missed" : `Due ${fmtDateTime(o.dueAt)}`}</div>
                  </div>
                </label>
              ))}
            </div>
            <p className="text-body-small">It's excused once {who} marks the reward redeemed. Until then it stays on your list.</p>
          </>
        ) : (
          <p>You don't have a consequence to get out of right now.</p>
        )}
      </div>
    </Dialog>
  );
}

function AdjustDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const { rel, partners, me } = useRel();
  const snack = useSnackbar();
  const adjust = useAdjustPoints(rel.id);
  const [userId, setUserId] = useState(partners[0]?.userId ?? me.user.id);
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const n = Number(delta);
  const ok = delta !== "" && Number.isInteger(n) && n !== 0 && note.trim();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Adjust points"
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            busy={adjust.isPending}
            disabled={!ok}
            onClick={() =>
              adjust.mutate(
                { userId, delta: n, note: note.trim() },
                {
                  onSuccess: () => {
                    snack("Points adjusted");
                    setDelta("");
                    setNote("");
                    onClose();
                  },
                  onError: (e) => snack(errorMessage(e)),
                },
              )
            }
          >
            Apply
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pt-2">
        <Select label="Who" value={userId} onChange={(e) => setUserId(e.target.value)}>
          {rel.members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.displayName}
            </option>
          ))}
        </Select>
        <TextField label="Points (+/-)" type="number" value={delta} onChange={(e) => setDelta(e.target.value)} help="Use a negative number to deduct." />
        <TextField label="Why" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </div>
    </Dialog>
  );
}

/**
 * The earner's balance as the headline, in the serif, with how far it is to the next reward. Anyone else's balance
 * is one quiet line under it.
 */
function Balances({
  balances,
  rewards,
  ledger,
  onAdjust,
}: {
  balances: ReturnType<typeof useBalances>;
  rewards: Reward[];
  ledger: LedgerEntry[];
  onAdjust?: () => void;
}) {
  const { rel, me, isDom, solo, memberName } = useRel();
  const weekFrom = startOfWeek(today(), me.user.weekStart ?? "sun");
  if (balances.isLoading) return <Loading />;
  if (balances.error) return <ErrorBox error={balances.error} />;
  if (!balances.data) return null;
  const all = withEveryMember(balances.data, rel.members);
  const isEarner = (id: string) => rel.members.find((m) => m.userId === id)?.role === "submissive" || (id === me.user.id && (solo || !isDom));
  const lead = all.find((b) => isEarner(b.userId)) ?? all[0];
  if (!lead) return null;
  const rest = all.filter((b) => b !== lead && b.balance !== 0);
  const next = rewards.filter((r) => r.cost > lead.balance).sort((a, z) => a.cost - z.cost)[0];
  const mine = lead.userId === me.user.id;
  // Points earned (less spent) since the week began, for "+31 this week".
  const week = ledger.filter((e) => e.userId === lead.userId && localDateOf(new Date(e.createdAt)) >= weekFrom).reduce((n, e) => n + e.delta, 0);
  return (
    <section aria-label="Points" className="mx-4 mb-8 md:mx-6">
      <div className="eyebrow">{mine ? "You have" : `${memberName(lead.userId)} has`}</div>
      <div className="flex items-baseline gap-3">
        <span className="font-serif text-[88px] leading-[0.95] text-on-surface tabular-nums">{lead.balance}</span>
        <span className="flex-1 text-body-large text-on-surface-variant">points</span>
        {onAdjust && (
          <Button variant="outlined" onClick={onAdjust} className="self-center">
            Adjust
          </Button>
        )}
      </div>
      <p className="mt-2 text-body-medium text-on-surface-variant">
        {[
          week ? `${week > 0 ? "+" : ""}${week} this week.` : null,
          rewards.length ? (next ? `${next.cost - lead.balance} more for ${next.title}.` : "Enough for any reward.") : null,
        ]
          .filter(Boolean)
          .join(" ")}
      </p>
      {rest.map((b) => (
        <p key={b.userId} className="text-body-medium text-on-surface-variant">
          {b.userId === me.user.id ? "You have" : `${memberName(b.userId)} has`} {b.balance} points.
        </p>
      ))}
    </section>
  );
}

/** Rewards spent but not yet given. A Dominant gets each as a card with a button; the one who spent it sees it waiting. */
function Waiting({ entries }: { entries: LedgerEntry[] }) {
  const { isDom } = useRel();
  return <div className="flex flex-col gap-3">{entries.map((e) => (isDom ? <WaitingCard key={e.id} e={e} /> : <WaitingRow key={e.id} e={e} />))}</div>;
}

function WaitingCard({ e }: { e: LedgerEntry }) {
  const { rel, memberName } = useRel();
  const snack = useSnackbar();
  const mark = useMarkRedeemed(rel.id);
  const [marking, setMarking] = useState(false);
  return (
    <article className="flex flex-col items-start gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-4">
      <p className="text-body-large text-on-surface">
        {memberName(e.userId)} spent {-e.delta} on <strong className="font-medium">{e.note}</strong>
        {e.consequenceTitle ? (
          <>
            {" "}
            to get out of <em>{e.consequenceTitle}</em>
          </>
        ) : null}
        .
      </p>
      <div className="flex w-full items-center gap-2">
        <Button
          busy={mark.isPending}
          onClick={() => mark.mutate({ id: e.id, note: null }, { onSuccess: () => snack("Redeemed"), onError: (x) => snack(errorMessage(x)) })}
        >
          Mark redeemed
        </Button>
        <Button variant="text" className="ml-auto" onClick={() => setMarking(true)}>
          Add a word
        </Button>
      </div>
      {marking && <RedeemedDialog e={e} onClose={() => setMarking(false)} />}
    </article>
  );
}

function WaitingRow({ e }: { e: LedgerEntry }) {
  return (
    <div className="flex items-center gap-4 py-1">
      <Diamond state="waiting" size={16} className="mx-1" />
      <div className="min-w-0 flex-1">
        <div className="text-body-large text-on-surface">{e.note}</div>
        <div className="text-body-medium text-on-surface-variant">
          {-e.delta} pts spent {ago(e.createdAt)}
          {e.consequenceTitle ? ` · gets you out of ${e.consequenceTitle}` : ""}
        </div>
      </div>
    </div>
  );
}

/** Points in and out, newest first: what for, when, and the change. */
function History({ ledger }: { ledger: ReturnType<typeof useLedger> }) {
  const { memberName, me, isDom } = useRel();
  const domName = useAskWho();
  if (ledger.isLoading) return <Loading />;
  if (ledger.error) return <ErrorBox error={ledger.error} />;
  if (ledger.data && !ledger.data.length) return <p className="text-body-medium text-on-surface-variant">No points yet.</p>;
  return (
    <div className="flex flex-col divide-y divide-outline-variant">
      {ledger.data?.map((e) => (
        <div key={e.id} className="flex items-start gap-3 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-body-large text-on-surface">{e.note || e.kind}</div>
            <div className="text-body-small text-on-surface-variant">
              {[
                e.userId === me.user.id ? null : memberName(e.userId),
                ago(e.createdAt),
                e.createdBy && e.createdBy !== e.userId ? `by ${e.createdBy === me.user.id ? "you" : memberName(e.createdBy)}` : null,
                e.kind === "redemption"
                  ? e.redeemedAt
                    ? `redeemed${e.consequenceTitle ? `, ${e.consequenceTitle} excused` : ""}`
                    : `waiting on ${isDom ? "you" : domName}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
            {e.redeemNote && <div className="text-body-medium text-on-surface-variant italic">“{e.redeemNote}”</div>}
          </div>
          <div className={cx("text-body-medium tabular-nums", e.delta >= 0 ? "text-on-surface-variant" : "text-error")}>
            {e.delta > 0 ? `+${e.delta}` : e.delta}
          </div>
        </div>
      ))}
    </div>
  );
}
