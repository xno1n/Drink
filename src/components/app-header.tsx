import Link from "next/link";
import { Bell, Mail, Search } from "lucide-react";
import { ThemeLangToggle } from "@/components/theme-lang-toggle";
import { logout } from "@/app/(auth)/actions";
import { createClient } from "@/lib/supabase/server";
import { Live } from "@/components/live";

export async function AppHeader({ lang, theme, username }: { lang: string; theme: string; username?: string }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { count } = await supabase.from("notifications").select("*", { count: "exact", head: true }).is("read_at", null);
  const fa = lang === "fa";
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between py-3 backdrop-blur-md">
      {user && <Live table="notifications" filter={`user_id=eq.${user.id}`} fallbackSeconds={60} />}
      <Link href="/" className="text-xl font-bold">{fa ? "پالس" : "PULSE"}</Link>
      <div className="flex items-center gap-2">
        <Link href="/explore" aria-label={fa ? "کاوش" : "Explore"} className="glass rounded-full p-2"><Search size={18} /></Link>
        <Link href="/messages" aria-label={fa ? "پیام‌ها" : "Messages"} className="glass rounded-full p-2"><Mail size={18} /></Link>
        <Link href="/notifications" aria-label={fa ? "اعلان‌ها" : "Notifications"} className="glass relative rounded-full p-2">
          <Bell size={18} />
          {!!count && <span className="absolute -top-1 -end-1 min-w-4 rounded-full bg-pink-500 px-1 text-center text-[10px] leading-4 text-white">{count > 99 ? "99+" : count}</span>}
        </Link>
        {username && <Link href={`/u/${username}`} className="glass hidden rounded-full px-3 py-1.5 text-sm sm:block" dir="ltr">@{username}</Link>}
        <ThemeLangToggle theme={theme} lang={lang} />
        <form action={logout}><button className="glass rounded-full px-3 py-1.5 text-sm" aria-label={fa ? "خروج" : "Log out"}>↩</button></form>
      </div>
    </header>
  );
}
