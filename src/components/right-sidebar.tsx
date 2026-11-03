import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FollowButton } from "@/components/follow-button";

export async function RightSidebar({ lang }: { lang: string }) {
  const supabase = await createClient();
  const [t, s] = await Promise.all([supabase.rpc("trending_hashtags", { p_hours: 24, p_limit: 5 }), supabase.rpc("suggested_accounts", { p_limit: 3 })]);
  const trending = (t.data ?? []) as { tag: string; uses: number }[];
  const suggested = (s.data ?? []) as { id: string; username: string; display_name: string }[];
  const fa = lang === "fa";
  return (
    <div className="space-y-3 py-4">
      <Link href="/explore" className="glass block rounded-full px-4 py-2 text-sm opacity-80">{fa ? "جستجو..." : "Search..."}</Link>
      <section className="glass rounded-2xl p-4"><h2 className="mb-2 font-semibold">{fa ? "موضوعات داغ" : "Trending"}</h2>
        {trending.length === 0 ? <p className="text-sm opacity-60">{fa ? "هنوز هشتگی نیست." : "No hashtags yet."}</p>
          : trending.map((x) => <Link key={x.tag} href={`/explore?tag=${encodeURIComponent(x.tag)}`} className="flex justify-between py-0.5 hover:underline"><span dir="ltr">#{x.tag}</span><span className="text-sm opacity-60">{Number(x.uses)}</span></Link>)}
      </section>
      {suggested.length > 0 && (
        <section className="glass space-y-3 rounded-2xl p-4"><h2 className="font-semibold">{fa ? "پیشنهاد دنبال‌کردن" : "Who to follow"}</h2>
          {suggested.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-2">
              <Link href={`/u/${u.username}`} className="min-w-0 truncate text-sm"><b>{u.display_name}</b><br /><span dir="ltr" className="opacity-60">@{u.username}</span></Link>
              <FollowButton target={u.id} initial="none" lang={lang} />
            </div>))}
        </section>)}
    </div>
  );
}
