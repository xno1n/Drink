import { describe, it, expect, beforeAll } from "vitest";
import { signIn, DEMO, newPost, uniq, type Session } from "./helpers";

let alice: Session, bob: Session;
beforeAll(async () => { alice = await signIn(DEMO.alice); bob = await signIn(DEMO.bob); });

describe("For You feed", () => {
  it("includes others' recent posts, excludes my own and muted authors", async () => {
    const theirs = await newPost(bob, "foryou"); const mine = await newPost(alice, "mine");
    const ids = ((await alice.c.rpc("for_you_feed", { p_limit: 50, p_offset: 0 })).data as { id: string }[]).map((r) => r.id);
    expect(ids).toContain(theirs.id); expect(ids).not.toContain(mine.id);
    await alice.c.from("mutes").upsert({ muter_id: alice.id, muted_id: bob.id });
    const muted = ((await alice.c.rpc("for_you_feed", { p_limit: 50, p_offset: 0 })).data as { id: string }[]).map((r) => r.id);
    expect(muted).not.toContain(theirs.id);
    await alice.c.from("mutes").delete().eq("muter_id", alice.id).eq("muted_id", bob.id);
  });
  it("ranks a liked post above an otherwise identical fresh one", async () => {
    const quiet = await newPost(bob, "quiet"); const liked = await newPost(bob, "liked");
    await alice.c.rpc("toggle_like", { p_post: liked.id });
    const rows = (await alice.c.rpc("for_you_feed", { p_limit: 50, p_offset: 0 })).data as { id: string; score: number }[];
    const s = (id: string) => rows.find((r) => r.id === id)?.score ?? -1;
    expect(s(liked.id)).toBeGreaterThan(s(quiet.id));
  });
});

describe("quotes and pins", () => {
  it("quote posts embed the original and notify its author", async () => {
    const orig = await newPost(bob, "orig");
    const { data: q } = await alice.c.from("posts").insert({ author_id: alice.id, body: uniq("quoting"), quote_of_id: orig.id }).select("id").single();
    const { data: feed } = await alice.c.from("posts_feed").select("quoted").eq("id", q!.id).single();
    expect((feed?.quoted as { id: string }).id).toBe(orig.id);
    const n = await bob.c.from("notifications").select("type").eq("post_id", q!.id).eq("actor_id", alice.id);
    expect(n.data?.map((x) => x.type)).toContain("quote");
  });
  it("lets you pin your own post but not someone else's", async () => {
    const mine = await newPost(alice, "pin"); const theirs = await newPost(bob, "nopin");
    expect((await alice.c.from("profiles").update({ pinned_post_id: mine.id }).eq("id", alice.id)).error).toBeNull();
    expect((await alice.c.from("profiles").update({ pinned_post_id: theirs.id }).eq("id", alice.id)).error).not.toBeNull();
    await alice.c.from("profiles").update({ pinned_post_id: null }).eq("id", alice.id);
  });
});

describe("profile tabs", () => {
  it("has_media flag is false for text-only posts", async () => {
    const p = await newPost(alice, "textonly");
    expect((await alice.c.from("posts_feed").select("has_media").eq("id", p.id).single()).data?.has_media).toBe(false);
  });
  it("likes tab respects the owner's privacy setting", async () => {
    const p = await newPost(bob, "likedpost");
    await alice.c.rpc("toggle_like", { p_post: p.id });
    const seen = async (s: Session) => ((await s.c.rpc("profile_likes", { p_user: alice.id, p_limit: 50 })).data as { post_id: string }[] ?? []).map((r) => r.post_id);
    expect(await seen(bob)).toContain(p.id);
    await alice.c.from("user_settings").update({ likes_public: false }).eq("user_id", alice.id);
    expect(await seen(bob)).not.toContain(p.id);
    expect(await seen(alice)).toContain(p.id);
    await alice.c.from("user_settings").update({ likes_public: true }).eq("user_id", alice.id);
  });
});

describe("avatar / cover paths", () => {
  it("accepts only storage paths in the user's folder format, never URLs", async () => {
    expect((await alice.c.from("profiles").update({ avatar_url: "http://evil.example/x.png" }).eq("id", alice.id)).error).not.toBeNull();
    expect((await alice.c.from("profiles").update({ cover_url: "../../etc/passwd" }).eq("id", alice.id)).error).not.toBeNull();
    expect((await alice.c.from("profiles").update({ avatar_url: `${alice.id}/avatar-test.png` }).eq("id", alice.id)).error).toBeNull();
    await alice.c.from("profiles").update({ avatar_url: null }).eq("id", alice.id);
  });
});

describe("private media bucket", () => {
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  async function upload(s: Session) {
    const path = `${s.id}/test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.png`;
    const up = await s.c.storage.from("media").upload(path, PNG, { contentType: "image/png" });
    expect(up.error).toBeNull();
    return path;
  }
  it("others cannot sign an unreferenced file; they can once a visible post references it", async () => {
    const path = await upload(alice);
    expect((await bob.c.storage.from("media").createSignedUrl(path, 60)).error).not.toBeNull();
    const post = await newPost(alice, "withmedia");
    await alice.c.from("post_media").insert({ post_id: post.id, storage_path: path, kind: "image", position: 0 });
    expect((await bob.c.storage.from("media").createSignedUrl(path, 60)).error).toBeNull();
    await alice.c.storage.from("media").remove([path]);
  });
  it("images of a protected account's posts are not reachable by non-followers", async () => {
    await alice.c.from("follows").delete().eq("follower_id", alice.id).eq("following_id", bob.id);
    await bob.c.from("profiles").update({ is_protected: true }).eq("id", bob.id);
    const path = await upload(bob);
    const post = await newPost(bob, "privmedia");
    await bob.c.from("post_media").insert({ post_id: post.id, storage_path: path, kind: "image", position: 0 });
    expect((await alice.c.storage.from("media").createSignedUrl(path, 60)).error).not.toBeNull();
    expect((await bob.c.storage.from("media").createSignedUrl(path, 60)).error).toBeNull();
    await bob.c.from("profiles").update({ is_protected: false }).eq("id", bob.id);
    await bob.c.storage.from("media").remove([path]);
  });
});
