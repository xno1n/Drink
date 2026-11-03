"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { blockUser, muteUser } from "@/app/actions/moderation";
import { ReportButton } from "@/components/report-button";

export function UserActions({ target, muted: m0, lang }: { target: string; muted: boolean; lang: string }) {
  const [muted, setMuted] = useState(m0);
  const [pending, start] = useTransition();
  const router = useRouter();
  const fa = lang === "fa";
  const cls = "glass rounded-full px-3 py-1.5 text-sm disabled:opacity-50";
  return (
    <div className="flex items-center gap-1">
      <button disabled={pending} className={cls} onClick={() => start(async () => { const r = await muteUser(target, !muted); if (!r.error) setMuted(!muted); })}>{muted ? (fa ? "رفع بی‌صدا" : "Unmute") : (fa ? "بی‌صدا" : "Mute")}</button>
      <button disabled={pending} className={cls} onClick={() => { if (confirm(fa ? "این کاربر بلاک شود؟ دنبال‌کردن دوطرفه قطع می‌شود." : "Block this user? Follows are removed both ways.")) start(async () => { const r = await blockUser(target, true); if (!r.error) router.push("/"); }); }}>{fa ? "بلاک" : "Block"}</button>
      <ReportButton userId={target} lang={lang} />
    </div>
  );
}
