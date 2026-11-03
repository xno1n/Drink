-- PULSE pass 11: avatar/cover images are storage paths inside the media bucket ("<user-uuid>/<file>"), never arbitrary URLs.
-- Not yet executed against a database.
alter table profiles add constraint avatar_path_check check (avatar_url is null or avatar_url ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+$');
alter table profiles add constraint cover_path_check  check (cover_url  is null or cover_url  ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+$');
