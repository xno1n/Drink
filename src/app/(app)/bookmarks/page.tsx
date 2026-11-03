import { getContext } from "@/lib/viewer";
import { AppHeader } from "@/components/app-header";
import { PostCard, type PostRow } from "@/components/post-card";

export default async function Bookmarks() {
  const { supabase, user, me, lang, theme, mediaBase } = await getContext();
  const fa = lang === "fa";
  const { data: bm } = await supabase.from("bookmarks").select("post_id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
  const ids = (bm ?? []).map((r) => r.post_id);
  let posts: PostRow[] = [];
  if (ids.length) {
    const { data } = await supabase.from("posts_feed").select("*").in("id", ids); // posts you can no longer see are simply omitted
    const order = new Map(ids.map((id, i) => [id, i]));
    posts = ((data ?? []) as unknown as PostRow[]).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  }
  return (
    <div className="mx-auto max-w-xl px-3">
      <AppHeader lang={lang} theme={theme} username={me?.username} />
      <h1 className="mb-3 text-lg font-bold">{fa ? "نشانه‌ها" : "Bookmarks"}</h1>
      <section className="space-y-3 pb-24">
        {posts.length === 0 ? <p className="py-16 text-center opacity-60">{fa ? "هنوز پستی را نشانه نکرده‌اید." : "No bookmarks yet."}</p>
          : posts.map((p) => <PostCard key={p.id} post={p} lang={lang} viewerId={user.id} mediaBase={mediaBase} />)}
      </section>
    </div>
  );
}
