import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { CurfewInput } from "../api/types";
import { useCurfew, useLibrary, usePlaces, useSaveCurfew } from "../api/hooks";
import { errorMessage } from "../api/client";
import { SubHeader, Button, ErrorBox, Loading, Select, Switch, TextField, useSnackbar } from "../components/ui";
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
  const back = useBack(() => navigate({ to: "/location" }));
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

  const header = <SubHeader title="Curfew" back="Location" onBack={back} />;
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
  const dirty = JSON.stringify(saved ?? null) !== JSON.stringify({ ...form, enabled: true });
  const submit = (next: CurfewInput) =>
    save.mutate(next, {
      onSuccess: () => snack(next.enabled ? (saved?.enabled ? "Curfew saved" : "Curfew is on") : "Curfew is off"),
      onError: (e) => snack(errorMessage(e)),
    });

  const intro = (
    <p className="-mt-2 text-body-large text-on-surface-variant">{who === "You" ? "You're" : `${who} is`} home by a set time, and stays in until morning.</p>
  );
  const home = places.data?.find((p) => p.id === form.placeId);

  if (!canEdit) {
    const rows: [string, string][] = saved?.enabled
      ? [
          ["Home", [home?.name ?? "Home", home?.address].filter(Boolean).join(" · ")],
          [saved.weekendTime ? "Sun–Thu, home by" : "Every night, home by", fmtClock(saved.time)],
          ...(saved.weekendTime ? ([["Fri–Sat, home by", fmtClock(saved.weekendTime)]] as [string, string][]) : []),
          ["Stay in until", fmtClock(saved.until)],
        ]
      : [];
    return (
      <div className="flex max-w-xl flex-col pb-10">
        {header}
        <div className="flex flex-col gap-6 px-4 md:px-6">
          {saved?.enabled ? (
            <>
              {intro}
              <div className="flex flex-col divide-y divide-outline-variant border-b border-outline-variant">
                {rows.map(([label, value]) => (
                  <div key={label} className="py-3">
                    <div className="text-body-medium text-on-surface-variant">{label}</div>
                    <div className="text-body-large text-on-surface">{value}</div>
                  </div>
                ))}
              </div>
              <p className="text-body-medium text-on-surface-variant">Late or left early, it counts like a missed task.</p>
            </>
          ) : (
            <p className="text-body-large text-on-surface-variant">No curfew.</p>
          )}
        </div>
      </div>
    );
  }

  if (!places.data?.length)
    return (
      <div className="flex max-w-xl flex-col pb-10">
        {header}
        <div className="flex flex-col items-start gap-4 px-4 md:px-6">
          <p className="text-body-large text-on-surface-variant">Curfew checks that they're at a place. Add Home first.</p>
          <Button variant="outlined" onClick={() => navigate({ to: "/location" })}>
            Add a place
          </Button>
        </div>
      </div>
    );

  return (
    <div className="flex max-w-xl flex-col pb-10">
      {header}
      <div className="flex flex-col gap-6 px-4 md:px-6">
        {intro}
        {subs.length > 1 ? (
          <Select label="Who" value={form.assigneeId} onChange={(e) => set({ assigneeId: e.target.value })}>
            {subs.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName}
              </option>
            ))}
          </Select>
        ) : (
          subs[0] && (
            <div className="border-b border-outline-variant pb-3">
              <div className="text-body-medium text-on-surface-variant">Who</div>
              <div className="text-body-large text-on-surface">{subs[0].displayName}</div>
            </div>
          )
        )}
        <Select label="Home" value={form.placeId} onChange={(e) => set({ placeId: e.target.value })}>
          {places.data.map((p) => (
            <option key={p.id} value={p.id}>
              {[p.name, p.address].filter(Boolean).join(" · ")}
            </option>
          ))}
        </Select>
        <TextField
          label={form.weekendTime ? "Sun–Thu, home by" : "Every night, home by"}
          type="time"
          value={form.time}
          onChange={(e) => e.target.value && set({ time: e.target.value })}
        />
        <div className="border-b border-outline-variant pb-2">
          <Switch
            checked={!!form.weekendTime}
            onChange={(on) => set({ weekendTime: on ? (saved?.weekendTime ?? "00:00") : null })}
            label="Weekends differ"
            help={form.weekendTime ? `Fri–Sat, home by ${fmtClock(form.weekendTime)}` : undefined}
          />
        </div>
        {form.weekendTime && (
          <TextField label="Fri–Sat, home by" type="time" value={form.weekendTime} onChange={(e) => e.target.value && set({ weekendTime: e.target.value })} />
        )}
        <TextField label="Stay in until" type="time" value={form.until} onChange={(e) => e.target.value && set({ until: e.target.value })} />
        {features.points && (
          <div className="flex gap-4">
            <TextField
              label="Points for keeping it"
              type="number"
              min={0}
              value={form.points}
              onChange={(e) => set({ points: num(e.target.value) })}
              className="flex-1"
            />
            <TextField
              label="Points lost if it's broken"
              type="number"
              min={0}
              value={form.missPenalty}
              onChange={(e) => set({ missPenalty: num(e.target.value) })}
              className="flex-1"
            />
          </div>
        )}
        {features.consequences && (
          <Select label="If it's broken" value={form.consequenceId ?? ""} onChange={(e) => set({ consequenceId: e.target.value || null })}>
            <option value="">No consequence</option>
            {consequences.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
        )}
        {who !== "You" && (
          <div className="border-b border-outline-variant pb-2">
            <Switch checked={form.reportHome} onChange={(reportHome) => set({ reportHome })} label={`${who} tells you they're home`} />
          </div>
        )}
        {!subs.length && <p className="text-body-large text-on-surface-variant">Curfew is for a submissive in this dynamic; invite them first.</p>}
        <Button
          className="mt-4 h-14 w-full"
          busy={save.isPending}
          disabled={!form.placeId || !form.assigneeId || (saved?.enabled && !dirty)}
          onClick={() => submit({ ...form, enabled: true })}
        >
          {saved?.enabled ? "Save" : "Turn on curfew"}
        </Button>
        {saved?.enabled && (
          <button type="button" className="self-center text-body-large text-on-surface-variant" onClick={() => submit({ ...form, enabled: false })}>
            Turn curfew off
          </button>
        )}
      </div>
    </div>
  );
}
