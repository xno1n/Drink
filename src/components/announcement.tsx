import { createClient } from "@/lib/supabase/server";

export async function Announcement({ lang }: { lang: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from("site_settings").select("key, value").in("key", ["announcement", "maintenance_mode"]);
  const ann = data?.find((r) => r.key === "announcement")?.value as { text?: string } | null | undefined;
  const maint = data?.find((r) => r.key === "maintenance_mode")?.value === true;
  if (!ann?.text && !maint) return null;
  return (
    <div role="status" className="glass mx-auto my-2 max-w-xl rounded-2xl px-4 py-2 text-center text-sm">
      {maint && <p className="font-semibold text-amber-500">{lang === "fa" ? "سایت در حالت تعمیر است؛ ارسال پست موقتاً غیرفعال است." : "Maintenance mode: posting is temporarily disabled."}</p>}
      {ann?.text && <p>{ann.text}</p>}
    </div>
  );
}
