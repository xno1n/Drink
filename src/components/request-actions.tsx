"use client";
import { useState, useTransition } from "react";
import { acceptRequest, rejectRequest } from "@/app/actions/notifications";

export function RequestActions({ requester, lang }: { requester: string; lang: string }) {
  const [done, setDone] = useState<null | "accepted" | "rejected">(null);
  const [pending, start] = useTransition();
  const fa = lang === "fa";
  if (done) return <span className="text-sm opacity-60">{done === "accepted" ? (fa ? "پذیرفته شد" : "Accepted") : (fa ? "رد شد" : "Rejected")}</span>;
  return (
    <div className="flex gap-2">
      <button disabled={pending} onClick={() => start(async () => { const r = await acceptRequest(requester); if (!r.error) setDone("accepted"); })}
        className="rounded-full bg-black px-3 py-1 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black">{fa ? "پذیرفتن" : "Accept"}</button>
      <button disabled={pending} onClick={() => start(async () => { const r = await rejectRequest(requester); if (!r.error) setDone("rejected"); })}
        className="glass rounded-full px-3 py-1 text-sm disabled:opacity-50">{fa ? "رد" : "Reject"}</button>
    </div>
  );
}
