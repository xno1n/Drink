import Link from "next/link";
import { redirect } from "next/navigation";
import { getFlags } from "@/lib/flags";
import { getContext } from "@/lib/viewer";
import { AppHeader } from "@/components/app-header";
import { Live } from "@/components/live";
import { escapeLike } from "@/lib/like";

type Conv = { conversation_id: string; other_username: string; other_display_name: string; last_body: string | null; last_has_image: boolean; last_at: string; unread_count: number };
export default async function Messages({ searchParams }: { searchParams: Promise<{ q?: string; err?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 32);
  const { supabase, me, lang, theme } = await getContext();
  if ((await getFlags(supabase)).dms_enabled === false) redirect("/");
  const fa = lang === "fa";
  const { data, error } = await supabase.rpc("my_conversations", { p_q: q ? escapeLike(q) : null });
  const convs = (data ?? []) as Conv[];
  return (
    <div className="mx-auto max-w-xl px-3">
      <AppHeader lang={lang} theme={theme} username={me?.username} />
      <Live table="messages" fallbackSeconds={30} />
      <h1 className="mb-3 text-lg font-bold">{fa ? "پیام‌ها" : "Messages"}</h1>
      <p className="mb-3 text-xs opacity-60">{fa ? "پیام‌ها با کنترل دسترسی محافظت می‌شوند؛ رمزنگاری سرتاسری نیستند." : "Messages are protected by access control; they are not end-to-end encrypted."}</p>
      {sp.err && <p role="alert" className="mb-3 text-sm text-red-500">{sp.err}</p>}
      <form className="mb-3"><input name="q" defaultValue={q} maxLength={32} placeholder={fa ? "جستجوی گفتگو" : "Search conversations"} aria-label="search" className="glass w-full rounded-full bg-transparent px-4 py-2" /></form>
      <section className="space-y-2 pb-24">
        {error && <p role="alert" className="py-6 text-center text-red-500">{fa ? "خطا در بارگذاری." : "Failed to load."}</p>}
        {!error && convs.length === 0 && <p className="py-16 text-center opacity-60">{fa ? "گفتگویی ندارید. از پروفایل کاربران پیام بدهید." : "No conversations. Start one from a profile."}</p>}
        {convs.map((c) => (
          <Link key={c.conversation_id} href={`/messages/${c.conversation_id}`} className="glass flex items-center gap-3 rounded-2xl p-3">
            <div className="size-10 shrink-0 rounded-full bg-gradient-to-br from-sky-400 to-violet-500" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate"><b>{c.other_display_name}</b> <span dir="ltr" className="opacity-60">@{c.other_username}</span></p>
              <p className="truncate text-sm opacity-70">{c.last_body ?? (c.last_has_image ? (fa ? "📷 تصویر" : "📷 Image") : "")}</p>
            </div>
            {Number(c.unread_count) > 0 && <span className="rounded-full bg-pink-500 px-2 text-xs text-white">{Number(c.unread_count)}</span>}
          </Link>))}
      </section>
    </div>
  );
}
