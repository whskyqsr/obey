// Plans across the week (multi-day, timed, for both) and Chastity switched on, for the second audit pass.
const API = "http://localhost:3000";
const DOM = "11111111-1111-4111-8111-111111111111", SUB = "22222222-2222-4222-8222-222222222222";
const mk = (id, name) => async (method, url, body) => {
  const r = await fetch(API + url, { method, headers: { "x-dev-user": id, "x-dev-name": name, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); if (r.status >= 400) console.log("ERR", method, url, r.status, t.slice(0, 300)); try { return JSON.parse(t) } catch { return t }
};
const dom = mk(DOM, "Marcus"), sub = mk(SUB, "Kitten");
const R = `/relationships/${process.argv[2]}`;
const day = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d; };
const at = (n, h, m = 0) => { const d = day(n); d.setHours(h, m); return d.toISOString(); };
await dom("PATCH", R, { features: { chastity: true } });
await sub("POST", `${R}/events`, { title: "Off work", startsAt: day(-1).toISOString(), endsAt: day(3).toISOString(), allDay: true, withPartner: false });
await dom("POST", `${R}/events`, { title: "Thanksgiving", startsAt: day(2).toISOString(), endsAt: day(3).toISOString(), allDay: true, withPartner: true });
await sub("POST", `${R}/events`, { title: "Dinner with Jess", startsAt: at(0, 18), endsAt: at(0, 23, 30), allDay: false, withPartner: false });
await dom("POST", `${R}/events`, { title: "Work trip", startsAt: at(1, 9), endsAt: at(1, 17), allDay: false, withPartner: false });
// A running lock: hidden time, two hours added for a missed task, and a hygiene break asked.
const lock = await dom("POST", `${R}/chastity`, { minutes: 4560, hideTime: true, keyMode: "keyholder" });
await sub("POST", `/chastity/${lock.id}/lock`, {});
await dom("POST", `/chastity/${lock.id}/time`, { minutes: 120, note: "Missed Hydration" });
await sub("POST", `/chastity/${lock.id}/asks`, { kind: "break", minutes: 20 });
