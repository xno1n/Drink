import Link from "next/link";
import { getContext } from "@/lib/viewer";
import { PostCard, type PostRow } from "@/components/post-card";
import { Composer } from "@/components/composer";
import { AppHeader } from "@/components/app-header";
import { t } from "@/lib/i18n";

const PAGE = 20;
type Tab = "foryou" | "following" | "latest";
export default async function Home({ searchParams }: { searchParams: Promise<{ tab?: string; before?: string; page?: string; msg?: string }> }) {
  const sp = await searchParams;
  const tab: Tab = sp.tab === "following" ? "following" : sp.tab === "latest" ? "latest" : "foryou";
  const before = sp.before && !Number.isNaN(Date.parse(sp.before)) ? sp.before : null;
  const page = Math.min(Math.max(parseInt(sp.page ?? "0", 10) || 0, 0), 50);
  const { supabase, user, me, lang, theme, mediaBase } = await getContext();
  const L = t(lang), fa = lang === "fa";

  let rows: PostRow[] = [];
  let error = false;
  let hasMore = false;
  let nextHref: string | null = null;

  if (tab === "foryou") {
    const r = await supabase.rpc("for_you_feed", { p_limit: PAGE + 1, p_offset: page * PAGE });
    if (r.error) error = true;
    const ranked = (r.data ?? []) as { id: string; score: number }[];
    hasMore = ranked.length > PAGE;
    const ids = ranked.slice(0, PAGE).map((x) => x.id);
    if (ids.length) {
      const { data } = await supabase.from("posts_feed").select("*").in("id", ids);
      const order = new Map(ids.map((id, i) => [id, i]));
      rows = ((data ?? []) as unknown as PostRow[]).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    }
    if (hasMore) nextHref = `/?tab=foryou&page=${page + 1}`;
  } else {
    let q = supabase.from("posts_feed").select("*").is("reply_to_id", null).order("created_at", { ascending: false }).limit(PAGE + 1);
    if (before) q = q.lt("created_at", before);
    if (tab === "following") {
      const { data: f } = await supabase.from("follows").select("following_id").eq("follower_id", user.id).limit(1000);
      q = q.in("author_id", [user.id, ...(f ?? []).map((r) => r.following_id)]);
    }
    const r = await q;
    if (r.error) error = true;
    const all = (r.data ?? []) as unknown as PostRow[];
    rows = all.slice(0, PAGE);
    if (all.length > PAGE) nextHref = `/?tab=${tab}&before=${encodeURIComponent(rows[rows.length - 1].created_at)}`;
  }
  const tabCls = (on: boolean) => `flex-1 py-3 text-center ${on ? "font-bold border-b-2 border-current" : "opacity-60"}`;

  return (
    <div className="mx-auto max-w-xl px-3">
      <AppHeader lang={lang} theme={theme} username={me?.username} />
      {sp.msg === "password_updated" && <p role="status" className="mb-3 text-sm text-emerald-500">{fa ? "رمز عبور تغییر کرد." : "Password updated."}</p>}
      <nav className="glass mb-3 flex overflow-hidden rounded-2xl" aria-label="feed">
        <Link href="/?tab=foryou" className={tabCls(tab === "foryou")}>{fa ? "برای شما" : "For you"}</Link>
        <Link href="/?tab=following" className={tabCls(tab === "following")}>{fa ? "دنبال‌شده‌ها" : "Following"}</Link>
        <Link href="/?tab=latest" className={tabCls(tab === "latest")}>{fa ? "جدیدترین" : "Latest"}</Link>
      </nav>
      <Composer lang={lang} />
      <section className="space-y-3 pb-24" aria-label={L.home}>
        {error && <p role="alert" className="py-6 text-center text-red-500">{fa ? "خطا در بارگذاری. دوباره تلاش کنید." : "Failed to load. Please retry."}</p>}
        {!error && rows.length === 0 && <p className="py-16 text-center opacity-60">{tab === "foryou" ? (fa ? "هنوز پیشنهادی نیست. چند نفر را دنبال کنید یا در «جدیدترین» بگردید." : "Nothing to recommend yet. Follow people or browse Latest.") : L.empty}</p>}
        {rows.map((p) => <PostCard key={p.id} post={p} lang={lang} viewerId={user.id} mediaBase={mediaBase} />)}
        {nextHref && <Link href={nextHref} className="glass block rounded-2xl py-3 text-center">{fa ? "نمایش بیشتر" : "Load more"}</Link>}
      </section>
    </div>
  );
}
