// Quick diagnostic: node scripts/doctor.mjs   (or: npm run doctor)
// Checks .env.local, reachability of your Supabase project, whether tables/functions from the migrations exist,
// and the auth settings. It only sends anonymous, side-effect-free requests. Paste its output when asking for help.
import { readFileSync, existsSync } from "node:fs";

const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { console.log(`  ✗ ${m}`); failures++; };
const warn = (m) => console.log(`  ! ${m}`);
let failures = 0;

console.log("\nPULSE doctor\n");
console.log("1) Environment");
if (!existsSync(".env.local")) { bad(".env.local not found. Run this from the project folder and create it: copy .env.example .env.local"); process.exit(1); }
const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const url = (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
if (!url) bad("NEXT_PUBLIC_SUPABASE_URL is empty");
else if (/xxxx|your-project|replace/i.test(url)) bad(`URL looks like a placeholder: ${url}`);
else if (!/^https?:\/\/[^\s/]+$/.test(url)) bad(`URL has an unexpected shape (no path, no spaces): ${url}`);
else ok(`URL: ${url}`);
if (!key) bad("NEXT_PUBLIC_SUPABASE_ANON_KEY is empty");
else if (/replace/i.test(key)) bad("Anon key is still the placeholder from .env.example");
else {
  try {
    const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString());
    if (payload.role === "service_role") bad("This is the SERVICE ROLE key. Never use it here — use the anon (public) key.");
    else if (payload.role === "anon") ok("Anon key looks valid");
    else warn(`Key role is "${payload.role}" (expected "anon")`);
  } catch { warn("Key is not a standard JWT (new-style publishable keys are fine if you copied them from the dashboard)"); }
}
if (failures) { console.log(`\n${failures} problem(s) in .env.local — fix them first.\n`); process.exit(1); }

const h = { apikey: key, Authorization: `Bearer ${key}` };
async function call(path, init) {
  try { const r = await fetch(url + path, { ...init, headers: { ...h, "Content-Type": "application/json", ...(init?.headers || {}) }, signal: AbortSignal.timeout(10000) }); let body = null; try { body = await r.json(); } catch {} return { status: r.status, body }; }
  catch (e) { return { error: e.cause?.code || e.message }; }
}

console.log("\n2) Reaching Supabase");
const health = await call("/auth/v1/health");
if (health.error) { bad(`Cannot reach ${url} (${health.error}). Local: is Docker/\`supabase start\` running? Cloud: check internet/VPN and that the URL is exact.`); process.exit(1); }
health.status === 200 ? ok("Auth service reachable") : bad(`Auth health returned HTTP ${health.status} (check the anon key)`);

console.log("\n3) Auth settings");
const st = await call("/auth/v1/settings");
if (st.body && typeof st.body === "object") {
  st.body.mailer_autoconfirm ? ok("Email confirmation is OFF (sign-up logs in immediately)") : warn("Email confirmation is ON: new users must click the emailed link before they can log in (turn off in Dashboard → Authentication → Providers → Email while testing)");
  st.body.disable_signup ? warn("Sign-ups are disabled in Supabase settings") : ok("Sign-ups enabled");
} else warn("Could not read auth settings");

console.log("\n4) Database tables");
const prof = await call("/rest/v1/profiles?select=id&limit=1");
if (prof.status === 200) ok("Table `profiles` exists");
else { bad(`Table \`profiles\` not found (HTTP ${prof.status}${prof.body?.code ? ", " + prof.body.code : ""}). Run: npx supabase link --project-ref <ref>  then  npx supabase db push`); }

console.log("\n5) Migrations (probing functions; HTTP 404 / PGRST202 = missing)");
const probes = [
  ["0002 posts engine", "toggle_like", { p_post: "00000000-0000-0000-0000-000000000000" }],
  ["0003 discovery", "trending_hashtags", { p_hours: 1, p_limit: 1 }],
  ["0004 moderation/admin", "admin_overview", { p_days: 1 }],
  ["0005 messaging", "my_conversations", {}],
  ["0006 feeds/profiles", "for_you_feed", {}],
  ["0007 settings/export", "export_my_data", {}],
  ["0008 realtime/deletion", "delete_my_account", { p_confirm: "x" }],
  ["0009 RLS recursion fix", "is_conversation_member", { cid: "00000000-0000-0000-0000-000000000000" }],
  ["0011 notif prefs/activity", "admin_daily_activity", {}],
  ["0012 guidelines/username", "username_available", { p_username: "doctor_check" }],
  ["0014 video/deletion/OAuth", "request_deletion", { p_reason: "doctor" }],
  ["0015 close friends", "can_see_cf", { p_owner: "00000000-0000-0000-0000-000000000000" }],
];
let last = "none";
for (const [label, fn, args] of probes) {
  const r = await call(`/rest/v1/rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
  const missing = r.status === 404 || r.body?.code === "PGRST202";
  if (missing) bad(`${label}: function ${fn} not found`); else { ok(label); last = label; }
}
console.log(`\nLast migration detected: ${last}. If something above is missing: npx supabase db push`);
console.log(failures ? `\n${failures} problem(s) found.\n` : "\nAll checks passed. Next: npm run typecheck && npm run dev\n");
process.exit(failures ? 1 : 0);
