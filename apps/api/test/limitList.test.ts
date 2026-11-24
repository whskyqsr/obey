import { LIMIT_STARTERS } from "@obey/contracts";
import { usualSides } from "../src/routes/limitList.js";
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
    expect(
      (
        await sub.put(`${url}/answers/gags`, {
          rating: "soft",
          note: "Only soft ones",
        })
      ).status,
    ).toBe(200);
    expect((await sub.put(`${url}/answers/not-an-item`, { rating: "love" })).status).toBe(404);
    expect((await sub.put(`${url}/answers/kneeling`, { rating: "meh" })).status).toBe(400);
    const own = (await dom.post(`${url}/items`, { title: "Silent dinners" })).body;
    expect(own).toMatchObject({
      custom: true,
      category: "Your own",
      createdBy: domId,
    });
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
    expect(seen.answers).toEqual({
      kneeling: { rating: "love", note: "" },
      gags: { rating: "soft", note: "Only soft ones" },
    });

    // Clearing an answer skips it; removing an item takes its answers with it.
    await sub.put(`${url}/answers/kneeling`, { rating: null });
    expect((await dom.del(`${url}/items/${own.key}`)).status).toBe(204);
    const after = (await sub.get(url)).body;
    expect(after.items.length).toBe(LIMIT_STARTERS.length);
    expect(after.people.find((p: { userId: string }) => p.userId === domId).answers).toEqual({ kneeling: { rating: "love", note: "" } });
    expect(after.people.find((p: { userId: string }) => p.userId === subId).rated).toBe(1);
  });

  it("takes answers for both sides, and puts one without a side on the person's usual side", async () => {
    const { dom, sub, relId, subId, domId } = await ctx.pair();
    const url = `/relationships/${relId}/limit-list`;
    await sub.put(`${url}/answers/canes`, { rating: "curious" });
    await sub.put(`${url}/answers/canes`, {
      rating: "hard",
      side: "dom",
      note: "Not on Sir",
    });
    await dom.put(`${url}/answers/canes`, { rating: "love", side: "dom" });
    await dom.put(`${url}/answers/kneeling`, { rating: "like", side: "sub" });
    expect((await dom.put(`${url}/answers/canes`, { rating: "love", side: "both" })).status).toBe(400);
    const mine = (await sub.get(url)).body.people.find((p: { userId: string }) => p.userId === subId);
    expect(mine.sides).toEqual({
      dom: { canes: { rating: "hard", note: "Not on Sir" } },
      sub: { canes: { rating: "curious", note: "" } },
    });
    expect(mine.answers).toEqual({ canes: { rating: "curious", note: "" } });
    expect(mine.rated).toBe(1);
    const theirs = (await sub.get(url)).body.people.find((p: { userId: string }) => p.userId === domId);
    expect(theirs).toMatchObject({ rated: 2, answers: null, sides: null });
    const item = (await sub.get(url)).body.items.find((i: { key: string }) => i.key === "canes");
    expect(item.sentences).toEqual({
      sub: "{name} canes you",
      dom: "You cane {name}",
    });
  });

  it("fills a new list in from your own limits as a draft, and asks before copying later changes", async () => {
    const { sub, relId, subId } = await ctx.pair();
    const url = `/relationships/${relId}/limit-list`;
    expect((await sub.get("/me/limit-profile")).body).toMatchObject({ rated: 0, sides: { dom: {}, sub: {} } });
    expect((await sub.get("/me/limit-profile")).body.items.length).toBe(LIMIT_STARTERS.length);
    expect((await sub.put("/me/limit-profile/answers/canes", { rating: "hard", side: "sub" })).status).toBe(200);
    expect((await sub.put("/me/limit-profile/answers/kneeling", { rating: "love", note: "On a cushion", side: "sub" })).status).toBe(200);
    expect((await sub.put("/me/limit-profile/answers/kneeling", { rating: "like" })).status).toBe(400);
    expect((await sub.put("/me/limit-profile/answers/not-an-item", { rating: "like", side: "dom" })).status).toBe(404);
    expect((await sub.get("/me/limit-profile")).body.rated).toBe(2);

    // Opening the list fills it in once, unfinished.
    let me = (await sub.get(url)).body.people.find((p: { userId: string }) => p.userId === subId);
    expect(me).toMatchObject({ fromProfile: true, finishedAt: null, rated: 2 });
    expect(me.sides.sub.kneeling).toEqual({ rating: "love", note: "On a cushion" });
    await sub.put(`${url}/answers/canes`, { rating: "soft", side: "sub" });

    // A second dynamic, opened after a change to the profile.
    const dom2 = ctx.as(crypto.randomUUID(), "Sam");
    const rel2 = (await dom2.post("/relationships", { role: "dominant" })).body;
    const invite = (await dom2.post(`/relationships/${rel2.id}/invites`)).body;
    await sub.post("/relationships/join", { code: invite.code, role: "submissive" });
    await sub.put("/me/limit-profile/answers/gags", { rating: "curious", side: "sub" });
    expect((await sub.get(`/relationships/${rel2.id}/limit-list`)).body.people.find((p: { userId: string }) => p.userId === subId).rated).toBe(3);
    await sub.put(`/relationships/${rel2.id}/limit-list/finished`, {});

    // Change two answers in the profile; only lists where they differ are offered.
    await sub.put("/me/limit-profile/answers/kneeling", { rating: null, side: "sub" });
    await sub.put("/me/limit-profile/answers/gags", { rating: "curious", side: "sub" });
    const changes = [
      { itemKey: "kneeling", side: "sub" },
      { itemKey: "gags", side: "sub" },
    ];
    const matches = (await sub.post("/me/limit-profile/matches", { changes })).body;
    expect(matches).toEqual(
      expect.arrayContaining([
        { relationshipId: relId, name: "Dom", differ: 2, finished: false },
        { relationshipId: rel2.id, name: "Sam", differ: 1, finished: true },
      ]),
    );
    expect(matches.length).toBe(2);

    await sub.post("/me/limit-profile/apply", { changes, relationshipIds: [relId] });
    me = (await sub.get(url)).body.people.find((p: { userId: string }) => p.userId === subId);
    expect(me.sides.sub).toEqual({ canes: { rating: "soft", note: "" }, gags: { rating: "curious", note: "" } });
    const other = (await sub.get(`/relationships/${rel2.id}/limit-list`)).body.people.find((p: { userId: string }) => p.userId === subId);
    expect(other.sides.sub.kneeling).toEqual({ rating: "love", note: "On a cushion" });
    expect(other.fromProfile).toBe(false);

    // Clearing everything in a list doesn't fill it in again.
    for (const k of ["canes", "gags"]) await sub.put(`${url}/answers/${k}`, { rating: null, side: "sub" });
    expect((await sub.get(url)).body.people.find((p: { userId: string }) => p.userId === subId).rated).toBe(0);
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

describe("usual side", () => {
  it("follows the role, and for a switch the opposite of their partner's", () => {
    expect(usualSides("dominant", "submissive")).toEqual(["dom"]);
    expect(usualSides("submissive", undefined)).toEqual(["sub"]);
    expect(usualSides("switch", "dominant")).toEqual(["sub"]);
    expect(usualSides("switch", "submissive")).toEqual(["dom"]);
    expect(usualSides("switch", "switch")).toEqual(["dom", "sub"]);
  });
});
