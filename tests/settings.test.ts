import { describe, it, expect, beforeAll } from "vitest";
import { signIn, DEMO, type Session } from "./helpers";

let alice: Session, adm: Session;
beforeAll(async () => { alice = await signIn(DEMO.alice); adm = await signIn(DEMO.admin); });

describe("site settings and export", () => {
  it("only admins can change settings; invalid keys and values are rejected", async () => {
    expect((await alice.c.rpc("set_site_setting", { p_key: "post_rate_per_hour", p_value: 5 })).error).not.toBeNull();
    expect((await adm.c.rpc("set_site_setting", { p_key: "nope", p_value: 1 })).error).not.toBeNull();
    expect((await adm.c.rpc("set_site_setting", { p_key: "post_max_chars", p_value: 5000 })).error).not.toBeNull();
    expect((await adm.c.rpc("set_site_setting", { p_key: "post_max_chars", p_value: 280 })).error).toBeNull();
    const audit = await adm.c.from("admin_audit_log").select("id").eq("action", "settings.post_max_chars");
    expect(audit.data?.length).toBeGreaterThan(0);
  });
  it("users cannot write site_settings directly", async () => {
    const r = await alice.c.from("site_settings").update({ value: 1 }).eq("key", "post_max_chars").select();
    expect(r.data ?? []).toHaveLength(0);
  });
  it("export returns only the caller's data", async () => {
    const { data, error } = await alice.c.rpc("export_my_data");
    expect(error).toBeNull();
    expect(data.profile.id).toBe(alice.id);
    expect(data.profile.role).toBeUndefined();
    expect((data.posts as { id: string }[]).length).toBeGreaterThanOrEqual(0);
  });
  it("hashtag exclusion is admin-only", async () => {
    expect((await alice.c.rpc("set_hashtag_excluded", { p_tag: "x", p_excluded: true })).error).not.toBeNull();
    expect((await adm.c.rpc("set_hashtag_excluded", { p_tag: "testtag", p_excluded: true })).error).toBeNull();
    await adm.c.rpc("set_hashtag_excluded", { p_tag: "testtag", p_excluded: false });
  });
});
