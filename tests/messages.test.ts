import { describe, it, expect, beforeAll } from "vitest";
import { signIn, DEMO, uniq, type Session } from "./helpers";

let alice: Session, bob: Session, adm: Session, cid: string;
beforeAll(async () => {
  alice = await signIn(DEMO.alice); bob = await signIn(DEMO.bob); adm = await signIn(DEMO.admin);
  const r = await alice.c.rpc("start_conversation", { p_other: bob.id });
  expect(r.error).toBeNull(); cid = r.data as string;
});

describe("direct messages access control", () => {
  it("reuses the same conversation and rejects messaging yourself", async () => {
    expect((await bob.c.rpc("start_conversation", { p_other: alice.id })).data).toBe(cid);
    expect((await alice.c.rpc("start_conversation", { p_other: alice.id })).error).not.toBeNull();
  });
  it("members can exchange messages", async () => {
    const body = uniq("hi");
    expect((await alice.c.from("messages").insert({ conversation_id: cid, sender_id: alice.id, body })).error).toBeNull();
    expect((await bob.c.from("messages").select("body").eq("conversation_id", cid).eq("body", body)).data).toHaveLength(1);
  });
  it("non-members (even staff) cannot read, list or write", async () => {
    expect((await adm.c.from("messages").select("id").eq("conversation_id", cid)).data ?? []).toHaveLength(0);
    expect((await adm.c.from("conversations").select("id").eq("id", cid)).data ?? []).toHaveLength(0);
    expect((await adm.c.from("messages").insert({ conversation_id: cid, sender_id: adm.id, body: "intruder" })).error).not.toBeNull();
  });
  it("cannot send as someone else", async () => {
    expect((await alice.c.from("messages").insert({ conversation_id: cid, sender_id: bob.id, body: "spoof" })).error).not.toBeNull();
  });
  it("only the sender can delete a message, and deletion clears its content", async () => {
    const { data: m } = await alice.c.from("messages").insert({ conversation_id: cid, sender_id: alice.id, body: uniq("del") }).select("id").single();
    await bob.c.rpc("delete_message", { p_id: m!.id });
    expect((await alice.c.from("messages").select("body, deleted_at").eq("id", m!.id).single()).data?.deleted_at).toBeNull();
    await alice.c.rpc("delete_message", { p_id: m!.id });
    const { data } = await bob.c.from("messages").select("body, deleted_at").eq("id", m!.id).single();
    expect(data?.deleted_at).toBeTruthy(); expect(data?.body).toBeNull();
  });
  it("members cannot edit messages directly", async () => {
    const { data: m } = await alice.c.from("messages").insert({ conversation_id: cid, sender_id: alice.id, body: uniq("edit") }).select("id").single();
    const r = await alice.c.from("messages").update({ body: "changed" }).eq("id", m!.id).select();
    expect(r.data ?? []).toHaveLength(0);
  });
  it("blocking prevents sending", async () => {
    await bob.c.from("blocks").upsert({ blocker_id: bob.id, blocked_id: alice.id });
    expect((await alice.c.from("messages").insert({ conversation_id: cid, sender_id: alice.id, body: uniq("blocked") })).error).not.toBeNull();
    await bob.c.from("blocks").delete().eq("blocker_id", bob.id).eq("blocked_id", alice.id);
  });
});

describe("conversation participants (RLS recursion regression)", () => {
  it("members can list both participants without a policy error; outsiders see none", async () => {
    const mine = await alice.c.from("conversation_participants").select("user_id").eq("conversation_id", cid);
    expect(mine.error).toBeNull(); expect(mine.data).toHaveLength(2);
    expect((await adm.c.from("conversation_participants").select("user_id").eq("conversation_id", cid)).data ?? []).toHaveLength(0);
  });
});
