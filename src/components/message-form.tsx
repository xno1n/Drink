"use client";
import { useActionState, useEffect, useRef } from "react";
import { ImagePlus, Send, Trash2 } from "lucide-react";
import { sendMessage, deleteMessage } from "@/app/actions/messages";

export function MessageForm({ conversationId, lang }: { conversationId: string; lang: string }) {
  const [state, action, pending] = useActionState(sendMessage, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  const fa = lang === "fa";
  return (
    <form ref={ref} action={action} className="glass fixed inset-x-0 bottom-0 mx-auto flex max-w-xl items-center gap-2 rounded-t-2xl p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <input type="hidden" name="conversation_id" value={conversationId} />
      <label className="cursor-pointer rounded-full p-2" aria-label={fa ? "افزودن تصویر" : "Attach image"}><ImagePlus size={20} />
        <input name="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden /></label>
      <input name="body" maxLength={2000} autoComplete="off" placeholder={fa ? "پیام..." : "Message..."} aria-label={fa ? "پیام" : "Message"} className="glass min-w-0 flex-1 rounded-full bg-transparent px-4 py-2" />
      <button disabled={pending} aria-label={fa ? "ارسال" : "Send"} className="rounded-full bg-black p-2.5 text-white disabled:opacity-50 dark:bg-white dark:text-black"><Send size={18} /></button>
      {state?.error && <span role="alert" className="absolute -top-6 start-4 text-xs text-red-500">{state.error}</span>}
    </form>
  );
}

export function DeleteMessage({ id, conversationId, lang }: { id: string; conversationId: string; lang: string }) {
  return (
    <form action={deleteMessage} onSubmit={(e) => { if (!confirm(lang === "fa" ? "این پیام حذف شود؟" : "Delete this message?")) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} /><input type="hidden" name="conversation_id" value={conversationId} />
      <button className="p-1 opacity-50 hover:opacity-100" aria-label={lang === "fa" ? "حذف پیام" : "Delete message"}><Trash2 size={14} /></button>
    </form>
  );
}
