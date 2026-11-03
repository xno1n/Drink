# Development guide

## Layout
- `supabase/migrations/` — schema, RLS, RPCs (apply in order). `supabase/seed.sql` — dev-only demo data.
- `src/app/` — pages (server components) and `actions/` (server actions). `src/components/` — UI. `src/lib/` — Supabase clients, i18n, helpers.
- `src/middleware.ts` — session validation + route protection. **Authorization lives in RLS and SQL functions**; UI checks are convenience only.
- `tests/` — Vitest. `tests/unit` needs nothing; the rest are integration tests against a local Supabase with the seed loaded.

## Workflow
1. `supabase start` · `supabase db reset` (migrations + seed) · copy URL/anon key into `.env.local` (`supabase status`).
2. `npm run dev`. Demo logins: `alice@demo.local`, `bob@demo.local`, `admin@demo.local` / `demo-password-123`.
3. Schema change: add `supabase/migrations/000N_name.sql` (never edit applied migrations), run `supabase db reset`, add/adjust tests.
4. Before committing: `npm run lint && npm run typecheck && npm test && npm run build`.

## Tests
- `npm run test:unit` — pure helpers.
- `npm test` — everything. Integration tests sign in as seeded users and exercise RLS/RPCs: auth, posts, likes/reposts/bookmarks, follows, private accounts, blocking, notifications, DM access control, reporting/moderation, admin authorization. They mutate the dev database; run `supabase db reset` to return to a clean state.
- Tests were written without being executed in the authoring environment; if one fails, check the test and the migration before assuming either is right.

## Conventions
- Validate every server-action input with Zod; return/redirect with an error code, never throw raw DB errors to the UI.
- New privileged operations go in `security definer` SQL functions that check roles themselves, set `search_path`, and write `admin_audit_log`.
- Use logical CSS (`ms-`, `ps-`, `start`/`end`) so RTL/LTR both work.
