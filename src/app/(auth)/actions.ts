"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

const signupSchema = z.object({
  email: z.string().email(), password: z.string().min(8).max(72),
  username: z.string().regex(/^[a-zA-Z0-9_]{3,20}$/), display_name: z.string().min(1).max(50),
});
export type AuthState = { error?: string } | undefined;

export async function login(_: AuthState, fd: FormData): Promise<AuthState> {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: "invalid_input" };
  const { error } = await (await createClient()).auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") return { error: "email_not_confirmed" };
    if (error.code === "invalid_credentials") return { error: "invalid_credentials" };
    return { error: error.message }; // e.g. network failure ("fetch failed")
  }
  redirect("/");
}

export async function signup(_: AuthState, fd: FormData): Promise<AuthState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: "invalid_input" };
  const { email, password, username, display_name } = parsed.data;
  const supabase = await createClient();
  const { data: taken } = await supabase.from("profiles").select("id").ilike("username", username.replace(/[\\%_]/g, "\\$&")).maybeSingle();
  if (taken) return { error: "username_taken" };
  const origin = (await headers()).get("origin") ?? "";
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username, display_name }, emailRedirectTo: `${origin}/auth/callback?next=/` } });
  if (error) return { error: error.message };
  if (!data.session) redirect("/login?msg=check_email"); // email confirmation is on: no session until the link is opened
  redirect("/");
}

export async function logout() {
  await (await createClient()).auth.signOut();
  redirect("/login");
}

export async function requestReset(_: AuthState, fd: FormData): Promise<AuthState> {
  const email = z.string().email().safeParse(fd.get("email"));
  if (!email.success) return { error: "invalid_input" };
  const origin = (await headers()).get("origin") ?? "";
  await (await createClient()).auth.resetPasswordForEmail(email.data, { redirectTo: `${origin}/auth/callback?next=/reset-password` });
  redirect("/login?msg=reset_sent"); // same response whether or not the account exists
}

export async function updatePassword(_: AuthState, fd: FormData): Promise<AuthState> {
  const p = z.string().min(8).max(72).safeParse(fd.get("password"));
  if (!p.success) return { error: "weak_password" };
  const { error } = await (await createClient()).auth.updateUser({ password: p.data });
  if (error) return { error: "failed" };
  redirect("/?msg=password_updated");
}
