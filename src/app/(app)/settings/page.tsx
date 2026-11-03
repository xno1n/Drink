import { getContext } from "@/lib/viewer";
import { AppHeader } from "@/components/app-header";
import { UnblockButton } from "@/components/unblock-button";
import { updateProfile, updateImages, requestDeletion, addCloseFriend, removeCloseFriend, updateNotificationPrefs, updatePrivacy, changePassword, deactivateAccount, deleteAccount, signOutOtherDevices } from "@/app/actions/settings";
import { submitAppeal } from "@/app/actions/moderation";

type Person = { id: string; username: string; display_name: string };
export default async function Settings({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  const sp = await searchParams;
  const { supabase, user, me, lang, theme } = await getContext();
  const fa = lang === "fa";
  const [{ data: prof }, { data: st }, { data: blocked }, { data: mutedRows }, { data: actions }, { data: appeals }] = await Promise.all([
    supabase.from("profiles").select("username, display_name, bio, location, website, is_protected, suspended_until, suspended_reason").eq("id", user.id).single(),
    supabase.from("user_settings").select("likes_public, notify").eq("user_id", user.id).single(),
    supabase.rpc("my_blocked_users"),
    supabase.from("mutes").select("muted:profiles!mutes_muted_id_fkey(id, username, display_name)").eq("muter_id", user.id),
    supabase.from("moderation_actions").select("id, action, reason, created_at").eq("target_user_id", user.id).in("action", ["suspend", "remove_post"]).order("created_at", { ascending: false }).limit(10),
    supabase.from("appeals").select("action_id, status").eq("user_id", user.id),
  ]);
  const { data: cfRows } = await supabase.from("close_friends").select("friend:profiles!close_friends_friend_id_fkey(id, username, display_name)").eq("owner_id", user.id);
  const closeFriends = ((cfRows ?? []) as unknown as { friend: Person | null }[]).map((r) => r.friend).filter(Boolean) as Person[];
  const muted = ((mutedRows ?? []) as unknown as { muted: Person | null }[]).map((r) => r.muted).filter(Boolean) as Person[];
  const appealed = new Map((appeals ?? []).map((a) => [a.action_id, a.status]));
  const card = "glass mb-3 space-y-3 rounded-2xl p-4";
  const inp = "glass w-full rounded-xl bg-transparent px-3 py-2";
  const btn = "rounded-full bg-black px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-black";
  return (
    <div className="mx-auto max-w-xl px-3">
      <AppHeader lang={lang} theme={theme} username={me?.username} />
      <h1 className="mb-3 text-lg font-bold">{fa ? "تنظیمات" : "Settings"}</h1>
      {sp.err && <p role="alert" className="mb-3 rounded-xl border border-red-500/40 p-3 text-sm text-red-500">{sp.err}</p>}
      {sp.ok && <p role="status" className="mb-3 rounded-xl border border-emerald-500/40 p-3 text-sm text-emerald-500">{sp.ok}</p>}

      {prof?.suspended_until && new Date(prof.suspended_until) > new Date() && (
        <section className={card}><h2 className="font-semibold text-red-500">{fa ? "حساب شما تعلیق شده است" : "Your account is suspended"}</h2>
          <p className="text-sm">{prof.suspended_reason}</p><p className="text-sm opacity-70">{new Date(prof.suspended_until).toLocaleString(lang)}</p></section>
      )}

      <form action={updateImages} className={card}>
        <h2 className="font-semibold">{fa ? "تصویر پروفایل و کاور" : "Profile photo & cover"}</h2>
        <label className="block text-sm">{fa ? "آواتار (JPG/PNG/WebP، حداکثر ۵ مگابایت)" : "Avatar (JPG/PNG/WebP, max 5 MB)"}
          <input name="avatar" type="file" accept="image/jpeg,image/png,image/webp" className="mt-1 block w-full text-sm" /></label>
        <label className="block text-sm">{fa ? "تصویر کاور" : "Cover image"}
          <input name="cover" type="file" accept="image/jpeg,image/png,image/webp" className="mt-1 block w-full text-sm" /></label>
        <button className={btn}>{fa ? "آپلود" : "Upload"}</button>
      </form>

      <form action={updateProfile} className={card}>
        <h2 className="font-semibold">{fa ? "پروفایل" : "Profile"}</h2>
        <input name="username" defaultValue={prof?.username} required pattern="[a-zA-Z0-9_]{3,20}" dir="ltr" className={inp} aria-label={fa ? "نام کاربری" : "Username"} />
        <input name="display_name" defaultValue={prof?.display_name} required maxLength={50} className={inp} aria-label={fa ? "نام نمایشی" : "Display name"} />
        <textarea name="bio" defaultValue={prof?.bio ?? ""} maxLength={160} rows={3} className={inp} aria-label="Bio" />
        <input name="location" defaultValue={prof?.location ?? ""} maxLength={60} className={inp} aria-label={fa ? "مکان" : "Location"} />
        <input name="website" defaultValue={prof?.website ?? ""} maxLength={200} dir="ltr" placeholder="https://" className={inp} aria-label="Website" />
        <button className={btn}>{fa ? "ذخیره" : "Save"}</button>
      </form>

      <form action={updatePrivacy} className={card}>
        <h2 className="font-semibold">{fa ? "حریم خصوصی" : "Privacy"}</h2>
        <label className="flex items-center gap-2"><input type="checkbox" name="is_protected" defaultChecked={prof?.is_protected} /> {fa ? "حساب خصوصی (درخواست دنبال‌کردن)" : "Protected account (follow requests)"}</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="likes_public" defaultChecked={st?.likes_public} /> {fa ? "نمایش عمومی پسندها" : "Show my likes publicly"}</label>
        <button className={btn}>{fa ? "ذخیره" : "Save"}</button>
      </form>

      <section className={card}>
        <h2 className="font-semibold">{fa ? "دوستان نزدیک" : "Close friends"}</h2>
        <p className="text-sm opacity-70">{fa ? "پست‌های «فقط دوستان نزدیک» را فقط خودتان و افراد این فهرست می‌بینند. فهرست خصوصی است و به افراد اطلاع داده نمی‌شود." : "“Close friends only” posts are visible to you and the people on this list. The list is private; people aren't notified."}</p>
        {closeFriends.length === 0 && <p className="text-sm opacity-60">—</p>}
        {closeFriends.map((u) => (
          <form key={u.id} action={removeCloseFriend} className="flex items-center justify-between"><input type="hidden" name="friend" value={u.id} />
            <span><b>{u.display_name}</b> <span dir="ltr" className="opacity-60">@{u.username}</span></span><button className="glass rounded-full px-3 py-1 text-sm">{fa ? "حذف" : "Remove"}</button></form>))}
        <form action={addCloseFriend} className="flex gap-2"><input name="username" required placeholder={fa ? "نام کاربری" : "username"} dir="ltr" className={inp} aria-label="username" /><button className={btn}>{fa ? "افزودن" : "Add"}</button></form>
      </section>

      <form action={updateNotificationPrefs} className={card}>
        <h2 className="font-semibold">{fa ? "اعلان‌ها" : "Notifications"}</h2>
        {([["follow", "دنبال‌کردن و درخواست‌ها", "Follows & requests"], ["like", "پسندیدن", "Likes"], ["reply", "پاسخ‌ها", "Replies"], ["repost", "بازنشر", "Reposts"], ["mention", "منشن", "Mentions"], ["quote", "نقل‌قول", "Quotes"], ["message", "پیام‌ها", "Messages"]] as const).map(([k, f, e]) => (
          <label key={k} className="flex items-center gap-2"><input type="checkbox" name={k} defaultChecked={(st?.notify as Record<string, boolean> | null)?.[k] !== false} /> {fa ? f : e}</label>))}
        <button className={btn}>{fa ? "ذخیره" : "Save"}</button>
      </form>

      <form action={changePassword} className={card}>
        <h2 className="font-semibold">{fa ? "تغییر رمز عبور" : "Change password"}</h2>
        <input name="password" type="password" minLength={8} maxLength={72} required dir="ltr" autoComplete="new-password" className={inp} aria-label="New password" />
        <button className={btn}>{fa ? "تغییر" : "Change"}</button>
      </form>

      <section className={card}>
        <h2 className="font-semibold">{fa ? "بلاک‌شده‌ها" : "Blocked"}</h2>
        {(blocked ?? []).length === 0 ? <p className="text-sm opacity-60">—</p> : (blocked as Person[]).map((u) => (
          <div key={u.id} className="flex items-center justify-between"><span><b>{u.display_name}</b> <span dir="ltr" className="opacity-60">@{u.username}</span></span><UnblockButton target={u.id} kind="block" lang={lang} /></div>))}
        <h2 className="pt-2 font-semibold">{fa ? "بی‌صداها" : "Muted"}</h2>
        {muted.length === 0 ? <p className="text-sm opacity-60">—</p> : muted.map((u) => (
          <div key={u.id} className="flex items-center justify-between"><span><b>{u.display_name}</b> <span dir="ltr" className="opacity-60">@{u.username}</span></span><UnblockButton target={u.id} kind="mute" lang={lang} /></div>))}
      </section>

      {(actions ?? []).length > 0 && (
        <section className={card}>
          <h2 className="font-semibold">{fa ? "اقدامات نظارتی و اعتراض" : "Moderation actions & appeals"}</h2>
          {actions!.map((a) => (
            <div key={a.id} className="space-y-2 border-t border-black/10 pt-2 dark:border-white/10">
              <p className="text-sm"><b>{a.action}</b> — {a.reason} <span className="opacity-60">({new Date(a.created_at).toLocaleDateString(lang)})</span></p>
              {appealed.has(a.id) ? <p className="text-sm opacity-70">{fa ? "اعتراض ثبت شده: " : "Appeal: "}{appealed.get(a.id)}</p> : (
                <form action={submitAppeal} className="flex gap-2"><input type="hidden" name="action_id" value={a.id} />
                  <input name="message" required minLength={3} maxLength={1000} placeholder={fa ? "دلیل اعتراض" : "Why should this be reviewed?"} className={inp} />
                  <button className={btn}>{fa ? "اعتراض" : "Appeal"}</button></form>)}
            </div>))}
        </section>
      )}

      <form action={signOutOtherDevices} className={card}>
        <h2 className="font-semibold">{fa ? "نشست‌های فعال" : "Active sessions"}</h2>
        <p className="text-sm opacity-70">{fa ? "فهرست دستگاه‌ها در دسترس نیست، ولی می‌توانید از همه‌ی دستگاه‌های دیگر خارج شوید." : "A device list isn't available, but you can sign out of every other device."}</p>
        <button className={btn}>{fa ? "خروج از دستگاه‌های دیگر" : "Sign out other devices"}</button>
      </form>

      <p className="mb-3 text-sm"><a href="/guidelines" className="underline">{fa ? "قوانین جامعه" : "Community guidelines"}</a></p>

      <section className={card}>
        <h2 className="font-semibold">{fa ? "دریافت داده‌های من" : "Export my data"}</h2>
        <p className="text-sm opacity-70">{fa ? "پست‌ها، پسندها، نشانه‌ها، روابط و پیام‌های شما در یک فایل JSON." : "Your posts, likes, bookmarks, relationships and messages as one JSON file."}</p>
        <a href="/settings/export" className={`${btn} inline-block`}>{fa ? "دانلود" : "Download"}</a>
      </section>

      <form action={deactivateAccount} className={`${card} border-red-500/40`}>
        <h2 className="font-semibold text-red-500">{fa ? "غیرفعال‌سازی حساب" : "Deactivate account"}</h2>
        <p className="text-sm opacity-70">{fa ? "برای تأیید DEACTIVATE را تایپ کنید. پروفایل شما پنهان می‌شود." : "Type DEACTIVATE to confirm. Your profile will be hidden."}</p>
        <input name="confirm" dir="ltr" className={inp} aria-label="confirm" />
        <button className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white">{fa ? "غیرفعال کن" : "Deactivate"}</button>
      </form>
      <form action={requestDeletion} className={card}>
        <h2 className="font-semibold">{fa ? "درخواست حذف حساب (با بررسی ادمین)" : "Request account deletion (admin-reviewed)"}</h2>
        <input name="reason" maxLength={500} placeholder={fa ? "دلیل (اختیاری)" : "Reason (optional)"} className={inp} />
        <button className={btn}>{fa ? "ارسال درخواست" : "Send request"}</button>
      </form>

      <form action={deleteAccount} className={`${card} border-red-500/40`}>
        <h2 className="font-semibold text-red-500">{fa ? "حذف دائمی حساب" : "Delete account permanently"}</h2>
        <p className="text-sm opacity-70">{fa ? "پست‌ها، پسندها، دنبال‌کردن‌ها و پیام‌های شما پاک می‌شود و برگشت‌پذیر نیست. برای تأیید DELETE را تایپ کنید." : "Your posts, likes, follows and messages are erased and this cannot be undone. Type DELETE to confirm."}</p>
        <input name="confirm" dir="ltr" className={inp} aria-label="confirm delete" />
        <button className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white">{fa ? "حذف دائمی" : "Delete permanently"}</button>
      </form>
      <div className="pb-24" />
    </div>
  );
}
