"use client";
import type { Provider } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// Shows buttons only for providers listed in NEXT_PUBLIC_OAUTH_PROVIDERS (comma-separated, e.g. "google,github").
// Each provider must also be enabled and configured in the Supabase dashboard (Authentication → Providers).
const PROVIDERS = (process.env.NEXT_PUBLIC_OAUTH_PROVIDERS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const LABEL: Record<string, string> = { google: "Google", github: "GitHub", discord: "Discord", twitter: "X / Twitter", apple: "Apple" };

export function OAuthButtons({ lang }: { lang: string }) {
  if (PROVIDERS.length === 0) return null;
  return (
    <div className="space-y-2 border-t border-black/10 pt-3 dark:border-white/10">
      {PROVIDERS.map((p) => (
        <button key={p} type="button" className="glass w-full rounded-xl py-2.5 text-sm"
          onClick={() => createClient().auth.signInWithOAuth({ provider: p as Provider, options: { redirectTo: `${location.origin}/auth/callback?next=/` } })}>
          {lang === "fa" ? `ادامه با ${LABEL[p] ?? p}` : `Continue with ${LABEL[p] ?? p}`}
        </button>))}
    </div>
  );
}
