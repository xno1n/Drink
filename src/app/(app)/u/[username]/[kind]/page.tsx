import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/viewer";
import { AppHeader } from "@/components/app-header";

type P = { id: string; username: string; display_name: string };
export default async function FollowList({ params }: { params: Promise<{ username: string; kind: string }> }) {
  const { username, kind } = await params;
  if (!["followers", "following"].includes(kind) || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) notFound();
  const { supabase, user, me, lang, theme } = await getContext();
  const fa = lang === "fa";
  const { data: prof } = await supabase.from("profiles").select("id, username, display_name").ilike("username", username.replace(/[\\%_]/g, "\\$&")).maybeSingle();
  if (!prof) notFound();
  // RLS decides what is visible (protected accounts' lists require following them).
  const { data: rows } = await supabase.from("follows").select("follower_id, following_id").eq(kind === "followers" ? "following_id" : "follower_id", prof.id).order("created_at", { ascending: false }).limit(100);
  const ids = (rows ?? []).map((r) => (kind === "followers" ? r.follower_id : r.following_id));
  let people: P[] = [];
  let followsMe = new Set<string>();
  if (ids.length) {
    const [{ data: ps }, { data: fm }] = await Promise.all([
      supabase.from("profiles").select("id, username, display_name").in("id", ids),
      supabase.from("follows").select("follower_id").in("follower_id", ids).eq("following_id", user.id),
    ]);
    const order = new Map(ids.map((id, i) => [id, i]));
    people = ((ps ?? []) as P[]).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    followsMe = new Set((fm ?? []).map((r) => r.follower_id));
  }
  return (
    <div className="mx-auto max-w-xl px-3">
      <AppHeader lang={lang} theme={theme} username={me?.username} />
      <p className="mb-3"><Link href={`/u/${prof.username}`} className="underline" dir="ltr">@{prof.username}</Link> — <b>{kind === "followers" ? (fa ? "دنبال‌کننده‌ها" : "Followers") : (fa ? "دنبال‌شونده‌ها" : "Following")}</b></p>
      <section className="space-y-2 pb-24">
        {people.length === 0 && <p className="py-16 text-center opacity-60">{fa ? "کسی نیست یا دسترسی ندارید." : "Nobody here, or you can't view this list."}</p>}
        {people.map((u) => (
          <Link key={u.id} href={`/u/${u.username}`} className="glass flex items-center justify-between rounded-2xl p-3">
            <span><b>{u.display_name}</b> <span dir="ltr" className="opacity-60">@{u.username}</span></span>
            {followsMe.has(u.id) && u.id !== user.id && <span className="rounded-full border px-2 py-0.5 text-xs opacity-70">{fa ? "شما را دنبال می‌کند" : "Follows you"}</span>}
          </Link>))}
      </section>
    </div>
  );
}
