import { useState } from "react";
import { useAdjustPoints, useBalances, useDeleteLibraryItem, useLedger, useLibrary, useRedeemReward, useSaveLibraryItem } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { LedgerEntry, Reward, RewardInput } from "../api/types";
import { ItemDialog, type FieldDef } from "../components/ItemDialog";
import { Badge, Button, Dialog, Empty, ErrorBox, Fab, Icon, Loading, PageHeader, Section, Select, TextField, cx, useSnackbar } from "../components/ui";
import { fmtDateTime } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { useConfirm } from "../lib/useConfirm";

const REWARD_FIELDS: FieldDef[] = [
  { key: "title", label: "Reward", type: "text", required: true, max: 200 },
  { key: "bodyMd", label: "Description", type: "textarea", max: 5000 },
  { key: "cost", label: "Cost (points)", type: "number", min: 0 },
  { key: "needsApproval", label: "Needs approval to redeem", type: "switch" },
];

const KIND_ICON: Record<LedgerEntry["kind"], string> = {
  completion: "task_alt",
  miss: "event_busy",
  redemption: "redeem",
  adjustment: "tune",
  delay: "schedule",
};

export function RewardsPage() {
  const { rel, me, isDom, memberName } = useRel();
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

  const myBalance = balances.data?.find((b) => b.userId === me.user.id)?.balance ?? 0;
  const current = editing && editing !== "new" ? editing : null;

  return (
    <>
      <PageHeader
        title="Rewards & points"
        actions={
          isDom && (
            <Button variant="tonal" icon="tune" onClick={() => setAdjusting(true)}>
              Adjust
            </Button>
          )
        }
      />

      <Section title="Balances">
        {balances.error && <ErrorBox error={balances.error} />}
        <div className="flex flex-wrap gap-3">
          {balances.data?.map((b) => {
            // The earner's balance is the headline: the sub's, or yours when you're the one earning.
            const earner = rel.members.find((m) => m.userId === b.userId)?.role === "submissive" || (b.userId === me.user.id && !isDom);
            const next = rewards.data?.filter((r) => r.cost > b.balance).sort((a, z) => a.cost - z.cost)[0];
            return (
              <div
                key={b.userId}
                className={cx("min-w-40 flex-1 rounded-lg p-4", earner ? "bg-primary-container text-on-primary-container" : "bg-surface-container-low text-on-surface")}
              >
                <div className="text-label-large opacity-80">{memberName(b.userId)}</div>
                <div className="text-display-small tabular-nums">{b.balance}</div>
                <div className="text-body-small opacity-80">points</div>
                {earner && !!rewards.data?.length && (
                  <div className="mt-3">
                    <div className="h-1.5 overflow-hidden rounded-full bg-on-primary-container/15">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${next ? Math.max(0, Math.min(100, (b.balance / next.cost) * 100)) : 100}%` }} />
                    </div>
                    <div className="mt-1.5 text-body-medium">{next ? `${next.cost - b.balance} more for ${next.title}` : "Enough for any reward"}</div>
                  </div>
                )}
              </div>
            );
          })}
          {balances.isLoading && <Loading />}
        </div>
      </Section>

      <Section title="Rewards">
        {rewards.isLoading && <Loading />}
        {rewards.error && <ErrorBox error={rewards.error} />}
        {rewards.data && !rewards.data.length && (
          <Empty icon="redeem" title="No rewards yet" body={isDom ? "Add treats your sub can spend points on." : "Your Dominant hasn't added any rewards yet."} />
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {rewards.data?.map((r) => (
            <div key={r.id} className="flex flex-col gap-2 rounded-md bg-surface-container-low p-4">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-title-medium text-on-surface">{r.title}</div>
                  {r.bodyMd && <div className="mt-1 text-body-medium whitespace-pre-wrap text-on-surface-variant">{r.bodyMd}</div>}
                </div>
                <Badge>{r.cost} pts</Badge>
              </div>
              <div className="flex items-center gap-2">
                {r.needsApproval && <span className="text-body-small text-on-surface-variant">Needs approval</span>}
                <div className="flex-1" />
                {isDom && (
                  <Button variant="text" onClick={() => setEditing(r)}>
                    Edit
                  </Button>
                )}
                {!isDom && (
                  <Button
                    variant="tonal"
                    icon="redeem"
                    disabled={myBalance < r.cost || redeem.isPending}
                    onClick={() =>
                      confirm(`Redeem “${r.title}” for ${r.cost} points?`, () =>
                        redeem.mutate(r.id, {
                          onSuccess: () => snack(r.needsApproval ? "Redemption requested" : "Redeemed. Enjoy."),
                          onError: (e) => snack(errorMessage(e)),
                        }),
                      )
                    }
                  >
                    Redeem
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="History">
        {ledger.isLoading && <Loading />}
        {ledger.error && <ErrorBox error={ledger.error} />}
        {ledger.data && !ledger.data.length && <p className="text-body-medium text-on-surface-variant">No points yet.</p>}
        <div className="overflow-hidden rounded-lg bg-surface-container-low">
          {ledger.data?.map((e, i) => (
            <div key={e.id} className={cx("flex items-center gap-4 px-4 py-3", i > 0 && "border-t border-outline-variant")}>
              <Icon name={KIND_ICON[e.kind] ?? "paid"} className="text-on-surface-variant" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-body-large text-on-surface">{e.note || e.kind}</div>
                <div className="text-body-small text-on-surface-variant">
                  {memberName(e.userId)} · {fmtDateTime(e.createdAt)}
                  {e.createdBy && e.createdBy !== e.userId ? ` · by ${memberName(e.createdBy)}` : ""}
                </div>
              </div>
              <div className={cx("text-title-medium", e.delta >= 0 ? "text-primary" : "text-error")}>{e.delta > 0 ? `+${e.delta}` : e.delta}</div>
            </div>
          ))}
        </div>
      </Section>

      {isDom && <Fab icon="add" label="New reward" onClick={() => setEditing("new")} />}

      <ItemDialog
        open={editing !== null}
        title={current ? "Edit reward" : "New reward"}
        fields={REWARD_FIELDS}
        initial={current ? { ...current } : { title: "", bodyMd: "", cost: 10, needsApproval: true }}
        busy={save.isPending}
        onClose={() => setEditing(null)}
        onDelete={
          current
            ? () => confirm(`Delete “${current.title}”?`, () => del.mutate(current.id, { onSuccess: () => setEditing(null), onError: (e) => snack(errorMessage(e)) }))
            : undefined
        }
        onSubmit={(v) => {
          const input: RewardInput = {
            title: String(v.title).trim(),
            bodyMd: String(v.bodyMd ?? ""),
            cost: Math.max(0, Number(v.cost) || 0),
            needsApproval: Boolean(v.needsApproval),
          };
          save.mutate({ id: current?.id, input }, { onSuccess: () => setEditing(null), onError: (e) => snack(errorMessage(e)) });
        }}
      />
      <AdjustDialog open={adjusting} onClose={() => setAdjusting(false)} />
      {confirmEl}
    </>
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
