import { cookies } from "next/headers";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

// Public page (listed in middleware OPEN) so it can be linked from the signup form.
export default async function Guidelines() {
  const lang = (await cookies()).get("lang")?.value === "en" ? "en" : "fa";
  const { data } = await (await createClient()).from("site_settings").select("value").eq("key", "community_guidelines").maybeSingle();
  const text = typeof data?.value === "string" ? data.value : "";
  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-bold">{lang === "fa" ? "قوانین جامعه" : "Community guidelines"}</h1>
      <div className="glass whitespace-pre-wrap break-words rounded-2xl p-4 leading-8">{text || (lang === "fa" ? "هنوز متنی ثبت نشده است." : "No guidelines published yet.")}</div>
      <p className="mt-4"><Link href="/" className="underline">{lang === "fa" ? "بازگشت" : "Back"}</Link></p>
    </main>
  );
}
