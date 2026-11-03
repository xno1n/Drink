import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { signIn, DEMO, newPost, type Session } from "./helpers";

let alice: Session, bob: Session;
beforeAll(async () => {
  alice = await signIn(DEMO.alice); bob = await signIn(DEMO.bob);
  await alice.c.from("follows").delete().eq("follower_id", alice.id).eq("following_id", bob.id);
  await alice.c.from("follow_requests").delete().eq("requester_id", alice.id).eq("target_id", bob.id);
});
afterAll(async () => {
  await bob.c.from("profiles").update({ is_protected: false }).eq("id", bob.id);
  await alice.c.from("follows").delete().eq("follower_id", alice.id).eq("following_id", bob.id);
});

describe("protected accounts", () => {
  it("hides posts from non-followers, supports request → accept → visibility", async () => {
    await bob.c.from("profiles").update({ is_protected: true }).eq("id", bob.id);
    const p = await newPost(bob, "private");
    expect((await alice.c.from("posts_feed").select("id").eq("id", p.id).maybeSingle()).data).toBeNull();
    expect((await bob.c.from("posts_feed").select("id").eq("id", p.id).maybeSingle()).data).not.toBeNull();

    // cannot bypass the request flow by inserting a follow directly
    expect((await alice.c.from("follows").insert({ follower_id: alice.id, following_id: bob.id })).error).not.toBeNull();

    expect((await alice.c.rpc("follow_user", { target: bob.id })).data).toBe("requested");
    expect((await alice.c.from("posts_feed").select("id").eq("id", p.id).maybeSingle()).data).toBeNull(); // still hidden while pending
    const n = await bob.c.from("notifications").select("type").eq("actor_id", alice.id).eq("type", "follow_request");
    expect(n.data?.length).toBeGreaterThan(0);

    expect((await alice.c.rpc("accept_follow_request", { requester: bob.id })).error).toBeNull(); // wrong party: no effect
    expect((await alice.c.from("posts_feed").select("id").eq("id", p.id).maybeSingle()).data).toBeNull();

    expect((await bob.c.rpc("accept_follow_request", { requester: alice.id })).error).toBeNull();
    expect((await alice.c.from("posts_feed").select("id").eq("id", p.id).maybeSingle()).data).not.toBeNull();
  });
});

describe("blocking", () => {
  it("hides content in both directions and stops follows", async () => {
    await bob.c.from("profiles").update({ is_protected: false }).eq("id", bob.id);
    const p = await newPost(bob, "blocked");
    await bob.c.from("blocks").upsert({ blocker_id: bob.id, blocked_id: alice.id });
    expect((await alice.c.from("posts_feed").select("id").eq("id", p.id).maybeSingle()).data).toBeNull();
    expect((await alice.c.rpc("follow_user", { target: bob.id })).error).not.toBeNull();
    await bob.c.from("blocks").delete().eq("blocker_id", bob.id).eq("blocked_id", alice.id);
    expect((await alice.c.from("posts_feed").select("id").eq("id", p.id).maybeSingle()).data).not.toBeNull();
  });
});
