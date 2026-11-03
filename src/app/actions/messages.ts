"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();
const MIME: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
export type MsgState = { error?: string; ok?: boolean } | undefined;

export async function startConversation(fd: FormData): Promise<void> {
  const t = uuid.safeParse(fd.get("target"));
  if (!t.success) redirect("/messages?err=invalid_input");
  const { data, error } = await (await createClient()).rpc("start_conversation", { p_other: t.data });
  if (error || !data) redirect("/messages?err=cannot_message");
  redirect(`/messages/${data}`);
}

export async function sendMessage(_: MsgState, fd: FormData): Promise<MsgState> {
  const conv = uuid.safeParse(fd.get("conversation_id"));
  const body = String(fd.get("body") ?? "").trim();
  const file = fd.get("image") as File | null;
  const hasFile = !!file && file.size > 0;
  if (!conv.success || body.length > 2000 || (!body && !hasFile)) return { error: "invalid_input" };
  if (hasFile && (!MIME[file!.type] || file!.size > 10 * 1024 * 1024)) return { error: "bad_file" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  let path: string | null = null;
  if (hasFile) {
    path = `${conv.data}/${crypto.randomUUID()}.${MIME[file!.type]}`; // storage policy: only conversation members may write here
    const up = await supabase.storage.from("dm").upload(path, file!, { contentType: file!.type });
    if (up.error) return { error: "upload_failed" };
  }
  const { error } = await supabase.from("messages").insert({ conversation_id: conv.data, sender_id: user.id, body: body || null, image_path: path }); // RLS: membership + no blocks
  if (error) { if (path) await supabase.storage.from("dm").remove([path]); return { error: error.message.includes("rate limit") ? "rate_limited" : "cannot_send" }; }
  revalidatePath(`/messages/${conv.data}`);
  return { ok: true };
}

export async function deleteMessage(fd: FormData): Promise<void> {
  const id = uuid.safeParse(fd.get("id")), conv = uuid.safeParse(fd.get("conversation_id"));
  if (!id.success || !conv.success) redirect("/messages");
  await (await createClient()).rpc("delete_message", { p_id: id.data });
  revalidatePath(`/messages/${conv.data}`);
}
