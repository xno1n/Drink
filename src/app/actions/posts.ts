"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type PostState = { error?: string; ok?: boolean } | undefined;
const MAX_IMAGES = 4, IMG_BYTES = 10 * 1024 * 1024, VID_BYTES = 25 * 1024 * 1024;
const MIME: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4", "video/webm": "webm" };
const schema = z.object({
  body: z.string().max(280),
  reply_to_id: z.string().uuid().optional().or(z.literal("")),
  quote_of_id: z.string().uuid().optional().or(z.literal("")),
  audience: z.enum(["public", "close_friends"]).default("public"),
});

export async function createPost(_: PostState, fd: FormData): Promise<PostState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const parsed = schema.safeParse({ body: String(fd.get("body") ?? "").trim(), reply_to_id: fd.get("reply_to_id") ?? "", quote_of_id: fd.get("quote_of_id") ?? "", audience: fd.get("audience") === "close_friends" ? "close_friends" : "public" });
  if (!parsed.success) return { error: "invalid_input" };
  const files = (fd.getAll("images") as File[]).filter((f) => f.size > 0);
  if (!parsed.data.body && files.length === 0) return { error: "empty_post" };
  const hasVideo = files.some((f) => f.type.startsWith("video/"));
  if (hasVideo ? files.length !== 1 : files.length > MAX_IMAGES) return { error: hasVideo ? "one_video_only" : "too_many_files" }; // up to 4 images OR a single video
  for (const f of files) {
    if (!MIME[f.type]) return { error: "bad_file_type" };
    if (f.size > (f.type.startsWith("video/") ? VID_BYTES : IMG_BYTES)) return { error: "file_too_large" };
  }

  const { data: post, error } = await supabase.from("posts").insert({
    author_id: user.id, body: parsed.data.body,
    reply_to_id: parsed.data.reply_to_id || null, quote_of_id: parsed.data.quote_of_id || null, audience: parsed.data.audience, // the DB trigger enforces/inherits the real audience
  }).select("id").single();
  if (error || !post) return { error: error?.message ?? "insert_failed" };

  const uploaded: string[] = [];
  for (const [i, f] of files.entries()) {
    const path = `${user.id}/${crypto.randomUUID()}.${MIME[f.type]}`; // extension from validated MIME, never from filename
    const up = await supabase.storage.from("media").upload(path, f, { contentType: f.type });
    if (up.error) { await supabase.storage.from("media").remove(uploaded); await supabase.from("posts").delete().eq("id", post.id); return { error: "upload_failed" }; }
    uploaded.push(path);
    await supabase.from("post_media").insert({ post_id: post.id, storage_path: path, kind: f.type.startsWith("video/") ? "video" : "image", alt_text: String(fd.get(`alt_${i}`) ?? "").slice(0, 420) || null, position: i });
  }
  revalidatePath("/");
  return { ok: true };
}

export async function editPost(id: string, body: string): Promise<PostState> {
  const b = z.string().min(1).max(280).safeParse(body.trim());
  if (!b.success || !z.string().uuid().safeParse(id).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { error } = await supabase.from("posts").update({ body: b.data }).eq("id", id); // RLS: author or staff
  if (error) return { error: error.message };
  revalidatePath("/");
  return { ok: true };
}

export async function deletePost(id: string): Promise<PostState> {
  if (!z.string().uuid().safeParse(id).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { error } = await supabase.from("posts").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/");
  return { ok: true };
}

async function toggle(fn: "toggle_like" | "toggle_repost" | "toggle_bookmark", id: string) {
  if (!z.string().uuid().safeParse(id).success) return { error: "invalid_input" as const };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, { p_post: id });
  if (error) return { error: error.message };
  return { active: data as boolean };
}
export async function toggleLike(id: string) { return toggle("toggle_like", id); }
export async function toggleRepost(id: string) { return toggle("toggle_repost", id); }
export async function toggleBookmark(id: string) { return toggle("toggle_bookmark", id); }

export async function pinPost(id: string | null): Promise<PostState> {
  if (id !== null && !z.string().uuid().safeParse(id).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };
  if (id) {
    const { data } = await supabase.from("posts").select("id").eq("id", id).eq("author_id", user.id).is("deleted_at", null).is("reply_to_id", null).maybeSingle();
    if (!data) return { error: "not_allowed" }; // only your own top-level posts
  }
  const { error } = await supabase.from("profiles").update({ pinned_post_id: id }).eq("id", user.id);
  if (error) return { error: "failed" };
  revalidatePath("/", "layout");
  return { ok: true };
}
