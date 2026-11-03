"use client";
import { useState, useTransition } from "react";
import { followUser, unfollowUser } from "@/app/actions/social";

type S = "none" | "following" | "requested";
export function FollowButton({ target, initial, lang }: { target: string; initial: S; lang: string }) {
  const [s, setS] = useState<S>(initial);
  const [pending, start] = useTransition();
  const fa = lang === "fa";
  const label = s === "following" ? (fa ? "دنبال می‌کنید" : "Following") : s === "requested" ? (fa ? "درخواست ارسال شد" : "Requested") : (fa ? "دنبال کردن" : "Follow");
  return (
    <button disabled={pending} aria-pressed={s !== "none"}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50 ${s === "none" ? "bg-black text-white dark:bg-white dark:text-black" : "glass"}`}
      onClick={() => start(async () => {
        if (s === "none") { const r = await followUser(target); if (r.status) setS(r.status); }
        else { const r = await unfollowUser(target); if (!r.error) setS("none"); }
      })}>{label}</button>
  );
}
