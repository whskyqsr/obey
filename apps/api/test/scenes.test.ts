import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sceneCheckIns } from "../src/routes/scenes.js";
import { setup } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  ctx = await setup();
});
afterAll(async () => ctx.close());

const lastTo = (userId: string) => [...ctx.notifier.sent].reverse().find((s) => s.userIds.includes(userId))?.push;

describe("the scene log", () => {
  it("keeps each side hidden until you share yours, and checks in the next morning", async () => {
    ctx.clock.now = new Date("2026-10-17T02:00:00Z");
    const { dom, sub, relId, domId, subId } = await ctx.pair();
    // Friday 9 PM in New York.
    const logged = await dom.post(`/relationships/${relId}/scenes`, {
      title: "Friday night",
      occurredAt: "2026-10-16T21:00:00-04:00",
      timezone: "America/New_York",
      safeword: "yellow",
      aftercare: ["Water", "Blanket"],
    });
    expect(logged.status).toBe(201);
    const id = logged.body.id;
    expect(logged.body).toMatchObject({ loggedBy: domId, safeword: "yellow", checkFrom: "2026-10-17T14:00:00.000Z", shared: [], sides: [], checks: [] });
    // The lock screen never says what it was.
    expect(lastTo(subId)).toMatchObject({ body: "Dom asked how it went for you", data: { type: "scene_logged", sceneId: id } });

    await dom.put(`/scenes/${id}/side`, { mood: 5, worked: "Checking in first.", change: "Water ready before." });
    expect(lastTo(subId)!.body).toBe("Dom shared how it went");
    let seen = (await sub.get(`/scenes/${id}`)).body;
    expect(seen).toMatchObject({ shared: [domId], sides: [] });
    await sub.put(`/scenes/${id}/side`, { mood: 4, worked: "Stopping when I called yellow." });
    seen = (await sub.get(`/scenes/${id}`)).body;
    expect(seen.sides.map((s: { userId: string }) => s.userId).sort()).toEqual([domId, subId].sort());
    expect(seen.sides.find((s: { userId: string }) => s.userId === domId)).toMatchObject({ mood: 5, change: "Water ready before." });

    // Editing a shared side doesn't tell anyone again.
    const sent = ctx.notifier.sent.length;
    await sub.put(`/scenes/${id}/side`, { mood: 3, worked: "Stopping when I called yellow." });
    expect(ctx.notifier.sent.length).toBe(sent);

    // The check-in opens at 10 AM the day after, once: each person is asked how they feel if they haven't said, and
    // nudged to check in with the other.
    expect((await sub.put(`/scenes/${id}/check`, { mood: 4 })).status).toBe(409);
    expect(await sceneCheckIns(ctx.db, ctx.notifier, ctx.clock.now)).toBe(0);
    ctx.clock.now = new Date("2026-10-17T14:05:00Z");
    expect((await sub.put(`/scenes/${id}/check`, { mood: 4 })).body.checks).toEqual([{ userId: subId, mood: 4, note: "", at: "2026-10-17T14:05:00.000Z", seen: false }]);
    // A good check-in with nothing still needed doesn't ask for the Dominant.
    expect(lastTo(domId)!.body).toBe("Sub shared how it went");
    expect(await sceneCheckIns(ctx.db, ctx.notifier, ctx.clock.now)).toBe(1);
    expect(lastTo(domId)).toMatchObject({ body: "How are you feeling after last night? And check in with Sub.", data: { type: "scene_check" } });
    expect(lastTo(subId)!.body).toBe("Check in with Dom about last night");
    expect(await sceneCheckIns(ctx.db, ctx.notifier, ctx.clock.now)).toBe(0);

    // Something still needed reaches the others, in words only if they've asked for them; a reply counts as seen.
    await sub.put(`/scenes/${id}/check`, { mood: 3, note: "A long hug tonight." });
    expect(lastTo(domId)!.body).toBe("Sub checked in and still needs something");
    await dom.patch("/me", { notifyDetails: true });
    await sub.put(`/scenes/${id}/check`, { mood: 2, note: "A long hug tonight." });
    expect(lastTo(domId)!.body).toBe("Sub checked in feeling low: “A long hug tonight.”");
    expect((await sub.post(`/scenes/${id}/checks/${subId}/seen`)).status).toBe(403);
    expect((await dom.post(`/scenes/${id}/checks/${subId}/seen`)).body.checks[0].seen).toBe(true);
    await sub.put(`/scenes/${id}/check`, { mood: 1 });
    expect((await dom.get(`/scenes/${id}`)).body.checks[0]).toMatchObject({ mood: 1, seen: false });
    await dom.post(`/scenes/${id}/comments`, { body: "On my way." });
    expect((await sub.get(`/scenes/${id}`)).body.checks[0].seen).toBe(true);

    // Aftercare: each person's own plan, and closing the card on Today.
    expect((await sub.put(`/relationships/${relId}/aftercare`, { needs: ["Water", "Cuddles"], note: "Stay close." })).status).toBe(200);
    const plans = (await dom.get(`/relationships/${relId}/aftercare`)).body;
    expect(plans.find((p: { userId: string }) => p.userId === subId)).toMatchObject({ needs: ["Water", "Cuddles"], note: "Stay close." });
    expect(plans.find((p: { userId: string }) => p.userId === domId)).toMatchObject({ needs: [], updatedAt: null });
    expect((await dom.post(`/scenes/${id}/aftercare-done`)).body.aftercareDone).toBe(true);
    expect((await sub.get(`/scenes/${id}`)).body.aftercareDone).toBe(false);

    // Comments, and only whoever logged it deletes it.
    expect((await sub.post(`/scenes/${id}/comments`, { body: "Thank you." })).status).toBe(201);
    expect((await dom.get(`/relationships/${relId}/scenes`)).body[0]).toMatchObject({ id, commentCount: 2 });
    expect((await sub.del(`/scenes/${id}`)).status).toBe(403);
    expect((await dom.del(`/scenes/${id}`)).status).toBe(204);

    // Another dynamic can't see it, and the switch hides it all.
    const kept = (await sub.post(`/relationships/${relId}/scenes`, { occurredAt: "2026-10-17T20:00:00-04:00", timezone: "America/New_York" })).body;
    const other = await ctx.pair();
    expect((await other.dom.get(`/scenes/${kept.id}`)).status).toBe(404);
    await dom.patch(`/relationships/${relId}`, { features: { scenes: false } });
    expect((await sub.get(`/relationships/${relId}/aftercare`)).status).toBe(403);
  });
});
