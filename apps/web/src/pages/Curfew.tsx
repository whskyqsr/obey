import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { CurfewInput } from "../api/types";
import { useCurfew, useLibrary, usePlaces, useSaveCurfew } from "../api/hooks";
import { errorMessage } from "../api/client";
import { Button, Empty, ErrorBox, Icon, IconButton, Loading, SegmentedButtons, Select, Switch, TextField, useSnackbar } from "../components/ui";
import { browserTimeZone } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { useBack } from "../lib/useBack";

/** "22:00" as "10:00 PM". */
export function fmtClock(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return new Date(2026, 0, 5, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "Home by 10:00 PM, in until 6:00 AM", or with weekends "Sun–Thu by 10:00 PM, Fri–Sat by 12:00 AM, in until 6:00 AM". */
export function describeCurfew(c: CurfewInput) {
  const by = c.weekendTime ? `Sun–Thu by ${fmtClock(c.time)}, Fri–Sat by ${fmtClock(c.weekendTime)}` : `Home by ${fmtClock(c.time)}`;
  return `${by}, in until ${fmtClock(c.until)}`;
}

const num = (v: string) => (v === "" ? 0 : Math.max(0, Math.trunc(Number(v)) || 0));

/** A sub's curfew: home by a time each night and in until morning. A Dominant sets it; the sub sees what it is. */
export function CurfewPage() {
  const { rel, isDom, me, features, memberName } = useRel();
  const navigate = useNavigate();
  const snack = useSnackbar();
  const back = useBack(() => navigate({ to: "/dynamic" }));
  const curfew = useCurfew(rel.id);
  const places = usePlaces(rel.id);
  const consequences = useLibrary(rel.id, "consequences");
  const save = useSaveCurfew(rel.id);
  const canEdit = isDom && rel.endedAt === null;
  const subs = rel.members.filter((m) => m.userId !== me.user.id && m.role !== "dominant");
  const [form, setForm] = useState<CurfewInput | null>(null);

  useEffect(() => {
    if (form || !curfew.data || !places.data) return;
    const home = places.data.find((p) => /home/i.test(p.name)) ?? places.data[0];
    setForm(
      curfew.data.settings ?? {
        enabled: false,
        assigneeId: subs[0]?.userId ?? "",
        placeId: home?.id ?? "",
        time: "22:00",
        weekendTime: null,
        until: "06:00",
        points: 0,
        missPenalty: 0,
        consequenceId: null,
        timezone: browserTimeZone(),
        reportHome: false,
      },
    );
  }, [curfew.data, places.data, form, subs]);

  const header = (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-1 bg-surface px-2 md:px-4">
      <IconButton icon="arrow_back" label="Back" onClick={back} />
      <h1 className="flex-1 text-title-large text-on-surface">Curfew</h1>
    </header>
  );
  if (curfew.error || places.error)
    return (
      <div className="flex flex-col">
        {header}
        <ErrorBox error={curfew.error ?? places.error} onRetry={() => (curfew.refetch(), places.refetch())} />
      </div>
    );
  if (!form)
    return (
      <div className="flex flex-col">
        {header}
        <Loading />
      </div>
    );

  const set = (patch: Partial<CurfewInput>) => setForm({ ...form, ...patch });
  const who = memberName(form.assigneeId);
  const saved = curfew.data?.settings;
  const dirty = JSON.stringify(saved ?? null) !== JSON.stringify(form) && (form.enabled || saved?.enabled);
  const submit = (next: CurfewInput) =>
    save.mutate(next, {
      onSuccess: () => snack(next.enabled ? (saved?.enabled ? "Curfew saved" : "Curfew is on") : "Curfew is off"),
      onError: (e) => snack(errorMessage(e)),
    });

  if (!canEdit) {
    return (
      <div className="flex flex-col pb-10">
        {header}
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 md:px-6">
          {saved?.enabled ? (
            <div className="flex flex-col gap-1 rounded-lg bg-surface-container-low p-4">
              <div className="text-body-large text-on-surface">{describeCurfew(saved)}</div>
              <div className="text-body-medium text-on-surface-variant">
                At {places.data?.find((p) => p.id === saved.placeId)?.name ?? "Home"}. Leaving before then breaks curfew. Late or left early, it counts like a missed task.
              </div>
            </div>
          ) : (
            <Empty icon="bedtime" title="No curfew" body="A Dominant can set one here." />
          )}
        </div>
      </div>
    );
  }

  if (!places.data?.length)
    return (
      <div className="flex flex-col pb-10">
        {header}
        <div className="mx-auto w-full max-w-2xl px-4 md:px-6">
          <Empty
            icon="home"
            title="Add Home first"
            body="Curfew checks that they're at a place. Save their home in Places, then come back."
            action={
              <Button variant="tonal" icon="add_location_alt" onClick={() => navigate({ to: "/places" })}>
                Go to Places
              </Button>
            }
          />
        </div>
      </div>
    );

  return (
    <div className="flex flex-col pb-10">
      {header}
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 md:px-6">
        <div className="rounded-lg bg-surface-container-low px-4 py-2">
          <Switch
            checked={form.enabled}
            onChange={(on) => {
              const next = { ...form, enabled: on };
              setForm(next);
              if (!on && saved?.enabled) submit(next);
            }}
            label="Curfew"
            help={`${who === "You" ? "You're" : `${who} is`} home by a set time and stays in until morning`}
          />
        </div>

        {form.enabled && (
          <>
            <div className="flex flex-col gap-4 rounded-lg bg-surface-container-low p-4">
              {subs.length > 1 && (
                <Select label="Who" value={form.assigneeId} onChange={(e) => set({ assigneeId: e.target.value })}>
                  {subs.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.displayName}
                    </option>
                  ))}
                </Select>
              )}
              <SegmentedButtons
                value={form.weekendTime ? "split" : "every"}
                onChange={(v) => set({ weekendTime: v === "split" ? (saved?.weekendTime ?? "00:00") : null })}
                options={[
                  { value: "every", label: "Every night" },
                  { value: "split", label: "Weekends differ" },
                ]}
                className="w-full whitespace-nowrap"
              />
              <div className="flex gap-4">
                <TextField
                  label={form.weekendTime ? "Sun–Thu, home by" : "Home by"}
                  type="time"
                  value={form.time}
                  onChange={(e) => e.target.value && set({ time: e.target.value })}
                  className="flex-1"
                />
                {form.weekendTime && (
                  <TextField
                    label="Fri–Sat, home by"
                    type="time"
                    value={form.weekendTime}
                    onChange={(e) => e.target.value && set({ weekendTime: e.target.value })}
                    className="flex-1"
                  />
                )}
              </div>
              <TextField
                label="Stay in until"
                type="time"
                value={form.until}
                onChange={(e) => e.target.value && set({ until: e.target.value })}
                help="Leaving home before then breaks curfew."
              />
              <Select
                label="Home"
                value={form.placeId}
                onChange={(e) => set({ placeId: e.target.value })}
                help={`${who === "You" ? "Your" : `${who}'s`} phone checks this. Without location, ${who === "You" ? "you tap" : `${who} taps`} "I'm home".`}
              >
                {places.data.map((p) => (
                  <option key={p.id} value={p.id}>
                    {[p.name, p.address].filter(Boolean).join(" · ")}
                  </option>
                ))}
              </Select>
            </div>

            {who !== "You" && (
              <div className="rounded-lg bg-surface-container-low px-4 py-2">
                <Switch
                  checked={form.reportHome}
                  onChange={(reportHome) => set({ reportHome })}
                  label={`${who} tells you they're home`}
                  help={`Getting home puts "Tell ${me.user.displayName} I'm home" in front of ${who}, with room for a line. Their phone still checks curfew; this is them reporting in.`}
                />
              </div>
            )}

            {(features.points || features.consequences) && (
              <div className="flex flex-col gap-4 rounded-lg bg-surface-container-low p-4">
                <div className="text-title-medium text-on-surface">If it's broken</div>
                {features.points && (
                  <div className="flex gap-4">
                    <TextField label="Points for keeping it" type="number" min={0} value={form.points} onChange={(e) => set({ points: num(e.target.value) })} className="flex-1" />
                    <TextField
                      label="Points lost for breaking it"
                      type="number"
                      min={0}
                      value={form.missPenalty}
                      onChange={(e) => set({ missPenalty: num(e.target.value) })}
                      className="flex-1"
                    />
                  </div>
                )}
                {features.consequences && (
                  <Select label="Consequence" value={form.consequenceId ?? ""} onChange={(e) => set({ consequenceId: e.target.value || null })}>
                    <option value="">None</option>
                    {consequences.data?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </Select>
                )}
                <p className="text-body-medium text-on-surface-variant">Late or left early, it counts like a missed task. You can excuse a night.</p>
              </div>
            )}
          </>
        )}

        {dirty && form.enabled && (
          <div>
            <Button icon="check" busy={save.isPending} disabled={!form.placeId || !form.assigneeId} onClick={() => submit(form)}>
              {saved?.enabled ? "Save" : "Turn on curfew"}
            </Button>
          </div>
        )}
        {!subs.length && <p className="px-1 text-body-medium text-on-surface-variant">Curfew is for a submissive in this dynamic; invite them first.</p>}
        <p className="flex items-start gap-2 px-1 text-body-small text-on-surface-variant">
          <Icon name="info" className="text-[18px]" />
          Nights don't show as tasks. Today shows curfew from an hour before, and plans that run past it.
        </p>
      </div>
    </div>
  );
}
