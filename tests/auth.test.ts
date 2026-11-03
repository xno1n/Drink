import { describe, it, expect } from "vitest";
import { anon, signIn, DEMO, PASSWORD } from "./helpers";

describe("authentication & anonymous access", () => {
  it("logs in with valid credentials", async () => { expect((await signIn(DEMO.alice)).id).toBeTruthy(); });
  it("rejects a wrong password", async () => {
    const { error } = await anon().auth.signInWithPassword({ email: DEMO.alice, password: PASSWORD + "x" });
    expect(error).not.toBeNull();
  });
  it("blocks anonymous writes and private tables", async () => {
    const c = anon();
    const ins = await c.from("posts").insert({ author_id: "00000000-0000-0000-0000-000000000000", body: "x" });
    expect(ins.error).not.toBeNull();
    expect((await c.from("notifications").select("id")).data ?? []).toHaveLength(0);
    expect((await c.from("messages").select("id")).data ?? []).toHaveLength(0);
  });
});
