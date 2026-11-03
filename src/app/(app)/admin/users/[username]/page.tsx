import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getContext } from "@/lib/viewer";
import { AppHeader } from "@/components/app-header";

type Hist = {
  profile: { id: string; username: string; display_name: string; role: string; created_at: string; suspended_until: string | null; suspended_reason: string | null; deactivated_at: string | null } | null;
  actions: { action: string; reason: string; at: string; by: string | null }[];
  reports_against: Record<string, number>;
  appeals: { status: string; message: string; at: string }[];
};
export default async function UserHistory({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) notFound();
  const { supabase, me, lang, theme } = await getContext();
  if (!me || !["moderator", "admin", "super_admin"].includes(me.role)) redirect("/"); // RPC re-checks staff role server-side
  const { data: p } = await supabase.from("profiles").select("id").ilike("username", username.replace(/[\\%_]/g, "\\$&")).maybeSingle();
  if (!p) notFound();
  const { data, error } = await supabase.rpc("admin_user_history", { p_user: p.id });
  if (error || !data) notFound();
  const h = data as Hist;
  if (!h.profile) notFound();
  const card = "glass mb-3 rounded-2xl p-4";
  return (
    <div className="mx-auto max-w-2xl px-3">
      <AppHeader lang={lang} theme={theme} username={me.username} />
      <p className="mb-3"><Link href="/admin" className="underline">← Admin</Link></p>
      <section className={card}>
        <h1 className="text-lg font-bold">{h.profile.display_name} <span dir="ltr" className="font-normal opacity-60">@{h.profile.username}</span></h1>
        <p className="text-sm opacity-80">Role: {h.profile.role} · Joined {new Date(h.profile.created_at).toLocaleDateString(lang)}{h.profile.deactivated_at ? " · deactivated" : ""}</p>
        {h.profile.suspended_until && new Date(h.profile.suspended_until) > new Date() && <p className="text-sm text-red-500">Suspended until {new Date(h.profile.suspended_until).toLocaleString(lang)} — {h.profile.suspended_reason}</p>}
        <p className="mt-2 text-sm">Reports against: {Object.keys(h.reports_against).length === 0 ? "none" : Object.entries(h.reports_against).map(([k, v]) => `${k}: ${v}`).join(", ")}</p>
      </section>
      <section className={card}><h2 className="mb-2 font-semibold">Moderation actions ({h.actions.length})</h2>
        {h.actions.length === 0 && <p className="text-sm opacity-60">None.</p>}
        {h.actions.map((a, i) => <p key={i} className="border-t border-black/10 py-1 text-sm dark:border-white/10"><b>{a.action}</b> — {a.reason} <span className="opacity-60">({new Date(a.at).toLocaleDateString(lang)}{a.by ? `, by @${a.by}` : ""})</span></p>)}
      </section>
      <section className={`${card} mb-24`}><h2 className="mb-2 font-semibold">Appeals ({h.appeals.length})</h2>
        {h.appeals.length === 0 && <p className="text-sm opacity-60">None.</p>}
        {h.appeals.map((a, i) => <p key={i} className="border-t border-black/10 py-1 text-sm dark:border-white/10"><b>{a.status}</b> — {a.message}</p>)}
      </section>
    </div>
  );
}
