import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/viewer";
import { PostCard, type PostRow } from "@/components/post-card";
import { AppHeader } from "@/components/app-header";
import { FollowButton } from "@/components/follow-button";
import { UserActions } from "@/components/user-actions";
import { startConversation } from "@/app/actions/messages";

export default async function Profile({ params, searchParams }: { params: Promise<{ username: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { username } = await params;
  const rawTab = (await searchParams).tab;
  const tab = (["replies", "media", "likes"].includes(rawTab ?? "") ? rawTab : "posts") as "posts" | "replies" | "media" | "likes";
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) notFound();
  const { supabase, user, me, lang, theme, mediaBase } = await getContext();
  const fa = lang === "fa";
  const { data: prof } = await supabase.from("profiles").select("id, username, display_name, bio, location, website, is_protected, created_at, pinned_post_id, avatar_url, cover_url")
    .ilike("username", username.replace(/[\\%_]/g, "\\$&")).maybeSingle();
  if (!prof) notFound();
  const sign = async (p: string | null) => (p ? (await supabase.storage.from("media").createSignedUrl(p, 3600)).data?.signedUrl ?? null : null);
  const [avatarSrc, coverSrc] = await Promise.all([sign(prof.avatar_url), sign(prof.cover_url)]); // media bucket is private

  const count = (col: "follower_id" | "following_id") =>
    supabase.from("follows").select("*", { count: "exact", head: true }).eq(col === "follower_id" ? "following_id" : "follower_id", prof.id);
  const [followers, following, rel, req, feed] = await Promise.all([
    count("follower_id"), count("following_id"),
    supabase.from("follows").select("follower_id").eq("follower_id", user.id).eq("following_id", prof.id).maybeSingle(),
    supabase.from("follow_requests").select("requester_id").eq("requester_id", user.id).eq("target_id", prof.id).maybeSingle(),
    (() => {
      const base = supabase.from("posts_feed").select("*").eq("author_id", prof.id).order("created_at", { ascending: false }).limit(30);
      if (tab === "replies") return base.not("reply_to_id", "is", null);
      if (tab === "media") return base.eq("has_media", true);
      if (tab === "likes") return base.limit(0); // likes are loaded below (privacy-aware RPC)
      return base.is("reply_to_id", null);
    })(),
  ]);
  const isMe = prof.id === user.id;
  const { data: mutedRow } = isMe ? { data: null } : await supabase.from("mutes").select("muted_id").eq("muter_id", user.id).eq("muted_id", prof.id).maybeSingle();
  const { data: followsMe } = isMe ? { data: null } : await supabase.from("follows").select("follower_id").eq("follower_id", prof.id).eq("following_id", user.id).maybeSingle();
  const status = rel.data ? "following" : req.data ? "requested" : "none";
  const locked = prof.is_protected && !isMe && status !== "following";
  let posts = (feed.data ?? []) as unknown as PostRow[];
  let likesHidden = false;
  if (tab === "likes" && !locked) {
    const { data: likedRows } = await supabase.rpc("profile_likes", { p_user: prof.id, p_limit: 30 });
    const ids = ((likedRows ?? []) as { post_id: string }[]).map((r) => r.post_id);
    likesHidden = !isMe && ids.length === 0;
    if (ids.length) {
      const { data } = await supabase.from("posts_feed").select("*").in("id", ids);
      const order = new Map(ids.map((id, i) => [id, i]));
      posts = ((data ?? []) as unknown as PostRow[]).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    }
  }
  let pinned: PostRow | null = null;
  if (tab === "posts" && prof.pinned_post_id && !locked) {
    const { data } = await supabase.from("posts_feed").select("*").eq("id", prof.pinned_post_id).is("reply_to_id", null).maybeSingle();
    pinned = (data as unknown as PostRow) ?? null; // soft-deleted or hidden pins simply don't show
    if (pinned) posts = posts.filter((p) => p.id !== pinned!.id);
  }
  const tabCls = (on: boolean) => `flex-1 py-3 text-center ${on ? "font-bold border-b-2 border-current" : "opacity-60"}`;

  return (
    <div className="mx-auto max-w-xl px-3">
      <AppHeader lang={lang} theme={theme} username={me?.username} />
      <section className="glass rounded-2xl mb-3 overflow-hidden">
        {coverSrc
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={coverSrc} alt="" className="h-28 w-full object-cover" />
          : <div className="h-28 w-full bg-gradient-to-r from-sky-400/30 to-violet-500/30" aria-hidden />}
        <div className="p-4">
        <div className="flex items-start gap-3">
          {avatarSrc
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={avatarSrc} alt="" className="size-16 rounded-full object-cover" />
            : <div className="size-16 rounded-full bg-gradient-to-br from-sky-400 to-violet-500" aria-hidden />}
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold truncate">{prof.display_name}</h1>
            <p dir="ltr" className="opacity-60 text-start">@{prof.username}{prof.is_protected ? " 🔒" : ""}</p>
            {followsMe && <span className="mt-1 inline-block rounded-full border px-2 py-0.5 text-xs opacity-70">{fa ? "شما را دنبال می‌کند" : "Follows you"}</span>}
          </div>
          {!isMe && <div className="flex flex-col items-end gap-2"><FollowButton target={prof.id} initial={status} lang={lang} /><div className="flex items-center gap-1"><form action={startConversation}><input type="hidden" name="target" value={prof.id} /><button className="glass rounded-full px-3 py-1.5 text-sm" aria-label={fa ? "پیام" : "Message"}>✉</button></form><UserActions target={prof.id} muted={!!mutedRow} lang={lang} /></div></div>}
          {isMe && <Link href="/settings" className="glass rounded-full px-4 py-1.5 text-sm">{fa ? "ویرایش" : "Edit"}</Link>}
        </div>
        {prof.bio && <p className="mt-3 whitespace-pre-wrap break-words">{prof.bio}</p>}
        {prof.website && /^https?:\/\//i.test(prof.website) && <a href={prof.website} target="_blank" rel="noopener noreferrer nofollow" dir="ltr" className="mt-1 block text-sm text-sky-500 hover:underline">{prof.website.replace(/^https?:\/\//i, "")}</a>}
        <p className="mt-2 text-sm opacity-70">{[prof.location, new Date(prof.created_at).toLocaleDateString(lang, { year: "numeric", month: "long" })].filter(Boolean).join(" · ")}</p>
        <p className="mt-2 text-sm"><Link href={`/u/${prof.username}/following`} className="hover:underline"><b>{following.count ?? 0}</b> {fa ? "دنبال‌شونده" : "Following"}</Link> · <Link href={`/u/${prof.username}/followers`} className="hover:underline"><b>{followers.count ?? 0}</b> {fa ? "دنبال‌کننده" : "Followers"}</Link></p>
        </div>
      </section>
      <nav className="glass mb-3 flex overflow-hidden rounded-2xl" aria-label="profile tabs">
        <Link href={`/u/${prof.username}`} className={tabCls(tab === "posts")}>{fa ? "پست‌ها" : "Posts"}</Link>
        <Link href={`/u/${prof.username}?tab=replies`} className={tabCls(tab === "replies")}>{fa ? "پاسخ‌ها" : "Replies"}</Link>
        <Link href={`/u/${prof.username}?tab=media`} className={tabCls(tab === "media")}>{fa ? "رسانه" : "Media"}</Link>
        <Link href={`/u/${prof.username}?tab=likes`} className={tabCls(tab === "likes")}>{fa ? "پسندها" : "Likes"}</Link>
      </nav>
      <section className="space-y-3 pb-24">
        {locked ? <p className="text-center opacity-60 py-16">{fa ? "این حساب خصوصی است." : "This account is private."}</p>
          : likesHidden ? <p className="text-center opacity-60 py-16">{fa ? "پسندها خصوصی هستند یا چیزی نیست." : "Likes are private or empty."}</p>
          : (<>
            {pinned && <PostCard post={pinned} lang={lang} viewerId={user.id} mediaBase={mediaBase} pinned />}
            {posts.length === 0 && !pinned ? <p className="text-center opacity-60 py-16">{fa ? "هنوز چیزی نیست." : "Nothing here yet."}</p>
              : posts.map((p) => <PostCard key={p.id} post={p} lang={lang} viewerId={user.id} mediaBase={mediaBase} />)}
          </>)}
      </section>
    </div>
  );
}
