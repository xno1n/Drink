"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function markAllRead() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null); // RLS also enforces ownership
  revalidatePath("/", "layout");
}
export async function acceptRequest(requester: string): Promise<{ error?: string }> {
  if (!z.string().uuid().safeParse(requester).success) return { error: "invalid_input" };
  const { error } = await (await createClient()).rpc("accept_follow_request", { requester });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return {};
}
export async function rejectRequest(requester: string): Promise<{ error?: string }> {
  if (!z.string().uuid().safeParse(requester).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };
  const { error } = await supabase.from("follow_requests").delete().eq("requester_id", requester).eq("target_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return {};
}
