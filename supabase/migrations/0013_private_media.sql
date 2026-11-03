-- PULSE pass 14: make the media bucket private. An object can be read (and signed) only if
--   * it is in the caller's own folder, or
--   * it belongs to a post the caller can see (post_media + posts RLS apply inside this policy), or
--   * it is the avatar/cover of a profile the caller can see (profiles RLS applies).
-- So images of protected accounts' posts are no longer reachable by a guessed/shared direct link.
-- Not yet executed against a database.
update storage.buckets set public = false where id = 'media';

drop policy media_read on storage.objects;
create policy media_read on storage.objects for select to authenticated using (
  bucket_id = 'media' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from post_media pm where pm.storage_path = name)
    or exists (select 1 from profiles pr where pr.avatar_url = name or pr.cover_url = name)));

create index if not exists post_media_path_idx on post_media (storage_path);
create index if not exists profiles_avatar_idx on profiles (avatar_url) where avatar_url is not null;
create index if not exists profiles_cover_idx  on profiles (cover_url)  where cover_url  is not null;
