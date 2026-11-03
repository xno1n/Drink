"use client";
import { useState, useTransition } from "react";
import { Flag } from "lucide-react";
import { createReport } from "@/app/actions/moderation";

const CATS: Record<string, { fa: string; en: string }> = {
  spam: { fa: "هرزنامه", en: "Spam" }, harassment: { fa: "آزار", en: "Harassment" }, hate: { fa: "نفرت‌پراکنی", en: "Hate" },
  violence: { fa: "خشونت", en: "Violence" }, sexual: { fa: "محتوای جنسی", en: "Sexual content" }, other: { fa: "سایر", en: "Other" },
};
export function ReportButton({ postId, userId, lang }: { postId?: string; userId?: string; lang: string }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const fa = lang === "fa", l = fa ? "fa" : "en";
  return (
    <span className="relative">
      <button className="flex items-center gap-1 rounded-full p-2 text-sm opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={fa ? "گزارش" : "Report"}><Flag size={16} /></button>
      {open && (
        <form className="glass absolute end-0 z-20 mt-1 w-56 space-y-2 rounded-xl bg-[var(--bg)] p-3 text-sm shadow-lg"
          onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget);
            start(async () => { const r = await createReport({ postId, userId, category: String(f.get("category")), details: String(f.get("details") ?? "") });
              setMsg(r.ok ? (fa ? "گزارش ثبت شد" : "Report sent") : r.error === "already_reported" ? (fa ? "قبلاً گزارش داده‌اید" : "Already reported") : (fa ? "خطا" : "Error")); if (r.ok) setTimeout(() => setOpen(false), 1200); }); }}>
          <select name="category" className="glass w-full rounded-lg bg-transparent p-2" aria-label={fa ? "دسته" : "Category"}>
            {Object.keys(CATS).map((k) => <option key={k} value={k}>{CATS[k][l]}</option>)}
          </select>
          <textarea name="details" maxLength={1000} rows={2} placeholder={fa ? "توضیح (اختیاری)" : "Details (optional)"} className="glass w-full rounded-lg bg-transparent p-2" />
          <button disabled={pending} className="w-full rounded-lg bg-black py-1.5 font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black">{fa ? "ارسال گزارش" : "Submit report"}</button>
          {msg && <p role="status" className="text-xs opacity-80">{msg}</p>}
        </form>
      )}
    </span>
  );
}
