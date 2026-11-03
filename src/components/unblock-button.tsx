"use client";
import { useState, useTransition } from "react";
import { blockUser, muteUser } from "@/app/actions/moderation";

export function UnblockButton({ target, kind, lang }: { target: string; kind: "block" | "mute"; lang: string }) {
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const fa = lang === "fa";
  if (done) return <span className="text-sm opacity-60">✓</span>;
  return <button disabled={pending} className="glass rounded-full px-3 py-1 text-sm disabled:opacity-50"
    onClick={() => start(async () => { const r = await (kind === "block" ? blockUser : muteUser)(target, false); if (!r.error) setDone(true); })}>
    {kind === "block" ? (fa ? "رفع بلاک" : "Unblock") : (fa ? "رفع بی‌صدا" : "Unmute")}</button>;
}
