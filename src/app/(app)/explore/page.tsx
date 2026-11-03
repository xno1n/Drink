import Link from "next/link";
import { getContext } from "@/lib/viewer";
import { AppHeader } from "@/components/app-header";
import { PostCard, type PostRow } from "@/components/post-card";
import { FollowButton } from "@/components/follow-button";
import { escapeLike } from "@/lib/like";

type Sp = { q?: string; type?: string; tag?: string; media?: string; since?: string };
export default async function Explore({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 64);
  const type = sp.type === "users" ? "users" : "posts";
  const tag = /^[\p{L}\p{N}_]{1,50}$/u.test(sp.tag ?? "") ? sp.tag!.toLowerCase() : null;
  const { supabase, user, me, lang, theme, mediaBase } = await getContext();
  const fa = lang === "fa";
  const card = (p: PostRow) => <PostCard key={p.id} post={p} lang={lang} viewerId={user.id} mediaBase={mediaBase} />;
  const tabCls = (on: boolean) => `flex-1 py-3 text-center ${on ? "font-bold border-b-2 border-current" : "opacity-60"}`;

  let posts: PostRow[] = [];
  let users: { id: string; username: string; display_name: string }[] = [];
  let trending: { tag: string; uses: number }[] = [];
  let suggested: { id: string; username: string; display_name: string }[] = [];
  let discussions: PostRow[] = [];

  if (tag) {
    const { data: h } = await supabase.from("hashtags").select("id").eq("tag", tag).eq("excluded", false).maybeSingle();
    if (h) {
      const { data: ph } = await supabase.from("post_hashtags").select("post_id").eq("hashtag_id", h.id).limit(100);
      const ids = (ph ?? []).map((r) => r.post_id);
      if (ids.length) posts = ((await supabase.from("posts_feed").select("*").in("id", ids).order("created_at", { ascending: false }).limit(30)).data ?? []) as unknown as PostRow[];
    }
  } else if (q && type === "users") {
    const pat = `%${escapeLike(q.replace(/^@/, ""))}%`;
    const [a, b] = await Promise.all([
      supabase.from("profiles").select("id, username, display_name").ilike("username", pat).limit(20),
      supabase.from("profiles").select("id, username, display_name").ilike("display_name", pat).limit(20),
    ]);
    const seen = new Set<string>();
    users = [...(a.data ?? []), ...(b.data ?? [])].filter((u) => !seen.has(u.id) && seen.add(u.id)).slice(0, 20);
  } else if (q) {
    let pq = supabase.from("posts_feed").select("*").ilike("body", `%${escapeLike(q)}%`).order("created_at", { ascending: false }).limit(30);
    if (sp.media === "1") pq = pq.eq("has_media", true);
    const days = ({ day: 1, week: 7, month: 30 } as Record<string, number>)[sp.since ?? ""];
    if (days) pq = pq.gte("created_at", new Date(Date.now() - days * 86400000).toISOString());
    posts = ((await pq).data ?? []) as unknown as PostRow[];
  } else {
    const [t, s, r, d] = await Promise.all([
      supabase.rpc("trending_hashtags", { p_hours: 24, p_limit: 10 }),
      supabase.rpc("suggested_accounts", { p_limit: 5 }),
      (sp.media === "1" ? supabase.from("posts_feed").select("*").eq("has_media", true) : supabase.from("posts_feed").select("*")).order("created_at", { ascending: false }).limit(15),
      supabase.from("posts_feed").select("*").gt("reply_count", 0).gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()).order("reply_count", { ascending: false }).limit(5),
    ]);
    trending = (t.data ?? []) as typeof trending;
    suggested = (s.data ?? []) as typeof suggested;
    posts = (r.data ?? []) as unknown as PostRow[];
    discussions = (d.data ?? []) as unknown as PostRow[];
  }
  const searching = !!q || !!tag;

  return (
    <div className="mx-auto max-w-xl px-3">
      <AppHeader lang={lang} theme={theme} username={me?.username} />
      <form action="/explore" className="mb-3">
        <input type="hidden" name="type" value={type} />
        <input name="q" defaultValue={q} maxLength={64} placeholder={fa ? "جستجو در پست‌ها و کاربران" : "Search posts and people"}
          aria-label={fa ? "جستجو" : "Search"} className="glass w-full rounded-full bg-transparent px-4 py-3" />
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1"><input type="checkbox" name="media" value="1" defaultChecked={sp.media === "1"} />{fa ? "فقط با رسانه" : "Media only"}</label>
          {q && type === "posts" && (
            <select name="since" defaultValue={sp.since ?? ""} aria-label={fa ? "بازه‌ی زمانی" : "Time range"} className="glass rounded-lg bg-transparent p-1">
              <option value="">{fa ? "همه‌ی زمان‌ها" : "Any time"}</option><option value="day">{fa ? "۲۴ ساعت" : "24h"}</option><option value="week">{fa ? "هفته" : "Week"}</option><option value="month">{fa ? "ماه" : "Month"}</option>
            </select>)}
          <button className="glass rounded-lg px-3 py-1">{fa ? "اعمال" : "Apply"}</button>
        </div>
      </form>
      {q && (
        <nav className="glass mb-3 flex overflow-hidden rounded-2xl" aria-label="search type">
          <Link href={`/explore?q=${encodeURIComponent(q)}&type=posts`} className={tabCls(type === "posts")}>{fa ? "پست‌ها" : "Posts"}</Link>
          <Link href={`/explore?q=${encodeURIComponent(q)}&type=users`} className={tabCls(type === "users")}>{fa ? "کاربران" : "People"}</Link>
        </nav>
      )}
      {tag && <h1 className="mb-3 text-lg font-bold" dir="ltr">#{tag}</h1>}
      {!searching && (
        <>
          <section className="glass mb-3 rounded-2xl p-4" aria-label={fa ? "موضوعات داغ" : "Trending"}>
            <h2 className="mb-2 font-semibold">{fa ? "موضوعات داغ (۲۴ ساعت اخیر)" : "Trending (last 24h)"}</h2>
            {trending.length === 0 ? <p className="text-sm opacity-60">{fa ? "هنوز هشتگی استفاده نشده است." : "No hashtags in use yet."}</p>
              : <ul className="space-y-1">{trending.map((x) => (
                <li key={x.tag}><Link href={`/explore?tag=${encodeURIComponent(x.tag)}`} className="flex justify-between hover:underline"><span dir="ltr">#{x.tag}</span><span className="opacity-60 text-sm">{Number(x.uses)}</span></Link></li>))}</ul>}
          </section>
          {suggested.length > 0 && (
            <section className="glass mb-3 space-y-3 rounded-2xl p-4" aria-label={fa ? "پیشنهاد دنبال‌کردن" : "Suggested accounts"}>
              <h2 className="font-semibold">{fa ? "پیشنهاد برای دنبال‌کردن" : "Who to follow"}</h2>
              {suggested.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2">
                  <Link href={`/u/${s.username}`} className="min-w-0 truncate"><b>{s.display_name}</b> <span dir="ltr" className="opacity-60">@{s.username}</span></Link>
                  <FollowButton target={s.id} initial="none" lang={lang} />
                </div>
              ))}
            </section>
          )}
          {discussions.length > 0 && (<>
            <h2 className="mb-2 font-semibold">{fa ? "بحث‌های داغ این هفته" : "Popular discussions this week"}</h2>
            <div className="mb-4 space-y-3">{discussions.map(card)}</div>
          </>)}
          <h2 className="mb-2 font-semibold">{fa ? "تازه‌ترین پست‌ها" : "Recent posts"}</h2>
        </>
      )}
      <section className="space-y-3 pb-24">
        {type === "users" && q
          ? (users.length === 0 ? <p className="py-16 text-center opacity-60">{fa ? "کاربری پیدا نشد." : "No people found."}</p>
            : users.map((u) => <Link key={u.id} href={`/u/${u.username}`} className="glass block rounded-2xl p-3"><b>{u.display_name}</b> <span dir="ltr" className="opacity-60">@{u.username}</span></Link>))
          : (posts.length === 0 ? <p className="py-16 text-center opacity-60">{searching ? (fa ? "نتیجه‌ای پیدا نشد." : "No results.") : (fa ? "هنوز پستی نیست." : "No posts yet.")}</p>
            : posts.map(card))}
      </section>
    </div>
  );
}
