"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
// Fallback for environments without Realtime: refresh server data periodically while the tab is visible.
export function Poller({ seconds = 8 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
