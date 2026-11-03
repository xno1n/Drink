import type { SupabaseClient } from "@supabase/supabase-js";

// Feature flags live in site_settings.feature_flags, e.g. {"dms_enabled": false}. A missing flag means "enabled".
// NOTE: flags only hide UI/routes. They are not a security boundary; data access is enforced by RLS.
export async function getFlags(supabase: SupabaseClient): Promise<Record<string, boolean>> {
  const { data } = await supabase.from("site_settings").select("value").eq("key", "feature_flags").maybeSingle();
  const v = data?.value;
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, boolean>) : {};
}
