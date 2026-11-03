# Backup and restore

Two things must be backed up: the **database** and the **storage buckets** (`media`, `dm`). A database dump does not contain the files.

## Database
```bash
# backup (custom format, includes auth + storage metadata when you have a superuser/service connection)
pg_dump "$DATABASE_URL" -Fc -f pulse-$(date +%F).dump

# restore into an EMPTY database
pg_restore --no-owner --clean --if-exists -d "$TARGET_DATABASE_URL" pulse-YYYY-MM-DD.dump
```
Supabase Cloud: use the dashboard's scheduled backups / PITR on paid plans, and additionally `supabase db dump -f schema-and-data.sql` for portable copies.
Local development: `supabase db reset` rebuilds from migrations + seed — no backup needed.

## Storage
Copy bucket contents with any S3-compatible tool against your project's storage S3 endpoint (e.g. rclone or the AWS CLI), and restore by copying back to the same bucket names and paths (`media/<user-id>/…`, `dm/<conversation-id>/…`).
Attachments of deleted DMs stay in `dm` unreferenced; they can be pruned by comparing against `messages.image_path`.

## Rehearse
A backup you have not restored is a guess. Restore into a scratch project, run `npm test` against it (after seeding demo users there), and confirm login, a post, and an image load.
