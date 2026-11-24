const API = "http://localhost:3000";
const DOM = "11111111-1111-4111-8111-111111111111", SUB = "22222222-2222-4222-8222-222222222222";
const mk = (id, name) => async (method, url, body) => {
  const r = await fetch(API + url, { method, headers: { "x-dev-user": id, "x-dev-name": name, "content-type": "application/json" }, body: body === undefined ? (method==="GET"?undefined:"{}") : JSON.stringify(body) });
  const t = await r.text(); if (r.status >= 400) console.log("ERR", method, url, r.status, t.slice(0, 300)); try { return JSON.parse(t) } catch { return t }
};
const dom = mk(DOM, "Marcus"), sub = mk(SUB, "Kitten"); const TZ = "America/Detroit";
const rel = { id: process.argv[2] };
const R = `/relationships/${rel.id}`; const subId = (await sub("GET", "/me")).user.id;
const today = new Date().toISOString().slice(0, 10); const d10 = new Date(Date.now()-10*864e5).toISOString().slice(0,10);
await dom("POST", `${R}/tasks`, { title: "Morning ritual", assigneeId: subId, points: 10, schedule: { start: d10, rule: { freq: "daily" } }, dueTime: "08:30", timezone: TZ, steps: [{id:"a",title:"Kneel for a minute"},{id:"b",title:"Say good morning"},{id:"c",title:"Plan the day"}] });
await dom("POST", `${R}/tasks`, { title: "Tidy the desk", assigneeId: subId, points: 5, schedule: { start: today }, dueTime: "23:59", timezone: TZ });
const cqs = await dom("GET", `${R}/consequences`); const cq = (cqs.consequences ?? cqs).find(c => /lines/.test(c.title));
await dom("POST", `/consequences/${cq.id}/assign`, { assigneeId: subId, date: today, dueTime: "22:00", timezone: TZ, reason: "Skipped the gym without asking" });
await dom("POST", `${R}/agreement`, { sections: [{ id: "why", title: "Why we're doing this", body: "To keep each other steady." }, { id: "lim", title: "Limits", body: "See the Limits list." }], note: "First go" });
console.log(rel.id);
