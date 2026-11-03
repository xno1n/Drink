"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Re-fetches server data when a Realtime change arrives; a slow poll covers environments where Realtime is unavailable.
export function Live({ table, filter, fallbackSeconds = 30 }: { table: string; filter?: string; fallbackSeconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => { if (timer) return; timer = setTimeout(() => { timer = null; router.refresh(); }, 300); }; // debounce bursts
    const channel = supabase.channel(`live-${table}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table, ...(filter ? { filter } : {}) }, refresh).subscribe();
    const poll = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, fallbackSeconds * 1000);
    return () => { clearInterval(poll); if (timer) clearTimeout(timer); supabase.removeChannel(channel); };
  }, [router, table, filter, fallbackSeconds]);
  return null;
}
