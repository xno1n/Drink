<div align="center">

# PULSE

**A Persian (RTL) / English (LTR) X-style social network — Next.js 15 + Supabase.**

Posts · For You feed · follows · explore · notifications · direct messages · close friends · admin & moderation

[فارسی](README.fa.md) · [Setup (Supabase Cloud, no Docker)](docs/CLOUD-SETUP.fa.md) · [Development](docs/DEVELOPMENT.md) · [Deployment](docs/DEPLOYMENT.md) · [Backup](docs/BACKUP.md)

![Next.js](https://img.shields.io/badge/Next.js-15-black) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6) ![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20RLS-3ecf8e) ![License](https://img.shields.io/badge/license-MIT-blue)

</div>

> **Status:** early release. The code, SQL and tests were written without a full CI run in the authoring environment. Run the commands in [Verify](#verify) on your machine and treat the first failures as the real to-do list. No test result is claimed in this README.

## Features

- **Auth** – email/password, email confirmation, password reset, optional OAuth providers, server-validated sessions in middleware
- **Posts** – text, up to 4 images (with alt text) or one video (MP4/WebM ≤ 25 MB), replies (two-level threads), quotes, edit with "edited" marker, pin, soft delete, hashtags and @mentions
- **Feeds** – *For You* (transparent score: recency, follows, engagement, author affinity; weights editable in `site_settings.for_you_weights`), *Following*, *Latest*
- **Social graph** – follow / follow requests for protected accounts, block (severs follows), mute, followers/following lists, **close friends** audience
- **Explore** – post and people search, trending hashtags (real 24 h counts), suggested accounts, media discovery
- **Notifications** – persisted, unread badge, per-type preferences enforced in the database, live via Supabase Realtime (polling fallback)
- **Direct messages** – 1:1, read receipts, private image attachments through signed URLs, sender-only deletion, rate limit, block enforcement (not end-to-end encrypted)
- **Profiles & settings** – avatar/cover, privacy, username change, password, deactivate/delete account, data export (JSON), sign out other devices
- **Admin & moderation** – dashboard, report queue with required-reason decisions, user search, role changes (escalation-guarded), suspend/restore, appeals, audit log, deletion-request queue, site settings & announcement banner, editable community guidelines
- **i18n & UI** – Persian/English with RTL/LTR, dark/light theme, glass styling, Framer Motion, reduced-motion support

## Tech stack

| Area | Choice |
|---|---|
| App | Next.js 15 (App Router, Server Components/Actions), React 19, TypeScript (strict) |
| UI | Tailwind CSS, Framer Motion, lucide-react, Vazirmatn |
| Backend | Supabase: Postgres + Row Level Security, `SECURITY DEFINER` RPCs, Auth, Storage, Realtime |
| Validation | Zod |
| Tests | Vitest (unit + integration against a real Supabase project) |

Authorization is enforced in the database (RLS + RPCs), not just in the UI. See [`supabase/migrations`](supabase/migrations) (15 migrations).

## Quick start (Supabase Cloud — no Docker needed)

Requirements: Node.js 20+, a free [Supabase](https://supabase.com) project.

```bash
git clone <your-fork-url> pulse && cd pulse
npm install

cp .env.example .env.local          # Windows: copy .env.example .env.local
# edit .env.local: project URL + anon key (Dashboard → Project Settings → API)

npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push                # applies the 15 migrations

npm run doctor                      # checks env, connection, auth settings, applied migrations
npm run dev                         # http://localhost:3000
```

For local-only testing turn off **Confirm email** in Supabase → Authentication → Providers → Email.
A step-by-step Persian guide is in [`docs/CLOUD-SETUP.fa.md`](docs/CLOUD-SETUP.fa.md).

### Demo accounts (development only)

`supabase/seed.sql` creates `alice@demo.local`, `bob@demo.local` and `admin@demo.local` (password `demo-password-123`). Run it in the SQL Editor of a **throwaway** project only — **never on production**.

### Local Supabase with Docker (optional)

```bash
npx supabase init && npx supabase start && npx supabase db reset   # migrations + seed
```
Use `http://127.0.0.1:54321` and the anon key from `npx supabase status` in `.env.local`.

## Verify

```bash
npm run check:static   # dependency-free sanity check
npm run typecheck
npm run lint
npm run test:unit      # no database needed
npm test               # + integration tests: needs .env.local, migrations applied, seed.sql run on a throwaway project
npm run build
```

## First admin

Roles above `admin` are never assigned from the UI. Promote your first account with SQL (SQL Editor):

```sql
update profiles set role = 'super_admin' where username = 'your_username';
```

## Project layout

```
src/app/            routes, server actions, route group (app) for the shell
src/lib/            supabase clients, i18n, helpers
supabase/migrations numbered SQL: schema, RLS, RPCs, triggers, storage policies
supabase/seed.sql   demo data (development only)
tests/              Vitest unit + integration suites
scripts/            doctor.mjs (diagnostics), check-static.mjs
docs/               setup, development, deployment, backup
```

## Deployment

A production `Dockerfile` and `docker-compose.yml` for the web app are included; Postgres/Auth/Storage run on Supabase (Cloud or self-hosted). See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) and [`docs/BACKUP.md`](docs/BACKUP.md).

## Security

- Only the public **anon** key is used. Never add the `service_role` key to this app, `.env*` files or CI.
- Never commit `.env.local` (already in `.gitignore`).
- Report vulnerabilities privately — see [SECURITY.md](SECURITY.md).

## Known limitations

- Close friends changes the central `posts_read` policy — review `supabase/migrations/0015_close_friends.sql` and run `tests/close-friends.test.ts` before trusting it with real private content. Staff can read close-friends posts (needed for reports).
- DMs are 1:1 only and not end-to-end encrypted; deleting a DM leaves the attachment file in the private `dm` bucket.
- Feature flags only hide UI (currently just `dms_enabled`); they are not a security boundary. Maintenance mode only blocks posting and shows a banner.
- Suspended users cannot post but can still read. Staff can edit `posts` through RLS without a moderation record; the report queue is the audited path.
- Supabase exposes no per-device session list, so only "sign out other devices" is offered.
- Counts use subqueries; add cached counters before scaling. Error messages are not yet fully translated.
- Not implemented: custom lists beyond close friends, video transcoding/thumbnails, Redis / S3-compatible storage (Supabase Postgres + Storage are used instead), per-IP rate limiting at the app layer (use your proxy).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Licensed under the [MIT License](LICENSE).
