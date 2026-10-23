import { LIMIT_STARTERS } from "@obey/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setup } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  ctx = await setup();
});
afterAll(async () => ctx.close());

describe("limits list", () => {
  it("keeps each person's answers to themselves until both have finished", async () => {
    const { dom, sub, relId, subId, domId } = await ctx.pair();
    const url = `/relationships/${relId}/limit-list`;
    const list = (await sub.get(url)).body;
    expect(list.items.length).toBe(LIMIT_STARTERS.length);
    expect(new Set(list.items.map((i: { key: string }) => i.key)).size).toBe(LIMIT_STARTERS.length);
    expect(list.people.map((p: { answers: unknown }) => p.answers)).toEqual(expect.arrayContaining([{}, null]));

    expect((await sub.put(`${url}/answers/kneeling`, { rating: "love" })).status).toBe(200);
    expect((await sub.put(`${url}/answers/gags`, { rating: "soft", note: "Only soft ones" })).status).toBe(200);
    expect((await sub.put(`${url}/answers/not-an-item`, { rating: "love" })).status).toBe(404);
    expect((await sub.put(`${url}/answers/kneeling`, { rating: "meh" })).status).toBe(400);
    const own = (await dom.post(`${url}/items`, { title: "Silent dinners" })).body;
    expect(own).toMatchObject({ custom: true, category: "Your own", createdBy: domId });
    await dom.put(`${url}/answers/${own.key}`, { rating: "like" });
    await dom.put(`${url}/answers/kneeling`, { rating: "love" });
    expect((await sub.del(`${url}/items/${own.key}`)).status).toBe(403);

    // The Dominant can't see the sub's answers, even after finishing first.
    await dom.put(`${url}/finished`, {});
    let seen = (await dom.get(url)).body.people.find((p: { userId: string }) => p.userId === subId);
    expect(seen).toMatchObject({ rated: 2, answers: null, finishedAt: null });
    expect(ctx.notifier.sent.at(-1)).toMatchObject({ userIds: [subId] });

    await sub.put(`${url}/finished`, {});
    seen = (await dom.get(url)).body.people.find((p: { userId: string }) => p.userId === subId);
    expect(seen.answers).toEqual({ kneeling: { rating: "love", note: "" }, gags: { rating: "soft", note: "Only soft ones" } });

    // Clearing an answer skips it; removing an item takes its answers with it.
    await sub.put(`${url}/answers/kneeling`, { rating: null });
    expect((await dom.del(`${url}/items/${own.key}`)).status).toBe(204);
    const after = (await sub.get(url)).body;
    expect(after.items.length).toBe(LIMIT_STARTERS.length);
    expect(after.people.find((p: { userId: string }) => p.userId === domId).answers).toEqual({ kneeling: { rating: "love", note: "" } });
    expect(after.people.find((p: { userId: string }) => p.userId === subId).rated).toBe(1);
  });

  it("is closed while the dynamic has it switched off", async () => {
    const { dom, sub, relId } = await ctx.pair();
    const url = `/relationships/${relId}/limit-list`;
    await dom.patch(`/relationships/${relId}`, { features: { limits: false } });
    expect((await sub.get(url)).status).toBe(403);
    expect((await sub.put(`${url}/answers/kneeling`, { rating: "love" })).status).toBe(403);
    await dom.patch(`/relationships/${relId}`, { features: { limits: true } });
    expect((await sub.get(url)).status).toBe(200);
  });
});
