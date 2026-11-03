"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { createPost } from "@/app/actions/posts";
import { ImagePlus } from "lucide-react";

export function Composer({ lang, replyTo, quoteOf }: { lang: string; replyTo?: string; quoteOf?: string }) {
  const [state, action, pending] = useActionState(createPost, undefined);
  const [len, setLen] = useState(0);
  const [files, setFiles] = useState<string[]>([]);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) { ref.current?.reset(); setLen(0); setFiles([]); } }, [state]);
  const fa = lang === "fa";
  return (
    <form ref={ref} action={action} className="glass rounded-2xl p-4 mb-3">
      {replyTo && <input type="hidden" name="reply_to_id" value={replyTo} />}
      {quoteOf && <input type="hidden" name="quote_of_id" value={quoteOf} />}
      <textarea name="body" maxLength={280} onChange={(e) => setLen(e.target.value.length)} rows={3}
        placeholder={fa ? "چه خبر؟" : "What's happening?"} aria-label={fa ? "متن پست" : "Post text"}
        className="w-full resize-none bg-transparent outline-none" />
      {files.map((n, i) => /\.(mp4|webm)$/i.test(n) ? null : <input key={i} name={`alt_${i}`} maxLength={420} placeholder={`${fa ? "متن جایگزین تصویر" : "Image alt text"}: ${n}`} className="glass mt-2 w-full rounded-lg bg-transparent px-3 py-1 text-sm" />)}
      <div className="flex items-center gap-3 mt-2">
        <label className="cursor-pointer rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10" aria-label={fa ? "افزودن تصویر" : "Add image"}>
          <ImagePlus size={20} />
          <input name="images" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" multiple hidden onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 4).map((f) => f.name))} />
        </label>
        <label className="flex items-center gap-1 text-xs opacity-80"><input type="checkbox" name="audience" value="close_friends" />{fa ? "فقط دوستان نزدیک" : "Close friends only"}</label>
        <span className={`text-sm ${len > 260 ? "text-red-500" : "opacity-60"}`}>{280 - len}</span>
        {state?.error && <span role="alert" className="text-sm text-red-500">{state.error}</span>}
        <button disabled={pending} className="ms-auto rounded-full bg-black px-5 py-2 font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black">
          {fa ? "ارسال" : "Post"}
        </button>
      </div>
    </form>
  );
}
