import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getContext } from "@/lib/viewer";
import { PostCard, type PostRow } from "@/components/post-card";
import { Composer } from "@/components/composer";
import { AppHeader } from "@/components/app-header";

export default async function PostPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ quote?: string }> }) {
  const { id } = await params;
  const quoting = (await searchParams).quote === "1";
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { supabase, user, me, lang, theme, mediaBase } = await getContext();
  const { data: post } = await supabase.from("posts_feed").select("*").eq("id", id).maybeSingle();
  if (!post) notFound(); // hidden by RLS (private/blocked/removed) looks identical to missing
  const { data: replies } = await supabase.from("posts_feed").select("*").eq("reply_to_id", id).order("created_at", { ascending: true }).limit(100);
  const rids = (replies ?? []).map((r) => r.id);
  const { data: kids } = rids.length ? await supabase.from("posts_feed").select("*").in("reply_to_id", rids).order("created_at", { ascending: true }).limit(200) : { data: [] as typeof replies };
  const fa = lang === "fa";
  return (
    <div className="mx-auto max-w-xl px-3">
      <AppHeader lang={lang} theme={theme} username={me?.username} />
      {post.reply_to_id && <Link href={`/post/${post.reply_to_id}`} className="mb-2 block text-sm underline opacity-70">{fa ? "در پاسخ به یک پست" : "In reply to a post"}</Link>}
      <PostCard post={post as unknown as PostRow} lang={lang} viewerId={user.id} mediaBase={mediaBase} />
      <div className="mt-3">
        {quoting && <p className="mb-1 text-sm opacity-70">{fa ? "نقل‌قول این پست:" : "Quoting this post:"}</p>}
        <Composer lang={lang} replyTo={quoting ? undefined : id} quoteOf={quoting ? id : undefined} />
      </div>
      <section className="space-y-3 pb-24" aria-label={fa ? "پاسخ‌ها" : "Replies"}>
        {(replies ?? []).map((r) => (
          <div key={r.id}>
            <PostCard post={r as unknown as PostRow} lang={lang} viewerId={user.id} mediaBase={mediaBase} />
            {(kids ?? []).filter((k) => k.reply_to_id === r.id).length > 0 && (
              <div className="ms-6 mt-2 space-y-2 border-s ps-3">
                {(kids ?? []).filter((k) => k.reply_to_id === r.id).map((k) => <PostCard key={k.id} post={k as unknown as PostRow} lang={lang} viewerId={user.id} mediaBase={mediaBase} />)}
              </div>)}
          </div>))}
      </section>
    </div>
  );
}
