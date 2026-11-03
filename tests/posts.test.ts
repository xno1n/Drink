import { describe, it, expect, beforeAll } from "vitest";
import { signIn, DEMO, newPost, uniq, type Session } from "./helpers";

let alice: Session, bob: Session;
beforeAll(async () => { alice = await signIn(DEMO.alice); bob = await signIn(DEMO.bob); });

describe("posts", () => {
  it("creates a post that appears in the feed with the author", async () => {
    const p = await newPost(alice);
    const { data } = await alice.c.from("posts_feed").select("id, author_username, like_count").eq("id", p.id).single();
    expect(data?.author_username).toBe("demo_alice");
    expect(Number(data?.like_count)).toBe(0);
  });
  it("rejects over-long posts", async () => {
    const { error } = await alice.c.from("posts").insert({ author_id: alice.id, body: "x".repeat(281) });
    expect(error).not.toBeNull();
  });
  it("rejects posting as another user", async () => {
    const { error } = await alice.c.from("posts").insert({ author_id: bob.id, body: uniq("spoof") });
    expect(error).not.toBeNull();
  });
  it("rejects duplicate content posted twice in a row", async () => {
    const body = uniq("dup");
    expect((await alice.c.from("posts").insert({ author_id: alice.id, body })).error).toBeNull();
    expect((await alice.c.from("posts").insert({ author_id: alice.id, body })).error).not.toBeNull();
  });
  it("lets only the author edit; other users change nothing", async () => {
    const p = await newPost(alice);
    const other = await bob.c.from("posts").update({ body: "hijacked" }).eq("id", p.id).select();
    expect(other.data ?? []).toHaveLength(0);
    const own = await alice.c.from("posts").update({ body: p.body + " (edited)" }).eq("id", p.id).select("edited_at");
    expect(own.data?.[0]?.edited_at).toBeTruthy();
  });
  it("soft-deletes: author deletes, post leaves the feed; others cannot delete", async () => {
    const p = await newPost(alice);
    const other = await bob.c.from("posts").update({ deleted_at: new Date().toISOString() }).eq("id", p.id).select();
    expect(other.data ?? []).toHaveLength(0);
    await alice.c.from("posts").update({ deleted_at: new Date().toISOString() }).eq("id", p.id);
    expect((await bob.c.from("posts_feed").select("id").eq("id", p.id).maybeSingle()).data).toBeNull();
  });
  it("extracts hashtags", async () => {
    const tag = `t${Date.now()}`;
    const { data } = await alice.c.from("posts").insert({ author_id: alice.id, body: uniq("tagged") + ` #${tag}` }).select("id").single();
    const { data: h } = await alice.c.from("hashtags").select("id").eq("tag", tag).maybeSingle();
    expect(h).not.toBeNull();
    const { data: ph } = await alice.c.from("post_hashtags").select("post_id").eq("hashtag_id", h!.id);
    expect(ph?.map((r) => r.post_id)).toContain(data!.id);
  });
});
