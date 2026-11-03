import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Lang } from "@/lib/i18n";

export async function getContext() {
  const c = await cookies();
  const lang = (c.get("lang")?.value === "en" ? "en" : "fa") as Lang;
  const theme = c.get("theme")?.value === "light" ? "light" : "dark";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("username, display_name, role").eq("id", user.id).single();
  const mediaBase = supabase.storage.from("media").getPublicUrl("").data.publicUrl.replace(/\/$/, "");
  return { supabase, user, me, lang, theme, mediaBase };
}
