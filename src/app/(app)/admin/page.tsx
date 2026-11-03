import Link from "next/link";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/viewer";
import { AppHeader } from "@/components/app-header";
import { ModerateForm } from "@/components/moderate-form";
import { restoreUser, setRole, resolveAppeal, setSiteSetting, setHashtagExcluded, resolveDeletion } from "@/app/actions/moderation";
import { escapeLike } from "@/lib/like";

type Rep = { id: string; category: string; details: string | null; status: string; created_at: string;
  reporter: { username: string } | null; post: { id: string; body: string } | null; reported: { username: string } | null };

export default async function Admin({ searchParams }: { searchParams: Promise<{ err?: string; q?: string; days?: string }> }) {
  const sp = await searchParams;
  const { supabase, user, me, lang, theme } = await getContext();
  const { data: self } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!self || !["moderator", "admin", "super_admin"].includes(self.role)) redirect("/"); // server-side check; middleware is a second layer, RLS/RPCs a third
  const isAdmin = self.role !== "moderator";
  const days = [1, 7, 30].includes(Number(sp.days)) ? Number(sp.days) : 7;
  const q = (sp.q ?? "").trim().slice(0, 32);

  const [ov, reps, users, audit, appeals] = await Promise.all([
    supabase.rpc("admin_overview", { p_days: days }),
    supabase.from("reports").select("id, category, details, status, created_at, reporter:profiles!reports_reporter_id_fkey(username), post:posts!reports_post_id_fkey(id, body), reported:profiles!reports_reported_user_id_fkey(username)")
      .in("status", ["open", "reviewing"]).order("created_at").limit(50),
    q ? supabase.from("profiles").select("id, username, display_name, role, suspended_until").ilike("username", `%${escapeLike(q)}%`).limit(20) : Promise.resolve({ data: [] as never[] }),
    isAdmin ? supabase.from("admin_audit_log").select("id, action, target, meta, created_at").order("created_at", { ascending: false }).limit(30) : Promise.resolve({ data: [] as never[] }),
    isAdmin ? supabase.from("appeals").select("id, message, created_at").eq("status", "open").order("created_at").limit(30) : Promise.resolve({ data: [] as never[] }),
  ]);
  const { data: sset } = isAdmin ? await supabase.from("site_settings").select("key, value") : { data: [] as { key: string; value: unknown }[] };
  const sv = (k: string) => (sset ?? []).find((x) => x.key === k)?.value;
  const { data: delReqs } = isAdmin ? await supabase.from("deletion_requests").select("user_id, reason, created_at, profile:profiles!deletion_requests_user_id_fkey(username)").eq("status", "open").order("created_at") : { data: [] };
  const [{ data: daily }, { data: recent }] = await Promise.all([
    supabase.rpc("admin_daily_activity", { p_days: 14 }),
    supabase.from("profiles").select("username, display_name, created_at").order("created_at", { ascending: false }).limit(8),
  ]);
  const days14 = (daily ?? []) as { day: string; new_posts: number; new_users: number }[];
  const maxPosts = Math.max(1, ...days14.map((d) => Number(d.new_posts)));
  const o = (ov.data ?? {}) as Record<string, number>;
  const reports = (reps.data ?? []) as unknown as Rep[];
  const card = "glass mb-3 rounded-2xl p-4";
  const inp = "glass rounded-lg bg-transparent p-2 text-sm";

  return (
    <div className="mx-auto max-w-3xl px-3">
      <AppHeader lang={lang} theme={theme} username={me?.username} />
      <h1 className="mb-3 text-lg font-bold">Admin <span className="text-sm font-normal opacity-60">({self.role})</span></h1>
      {sp.err && <p role="alert" className="mb-3 rounded-xl border border-red-500/40 p-3 text-sm text-red-500">{sp.err}</p>}

      <section className={card} aria-label="Overview">
        <div className="mb-3 flex gap-2 text-sm">{[1, 7, 30].map((d) => <a key={d} href={`/admin?days=${d}`} className={`glass rounded-full px-3 py-1 ${d === days ? "font-bold" : "opacity-60"}`}>{d}d</a>)}</div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {([["Users", o.total_users], ["Posts", o.total_posts], ["Open reports", o.open_reports], [`New users (${days}d)`, o.new_users], [`New posts (${days}d)`, o.new_posts], [`Active authors (${days}d)`, o.active_users]] as [string, number][]).map(([k, v]) => (
            <div key={k}><dt className="text-xs opacity-60">{k}</dt><dd className="text-2xl font-bold">{v ?? "—"}</dd></div>))}
        </dl>
      </section>

      <section className={card} aria-label="Activity">
        <h2 className="mb-2 font-semibold">Posts per day (14d)</h2>
        <div className="flex h-24 items-end gap-1" role="img" aria-label="Posts per day">
          {days14.map((d) => <div key={d.day} title={`${d.day}: ${d.new_posts} posts, ${d.new_users} new users`} className="flex-1 rounded-t bg-sky-500/70" style={{ height: `${Math.max(4, (Number(d.new_posts) / maxPosts) * 100)}%` }} />)}
        </div>
        <h2 className="mb-1 mt-4 font-semibold">Recent registrations</h2>
        {(recent ?? []).map((r) => <p key={r.username} className="text-sm"><b>{r.display_name}</b> <span dir="ltr" className="opacity-60">@{r.username}</span> · {new Date(r.created_at).toLocaleDateString(lang)}</p>)}
      </section>

      <section className={card} aria-label="Report queue">
        <h2 className="mb-2 font-semibold">Report queue ({reports.length})</h2>
        {reports.length === 0 && <p className="text-sm opacity-60">No open reports.</p>}
        {reports.map((r) => (
          <div key={r.id} className="border-t border-black/10 py-3 dark:border-white/10">
            <p className="text-sm"><b>{r.category}</b> · by <span dir="ltr">@{r.reporter?.username ?? "?"}</span> · {new Date(r.created_at).toLocaleString(lang)}</p>
            {r.reported && <p className="text-sm">User: <span dir="ltr">@{r.reported.username}</span></p>}
            {r.post && <blockquote className="my-1 whitespace-pre-wrap break-words border-s-2 ps-2 text-sm opacity-90">{r.post.body}</blockquote>}
            {r.details && <p className="text-sm opacity-70">“{r.details}”</p>}
            <ModerateForm reportId={r.id} hasPost={!!r.post} />
          </div>))}
      </section>

      <section className={card} aria-label="Users">
        <h2 className="mb-2 font-semibold">Users</h2>
        <form className="mb-3 flex gap-2"><input name="q" defaultValue={q} placeholder="username" dir="ltr" className={`${inp} flex-1`} /><button className={`${inp} font-semibold`}>Search</button></form>
        {(users.data ?? []).map((u: { id: string; username: string; display_name: string; role: string; suspended_until: string | null }) => (
          <div key={u.id} className="space-y-2 border-t border-black/10 py-3 dark:border-white/10">
            <p className="text-sm"><Link href={`/admin/users/${u.username}`} className="underline"><b>{u.display_name}</b> <span dir="ltr" className="opacity-60">@{u.username}</span></Link> · {u.role}{u.suspended_until && new Date(u.suspended_until) > new Date() ? " · suspended" : ""}</p>
            {isAdmin && u.id !== user.id && (<>
              <form action={setRole} className="flex flex-wrap gap-2"><input type="hidden" name="user" value={u.id} />
                <select name="role" defaultValue={u.role === "super_admin" ? "admin" : u.role} className={inp}><option value="user">user</option><option value="moderator">moderator</option>{self.role === "super_admin" && <option value="admin">admin</option>}</select>
                <input name="reason" required minLength={3} placeholder="Reason" className={`${inp} flex-1`} /><button className={`${inp} font-semibold`}>Set role</button></form>
              {u.suspended_until && new Date(u.suspended_until) > new Date() && (
                <form action={restoreUser} className="flex gap-2"><input type="hidden" name="user" value={u.id} /><input name="reason" required minLength={3} placeholder="Reason" className={`${inp} flex-1`} /><button className={`${inp} font-semibold`}>Restore</button></form>)}
            </>)}
          </div>))}
      </section>

      {isAdmin && (
        <>
          <section className={card} aria-label="Deletion requests">
            <h2 className="mb-2 font-semibold">Deletion requests ({(delReqs ?? []).length})</h2>
            {((delReqs ?? []) as unknown as { user_id: string; reason: string | null; created_at: string; profile: { username: string } | null }[]).map((d) => (
              <form key={d.user_id} action={resolveDeletion} className="space-y-2 border-t border-black/10 py-2 text-sm dark:border-white/10">
                <input type="hidden" name="user" value={d.user_id} />
                <p><b dir="ltr">@{d.profile?.username ?? "?"}</b> · {new Date(d.created_at).toLocaleDateString(lang)}{d.reason ? ` — “${d.reason}”` : ""}</p>
                <div className="flex flex-wrap gap-2"><input name="reason" required minLength={3} placeholder="Decision reason" className={`${inp} min-w-40 flex-1`} />
                  <button name="action" value="reject" className={inp}>Reject</button><button name="action" value="approve" className={`${inp} font-semibold text-red-500`} formNoValidate={false}>Approve & delete</button></div>
              </form>))}
          </section>
          <section className={card} aria-label="Appeals">
            <h2 className="mb-2 font-semibold">Open appeals ({(appeals.data ?? []).length})</h2>
            {(appeals.data ?? []).map((a: { id: string; message: string }) => (
              <form key={a.id} action={resolveAppeal} className="flex flex-wrap items-center gap-2 border-t border-black/10 py-2 text-sm dark:border-white/10">
                <input type="hidden" name="appeal" value={a.id} /><span className="min-w-40 flex-1">{a.message}</span>
                <button name="outcome" value="upheld" className={inp}>Uphold action</button><button name="outcome" value="overturned" className={inp}>Overturn</button></form>))}
          </section>
          <section className={card} aria-label="Site settings">
            <h2 className="mb-2 font-semibold">Site settings</h2>
            {([["registration_open", "bool"], ["maintenance_mode", "bool"], ["post_max_chars", "int"], ["post_rate_per_hour", "int"], ["media_max_mb", "int"]] as const).map(([k, kind]) => (
              <form key={k} action={setSiteSetting} className="flex flex-wrap items-center gap-2 border-t border-black/10 py-2 text-sm dark:border-white/10">
                <input type="hidden" name="key" value={k} /><span className="min-w-44 flex-1" dir="ltr">{k}</span>
                {kind === "bool" ? <select name="value" defaultValue={String(sv(k) === true)} className={inp}><option value="true">true</option><option value="false">false</option></select>
                  : <input name="value" type="number" defaultValue={String(sv(k) ?? "")} className={`${inp} w-24`} />}
                <button className={`${inp} font-semibold`}>Save</button></form>))}
            <form action={setSiteSetting} className="flex flex-wrap items-center gap-2 border-t border-black/10 py-2 text-sm dark:border-white/10">
              <input type="hidden" name="key" value="announcement" /><span className="min-w-44" dir="ltr">announcement</span>
              <input name="value" defaultValue={(sv("announcement") as { text?: string } | null)?.text ?? ""} placeholder="empty = no banner" maxLength={300} className={`${inp} min-w-40 flex-1`} /><button className={`${inp} font-semibold`}>Save</button></form>
            {(["for_you_weights", "feature_flags"] as const).map((k) => (
              <form key={k} action={setSiteSetting} className="space-y-2 border-t border-black/10 py-2 text-sm dark:border-white/10">
                <input type="hidden" name="key" value={k} /><span dir="ltr">{k} (JSON object)</span>
                <textarea name="value" rows={3} defaultValue={JSON.stringify(sv(k) ?? {}, null, 1)} dir="ltr" className={`${inp} w-full font-mono`} /><button className={`${inp} font-semibold`}>Save</button></form>))}
            <form action={setSiteSetting} className="space-y-2 border-t border-black/10 py-2 text-sm dark:border-white/10">
              <input type="hidden" name="key" value="community_guidelines" /><span dir="ltr">community_guidelines (public at /guidelines)</span>
              <textarea name="value" rows={5} maxLength={5000} defaultValue={typeof sv("community_guidelines") === "string" ? (sv("community_guidelines") as string) : ""} className={`${inp} w-full`} /><button className={`${inp} font-semibold`}>Save</button></form>
            <form action={setHashtagExcluded} className="flex flex-wrap items-center gap-2 border-t border-black/10 py-2 text-sm dark:border-white/10">
              <span className="min-w-44">Hide hashtag from trending</span><input name="tag" required placeholder="tag" dir="ltr" className={`${inp} flex-1`} />
              <select name="excluded" className={inp}><option value="true">exclude</option><option value="false">include</option></select><button className={`${inp} font-semibold`}>Apply</button></form>
          </section>
          <section className={`${card} mb-24`} aria-label="Audit log">
            <h2 className="mb-2 font-semibold">Audit log</h2>
            {(audit.data ?? []).map((l: { id: string; action: string; target: string | null; created_at: string }) => (
              <p key={l.id} className="border-t border-black/10 py-1 text-xs dark:border-white/10" dir="ltr">{new Date(l.created_at).toISOString()} · {l.action} · {l.target}</p>))}
          </section>
        </>
      )}
    </div>
  );
}
