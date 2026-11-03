# Contributing

1. Fork, then `git checkout -b my-change`.
2. Set up a **disposable** Supabase project (see `docs/DEVELOPMENT.md` / `docs/CLOUD-SETUP.fa.md`) and `.env.local`.
3. Make the change. Rules of thumb:
   - Database changes = a **new** numbered file in `supabase/migrations/` (never edit applied ones), with RLS on every new table and a test in `tests/`.
   - `"use server"` files export only async functions.
   - UI strings go through `src/lib/i18n.ts` (fa + en); use logical Tailwind classes (`ms-`, `pe-`, `start-`) so RTL/LTR both work.
   - Never commit `.env*`, keys, or real user data.
4. Run `npm run check:static && npm run typecheck && npm run lint && npm run test:unit` (and `npm test` if you touched SQL/RLS).
5. Open a pull request using the template.
