import { describe, it, expect, beforeAll } from "vitest";
import { signIn, DEMO, type Session } from "./helpers";

let alice: Session, adm: Session;
beforeAll(async () => { alice = await signIn(DEMO.alice); adm = await signIn(DEMO.admin); });

describe("account deletion guards", () => {
  it("requires the exact confirmation word", async () => {
    expect((await alice.c.rpc("delete_my_account", { p_confirm: "yes" })).error).not.toBeNull();
  });
  it("refuses to delete staff accounts", async () => {
    expect((await adm.c.rpc("delete_my_account", { p_confirm: "DELETE" })).error).not.toBeNull();
  });
  it("rejects anonymous callers", async () => {
    const { anon } = await import("./helpers");
    expect((await anon().rpc("delete_my_account", { p_confirm: "DELETE" })).error).not.toBeNull();
  });
});

describe("deletion requests & username changes", () => {
  it("users can file a request; only admins can resolve it", async () => {
    expect((await alice.c.rpc("request_deletion", { p_reason: "test request" })).error).toBeNull();
    expect((await alice.c.from("deletion_requests").select("user_id").eq("user_id", alice.id)).data).toHaveLength(1);
    expect((await alice.c.rpc("resolve_deletion_request", { p_user: alice.id, p_action: "reject", p_reason: "self" })).error).not.toBeNull();
    expect((await adm.c.rpc("resolve_deletion_request", { p_user: alice.id, p_action: "reject", p_reason: "" })).error).not.toBeNull(); // reason required
    expect((await adm.c.rpc("resolve_deletion_request", { p_user: alice.id, p_action: "reject", p_reason: "test cleanup" })).error).toBeNull();
    await alice.c.from("deletion_requests").delete().eq("user_id", alice.id); // no policy: harmless no-op
  });
  it("usernames stay unique when changed", async () => {
    const { data: bob } = await adm.c.from("profiles").select("id").eq("username", "demo_bob").single();
    expect(bob).not.toBeNull();
    expect((await alice.c.from("profiles").update({ username: "demo_bob" }).eq("id", alice.id)).error?.code).toBe("23505");
  });
});

describe("video uploads", () => {
  it("bucket accepts mp4 and rejects other types", async () => {
    const path = `${alice.id}/clip-${Date.now()}.mp4`;
    expect((await alice.c.storage.from("media").upload(path, Buffer.from("00"), { contentType: "video/mp4" })).error).toBeNull();
    expect((await alice.c.storage.from("media").upload(`${alice.id}/x-${Date.now()}.exe`, Buffer.from("00"), { contentType: "application/x-msdownload" })).error).not.toBeNull();
    await alice.c.storage.from("media").remove([path]);
  });
});
