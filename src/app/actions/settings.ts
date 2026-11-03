"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const site = z.string().trim().max(200).refine((v) => v === "" || /^https?:\/\//i.test(v), "url").optional();

export async function updateProfile(fd: FormData): Promise<void> {
  const p = z.object({ username: z.string().regex(/^[a-zA-Z0-9_]{3,20}$/), display_name: z.string().trim().min(1).max(50), bio: z.string().trim().max(160), location: z.string().trim().max(60), website: site }).safeParse(Object.fromEntries(fd));
  if (!p.success) redirect("/settings?err=invalid_input");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase.from("profiles").update({ username: p.data.username, display_name: p.data.display_name, bio: p.data.bio || null, location: p.data.location || null, website: p.data.website || null }).eq("id", user.id);
  revalidatePath("/", "layout");
  redirect(error?.code === "23505" ? "/settings?err=username_taken" : error ? "/settings?err=save_failed" : "/settings?ok=saved");
}

export async function updatePrivacy(fd: FormData): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const a = await supabase.from("profiles").update({ is_protected: fd.get("is_protected") === "on" }).eq("id", user.id);
  const b = await supabase.from("user_settings").update({ likes_public: fd.get("likes_public") === "on" }).eq("user_id", user.id);
  revalidatePath("/", "layout");
  redirect(a.error || b.error ? "/settings?err=save_failed" : "/settings?ok=saved");
}

export async function changePassword(fd: FormData): Promise<void> {
  const p = z.object({ password: z.string().min(8).max(72) }).safeParse(Object.fromEntries(fd));
  if (!p.success) redirect("/settings?err=weak_password");
  const { error } = await (await createClient()).auth.updateUser({ password: p.data.password });
  redirect(error ? "/settings?err=save_failed" : "/settings?ok=password_changed");
}

export async function deactivateAccount(fd: FormData): Promise<void> {
  if (fd.get("confirm") !== "DEACTIVATE") redirect("/settings?err=confirm_required");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await supabase.from("profiles").update({ deactivated_at: new Date().toISOString() }).eq("id", user.id);
  await supabase.auth.signOut();
  redirect("/login");
}

export async function signOutOtherDevices(): Promise<void> {
  const { error } = await (await createClient()).auth.signOut({ scope: "others" });
  redirect(error ? "/settings?err=save_failed" : "/settings?ok=other_sessions_closed");
}

export async function deleteAccount(fd: FormData): Promise<void> {
  if (fd.get("confirm") !== "DELETE") redirect("/settings?err=confirm_required");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // best effort: remove the user's public media files first (DM attachments live under conversation folders and are not removed)
  const { data: files } = await supabase.storage.from("media").list(user.id, { limit: 1000 });
  if (files?.length) await supabase.storage.from("media").remove(files.map((f) => `${user.id}/${f.name}`));
  const { error } = await supabase.rpc("delete_my_account", { p_confirm: "DELETE" });
  if (error) redirect(`/settings?err=${encodeURIComponent(error.message)}`);
  await supabase.auth.signOut().catch(() => undefined);
  redirect("/login?msg=account_deleted");
}

const IMG_MIME: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const IMG_MAX = 5 * 1024 * 1024;
export async function updateImages(fd: FormData): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: cur } = await supabase.from("profiles").select("avatar_url, cover_url").eq("id", user.id).single();
  const patch: { avatar_url?: string; cover_url?: string } = {};
  const old: string[] = [];
  for (const [field, col] of [["avatar", "avatar_url"], ["cover", "cover_url"]] as const) {
    const f = fd.get(field) as File | null;
    if (!f || f.size === 0) continue;
    if (!IMG_MIME[f.type]) redirect("/settings?err=bad_file_type");
    if (f.size > IMG_MAX) redirect("/settings?err=file_too_large");
    const path = `${user.id}/${field}-${crypto.randomUUID()}.${IMG_MIME[f.type]}`; // extension from validated MIME, not the filename
    const up = await supabase.storage.from("media").upload(path, f, { contentType: f.type });
    if (up.error) redirect("/settings?err=upload_failed");
    patch[col] = path;
    if (cur?.[col]) old.push(cur[col] as string);
  }
  if (Object.keys(patch).length === 0) redirect("/settings?err=no_file");
  const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
  if (error) redirect("/settings?err=save_failed");
  if (old.length) await supabase.storage.from("media").remove(old); // best effort cleanup of replaced images
  revalidatePath("/", "layout");
  redirect("/settings?ok=saved");
}

const NOTIF = ["follow", "like", "reply", "repost", "mention", "quote", "message"] as const;
export async function updateNotificationPrefs(fd: FormData): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const prefs = Object.fromEntries(NOTIF.map((k) => [k, fd.get(k) === "on"]));
  const { error } = await supabase.from("user_settings").update({ notify: prefs }).eq("user_id", user.id);
  redirect(error ? "/settings?err=save_failed" : "/settings?ok=saved");
}

export async function requestDeletion(fd: FormData): Promise<void> {
  const reason = String(fd.get("reason") ?? "").slice(0, 500);
  const { error } = await (await createClient()).rpc("request_deletion", { p_reason: reason });
  redirect(error ? "/settings?err=save_failed" : "/settings?ok=deletion_requested");
}

export async function addCloseFriend(fd: FormData): Promise<void> {
  const u = z.string().trim().transform((s) => s.replace(/^@/, "")).pipe(z.string().regex(/^[a-zA-Z0-9_]{3,20}$/)).safeParse(fd.get("username"));
  if (!u.success) redirect("/settings?err=invalid_input");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: target } = await supabase.from("profiles").select("id").ilike("username", u.data.replace(/[\\%_]/g, "\\$&")).maybeSingle();
  if (!target || target.id === user.id) redirect("/settings?err=user_not_found");
  const { error } = await supabase.from("close_friends").upsert({ owner_id: user.id, friend_id: target.id });
  revalidatePath("/settings");
  redirect(error ? "/settings?err=save_failed" : "/settings?ok=saved");
}
export async function removeCloseFriend(fd: FormData): Promise<void> {
  const id = z.string().uuid().safeParse(fd.get("friend"));
  if (!id.success) redirect("/settings?err=invalid_input");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await supabase.from("close_friends").delete().eq("owner_id", user.id).eq("friend_id", id.data);
  revalidatePath("/settings");
  redirect("/settings?ok=saved");
}
