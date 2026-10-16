import { useEffect, useState } from "react";
import { useCreateInvite, useUpdateRelationship } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { ReschedulePolicy } from "../api/types";
import { signOut } from "../auth/session";
import { Button, Divider, Icon, PageHeader, Section, SegmentedButtons, Select, TextField, cx, useSnackbar } from "../components/ui";
import { API_URL, FIREBASE_ENABLED } from "../env";
import { fmtDateTime } from "../lib/dates";
import { ROLE_LABEL, useRel } from "../lib/relationship";
import { type PushState, pushState, registerPush } from "../push";
import { type ThemeMode, useTheme } from "../theme/ThemeProvider";
import { SEED_PRESETS } from "../theme/tokens";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

const POLICIES: { value: ReschedulePolicy; label: string; help: string }[] = [
  { value: "dominant_only", label: "Dominant only", help: "Only a Dominant can move deadlines." },
  { value: "request", label: "Sub may request", help: "The sub asks; a Dominant approves or declines." },
  { value: "allowance", label: "Weekly allowance", help: "The sub gets a number of free delays each week; more need approval." },
];

export function SettingsPage() {
  const { me, rel, self, isDom, select } = useRel();
  const theme = useTheme();
  const snack = useSnackbar();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const update = useUpdateRelationship(rel.id);
  const invite = useCreateInvite(rel.id);
  const [name, setName] = useState(rel.name);
  const [allowance, setAllowance] = useState(String(rel.weeklyDelayAllowance));
  const [push, setPush] = useState<PushState>(pushState);

  useEffect(() => {
    setName(rel.name);
    setAllowance(String(rel.weeklyDelayAllowance));
  }, [rel.id, rel.name, rel.weeklyDelayAllowance]);

  const patch = (body: Parameters<typeof update.mutate>[0], msg = "Saved") => update.mutate(body, { onSuccess: () => snack(msg), onError: (e) => snack(errorMessage(e)) });

  return (
    <>
      <PageHeader title="Settings" subtitle={me.user.email ?? me.user.displayName} />

      <Section title="Appearance">
        <div className="flex flex-col gap-5 rounded-lg bg-surface-container-low p-4" style={{ ["--field-bg" as string]: "var(--md-surface-container-low)" }}>
          <div>
            <div className="mb-2 text-label-large text-on-surface-variant">Theme</div>
            <SegmentedButtons<ThemeMode>
              value={theme.mode}
              onChange={theme.setMode}
              options={[
                { value: "system", label: "System", icon: "brightness_auto" },
                { value: "light", label: "Light", icon: "light_mode" },
                { value: "dark", label: "Dark", icon: "dark_mode" },
              ]}
            />
          </div>
          <div>
            <div className="mb-2 text-label-large text-on-surface-variant">Seed color</div>
            <div className="flex flex-wrap items-center gap-2">
              {SEED_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Use ${c}`}
                  aria-pressed={theme.seed === c}
                  onClick={() => theme.setSeed(c)}
                  className={cx("flex size-10 items-center justify-center rounded-full", theme.seed === c && "ring-2 ring-on-surface ring-offset-2 ring-offset-surface")}
                  style={{ background: c }}
                >
                  {theme.seed === c && <Icon name="check" className="text-white" size={20} />}
                </button>
              ))}
              <label className="state-layer flex h-10 cursor-pointer items-center gap-2 rounded-full border border-outline px-3 text-label-large text-on-surface">
                <input type="color" value={theme.seed} onChange={(e) => theme.setSeed(e.target.value)} className="size-6 cursor-pointer rounded-full border-0 bg-transparent p-0" />
                Custom
              </label>
            </div>
            <p className="mt-2 text-body-small text-on-surface-variant">The whole palette, light and dark, is generated from this color (Material 3 tonal spot).</p>
          </div>
        </div>
      </Section>

      <Section title="Relationship">
        <div className="flex flex-col gap-5 rounded-lg bg-surface-container-low p-4" style={{ ["--field-bg" as string]: "var(--md-surface-container-low)" }}>
          {me.relationships.length > 1 && (
            <Select label="Current relationship" value={rel.id} onChange={(e) => select(e.target.value)}>
              {me.relationships.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          )}
          <div className="flex flex-wrap items-start gap-2">
            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="min-w-48 flex-1" disabled={!isDom} />
            {isDom && name.trim() !== rel.name && (
              <Button variant="tonal" className="mt-2" busy={update.isPending} onClick={() => patch({ name: name.trim() })}>
                Rename
              </Button>
            )}
          </div>
          <div>
            <div className="mb-1 text-label-large text-on-surface-variant">Members</div>
            {rel.members.map((m) => (
              <div key={m.userId} className="flex items-center gap-3 py-1.5">
                <Icon name={m.role === "dominant" ? "shield_person" : m.role === "submissive" ? "person" : "swap_horiz"} className="text-on-surface-variant" />
                <span className="flex-1 text-body-large text-on-surface">
                  {m.displayName}
                  {m.userId === me.user.id && " (you)"}
                </span>
                <span className="text-body-medium text-on-surface-variant">{ROLE_LABEL[m.role]}</span>
              </div>
            ))}
            {self && <p className="mt-1 text-body-small text-on-surface-variant">You are the {ROLE_LABEL[self.role]} here.</p>}
          </div>
          <Divider />
          <div>
            <div className="mb-2 text-title-small text-on-surface">Invite a partner</div>
            {invite.data ? (
              <div className="flex flex-wrap items-center gap-3 rounded-md bg-primary-container p-4 text-on-primary-container">
                <code className="text-headline-small tracking-widest">{invite.data.code}</code>
                <span className="flex-1 text-body-small">Expires {fmtDateTime(invite.data.expiresAt)}</span>
                <Button
                  variant="text"
                  icon="content_copy"
                  className="text-on-primary-container"
                  onClick={() => navigator.clipboard?.writeText(invite.data!.code).then(() => snack("Code copied"), () => snack("Couldn't copy"))}
                >
                  Copy
                </Button>
              </div>
            ) : (
              <Button variant="tonal" icon="person_add" busy={invite.isPending} onClick={() => invite.mutate(undefined, { onError: (e) => snack(errorMessage(e)) })}>
                Create invite code
              </Button>
            )}
            <p className="mt-2 text-body-small text-on-surface-variant">They choose “Join with code” after signing in.</p>
          </div>
          <Divider />
          <div>
            <div className="mb-2 text-title-small text-on-surface">Rescheduling</div>
            <Select label="Who can move deadlines" value={rel.reschedulePolicy} disabled={!isDom || update.isPending} onChange={(e) => patch({ reschedulePolicy: e.target.value as ReschedulePolicy })}>
              {POLICIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
            <p className="mt-2 px-1 text-body-small text-on-surface-variant">{POLICIES.find((p) => p.value === rel.reschedulePolicy)?.help}</p>
            {rel.reschedulePolicy === "allowance" && (
              <div className="mt-4 flex flex-wrap items-start gap-2">
                <TextField label="Free delays per week" type="number" min={0} max={50} value={allowance} onChange={(e) => setAllowance(e.target.value)} disabled={!isDom} className="w-48" />
                {isDom && Number(allowance) !== rel.weeklyDelayAllowance && allowance !== "" && (
                  <Button variant="tonal" className="mt-2" onClick={() => patch({ weeklyDelayAllowance: Math.max(0, Math.min(50, Math.trunc(Number(allowance)))) })}>
                    Save
                  </Button>
                )}
              </div>
            )}
          </div>
          <Divider />
          <Button variant="outlined" icon="add_link" onClick={() => navigate({ to: "/onboarding" })} className="self-start">
            Join or start another relationship
          </Button>
        </div>
      </Section>

      <Section title="Notifications">
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-container-low p-4">
          <Icon name={push === "granted" ? "notifications_active" : "notifications_off"} className="text-on-surface-variant" />
          <div className="min-w-0 flex-1 text-body-medium text-on-surface-variant">
            {push === "unavailable" && "Web push isn't configured for this build (needs Firebase and a VAPID key) or this browser doesn't support it."}
            {push === "default" && "Get reminders, approvals and extension requests in this browser."}
            {push === "denied" && "Notifications are blocked for this site in your browser settings."}
            {push === "granted" && "This browser receives notifications."}
          </div>
          {(push === "default" || push === "granted") && (
            <Button
              variant="tonal"
              onClick={() =>
                registerPush({ prompt: true }).then(
                  (s) => {
                    setPush(s);
                    if (s === "granted") snack("Notifications on");
                  },
                  (e) => snack(errorMessage(e)),
                )
              }
            >
              {push === "granted" ? "Re-register" : "Turn on"}
            </Button>
          )}
        </div>
      </Section>

      <Section title="Account">
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-container-low p-4">
          <div className="min-w-0 flex-1 text-body-medium text-on-surface-variant">
            {FIREBASE_ENABLED ? "Signed in with Google." : `Dev sign-in as ${me.user.id}.`} API: {API_URL}
          </div>
          <Button
            variant="outlined"
            icon="logout"
            onClick={() =>
              signOut().then(() => {
                qc.clear();
              })
            }
          >
            Sign out
          </Button>
        </div>
      </Section>
    </>
  );
}
