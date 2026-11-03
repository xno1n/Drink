import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFlags } from "@/lib/flags";
import { z } from "zod";
import { getContext } from "@/lib/viewer";
import { AppHeader } from "@/components/app-header";
import { Live } from "@/components/live";
import { MessageForm, DeleteMessage } from "@/components/message-form";

type Msg = { id: string; sender_id: string; body: string | null; image_path: string | null; deleted_at: string | null; created_at: string };
export default async function Thread({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { supabase, user, me, lang, theme } = await getContext();
  if ((await getFlags(supabase)).dms_enabled === false) redirect("/");
  const fa = lang === "fa";
  // Membership is enforced by RLS: a non-member gets no row, which looks identical to a missing conversation.
  const { data: parts } = await supabase.from("conversation_participants").select("user_id, last_read_at").eq("conversation_id", id);
  const other = (parts ?? []).find((p) => p.user_id !== user.id);
  if (!parts || !parts.some((p) => p.user_id === user.id) || !other) notFound();
  const { data: convs } = await supabase.rpc("my_conversations", { p_q: null });
  const peer = ((convs ?? []) as { conversation_id: string; other_username: string; other_display_name: string }[]).find((c) => c.conversation_id === id);

  const { data } = await supabase.from("messages").select("id, sender_id, body, image_path, deleted_at, created_at").eq("conversation_id", id).order("created_at", { ascending: false }).limit(60);
  const msgs = ((data ?? []) as Msg[]).reverse();
  const paths = msgs.map((m) => m.image_path).filter(Boolean) as string[];
  const signed = paths.length ? (await supabase.storage.from("dm").createSignedUrls(paths, 3600)).data ?? [] : [];
  const urlOf = new Map<string, string>();
  for (const s of signed) if (s.path && s.signedUrl) urlOf.set(s.path, s.signedUrl);
  const imgSrc = (p: string | null | undefined): string | undefined => (p ? urlOf.get(p) : undefined);
  await supabase.from("conversation_participants").update({ last_read_at: new Date().toISOString() }).eq("conversation_id", id).eq("user_id", user.id);

  return (
    <div className="mx-auto max-w-xl px-3">
      <AppHeader lang={lang} theme={theme} username={me?.username} />
      <Live table="messages" filter={`conversation_id=eq.${id}`} fallbackSeconds={20} />
      <p className="mb-3 flex items-center gap-2"><Link href="/messages" aria-label={fa ? "بازگشت" : "Back"} className="glass rounded-full px-2.5 py-1 text-sm">{fa ? "→" : "←"}</Link>
        <b>{peer?.other_display_name ?? "—"}</b> <span dir="ltr" className="opacity-60">@{peer?.other_username}</span></p>
      <section className="space-y-2 pb-28" aria-label={fa ? "گفتگو" : "Conversation"}>
        {msgs.length === 0 && <p className="py-16 text-center opacity-60">{fa ? "اولین پیام را بفرستید." : "Send the first message."}</p>}
        {msgs.map((m) => {
          const mine = m.sender_id === user.id;
          const seen = mine && new Date(m.created_at) <= new Date(other.last_read_at);
          return (
            <div key={m.id} className={`flex items-end gap-1 ${mine ? "flex-row-reverse" : ""}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${mine ? "bg-sky-500 text-white" : "glass"}`}>
                {m.deleted_at ? <i className="text-sm opacity-70">{fa ? "پیام حذف شد" : "Message deleted"}</i> : (<>
                  {imgSrc(m.image_path) && /* eslint-disable-next-line @next/next/no-img-element */ <img src={imgSrc(m.image_path)} alt={fa ? "تصویر پیوست" : "Attachment"} loading="lazy" className="mb-1 max-h-72 rounded-lg" />}
                  {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}</>)}
                <p className="mt-0.5 text-[10px] opacity-70"><time dateTime={m.created_at}>{new Date(m.created_at).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" })}</time>{mine && !m.deleted_at ? (seen ? " ✓✓" : " ✓") : ""}</p>
              </div>
              {mine && !m.deleted_at && <DeleteMessage id={m.id} conversationId={id} lang={lang} />}
            </div>);
        })}
      </section>
      <MessageForm conversationId={id} lang={lang} />
    </div>
  );
}
