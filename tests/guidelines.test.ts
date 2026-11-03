import { describe, it, expect, beforeAll } from "vitest";
import { anon, signIn, DEMO, type Session } from "./helpers";

let alice: Session, adm: Session;
beforeAll(async () => { alice = await signIn(DEMO.alice); adm = await signIn(DEMO.admin); });

describe("username availability", () => {
  it("works for anonymous callers, rejects taken and malformed names", async () => {
    const c = anon();
    expect((await c.rpc("username_available", { p_username: "demo_alice" })).data).toBe(false);
    expect((await c.rpc("username_available", { p_username: "DEMO_ALICE" })).data).toBe(false); // case-insensitive
    expect((await c.rpc("username_available", { p_username: "a b" })).data).toBe(false);
    expect((await c.rpc("username_available", { p_username: `free_${Date.now()}`.slice(0, 20) })).data).toBe(true);
  });
});
describe("guidelines & user history", () => {
  it("guidelines are publicly readable and admin-only writable", async () => {
    expect((await anon().from("site_settings").select("value").eq("key", "community_guidelines").single()).data?.value).toBeTruthy();
    expect((await alice.c.rpc("set_site_setting", { p_key: "community_guidelines", p_value: "hacked" })).error).not.toBeNull();
    expect((await adm.c.rpc("set_site_setting", { p_key: "community_guidelines", p_value: 12 })).error).not.toBeNull();
  });
  it("user moderation history is staff-only", async () => {
    expect((await alice.c.rpc("admin_user_history", { p_user: alice.id })).error).not.toBeNull();
    const r = await adm.c.rpc("admin_user_history", { p_user: alice.id });
    expect(r.error).toBeNull(); expect(r.data.profile.username).toBe("demo_alice");
    expect(r.data.profile.email).toBeUndefined();
  });
});
