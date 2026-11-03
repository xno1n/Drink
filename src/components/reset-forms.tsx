"use client";
import { useActionState } from "react";
import { requestReset, updatePassword } from "@/app/(auth)/actions";

export function EmailOrPasswordForm({ mode, lang }: { mode: "forgot" | "reset"; lang: string }) {
  const [state, action, pending] = useActionState(mode === "forgot" ? requestReset : updatePassword, undefined);
  const fa = lang === "fa";
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <form action={action} className="glass w-full max-w-sm space-y-3 rounded-3xl p-6">
        <h1 className="text-xl font-bold">{mode === "forgot" ? (fa ? "بازیابی رمز عبور" : "Reset password") : (fa ? "رمز عبور جدید" : "New password")}</h1>
        {mode === "forgot"
          ? <input name="email" type="email" required dir="ltr" placeholder={fa ? "ایمیل" : "Email"} className="glass w-full rounded-xl bg-transparent px-4 py-3" />
          : <input name="password" type="password" required minLength={8} maxLength={72} dir="ltr" autoComplete="new-password" placeholder={fa ? "رمز جدید (حداقل ۸ کاراکتر)" : "New password (min 8)"} className="glass w-full rounded-xl bg-transparent px-4 py-3" />}
        {state?.error && <p role="alert" className="text-sm text-red-500">{state.error}</p>}
        <button disabled={pending} className="w-full rounded-xl bg-black py-3 font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black">{fa ? "ادامه" : "Continue"}</button>
      </form>
    </main>
  );
}
