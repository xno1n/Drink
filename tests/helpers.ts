import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const PASSWORD = "demo-password-123"; // seed.sql demo accounts (development only)
export const DEMO = { alice: "alice@demo.local", bob: "bob@demo.local", admin: "admin@demo.local" } as const;
export type Session = { c: SupabaseClient; id: string };

export const anon = (): SupabaseClient => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
export async function signIn(email: string): Promise<Session> {
  const c = anon();
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.user) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return { c, id: data.user.id };
}
export const uniq = (label: string) => `[TEST] ${label} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
export async function newPost(s: Session, label = "post") {
  const { data, error } = await s.c.from("posts").insert({ author_id: s.id, body: uniq(label) }).select("id, body").single();
  if (error || !data) throw new Error(`newPost failed: ${error?.message}`);
  return data as { id: string; body: string };
}
