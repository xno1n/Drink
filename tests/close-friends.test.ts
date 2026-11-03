import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { anon, signIn, DEMO, uniq, type Session } from "./helpers";

let alice: Session, bob: Session, adm: Session;
const cfPost = async (s: Session, label: string, extra: Record<string, unknown> = {}) => {
  const { data, error } = await s.c.from("posts").insert({ author_id: s.id, body: uniq(label), audience: "close_friends", ...extra }).select("id, body, audience, audience_owner").single();
  expect(error).toBeNull(); return data!;
};
beforeAll(async () => {
  alice = await signIn(DEMO.alice); bob = await signIn(DEMO.bob); adm = await signIn(DEMO.admin);
  await alice.c.from("close_friends").delete().eq("owner_id", alice.id);
});
afterAll(async () => { await alice.c.from("close_friends").delete().eq("owner_id", alice.id); });

describe("close friends visibility", () => {
  it("is visible to the author and listed friends only", async () => {
    const p = await cfPost(alice, "cf");
    expect(p.audience).toBe("close_friends"); expect(p.audience_owner).toBe(alice.id);
    const see = async (s: { c: Session["c"] }) => (await s.c.from("posts_feed").select("id").eq("id", p.id).maybeSingle()).data;
    expect(await see(alice)).not.toBeNull();
    expect(await see(bob)).toBeNull();               // not on the list
    expect(await see({ c: anon() })).toBeNull();            // anonymous
    expect((await alice.c.from("close_friends").insert({ owner_id: alice.id, friend_id: bob.id })).error).toBeNull();
    expect(await see(bob)).not.toBeNull();           // now on the list
    await alice.c.from("close_friends").delete().eq("owner_id", alice.id).eq("friend_id", bob.id);
    expect(await see(bob)).toBeNull();               // removed again
  });
  it("the list is private and cannot contain yourself", async () => {
    await alice.c.from("close_friends").insert({ owner_id: alice.id, friend_id: bob.id });
    expect((await bob.c.from("close_friends").select("owner_id").eq("owner_id", alice.id)).data ?? []).toHaveLength(0);
    expect((await alice.c.from("close_friends").insert({ owner_id: alice.id, friend_id: alice.id })).error).not.toBeNull();
    expect((await bob.c.from("close_friends").insert({ owner_id: alice.id, friend_id: bob.id })).error).not.toBeNull(); // cannot edit someone else's list
  });
  it("audience cannot be changed after posting", async () => {
    const p = await cfPost(alice, "locked");
    expect((await alice.c.from("posts").update({ audience: "public", audience_owner: null }).eq("id", p.id)).error).not.toBeNull();
  });
});

describe("replies, hashtags, trending", () => {
  it("only friends can reply to a close-friends post, and replies stay inside the circle", async () => {
    await alice.c.from("close_friends").delete().eq("owner_id", alice.id);
    const p = await cfPost(alice, "thread");
    const body = uniq("reply");
    expect((await bob.c.from("posts").insert({ author_id: bob.id, body, reply_to_id: p.id })).error).not.toBeNull(); // bob can't see it
    await alice.c.from("close_friends").insert({ owner_id: alice.id, friend_id: bob.id });
    const r = await bob.c.from("posts").insert({ author_id: bob.id, body, reply_to_id: p.id, audience: "public" }).select("id, audience, audience_owner").single();
    expect(r.error).toBeNull();
    expect(r.data?.audience).toBe("close_friends");   // a "public" request is overridden
    expect(r.data?.audience_owner).toBe(alice.id);
    expect((await anon().from("posts_feed").select("id").eq("id", r.data!.id).maybeSingle()).data).toBeNull();
    expect((await alice.c.from("posts_feed").select("id").eq("id", r.data!.id).maybeSingle()).data).not.toBeNull();
  });
  it("hashtags of close-friends posts do not reach trending or non-friends", async () => {
    await alice.c.from("close_friends").delete().eq("owner_id", alice.id);
    const tag = `cf${Date.now()}`;
    const { data: p } = await alice.c.from("posts").insert({ author_id: alice.id, body: uniq("tagged") + ` #${tag}`, audience: "close_friends" }).select("id").single();
    const trending = (await bob.c.rpc("trending_hashtags", { p_hours: 24, p_limit: 50 })).data as { tag: string }[];
    expect(trending.map((t) => t.tag)).not.toContain(tag);
    const { data: h } = await bob.c.from("hashtags").select("id").eq("tag", tag).maybeSingle();
    if (h) expect((await bob.c.from("post_hashtags").select("post_id").eq("hashtag_id", h.id).eq("post_id", p!.id)).data ?? []).toHaveLength(0);
  });
});

describe("blocking and moderation", () => {
  it("blocking removes the friendship", async () => {
    await alice.c.from("close_friends").upsert({ owner_id: alice.id, friend_id: bob.id });
    await bob.c.from("blocks").upsert({ blocker_id: bob.id, blocked_id: alice.id });
    expect((await alice.c.from("close_friends").select("friend_id").eq("friend_id", bob.id)).data ?? []).toHaveLength(0);
    await bob.c.from("blocks").delete().eq("blocker_id", bob.id).eq("blocked_id", alice.id);
  });
  it("staff can see close-friends posts for moderation", async () => {
    const p = await cfPost(alice, "modview");
    expect((await adm.c.from("posts").select("id").eq("id", p.id).maybeSingle()).data).not.toBeNull();
  });
});
