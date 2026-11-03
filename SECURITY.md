# Security policy

## Reporting a vulnerability
Please **do not open a public issue** for security problems. Use GitHub's
"Report a vulnerability" (Security tab → Advisories) on this repository, or contact the maintainer privately.
Include steps to reproduce and the affected migration/route if you know it.

## Ground rules for this project
- Only the public **anon** key is used by the app. The `service_role` key must never be added to the app, `.env*` files, CI logs or the repository.
- Authorization lives in Postgres Row Level Security and `SECURITY DEFINER` functions (`supabase/migrations`), not only in the UI. Feature flags are not a security boundary.
- `supabase/seed.sql` creates demo accounts with a known password. Use it **only** on local/throwaway projects, never on production.
- Direct messages are access-controlled but **not end-to-end encrypted**.
- Admin roles beyond `admin` (`super_admin`) are assigned only via SQL by the operator.
