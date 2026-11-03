"use client";
import { useActionState, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { OAuthButtons } from "@/components/oauth-buttons";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { login, signup } from "@/app/(auth)/actions";
import { t, type Lang } from "@/lib/i18n";

const ERR: Record<string, { fa: string; en: string }> = {
  invalid_input: { fa: "ورودی نامعتبر است (نام کاربری ۳ تا ۲۰ حرف انگلیسی/عدد/_، رمز حداقل ۸ کاراکتر).", en: "Invalid input (username 3–20 letters/digits/_, password min 8)." },
  invalid_credentials: { fa: "ایمیل یا رمز اشتباه است، یا حسابی با این مشخصات وجود ندارد.", en: "Wrong email or password, or no such account." },
  email_not_confirmed: { fa: "ایمیل هنوز تأیید نشده است. لینک ایمیل را باز کنید.", en: "Email not confirmed yet. Open the link we emailed you." },
  username_taken: { fa: "این نام کاربری قبلاً گرفته شده است.", en: "That username is taken." },
};
export function AuthForm({ mode, lang }: { mode: "login" | "signup"; lang: Lang }) {
  const L = t(lang);
  const msg = useSearchParams().get("msg");
  const notice = msg === "check_email" ? (lang === "fa" ? "ایمیل تأیید ارسال شد. لینک آن را باز کنید." : "Check your email to confirm your account.") : msg === "reset_sent" ? (lang === "fa" ? "اگر حسابی با این ایمیل باشد، لینک بازیابی ارسال شد." : "If an account exists, a reset link was sent.") : null;
  const [uname, setUname] = useState("");
  const [avail, setAvail] = useState<boolean | null>(null);
  useEffect(() => {
    if (mode !== "signup" || !/^[a-zA-Z0-9_]{3,20}$/.test(uname)) { setAvail(null); return; }
    const t = setTimeout(async () => { const { data } = await createClient().rpc("username_available", { p_username: uname }); setAvail(typeof data === "boolean" ? data : null); }, 400);
    return () => clearTimeout(t);
  }, [uname, mode]);
  const [state, action, pending] = useActionState(mode === "login" ? login : signup, undefined);
  const input = "glass w-full rounded-xl px-4 py-3 bg-transparent";
  return (
    <main className="min-h-dvh grid place-items-center p-4">
      <form action={action} className="glass w-full max-w-sm rounded-3xl p-6 space-y-3">
        <h1 className="text-2xl font-bold mb-2">{L.brand}</h1>
        {mode === "signup" && (<>
          <input name="display_name" placeholder={L.displayName} required className={input} />
          <input name="username" placeholder={L.username} required pattern="[a-zA-Z0-9_]{3,20}" dir="ltr" className={input} value={uname} onChange={(e) => setUname(e.target.value)} />
          {avail !== null && <p role="status" className={`text-xs ${avail ? "text-emerald-500" : "text-red-500"}`}>{avail ? (lang === "fa" ? "در دسترس است" : "Available") : (lang === "fa" ? "قبلاً گرفته شده" : "Already taken")}</p>}
        </>)}
        <input name="email" type="email" placeholder={L.email} required dir="ltr" className={input} />
        <input name="password" type="password" placeholder={L.password} required minLength={mode === "signup" ? 8 : 1} dir="ltr" className={input} />
        {notice && <p role="status" className="text-sm text-emerald-500">{notice}</p>}
        {state?.error && <p role="alert" className="text-sm text-red-500">{ERR[state.error]?.[lang] ?? state.error}</p>}
        {mode === "signup" && <p className="text-xs opacity-70">{lang === "fa" ? "با ثبت‌نام، " : "By signing up you accept the "}<Link className="underline" href="/guidelines">{lang === "fa" ? "قوانین جامعه" : "community guidelines"}</Link>{lang === "fa" ? " را می‌پذیرید." : "."}</p>}
        <button disabled={pending} className="w-full rounded-xl bg-black text-white dark:bg-white dark:text-black py-3 font-semibold disabled:opacity-50">
          {mode === "login" ? L.login : L.signup}
        </button>
        <OAuthButtons lang={lang} />
        {mode === "login" && <Link className="block text-sm underline opacity-70" href="/forgot-password">{lang === "fa" ? "رمز را فراموش کرده‌اید؟" : "Forgot password?"}</Link>}
        <p className="text-sm opacity-70">
          {mode === "login" ? L.noAccount : L.haveAccount}{" "}
          <Link className="underline" href={mode === "login" ? "/signup" : "/login"}>{mode === "login" ? L.signup : L.login}</Link>
        </p>
      </form>
    </main>
  );
}
