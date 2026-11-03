"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Heart, MessageCircle, Repeat2, Bookmark, Trash2, Quote, Pencil, Pin, Share2, Users } from "lucide-react";
import { useSignedUrl } from "@/lib/use-signed-url";
import { RichText } from "@/components/rich-text";
import { ReportButton } from "@/components/report-button";
import { toggleLike, toggleRepost, toggleBookmark, deletePost, editPost, pinPost } from "@/app/actions/posts";

export type PostRow = {
  id: string; author_id: string; body: string; created_at: string; edited_at: string | null;
  author_username: string; author_display_name: string; author_avatar_url: string | null;
  like_count: number; repost_count: number; reply_count: number;
  liked_by_me: boolean; reposted_by_me: boolean; bookmarked_by_me: boolean;
  media: { path: string; alt: string | null; kind: string }[];
  quoted: { id: string; body: string; username: string; display_name: string } | null;
  has_media: boolean;
  audience?: "public" | "close_friends";
};

const rel = (iso: string, lang: string) => {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const f = new Intl.RelativeTimeFormat(lang, { numeric: "auto", style: "short" });
  if (s < 60) return f.format(-s, "second");
  if (s < 3600) return f.format(-Math.floor(s / 60), "minute");
  if (s < 86400) return f.format(-Math.floor(s / 3600), "hour");
  return f.format(-Math.floor(s / 86400), "day");
};

function useToggle(initial: boolean, count: number, action: (id: string) => Promise<{ active?: boolean; error?: string }>, id: string) {
  const [on, setOn] = useState(initial);
  const [n, setN] = useState(Number(count));
  const [, start] = useTransition();
  const click = () => {
    const next = !on;
    setOn(next); setN((c) => c + (next ? 1 : -1)); // optimistic
    start(async () => {
      const r = await action(id);
      if (r.error) { setOn(!next); setN((c) => c + (next ? -1 : 1)); } // revert on failure
    });
  };
  return { on, n, click };
}

function Avatar({ path }: { path: string | null }) {
  const url = useSignedUrl(path);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" loading="lazy" className="size-10 shrink-0 rounded-full object-cover" />
    : <div className="size-10 shrink-0 rounded-full bg-gradient-to-br from-sky-400 to-violet-500" aria-hidden />;
}
function MediaImg({ path, alt, kind }: { path: string; alt: string; kind: string }) {
  const url = useSignedUrl(path);
  if (url === undefined) return <div className="h-40 w-full animate-pulse bg-black/10 dark:bg-white/10" aria-hidden />;
  if (url === null) return null; // no access or failed: show nothing rather than a broken image
  if (kind === "video") return <video src={url} controls preload="metadata" playsInline aria-label={alt || "video"} className="w-full max-h-96 bg-black" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} loading="lazy" className="w-full max-h-96 object-cover" />;
}

export function PostCard({ post, lang, viewerId, mediaBase, pinned = false }: { post: PostRow; lang: string; viewerId: string; mediaBase: string; pinned?: boolean }) {
  const like = useToggle(post.liked_by_me, post.like_count, toggleLike, post.id);
  const repost = useToggle(post.reposted_by_me, post.repost_count, toggleRepost, post.id);
  const bm = useToggle(post.bookmarked_by_me, 0, toggleBookmark, post.id);
  const [gone, setGone] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [body, setBody] = useState(post.body);
  const [edited, setEdited] = useState(!!post.edited_at);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.body);
  const [note, setNote] = useState("");
  const fa = lang === "fa";
  const mine = post.author_id === viewerId;
  if (gone) return null;
  const btn = "flex items-center gap-1 rounded-full p-2 text-sm opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition";
  return (
    <motion.article initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="glass rounded-2xl p-4 flex gap-3">
      <Avatar path={post.author_avatar_url} />
      <div className="min-w-0 flex-1">
        {post.audience === "close_friends" && <p className="mb-1 flex items-center gap-1 text-xs text-emerald-500"><Users size={12} />{fa ? "دوستان نزدیک" : "Close friends"}</p>}
        {pinned && <p className="mb-1 flex items-center gap-1 text-xs opacity-60"><Pin size={12} />{fa ? "پست سنجاق‌شده" : "Pinned post"}</p>}
        <header className="flex items-baseline gap-2 text-sm">
          <Link href={`/u/${post.author_username}`} className="flex min-w-0 items-baseline gap-2 hover:underline"><b className="truncate">{post.author_display_name}</b>
            <span dir="ltr" className="opacity-60 truncate">@{post.author_username}</span></Link>
          <Link href={`/post/${post.id}`} className="ms-auto shrink-0 opacity-60 hover:underline"><time dateTime={post.created_at}>{rel(post.created_at, lang)}{edited ? (fa ? " · ویرایش‌شده" : " · edited") : ""}</time></Link>
        </header>
        {editing ? (
          <form className="mt-2 space-y-2" onSubmit={async (e) => { e.preventDefault(); const r = await editPost(post.id, draft); if (r?.error) setNote(r.error); else { setBody(draft.trim()); setEdited(true); setEditing(false); setNote(""); } }}>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={280} rows={3} aria-label={fa ? "ویرایش پست" : "Edit post"} className="glass w-full rounded-xl bg-transparent p-2" />
            <div className="flex items-center gap-2 text-sm">
              <button className="rounded-full bg-black px-3 py-1 font-semibold text-white dark:bg-white dark:text-black">{fa ? "ذخیره" : "Save"}</button>
              <button type="button" className="glass rounded-full px-3 py-1" onClick={() => { setEditing(false); setDraft(body); setNote(""); }}>{fa ? "انصراف" : "Cancel"}</button>
              {note && <span role="alert" className="text-red-500">{note}</span>}
            </div>
          </form>
        ) : body && <p className="mt-1 whitespace-pre-wrap break-words"><RichText text={body} /></p>}
        {post.quoted && (
          <Link href={`/post/${post.quoted.id}`} className="glass mt-2 block rounded-xl p-2 text-sm">
            <b>{post.quoted.display_name}</b> <span dir="ltr" className="opacity-60">@{post.quoted.username}</span>
            <p className="line-clamp-3 whitespace-pre-wrap break-words opacity-90">{post.quoted.body}</p>
          </Link>
        )}
        {post.media.length > 0 && (
          <div className={`mt-2 grid gap-1 overflow-hidden rounded-xl ${post.media.length > 1 ? "grid-cols-2" : ""}`}>
            {post.media.map((m) => <MediaImg key={m.path} path={m.path} alt={m.alt ?? ""} kind={m.kind} />)}
          </div>
        )}
        <footer className="mt-2 -ms-2 flex flex-wrap items-center gap-x-1">
          <Link href={`/post/${post.id}`} className={btn} aria-label={fa ? "پاسخ" : "Reply"}><MessageCircle size={18} />{Number(post.reply_count) || ""}</Link>
          <button className={`${btn} ${repost.on ? "!opacity-100 text-emerald-500" : ""}`} onClick={repost.click} aria-pressed={repost.on} aria-label={fa ? "بازنشر" : "Repost"}><Repeat2 size={18} />{repost.n || ""}</button>
          <Link href={`/post/${post.id}?quote=1`} className={btn} aria-label={fa ? "نقل‌قول" : "Quote"}><Quote size={18} /></Link>
          <button className={btn} aria-label={fa ? "اشتراک‌گذاری" : "Share"} onClick={async () => { const url = `${location.origin}/post/${post.id}`; try { if (navigator.share) await navigator.share({ url }); else { await navigator.clipboard.writeText(url); setNote(fa ? "لینک کپی شد" : "Link copied"); } } catch { /* cancelled */ } }}><Share2 size={18} /></button>
          <button className={`${btn} ${like.on ? "!opacity-100 text-pink-500" : ""}`} onClick={like.click} aria-pressed={like.on} aria-label={fa ? "پسندیدن" : "Like"}><Heart size={18} fill={like.on ? "currentColor" : "none"} />{like.n || ""}</button>
          <button className={`${btn} ${bm.on ? "!opacity-100 text-sky-500" : ""}`} onClick={bm.click} aria-pressed={bm.on} aria-label={fa ? "نشانه‌گذاری" : "Bookmark"}><Bookmark size={18} fill={bm.on ? "currentColor" : "none"} /></button>
          {mine && !editing && <button className={btn} onClick={() => setEditing(true)} aria-label={fa ? "ویرایش" : "Edit"}><Pencil size={18} /></button>}
          {mine && <button className={btn} aria-label={pinned ? (fa ? "برداشتن سنجاق" : "Unpin") : (fa ? "سنجاق" : "Pin")}
            onClick={async () => { const r = await pinPost(pinned ? null : post.id); setNote(r?.error ? r.error : fa ? "انجام شد" : "Done"); }}><Pin size={18} fill={pinned ? "currentColor" : "none"} /></button>}
          {mine && (confirming ? (
            <button className={`${btn} !opacity-100 text-red-500`} onClick={async () => { const r = await deletePost(post.id); if (!r?.error) setGone(true); }}>{fa ? "حذف؟" : "Delete?"}</button>
          ) : (
            <button className={btn} onClick={() => setConfirming(true)} aria-label={fa ? "حذف" : "Delete"}><Trash2 size={18} /></button>
          ))}
          {!mine && <ReportButton postId={post.id} lang={lang} />}
          {!editing && note && <span role="status" className="text-xs opacity-60">{note}</span>}
        </footer>
      </div>
    </motion.article>
  );
}
