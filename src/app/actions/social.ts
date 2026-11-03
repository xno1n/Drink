"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const id = z.string().uuid();
export async function followUser(target: string): Promise<{ status?: "following" | "requested"; error?: string }> {
  if (!id.safeParse(target).success) return { error: "invalid_input" };
  const { data, error } = await (await createClient()).rpc("follow_user", { target });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { status: data as "following" | "requested" };
}
export async function unfollowUser(target: string): Promise<{ error?: string }> {
  if (!id.safeParse(target).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };
  await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", target);
  await supabase.from("follow_requests").delete().eq("requester_id", user.id).eq("target_id", target);
  revalidatePath("/", "layout");
  return {};
}
