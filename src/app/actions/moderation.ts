"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();
const CATS = ["spam", "harassment", "hate", "violence", "sexual", "other"] as const;

export async function createReport(input: { postId?: string; userId?: string; category: string; details?: string }): Promise<{ ok?: boolean; error?: string }> {
  const p = z.object({ postId: uuid.optional(), userId: uuid.optional(), category: z.enum(CATS), details: z.string().max(1000).optional() }).safeParse(input);
  if (!p.success || (!p.data.postId && !p.data.userId)) return { error: "invalid_input" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };
  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id, post_id: p.data.postId ?? null, reported_user_id: p.data.postId ? null : p.data.userId!, category: p.data.category, details: p.data.details || null,
  });
  if (error) return { error: error.code === "23505" ? "already_reported" : "failed" };
  return { ok: true };
}

async function relation(table: "blocks" | "mutes", target: string, on: boolean) {
  if (!uuid.safeParse(target).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id === target) return { error: "invalid_input" };
  const a = table === "blocks" ? "blocker_id" : "muter_id";
  const b = table === "blocks" ? "blocked_id" : "muted_id";
  if (on) {
    const { error } = table === "blocks"
      ? await supabase.from("blocks").upsert({ blocker_id: user.id, blocked_id: target })
      : await supabase.from("mutes").upsert({ muter_id: user.id, muted_id: target });
    if (!error && table === "blocks") { // blocking severs follows both ways
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", target);
      await supabase.from("follows").delete().eq("follower_id", target).eq("following_id", user.id);
    }
    if (error) return { error: "failed" };
  } else {
    const { error } = await supabase.from(table).delete().eq(a, user.id).eq(b, target);
    if (error) return { error: "failed" };
  }
  revalidatePath("/", "layout");
  return {};
}
export async function blockUser(id: string, on: boolean) { return relation("blocks", id, on); }
export async function muteUser(id: string, on: boolean) { return relation("mutes", id, on); }

export async function submitAppeal(fd: FormData): Promise<void> {
  const p = z.object({ action_id: uuid, message: z.string().trim().min(3).max(1000) }).safeParse(Object.fromEntries(fd));
  if (!p.success) redirect("/settings?err=invalid_input");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase.from("appeals").insert({ action_id: p.data.action_id, user_id: user.id, message: p.data.message });
  redirect(error ? "/settings?err=appeal_failed" : "/settings?ok=appeal_sent");
}

// ---- staff actions (all authorization re-checked inside SQL functions) ----
async function rpc(name: string, args: Record<string, unknown>, back: string) {
  const { error } = await (await createClient()).rpc(name, args);
  revalidatePath("/admin");
  redirect(error ? `${back}?err=${encodeURIComponent(error.message)}` : back);
}
export async function moderateReport(fd: FormData): Promise<void> {
  const p = z.object({ report: uuid, action: z.enum(["remove_post", "suspend", "warn", "dismiss"]), reason: z.string().trim().min(3).max(500), days: z.coerce.number().int().min(1).max(365).default(7) }).safeParse(Object.fromEntries(fd));
  if (!p.success) redirect("/admin?err=invalid_input");
  await rpc("moderate_report", { p_report: p.data.report, p_action: p.data.action, p_reason: p.data.reason, p_days: p.data.days }, "/admin");
}
export async function restoreUser(fd: FormData): Promise<void> {
  const p = z.object({ user: uuid, reason: z.string().trim().min(3).max(500) }).safeParse(Object.fromEntries(fd));
  if (!p.success) redirect("/admin?err=invalid_input");
  await rpc("restore_user", { p_user: p.data.user, p_reason: p.data.reason }, "/admin");
}
export async function setRole(fd: FormData): Promise<void> {
  const p = z.object({ user: uuid, role: z.enum(["user", "moderator", "admin"]), reason: z.string().trim().min(3).max(500) }).safeParse(Object.fromEntries(fd));
  if (!p.success) redirect("/admin?err=invalid_input");
  await rpc("set_user_role", { p_user: p.data.user, p_role: p.data.role, p_reason: p.data.reason }, "/admin");
}
export async function resolveAppeal(fd: FormData): Promise<void> {
  const p = z.object({ appeal: uuid, outcome: z.enum(["upheld", "overturned"]) }).safeParse(Object.fromEntries(fd));
  if (!p.success) redirect("/admin?err=invalid_input");
  await rpc("resolve_appeal", { p_appeal: p.data.appeal, p_outcome: p.data.outcome }, "/admin");
}

// ---- site settings (admin only; validated again inside set_site_setting) ----
const BOOL_KEYS = ["registration_open", "maintenance_mode"], INT_KEYS = ["post_max_chars", "post_rate_per_hour", "media_max_mb"], OBJ_KEYS = ["feature_flags", "for_you_weights"];
export async function setSiteSetting(fd: FormData): Promise<void> {
  const key = String(fd.get("key") ?? ""), raw = String(fd.get("value") ?? "");
  let value: unknown;
  try {
    if (BOOL_KEYS.includes(key)) value = raw === "true";
    else if (INT_KEYS.includes(key)) value = z.coerce.number().int().parse(raw);
    else if (key === "community_guidelines") value = raw.trim();
    else if (key === "announcement") value = raw.trim() === "" ? null : { text: raw.trim().slice(0, 300) };
    else if (OBJ_KEYS.includes(key)) { value = JSON.parse(raw); if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("object"); }
    else redirect("/admin?err=unknown_setting");
  } catch (e) { if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e; redirect("/admin?err=invalid_value"); }
  await rpc("set_site_setting", { p_key: key, p_value: value }, "/admin");
}
export async function setHashtagExcluded(fd: FormData): Promise<void> {
  const p = z.object({ tag: z.string().trim().regex(/^[\p{L}\p{N}_]{1,50}$/u), excluded: z.enum(["true", "false"]) }).safeParse(Object.fromEntries(fd));
  if (!p.success) redirect("/admin?err=invalid_input");
  await rpc("set_hashtag_excluded", { p_tag: p.data.tag, p_excluded: p.data.excluded === "true" }, "/admin");
}

export async function resolveDeletion(fd: FormData): Promise<void> {
  const p = z.object({ user: uuid, action: z.enum(["approve", "reject"]), reason: z.string().trim().min(3).max(500) }).safeParse(Object.fromEntries(fd));
  if (!p.success) redirect("/admin?err=invalid_input");
  await rpc("resolve_deletion_request", { p_user: p.data.user, p_action: p.data.action, p_reason: p.data.reason }, "/admin");
}
