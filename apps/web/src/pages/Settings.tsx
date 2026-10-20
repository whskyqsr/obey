import { useEffect, useRef, useState } from "react";
import { useSetAvatar, useUpdateMe } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { WeekStart } from "../api/types";
import { getSession, signOut } from "../auth/session";
import { Avatar, squareJpeg } from "../components/Avatar";
import { Button, Dialog, Icon, PageHeader, Section, SegmentedButtons, Switch, TextField, cx, useSnackbar } from "../components/ui";
import { isCollared, useRel } from "../lib/relationship";
import { useDynamicTitle } from "./Dynamic";
import { PushHealth } from "../components/PushHealth";
import { QuietHoursSetting } from "../components/QuietHours";
import { NotificationTypes } from "../components/NotificationTypes";
import { type PushState, pushState, registerPush } from "../push";
import { type ThemeMode, useTheme } from "../theme/ThemeProvider";
import { SEED_PRESETS } from "../theme/tokens";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

export function SettingsPage() {
  const { me, rel } = useRel();
  const dynamicTitle = useDynamicTitle();
  const theme = useTheme();
  const snack = useSnackbar();
  const qc = useQueryClient();
  const [push, setPush] = useState<PushState>(pushState);
  const [confirmReveal, setConfirmReveal] = useState(false);
  const updateMe = useUpdateMe();
  const [displayName, setDisplayName] = useState(me.user.displayName);
  const setAvatar = useSetAvatar();
  const fileInput = useRef<HTMLInputElement>(null);
  const session = getSession();

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    try {
      setAvatar.mutate(await squareJpeg(file), { onSuccess: () => snack("Photo updated"), onError: (e) => snack(errorMessage(e)) });
    } catch (e) {
      snack(errorMessage(e));
    }
  }

  useEffect(() => setDisplayName(me.user.displayName), [me.user.displayName]);

  return (
    <>
      <PageHeader title="Settings" subtitle={me.user.email ?? me.user.displayName} />

      {/* The relationship has its own page; Settings is about you. */}
      <div className="px-4 pb-6 md:px-6">
        <Link to="/dynamic" className="state-layer flex items-center gap-4 rounded-xl bg-primary-container p-4 text-on-primary-container">
          <span className="flex">
            {rel.members.slice(0, 3).map((m, i) => (
              <Avatar
                key={m.userId}
                userId={m.userId}
                name={m.displayName}
                version={m.avatarVersion}
                size={48}
                collared={isCollared(rel, m.userId)}
                className={cx("ring-4 ring-primary-container", i > 0 && "-ml-3", isCollared(rel, m.userId) && "z-10")}
              />
            ))}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-title-large">{dynamicTitle}</span>
            <span className="block text-body-medium opacity-80">Your dynamic · people, invites, how it works, features</span>
          </span>
          <Icon name="chevron_right" />
        </Link>
      </div>

      <Section title="Profile">
        <div className="flex flex-col gap-4 rounded-lg bg-surface-container-low p-4" style={{ ["--field-bg" as string]: "var(--md-surface-container-low)" }}>
          <div className="flex flex-wrap items-center gap-4">
            <Avatar userId={me.user.id} name={me.user.displayName} version={me.user.avatarVersion} size={72} />
            <div className="flex flex-wrap gap-2">
              <Button variant="tonal" icon="photo_camera" busy={setAvatar.isPending} onClick={() => fileInput.current?.click()}>
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
          <div className="flex flex-wrap items-start gap-2">
            <TextField label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} className="min-w-48 flex-1" />
            {displayName.trim() && displayName.trim() !== me.user.displayName && (
              <Button
                variant="tonal"
                className="mt-2"
                busy={updateMe.isPending}
                onClick={() => updateMe.mutate({ displayName: displayName.trim() }, { onSuccess: () => snack("Name updated"), onError: (e) => snack(errorMessage(e)) })}
              >
                Save
              </Button>
            )}
          </div>
          <p className="px-1 text-body-small text-on-surface-variant">This is what your partner sees in the app and in notifications.</p>
        </div>
      </Section>

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
            <div className="mb-2 text-label-large text-on-surface-variant">Week starts on</div>
            <SegmentedButtons<WeekStart>
              value={me.user.weekStart ?? "sun"}
              onChange={(weekStart) => updateMe.mutate({ weekStart }, { onError: (e) => snack(errorMessage(e)) })}
              options={[
                { value: "sun", label: "Sunday" },
                { value: "mon", label: "Monday" },
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

      <Section title="Privacy">
        <div className="rounded-lg bg-surface-container-low px-4 py-2">
          <Switch
            checked={me.user.revealProofs}
            onChange={(on) => (on ? setConfirmReveal(true) : updateMe.mutate({ revealProofs: false }, { onError: (e) => snack(errorMessage(e)) }))}
            label="Show proof photos without blur"
            help="Off: photos stay blurred until you open one."
          />
        </div>
        <Dialog
          open={confirmReveal}
          onClose={() => setConfirmReveal(false)}
          icon="visibility"
          title="Show photos unblurred?"
          actions={
            <>
              <Button variant="text" onClick={() => setConfirmReveal(false)}>
                Keep blurred
              </Button>
              <Button onClick={() => updateMe.mutate({ revealProofs: true }, { onSuccess: () => setConfirmReveal(false), onError: (e) => snack(errorMessage(e)) })}>
                Show them
              </Button>
            </>
          }
        >
          Proof photos will show as soon as a task opens, on this account everywhere. Anyone who can see your screen will see them too.
        </Dialog>
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
        {push === "granted" && <PushHealth />}
        <QuietHoursSetting />
        <NotificationTypes />
      </Section>

      {me.admin && (
        <Section title="Obey team">
          <Link to="/admin/reports" className="state-layer flex items-center gap-3 rounded-lg bg-surface-container-low p-4">
            <Icon name="flag" className="text-on-surface-variant" />
            <span className="flex-1 text-body-large text-on-surface">Reports to review</span>
            <Icon name="chevron_right" className="text-on-surface-variant" />
          </Link>
        </Section>
      )}

      <Section title="Account">
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-container-low p-4">
          <div className="min-w-0 flex-1">
            <div className="text-body-large text-on-surface">
              {session?.kind === "dev" ? "Dev sign-in" : session?.kind === "firebase" && session.provider === "password" ? "Signed in with email" : "Signed in with Google"}
            </div>
            <div className="truncate text-body-medium text-on-surface-variant">{me.user.email ?? me.user.id}</div>
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
