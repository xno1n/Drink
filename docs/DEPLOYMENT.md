# Production deployment

PULSE = Next.js app + Supabase (Postgres, Auth, Storage). Choose how to host Supabase:

**A. Supabase Cloud (simplest).** Create a project, then:
```bash
supabase link --project-ref <ref>
supabase db push                 # applies supabase/migrations/* (do NOT run seed.sql in production)
```
In the dashboard: enable email confirmation, configure SMTP, set the Site URL / redirect URLs to your domain, and confirm the `media` and `dm` buckets (both private) exist after the migrations.

**B. Self-hosted Supabase.** Follow Supabase's official self-hosting Docker guide, then apply the migrations with `psql` in order.

## App
```bash
cp .env.example .env     # set NEXT_PUBLIC_SUPABASE_URL (public https URL) and NEXT_PUBLIC_SUPABASE_ANON_KEY
docker compose up -d --build
```
Put the container behind a TLS-terminating reverse proxy (Caddy/nginx/Traefik). The anon key is public by design; the **service-role key must never be used by or exposed to this app**.

## First administrator
No demo accounts in production. Register normally, then promote once from a trusted SQL session (service role / psql):
```sql
select set_config('pulse.bypass_guard','1',false);
update profiles set role='super_admin' where username='<your-username>';
```

## Checklist
- [ ] Email confirmation + SMTP configured; password reset flow tested
- [ ] Only migrations applied (no seed); demo accounts absent
- [ ] HTTPS everywhere; secure cookies are set by the Supabase SSR client when served over HTTPS
- [ ] Database backups scheduled and a restore rehearsed (docs/BACKUP.md)
- [ ] Rate limits at the proxy (login/signup) in addition to the in-database post/message limits
- [x] `media` bucket is private (migration 0013); confirm in the dashboard that it shows as Private after `db push`
