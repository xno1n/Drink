import { describe, it, expect, beforeAll } from "vitest";
import { signIn, DEMO, newPost, type Session } from "./helpers";

let alice: Session, bob: Session;
beforeAll(async () => { alice = await signIn(DEMO.alice); bob = await signIn(DEMO.bob); });

describe("likes, reposts, bookmarks", () => {
  it("toggles like on/off with correct counts and viewer flag", async () => {
    const p = await newPost(bob);
    expect((await alice.c.rpc("toggle_like", { p_post: p.id })).data).toBe(true);
    let { data } = await alice.c.from("posts_feed").select("like_count, liked_by_me").eq("id", p.id).single();
    expect(Number(data?.like_count)).toBe(1); expect(data?.liked_by_me).toBe(true);
    expect((await alice.c.rpc("toggle_like", { p_post: p.id })).data).toBe(false);
    ({ data } = await alice.c.from("posts_feed").select("like_count, liked_by_me").eq("id", p.id).single());
    expect(Number(data?.like_count)).toBe(0); expect(data?.liked_by_me).toBe(false);
  });
  it("prevents duplicate likes at the database level", async () => {
    const p = await newPost(bob);
    expect((await alice.c.from("likes").insert({ user_id: alice.id, post_id: p.id })).error).toBeNull();
    expect((await alice.c.from("likes").insert({ user_id: alice.id, post_id: p.id })).error?.code).toBe("23505");
  });
  it("cannot like on behalf of another user", async () => {
    const p = await newPost(bob);
    expect((await alice.c.from("likes").insert({ user_id: bob.id, post_id: p.id })).error).not.toBeNull();
  });
  it("toggles repost and bookmark", async () => {
    const p = await newPost(bob);
    expect((await alice.c.rpc("toggle_repost", { p_post: p.id })).data).toBe(true);
    expect((await alice.c.rpc("toggle_bookmark", { p_post: p.id })).data).toBe(true);
    const { data } = await alice.c.from("posts_feed").select("repost_count, reposted_by_me, bookmarked_by_me").eq("id", p.id).single();
    expect(Number(data?.repost_count)).toBe(1); expect(data?.reposted_by_me && data?.bookmarked_by_me).toBe(true);
    expect((await alice.c.rpc("toggle_repost", { p_post: p.id })).data).toBe(false);
  });
  it("replies are counted and notify the parent author", async () => {
    const p = await newPost(bob);
    const { data: r } = await alice.c.from("posts").insert({ author_id: alice.id, body: `[TEST] reply ${Date.now()}`, reply_to_id: p.id }).select("id").single();
    const { data: feed } = await alice.c.from("posts_feed").select("reply_count").eq("id", p.id).single();
    expect(Number(feed?.reply_count)).toBe(1);
    const { data: n } = await bob.c.from("notifications").select("type").eq("post_id", r!.id).eq("actor_id", alice.id);
    expect(n?.map((x) => x.type)).toContain("reply");
  });
  it("a like creates a persisted notification for the author, readable only by them", async () => {
    const p = await newPost(bob);
    await alice.c.rpc("toggle_like", { p_post: p.id });
    const mine = await bob.c.from("notifications").select("type, actor_id").eq("post_id", p.id);
    expect(mine.data?.some((n) => n.type === "like" && n.actor_id === alice.id)).toBe(true);
    expect((await alice.c.from("notifications").select("id").eq("post_id", p.id)).data ?? []).toHaveLength(0);
  });
  it("does not notify users about their own actions", async () => {
    const p = await newPost(bob);
    await bob.c.rpc("toggle_like", { p_post: p.id });
    expect((await bob.c.from("notifications").select("id").eq("post_id", p.id).eq("actor_id", bob.id)).data ?? []).toHaveLength(0);
  });
});

describe("follow graph", () => {
  it("follows and unfollows; rejects self-follow", async () => {
    await alice.c.from("follows").delete().eq("follower_id", alice.id).eq("following_id", bob.id);
    expect((await alice.c.rpc("follow_user", { target: bob.id })).data).toBe("following");
    expect((await alice.c.from("follows").select("follower_id").eq("following_id", bob.id).eq("follower_id", alice.id)).data).toHaveLength(1);
    expect((await alice.c.rpc("follow_user", { target: alice.id })).error).not.toBeNull();
    expect((await alice.c.from("follows").insert({ follower_id: alice.id, following_id: alice.id })).error).not.toBeNull();
    await alice.c.from("follows").delete().eq("follower_id", alice.id).eq("following_id", bob.id);
    expect((await alice.c.from("follows").select("follower_id").eq("following_id", bob.id).eq("follower_id", alice.id)).data ?? []).toHaveLength(0);
  });
});
