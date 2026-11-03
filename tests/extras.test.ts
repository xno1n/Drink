import { describe, it, expect, beforeAll } from "vitest";
import { signIn, DEMO, newPost, type Session } from "./helpers";

let alice: Session, bob: Session, adm: Session;
beforeAll(async () => { alice = await signIn(DEMO.alice); bob = await signIn(DEMO.bob); adm = await signIn(DEMO.admin); });

describe("notification preferences", () => {
  it("do not create notifications for disabled types", async () => {
    const all = { follow: true, like: true, reply: true, repost: true, mention: true, quote: true, message: true };
    await bob.c.from("user_settings").update({ notify: { ...all, like: false } }).eq("user_id", bob.id);
    const p = await newPost(bob, "prefs");
    await alice.c.rpc("toggle_like", { p_post: p.id });
    expect((await bob.c.from("notifications").select("id").eq("post_id", p.id).eq("type", "like")).data ?? []).toHaveLength(0);
    await bob.c.from("user_settings").update({ notify: all }).eq("user_id", bob.id);
  });
});

describe("admin activity", () => {
  it("is staff-only and returns one row per day", async () => {
    expect((await alice.c.rpc("admin_daily_activity", { p_days: 14 })).error).not.toBeNull();
    const r = await adm.c.rpc("admin_daily_activity", { p_days: 14 });
    expect(r.error).toBeNull(); expect(r.data).toHaveLength(14);
  });
});
