"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Signed URLs for the private `media` bucket, created with the viewer's own session (storage RLS decides access).
// Cached per path and de-duplicated across components. A failed lookup is cached only briefly.
const cache = new Map<string, { url: string | null; exp: number }>();
const inflight = new Map<string, Promise<string | null>>();

function load(path: string): Promise<string | null> {
  const hit = cache.get(path);
  if (hit && hit.exp > Date.now()) return Promise.resolve(hit.url);
  let p = inflight.get(path);
  if (!p) {
    p = createClient().storage.from("media").createSignedUrl(path, 3600).then(({ data }) => {
      const url = data?.signedUrl ?? null;
      cache.set(path, { url, exp: Date.now() + (url ? 50 * 60 * 1000 : 60 * 1000) });
      inflight.delete(path);
      return url;
    });
    inflight.set(path, p);
  }
  return p;
}

/** undefined = loading, null = unavailable (no access / failed), string = ready */
export function useSignedUrl(path: string | null | undefined): string | null | undefined {
  const [url, setUrl] = useState<string | null | undefined>(() => {
    const c = path ? cache.get(path) : undefined;
    return c && c.exp > Date.now() ? c.url : undefined;
  });
  useEffect(() => {
    if (!path) { setUrl(null); return; }
    let alive = true;
    load(path).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [path]);
  return url;
}
