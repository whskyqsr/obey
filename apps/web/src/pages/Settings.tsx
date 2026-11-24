import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSetAvatar, useUpdateMe, useUpdateRelationship } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { WeekStart } from "../api/types";
import { getSession, signOut } from "../auth/session";
import { Avatar, squareJpeg } from "../components/Avatar";
import { Button, Dialog, Icon, SegmentedButtons, SubHeader, Switch, TextField, cx, useSnackbar } from "../components/ui";
import { useRel } from "../lib/relationship";
import { useMediaQuery } from "../lib/useMediaQuery";
import { useBack } from "../lib/useBack";
import { fmtClock } from "../lib/dates";
import { useLockConfig } from "../lib/appLock";
import { FEATURE_ROWS, useDynamicTitle } from "./Dynamic";
import { PushHealth } from "../components/PushHealth";
import { QuietHoursSetting } from "../components/QuietHours";
import { NOTIFY_TYPES, NotificationTypes } from "../components/NotificationTypes";
import { AppLockSetting } from "../components/AppLock";
import { DeleteAccount } from "../components/DeleteAccount";
import { type PushState, pushState, registerPush } from "../push";
import { type ThemeMode, useTheme } from "../theme/ThemeProvider";
import { ACCENTS } from "../theme/tokens";

/** Settings' own pages. "Your dynamic" is a page of its own, linked from the list. */
export const SETTINGS_SECTIONS = [
  { id: "you", label: "You" },
  { id: "notifications", label: "Notifications" },
  { id: "look", label: "Look and privacy" },
  { id: "features", label: "Features" },
  { id: "account", label: "Account" },
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]["id"];

const Eyebrow = ({ children }: { children: ReactNode }) => <h2 className="pt-8 pb-1 eyebrow first:pt-2">{children}</h2>;
/** Rows between hairlines. */
const Rows = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-col divide-y divide-outline-variant border-b border-outline-variant">{children}</div>
);

/** A setting that opens somewhere else: the name, and its current value on the right. */
function ValueRow({ label, value, to, hash }: { label: string; value?: ReactNode; to: string; hash?: string }) {
  return (
    <Link to={to} hash={hash} className="state-layer flex min-h-14 items-center gap-4 py-3.5">
      <span className="min-w-0 flex-1 text-body-large text-on-surface">{label}</span>
      <span className="flex shrink-0 items-center gap-0.5 text-body-medium text-on-surface-variant">
        {value}
        <Icon name="chevron_right" size={18} />
      </span>
    </Link>
  );
}

const PROOF_DAYS_SHORT: Record<number, string> = { 1: "1 day", 7: "7 days", 30: "30 days" };

/** "11 PM–7 AM". */
const span = (start: string, end: string) => `${fmtClock(start).replace(":00", "")}–${fmtClock(end).replace(":00", "")}`;

/**
 * Settings. On phones a list of settings with their values (each group opens its own page); on wide screens the
 * groups sit in a list beside the open one.
 */
export function SettingsPage({ section }: { section?: SettingsSection }) {
  const wide = useMediaQuery("(min-width: 1024px)");
  const navigate = useNavigate();
  const back = useBack(() => navigate({ to: "/settings" }));
  if (wide) return <WideSettings section={section ?? "you"} />;
  if (!section) return <SettingsList />;
  const label = SETTINGS_SECTIONS.find((s) => s.id === section)?.label ?? "Settings";
  return (
    <>
      <SubHeader title={label} back="Settings" onBack={back} />
      <div className="max-w-2xl px-4 pb-10 md:px-6">
        <SectionBody section={section} />
      </div>
    </>
  );
}

function WideSettings({ section }: { section: SettingsSection }) {
  const navigate = useNavigate();
  const { me } = useRel();
  return (
    <div className="flex gap-16 px-10 pt-10 pb-16">
      <nav className="w-64 shrink-0">
        <h1 className="mb-6 font-serif text-[64px] leading-none tracking-[-0.01em] text-on-surface">Settings</h1>
        <ul className="flex flex-col gap-0.5">
          {SETTINGS_SECTIONS.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                aria-current={s.id === section ? "page" : undefined}
                onClick={() => void navigate({ to: "/settings/$section", params: { section: s.id } })}
                className={cx(
                  "state-layer w-full rounded-md px-3.5 py-2.5 text-left text-body-large",
                  s.id === section ? "bg-surface-container text-on-surface" : "text-on-surface-variant",
                )}
              >
                {s.label}
              </button>
            </li>
          ))}
          <li>
            <Link to="/dynamic" className="state-layer block rounded-md px-3.5 py-2.5 text-body-large text-on-surface-variant">
              Your dynamic
            </Link>
          </li>
          {me.admin && (
            <li>
              <Link to="/admin/reports" className="state-layer block rounded-md px-3.5 py-2.5 text-body-large text-on-surface-variant">
                Reports to review
              </Link>
            </li>
          )}
        </ul>
      </nav>
      <div className="max-w-2xl min-w-0 flex-1 pt-3">
        <SectionBody section={section} />
      </div>
    </div>
  );
}

/** The phone list, as in the mockup: each setting with its value, grouped. */
function SettingsList() {
  const { me, rel, features } = useRel();
  const navigate = useNavigate();
  const back = useBack(() => navigate({ to: "/us" }));
  const updateMe = useUpdateMe();
  const snack = useSnackbar();
  const theme = useTheme();
  const dynamicTitle = useDynamicTitle();
  const session = getSession();
  const lock = useLockConfig(session?.uid ?? "");
  const [confirmReveal, setConfirmReveal] = useState(false);
  const types = NOTIFY_TYPES.filter((t) => !t.feature || features[t.feature]);
  const muted = new Set(me.user.mutedNotifications ?? []);
  const heard = types.filter((t) => !muted.has(t.key)).length;
  const on = FEATURE_ROWS.filter((f) => features[f.key]).length;
  const q = me.user.quietHours;
  return (
    <>
      <SubHeader title="Settings" back="Us" onBack={back} />
      <div className="max-w-2xl px-4 pb-10 md:px-6">
        <Eyebrow>You</Eyebrow>
        <Rows>
          <ValueRow label="Name, photo, email" value={me.user.displayName} to="/settings/you" />
          <ValueRow label="Week starts on" value={me.user.weekStart === "mon" ? "Monday" : "Sunday"} to="/settings/you" />
        </Rows>

        <Eyebrow>Notifications</Eyebrow>
        <Rows>
          <ValueRow label="What you hear about" value={`${heard} of ${types.length}`} to="/settings/notifications" />
          <ValueRow label="Quiet hours" value={q ? span(q.start, q.end) : "Off"} to="/settings/notifications" />
          <Switch
            checked={me.user.notifyDetails ?? false}
            onChange={(notifyDetails) => updateMe.mutate({ notifyDetails }, { onError: (e) => snack(errorMessage(e)) })}
            label="Show your partner's words"
          />
        </Rows>

        <Eyebrow>Privacy</Eyebrow>
        <Rows>
          <ValueRow label="App lock" value={lock ? "PIN" : "Off"} to="/settings/look" />
          <Switch
            checked={!me.user.revealProofs}
            onChange={(blur) => (blur ? updateMe.mutate({ revealProofs: false }, { onError: (e) => snack(errorMessage(e)) }) : setConfirmReveal(true))}
            label="Blur proof photos"
          />
          <ValueRow label="Theme and accent" value={{ system: "System", light: "Light", dark: "Dark" }[theme.mode]} to="/settings/look" />
        </Rows>

        <Eyebrow>This dynamic</Eyebrow>
        <Rows>
          <ValueRow label="Your dynamic" value={<span className="max-w-40 truncate">{dynamicTitle}</span>} to="/dynamic" />
          {!rel.endedAt && <ValueRow label="Features" value={`${on} of ${FEATURE_ROWS.length} on`} to="/settings/features" />}
          <ValueRow label="Proof photos delete after" value={rel.proofDays ? PROOF_DAYS_SHORT[rel.proofDays] : "Never"} to="/dynamic" />
        </Rows>

        <Eyebrow>Account</Eyebrow>
        <Rows>
          <ValueRow label="Account" value={<span className="max-w-44 truncate">{me.user.email ?? ""}</span>} to="/settings/account" />
          {me.admin && <ValueRow label="Reports to review" to="/admin/reports" />}
        </Rows>
      </div>
      <RevealDialog open={confirmReveal} onClose={() => setConfirmReveal(false)} />
    </>
  );
}

function RevealDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const updateMe = useUpdateMe();
  const snack = useSnackbar();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon="visibility"
      title="Show photos unblurred?"
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Keep blurred
          </Button>
          <Button onClick={() => updateMe.mutate({ revealProofs: true }, { onSuccess: onClose, onError: (e) => snack(errorMessage(e)) })}>Show them</Button>
        </>
      }
    >
      Proof photos will show as soon as a task opens, on this account everywhere. Anyone who can see your screen will see them too.
    </Dialog>
  );
}

function SectionBody({ section }: { section: SettingsSection }) {
  switch (section) {
    case "you":
      return <YouSection />;
    case "notifications":
      return <NotificationsSection />;
    case "look":
      return <LookSection />;
    case "features":
      return <FeaturesSection />;
    case "account":
      return <AccountSection />;
  }
}

function YouSection() {
  const { me } = useRel();
  const snack = useSnackbar();
  const updateMe = useUpdateMe();
  const setAvatar = useSetAvatar();
  const fileInput = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState(me.user.displayName);
  useEffect(() => setDisplayName(me.user.displayName), [me.user.displayName]);
  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    try {
      setAvatar.mutate(await squareJpeg(file), { onSuccess: () => snack("Photo updated"), onError: (e) => snack(errorMessage(e)) });
    } catch (e) {
      snack(errorMessage(e));
    }
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar userId={me.user.id} name={me.user.displayName} version={me.user.avatarVersion} size={72} serif />
        <div className="flex flex-wrap gap-2">
          <Button variant="outlined" icon="photo_camera" busy={setAvatar.isPending} onClick={() => fileInput.current?.click()}>
            {me.user.avatarVersion ? "Change photo" : "Add photo"}
          </Button>
          {me.user.avatarVersion && (
            <Button
              variant="text"
              disabled={setAvatar.isPending}
              onClick={() => setAvatar.mutate(null, { onSuccess: () => snack("Photo removed"), onError: (e) => snack(errorMessage(e)) })}
            >
              Remove
            </Button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void pickPhoto(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      <div className="flex items-end gap-3">
        <TextField label="Name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} className="min-w-0 flex-1" />
        {displayName.trim() && displayName.trim() !== me.user.displayName && (
          <Button
            busy={updateMe.isPending}
            className="mb-6"
            onClick={() =>
              updateMe.mutate({ displayName: displayName.trim() }, { onSuccess: () => snack("Name updated"), onError: (e) => snack(errorMessage(e)) })
            }
          >
            Save
          </Button>
        )}
      </div>
      <div>
        <div className="text-body-small text-on-surface-variant">Email</div>
        <div className="border-b border-outline-variant py-2 text-body-large text-on-surface">{me.user.email ?? "None"}</div>
      </div>
      <div>
        <div className="mb-2 text-body-small text-on-surface-variant">Week starts on</div>
        <SegmentedButtons<WeekStart>
          value={me.user.weekStart ?? "sun"}
          onChange={(weekStart) => updateMe.mutate({ weekStart }, { onError: (e) => snack(errorMessage(e)) })}
          options={[
            { value: "sun", label: "Sunday" },
            { value: "mon", label: "Monday" },
          ]}
        />
      </div>
    </div>
  );
}

function NotificationsSection() {
  const snack = useSnackbar();
  const qc = useQueryClient();
  const [push, setPush] = useState<PushState>(pushState);
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-outline-variant pb-4">
        <Icon name={push === "granted" ? "notifications_active" : "notifications_off"} className="text-on-surface-variant" />
        <div className="min-w-0 flex-1 text-body-medium text-on-surface-variant">
          {push === "unavailable" && "Web push isn't configured for this build (needs Firebase and a VAPID key) or this browser doesn't support it."}
          {push === "default" && "Get reminders, approvals and extension requests in this browser."}
          {push === "denied" && "Notifications are blocked for this site in your browser settings."}
          {push === "granted" && "This browser receives notifications."}
        </div>
        {(push === "default" || push === "granted") && (
          <Button
            variant="outlined"
            onClick={() =>
              registerPush({ prompt: true }).then(
                (s) => {
                  setPush(s);
                  void qc.invalidateQueries({ queryKey: ["me", "devices"] });
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
      {push === "granted" && (
        <div className="mt-4">
          <PushHealth />
        </div>
      )}
      <Eyebrow>What you hear about</Eyebrow>
      <NotificationTypes />
      <Eyebrow>Quiet hours</Eyebrow>
      <QuietHoursSetting />
    </>
  );
}

function LookSection() {
  const { me } = useRel();
  const theme = useTheme();
  const updateMe = useUpdateMe();
  const snack = useSnackbar();
  const session = getSession();
  const [confirmReveal, setConfirmReveal] = useState(false);
  return (
    <>
      <Eyebrow>Theme</Eyebrow>
      <div className="pt-2">
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
      <Eyebrow>Accent</Eyebrow>
      <div className="flex flex-wrap items-center gap-3 pt-2">
        {ACCENTS.map((a) => (
          <button
            key={a.id}
            type="button"
            aria-label={a.name}
            title={a.name}
            aria-pressed={theme.seed === a.light}
            onClick={() => theme.setSeed(a.light)}
            className={cx(
              "flex size-9 items-center justify-center rounded-full",
              theme.seed === a.light && "ring-2 ring-on-surface ring-offset-2 ring-offset-surface",
            )}
            style={{ background: a.light }}
          >
            {theme.seed === a.light && <Icon name="check" className="text-white" size={18} />}
          </button>
        ))}
      </div>
      <Eyebrow>Privacy</Eyebrow>
      <Rows>
        {session && <AppLockSetting uid={session.uid} />}
        <Switch
          checked={!me.user.revealProofs}
          onChange={(blur) => (blur ? updateMe.mutate({ revealProofs: false }, { onError: (e) => snack(errorMessage(e)) }) : setConfirmReveal(true))}
          label="Blur proof photos"
        />
      </Rows>
      <RevealDialog open={confirmReveal} onClose={() => setConfirmReveal(false)} />
    </>
  );
}

/** The dynamic's feature switches; also on Your dynamic. */
function FeaturesSection() {
  const { rel, features, isDom } = useRel();
  const update = useUpdateRelationship(rel.id);
  const snack = useSnackbar();
  const canChange = isDom && !rel.endedAt;
  return (
    <>
      {!canChange && (
        <p className="pb-2 text-body-large text-on-surface-variant">
          {rel.endedAt ? "This dynamic has ended, so nothing here can change." : "Only a Dominant can change these."}
        </p>
      )}
      <Rows>
        {FEATURE_ROWS.map((f) => (
          <Switch
            key={f.key}
            checked={features[f.key]}
            onChange={(on) =>
              canChange &&
              update.mutate(
                { features: { [f.key]: on } },
                { onSuccess: () => snack(on ? `${f.label} on` : `${f.label} off`), onError: (e) => snack(errorMessage(e)) },
              )
            }
            label={f.label}
          />
        ))}
      </Rows>
    </>
  );
}

function AccountSection() {
  const { me } = useRel();
  const qc = useQueryClient();
  const session = getSession();
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-outline-variant pb-4">
        <div className="min-w-0 flex-1">
          <div className="text-body-large text-on-surface">
            {session?.kind === "dev"
              ? "Dev sign-in"
              : session?.kind === "firebase" && session.provider === "password"
                ? "Signed in with email"
                : "Signed in with Google"}
          </div>
          <div className="truncate text-body-medium text-on-surface-variant">{me.user.email ?? me.user.id}</div>
        </div>
        <Button variant="outlined" icon="logout" onClick={() => signOut().then(() => qc.clear())}>
          Sign out
        </Button>
      </div>
      <DeleteAccount />
    </>
  );
}
