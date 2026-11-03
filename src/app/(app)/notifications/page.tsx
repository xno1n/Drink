import Link from "next/link";
import { getContext } from "@/lib/viewer";
import { AppHeader } from "@/components/app-header";
import { RequestActions } from "@/components/request-actions";
import { Live } from "@/components/live";
import { markAllRead } from "@/app/actions/notifications";

type Actor = { username: string; display_name: string } | null;
type N = { id: string; type: string; post_id: string | null; read_at: string | null; created_at: string; actor: Actor };
type Req = { requester: { id: string; username: string; display_name: string } | null };

const TEXT: Record<string, { fa: string; en: string }> = {
  follow: { fa: "شما را دنبال کرد", en: "followed you" },
  follow_request: { fa: "درخواست دنبال‌کردن فرستاد", en: "requested to follow you" },
  like: { fa: "پست شما را پسندید", en: "liked your post" },
  reply: { fa: "به پست شما پاسخ داد", en: "replied to your post" },
  repost: { fa: "پست شما را بازنشر کرد", en: "reposted your post" },
  mention: { fa: "شما را منشن کرد", en: "mentioned you" },
  quote: { fa: "پست شما را نقل‌قول کرد", en: "quoted your post" },
  message: { fa: "پیام فرستاد", en: "sent you a message" },
};

export default async function Notifications() {
  const { supabase, user, me, lang, theme } = await getContext();
  const fa = lang === "fa";
  const [{ data: nData, error }, { data: rData }] = await Promise.all([
    supabase.from("notifications").select("id, type, post_id, read_at, created_at, actor:profiles!notifications_actor_id_fkey(username, display_name)")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    supabase.from("follow_requests").select("requester:profiles!follow_requests_requester_id_fkey(id, username, display_name)").eq("target_id", user.id).order("created_at"),
  ]);
  const items = (nData ?? []) as unknown as N[];
  const reqs = ((rData ?? []) as unknown as Req[]).filter((r) => r.requester);
  const unread = items.some((n) => !n.read_at);
  return (
    <div className="mx-auto max-w-xl px-3">
      <AppHeader lang={lang} theme={theme} username={me?.username} />
      <Live table="notifications" filter={`user_id=eq.${user.id}`} fallbackSeconds={30} />
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-bold">{fa ? "اعلان‌ها" : "Notifications"}</h1>
        {unread && <form action={markAllRead}><button className="glass rounded-full px-3 py-1.5 text-sm">{fa ? "همه خوانده شد" : "Mark all read"}</button></form>}
      </div>
      {reqs.length > 0 && (
        <section className="glass mb-3 space-y-3 rounded-2xl p-4" aria-label={fa ? "درخواست‌های دنبال‌کردن" : "Follow requests"}>
          <h2 className="font-semibold">{fa ? "درخواست‌های دنبال‌کردن" : "Follow requests"}</h2>
          {reqs.map(({ requester: r }) => (
            <div key={r!.id} className="flex items-center justify-between gap-2">
              <Link href={`/u/${r!.username}`} className="min-w-0 truncate"><b>{r!.display_name}</b> <span dir="ltr" className="opacity-60">@{r!.username}</span></Link>
              <RequestActions requester={r!.id} lang={lang} />
            </div>
          ))}
        </section>
      )}
      <section className="space-y-2 pb-24">
        {error && <p role="alert" className="py-6 text-center text-red-500">{fa ? "خطا در بارگذاری." : "Failed to load."}</p>}
        {!error && items.length === 0 && <p className="py-16 text-center opacity-60">{fa ? "اعلانی ندارید." : "No notifications."}</p>}
        {items.map((n) => (
          <Link key={n.id} href={n.type === "message" ? "/messages" : n.post_id ? `/post/${n.post_id}` : n.actor ? `/u/${n.actor.username}` : "/"}
            className={`glass flex items-center gap-3 rounded-2xl p-3 ${n.read_at ? "opacity-70" : ""}`}>
            {!n.read_at && <span className="size-2 shrink-0 rounded-full bg-pink-500" aria-label={fa ? "خوانده‌نشده" : "unread"} />}
            <span className="min-w-0"><b>{n.actor?.display_name ?? "—"}</b> {(TEXT[n.type] ?? TEXT.follow)[lang]}</span>
            <time className="ms-auto shrink-0 text-xs opacity-60" dateTime={n.created_at}>{new Date(n.created_at).toLocaleDateString(lang)}</time>
          </Link>
        ))}
      </section>
    </div>
  );
}
