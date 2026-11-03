## What and why

## How I tested
- [ ] `npm run typecheck && npm run lint`
- [ ] `npm run test:unit` (and `npm test` against a throwaway Supabase project if the DB/RLS changed)
- [ ] New/changed SQL is a **new** migration file (existing migrations are not edited)

## Checklist
- [ ] No secrets, keys or real user data committed
- [ ] UI works in both fa (RTL) and en (LTR)
