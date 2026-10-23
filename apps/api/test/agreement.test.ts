import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { diffLines } from "../src/routes/agreement.js";
import { setup } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  ctx = await setup();
});
afterAll(async () => ctx.close());

const lastTo = (userId: string) => [...ctx.notifier.sent].reverse().find((s) => s.userIds.includes(userId))?.push;

describe("the agreement", () => {
  it("takes effect once both agree, keeps the version before in force until then, and marks what changed", async () => {
    const { dom, sub, relId, domId, subId } = await ctx.pair();
    const spending = (await dom.post(`/relationships/${relId}/rules`, { title: "Ask before spending over $50" })).body;
    const limits = (await dom.post(`/relationships/${relId}/notes`, { title: "Limits", bodyMd: "Hard: none of that." })).body;
    expect((await dom.get(`/relationships/${relId}/agreement`)).body).toEqual({ current: null, proposal: null, versions: [], drift: [] });

    // The template has everyone's names and points at the Limits note.
    const { sections } = (await dom.get(`/relationships/${relId}/agreement/template`)).body;
    expect(sections.map((s: { title: string }) => s.title)).toEqual(["Why we're doing this", "What Dom will do", "What Sub will do", "Limits", "Safewords", "Rules", "Protocols"]);
    expect(sections.find((s: { id: string }) => s.id === "limits").noteId).toBe(limits.id);

    const v1 = await dom.post(`/relationships/${relId}/agreement`, { sections, note: "First go" });
    expect(v1.status).toBe(201);
    expect(v1.body).toMatchObject({ number: 1, status: "proposed", proposedBy: domId, agreements: [{ userId: domId }] });
    expect(v1.body.sections.find((s: { id: string }) => s.id === "rules")).toMatchObject({ items: ["Ask before spending over $50"] });
    expect(v1.body.sections.find((s: { id: string }) => s.id === "limits")).toMatchObject({ noteTitle: "Limits" });
    expect(lastTo(subId)).toMatchObject({ body: "Dom proposed version 1 of your agreement", data: { type: "agreement_proposed" } });

    // Proposing doesn't count as agreed: there's nothing in force yet.
    expect((await sub.get(`/relationships/${relId}/agreement`)).body).toMatchObject({ current: null, proposal: { id: v1.body.id } });
    expect((await dom.post(`/agreement-versions/${v1.body.id}/request-changes`, { note: "x" })).status).toBe(409);
    const agreed = (await sub.post(`/agreement-versions/${v1.body.id}/agree`)).body;
    expect(agreed).toMatchObject({ status: "agreed", agreedAt: expect.any(String) });
    expect(lastTo(domId)!.body).toBe("Sub agreed. Version 1 of your agreement is in force");

    // Sub proposes version 2; Dom asks for changes, then edits it into their own proposal.
    const changed = sections
      .map((s: { id: string; body: string }) => (s.id === "sub-1" ? { ...s, body: `${s.body}\n- Be home by curfew.` } : s))
      .filter((s: { id: string }) => s.id !== "safewords");
    await dom.post(`/relationships/${relId}/rules`, { title: "Text when you leave work" });
    const v2 = (await sub.post(`/relationships/${relId}/agreement`, { sections: changed, note: "Curfew" })).body;
    expect(v2).toMatchObject({ number: 2, status: "proposed", removed: ["Safewords"], changes: 3 });
    expect(v2.sections.find((s: { id: string }) => s.id === "sub-1")).toMatchObject({
      change: "changed",
      lines: [
        { op: "same", text: "- Follow our rules and keep up with daily tasks." },
        { op: "same", text: "- Say early when something isn't working." },
        { op: "add", text: "- Be home by curfew." },
      ],
    });
    expect(v2.sections.find((s: { id: string }) => s.id === "rules").lines).toEqual([
      { op: "same", text: "Ask before spending over $50" },
      { op: "add", text: "Text when you leave work" },
    ]);
    let state = (await dom.get(`/relationships/${relId}/agreement`)).body;
    expect(state.current.number).toBe(1);
    expect(state.proposal.number).toBe(2);
    // Rules have moved on since version 1 was written.
    expect(state.drift).toEqual([{ kind: "rules", verb: "added", title: "Text when you leave work" }]);

    expect((await dom.post(`/agreement-versions/${v2.id}/request-changes`, { note: "Keep the safewords" })).body).toMatchObject({
      status: "changes_requested",
      feedback: { userId: domId, note: "Keep the safewords" },
      agreements: [{ userId: subId }],
    });
    expect(lastTo(subId)!.body).toBe("Dom asked for changes to the agreement");
    const edited = (await dom.post(`/relationships/${relId}/agreement`, { sections: [...changed, sections.find((s: { id: string }) => s.id === "safewords")] })).body;
    expect(edited).toMatchObject({ id: v2.id, number: 2, status: "proposed", proposedBy: domId, removed: [], feedback: null, agreements: [{ userId: domId }] });
    expect(lastTo(subId)!.body).toBe("Dom changed version 2 of your agreement");
    expect((await dom.del(`/agreement-versions/${v2.id}`)).status).toBe(204);
    expect((await sub.get(`/relationships/${relId}/agreement`)).body.proposal).toBeNull();

    // Withdrawn numbers are reused, and agreeing retires the version before.
    const v2b = (await dom.post(`/relationships/${relId}/agreement`, { sections: changed })).body;
    expect(v2b.number).toBe(2);
    expect((await sub.del(`/agreement-versions/${v2b.id}`)).status).toBe(403);
    await sub.post(`/agreement-versions/${v2b.id}/agree`);
    state = (await dom.get(`/relationships/${relId}/agreement`)).body;
    expect(state).toMatchObject({ current: { number: 2 }, proposal: null, drift: [] });
    await dom.del(`/rules/${spending.id}`);
    expect((await sub.get(`/relationships/${relId}/agreement`)).body.drift).toEqual([{ kind: "rules", verb: "removed", title: "Ask before spending over $50" }]);
    expect(state.versions.map((v: { number: number; status: string }) => [v.number, v.status])).toEqual([
      [2, "agreed"],
      [1, "superseded"],
    ]);
    expect((await sub.get(`/agreement-versions/${agreed.id}`)).body.number).toBe(1);
    expect((await sub.post(`/agreement-versions/${agreed.id}/agree`)).status).toBe(409);

    // Another dynamic can't read it, and switching it off hides it.
    const other = await ctx.pair();
    expect((await other.dom.get(`/agreement-versions/${agreed.id}`)).status).toBe(404);
    await dom.patch(`/relationships/${relId}`, { features: { agreement: false } });
    expect((await sub.get(`/relationships/${relId}/agreement`)).status).toBe(403);
  });

  it("diffs lines by longest common run", () => {
    expect(diffLines(["a", "b", "c"], ["a", "c", "d"])).toEqual([
      { op: "same", text: "a" },
      { op: "del", text: "b" },
      { op: "same", text: "c" },
      { op: "add", text: "d" },
    ]);
  });
});

describe("rule and protocol changes", () => {
  it("tell the other partner, naming it only to someone who shows their partner's words", async () => {
    const { dom, sub, relId, subId, domId } = await ctx.pair();
    const rule = (await dom.post(`/relationships/${relId}/rules`, { title: "Lights out by 11" })).body;
    expect(lastTo(subId)).toMatchObject({ body: "Dom added a rule", data: { type: "library_changed", kind: "rules" } });
    expect(ctx.notifier.sent.at(-1)!.userIds).toEqual([subId]);
    await sub.patch("/me", { notifyDetails: true });
    await dom.patch(`/rules/${rule.id}`, { title: "Lights out by 10:30" });
    expect(lastTo(subId)!.body).toBe("Dom changed the rule “Lights out by 10:30”");
    const sent = ctx.notifier.sent.length;
    await dom.put(`/relationships/${relId}/rules/order`, { ids: [rule.id] });
    expect(ctx.notifier.sent.length).toBe(sent);
    const p = (await dom.post(`/relationships/${relId}/protocols`, { title: "Morning greeting" })).body;
    await dom.del(`/protocols/${p.id}`);
    expect(lastTo(subId)!.body).toBe("Dom removed the protocol “Morning greeting”");

    // Today keeps what Sub hasn't seen, one entry per item: an unseen protocol added then removed leaves nothing.
    let changes = (await sub.get(`/relationships/${relId}/library-changes`)).body;
    expect(changes).toEqual([expect.objectContaining({ kind: "rules", verb: "added", itemId: rule.id, title: "Lights out by 10:30", changedBy: domId })]);
    expect((await dom.get(`/relationships/${relId}/library-changes`)).body).toEqual([]);
    expect((await sub.post(`/relationships/${relId}/library-changes/seen`, { ids: [changes[0].id] })).status).toBe(204);
    await dom.patch(`/rules/${rule.id}`, { bodyMd: "Phone down too." });
    changes = (await sub.get(`/relationships/${relId}/library-changes`)).body;
    expect(changes).toEqual([expect.objectContaining({ verb: "changed", title: "Lights out by 10:30" })]);
    await dom.del(`/rules/${rule.id}`);
    expect((await sub.get(`/relationships/${relId}/library-changes`)).body).toEqual([expect.objectContaining({ verb: "removed", itemId: rule.id })]);
  });
});
