import { describe, it, expect, beforeAll } from "vitest";
import { signIn, DEMO, newPost, type Session } from "./helpers";

let alice: Session, bob: Session, adm: Session;
beforeAll(async () => { alice = await signIn(DEMO.alice); bob = await signIn(DEMO.bob); adm = await signIn(DEMO.admin); });

describe("reporting and moderation", () => {
  it("full flow: report → duplicate rejected → staff-only decision with reason → recorded and audited", async () => {
    const post = await newPost(bob, "reported");
    const rep = await alice.c.from("reports").insert({ reporter_id: alice.id, post_id: post.id, category: "spam" }).select("id").single();
    expect(rep.error).toBeNull();
    expect((await alice.c.from("reports").insert({ reporter_id: alice.id, post_id: post.id, category: "spam" })).error?.code).toBe("23505");
    expect((await bob.c.from("reports").select("id").eq("id", rep.data!.id)).data ?? []).toHaveLength(0); // not the reporter, not staff

    const args = { p_report: rep.data!.id, p_action: "remove_post", p_days: 7 };
    expect((await alice.c.rpc("moderate_report", { ...args, p_reason: "I want it gone" })).error).not.toBeNull(); // normal user
    expect((await adm.c.rpc("moderate_report", { ...args, p_reason: "  " })).error).not.toBeNull();               // reason required
    expect((await adm.c.rpc("moderate_report", { ...args, p_reason: "Spam content" })).error).toBeNull();

    expect((await alice.c.from("posts_feed").select("id").eq("id", post.id).maybeSingle()).data).toBeNull();
    const act = await adm.c.from("moderation_actions").select("action, reason, moderator_id").eq("report_id", rep.data!.id);
    expect(act.data).toHaveLength(1); expect(act.data![0]).toMatchObject({ action: "remove_post", reason: "Spam content", moderator_id: adm.id });
    expect((await adm.c.from("reports").select("status").eq("id", rep.data!.id).single()).data?.status).toBe("actioned");
    const audit = await adm.c.from("admin_audit_log").select("id").eq("action", "moderation.remove_post");
    expect(audit.data?.length).toBeGreaterThan(0);
  });
});

describe("admin authorization", () => {
  it("rejects non-staff from admin RPCs and audit log", async () => {
    expect((await alice.c.rpc("admin_overview", { p_days: 7 })).error).not.toBeNull();
    expect((await alice.c.rpc("set_user_role", { p_user: bob.id, p_role: "moderator", p_reason: "nope" })).error).not.toBeNull();
    expect((await alice.c.from("admin_audit_log").select("id")).data ?? []).toHaveLength(0);
  });
  it("staff can read the overview", async () => {
    const r = await adm.c.rpc("admin_overview", { p_days: 7 });
    expect(r.error).toBeNull(); expect(Number(r.data.total_users)).toBeGreaterThanOrEqual(3);
  });
  it("prevents privilege escalation: direct role update and self-role change both fail", async () => {
    expect((await alice.c.from("profiles").update({ role: "admin" }).eq("id", alice.id)).error).not.toBeNull();
    expect((await adm.c.rpc("set_user_role", { p_user: adm.id, p_role: "user", p_reason: "self change" })).error).not.toBeNull();
  });
  it("super_admin cannot be granted via the role RPC", async () => {
    expect((await adm.c.rpc("set_user_role", { p_user: bob.id, p_role: "super_admin", p_reason: "escalate" })).error).not.toBeNull();
  });
  it("users cannot suspend themselves out of or into anything via profile update", async () => {
    expect((await alice.c.from("profiles").update({ suspended_until: null, suspended_reason: "x" }).eq("id", alice.id)).error).not.toBeNull();
  });
});
