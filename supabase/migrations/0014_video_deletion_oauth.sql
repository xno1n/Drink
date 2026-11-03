-- PULSE pass 15: video uploads, account-deletion request queue, OAuth-friendly signup, media limit 25 MB. Not yet executed.

-- Video support: raise the bucket limit to 25 MB and allow mp4/webm (images are limited to 10 MB in the server action).
update storage.buckets set file_size_limit = 26214400,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'] where id = 'media';

create or replace function set_site_setting(p_key text, p_value jsonb) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if p_key in ('registration_open','maintenance_mode') then
    if jsonb_typeof(p_value) <> 'boolean' then raise exception 'boolean required'; end if;
  elsif p_key = 'post_max_chars' then
    if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric not between 1 and 280 then raise exception 'post_max_chars must be 1..280'; end if;
  elsif p_key = 'post_rate_per_hour' then
    if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric not between 1 and 1000 then raise exception 'post_rate_per_hour must be 1..1000'; end if;
  elsif p_key = 'media_max_mb' then
    if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric not between 1 and 25 then raise exception 'media_max_mb must be 1..25 (bucket limit)'; end if;
  elsif p_key = 'announcement' then
    if p_value <> 'null'::jsonb and (jsonb_typeof(p_value) <> 'object' or char_length(coalesce(p_value->>'text','')) not between 1 and 300) then raise exception 'announcement must be null or {text}'; end if;
  elsif p_key = 'community_guidelines' then
    if jsonb_typeof(p_value) <> 'string' or char_length(p_value #>> '{}') not between 1 and 5000 then raise exception 'guidelines must be 1..5000 chars'; end if;
  elsif p_key in ('feature_flags','for_you_weights') then
    if jsonb_typeof(p_value) <> 'object' then raise exception 'object required'; end if;
  else
    raise exception 'unknown setting';
  end if;
  insert into site_settings (key, value, updated_at) values (p_key, p_value, now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
  perform log_admin('settings.' || p_key, p_key, jsonb_build_object('value', p_value));
end $$;

-- ---------- deletion requests (admin-reviewed alternative to instant self-deletion) ----------
create table deletion_requests (
  user_id uuid primary key references profiles(id) on delete cascade,
  reason text check (char_length(reason) <= 500),
  status text not null default 'open' check (status in ('open','rejected')),
  created_at timestamptz not null default now()
);
alter table deletion_requests enable row level security;
create policy delreq_read on deletion_requests for select using (user_id = auth.uid() or is_staff());
-- inserts/updates only through the functions below

create function request_deletion(p_reason text default null) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  insert into deletion_requests (user_id, reason) values (auth.uid(), left(p_reason, 500))
    on conflict (user_id) do update set status = 'open', reason = excluded.reason, created_at = now();
end $$;

create function resolve_deletion_request(p_user uuid, p_action text, p_reason text) returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason required'; end if;
  if not exists (select 1 from deletion_requests where user_id = p_user and status = 'open') then raise exception 'no open request'; end if;
  if p_action = 'reject' then
    update deletion_requests set status = 'rejected' where user_id = p_user;
    perform log_admin('deletion.reject', p_user::text, jsonb_build_object('reason', p_reason));
  elsif p_action = 'approve' then
    if p_user = auth.uid() then raise exception 'cannot approve your own request here'; end if;
    if (select role from profiles where id = p_user) <> 'user' then raise exception 'staff accounts must be demoted first'; end if;
    perform log_admin('deletion.approve', p_user::text, jsonb_build_object('reason', p_reason));  -- logged before the user row disappears
    delete from auth.users where id = p_user;
  else
    raise exception 'unknown action';
  end if;
exception when foreign_key_violation then
  raise exception 'account has moderation records and cannot be deleted';
end $$;
revoke execute on function request_deletion(text), resolve_deletion_request(uuid, text, text) from anon;

-- ---------- OAuth-friendly signup (providers supply full_name/name, not our username) ----------
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from site_settings where key = 'registration_open' and value = 'false'::jsonb) then
    raise exception 'registration is closed';
  end if;
  insert into profiles (id, username, display_name)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(replace(new.id::text, '-', ''), 1, 10)),
          left(coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'New user'), 50));
  insert into user_settings (user_id) values (new.id);
  return new;
end $$;
