-- PULSE pass 9: admin site settings, registration switch, hashtag exclusion, data export. Not yet executed.

create function set_site_setting(p_key text, p_value jsonb) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if p_key in ('registration_open','maintenance_mode') then
    if jsonb_typeof(p_value) <> 'boolean' then raise exception 'boolean required'; end if;
  elsif p_key = 'post_max_chars' then
    if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric not between 1 and 280 then raise exception 'post_max_chars must be 1..280'; end if;
  elsif p_key = 'post_rate_per_hour' then
    if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric not between 1 and 1000 then raise exception 'post_rate_per_hour must be 1..1000'; end if;
  elsif p_key = 'media_max_mb' then
    if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric not between 1 and 10 then raise exception 'media_max_mb must be 1..10 (bucket limit)'; end if;
  elsif p_key = 'announcement' then
    if p_value <> 'null'::jsonb and (jsonb_typeof(p_value) <> 'object' or char_length(coalesce(p_value->>'text','')) not between 1 and 300) then raise exception 'announcement must be null or {text}'; end if;
  elsif p_key in ('feature_flags','for_you_weights') then
    if jsonb_typeof(p_value) <> 'object' then raise exception 'object required'; end if;
  else
    raise exception 'unknown setting';
  end if;
  insert into site_settings (key, value, updated_at) values (p_key, p_value, now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
  perform log_admin('settings.' || p_key, p_key, jsonb_build_object('value', p_value));
end $$;

create function set_hashtag_excluded(p_tag text, p_excluded boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  insert into hashtags (tag, excluded) values (lower(p_tag), p_excluded) on conflict (tag) do update set excluded = excluded.excluded;
  perform log_admin('hashtag.exclude', lower(p_tag), jsonb_build_object('excluded', p_excluded));
end $$;

-- Registration switch: block new signups when closed (existing users unaffected).
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from site_settings where key = 'registration_open' and value = 'false'::jsonb) then
    raise exception 'registration is closed';
  end if;
  insert into profiles (id, username, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text,1,8)),
                  coalesce(new.raw_user_meta_data->>'display_name', 'New user'));
  insert into user_settings (user_id) values (new.id);
  return new;
end $$;

-- Account data export: the caller's own data only.
create function export_my_data() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'auth required'; end if;
  return jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) - 'role' from profiles p where p.id = me),
    'settings', (select to_jsonb(s) from user_settings s where s.user_id = me),
    'posts', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from (select id, body, reply_to_id, quote_of_id, created_at, edited_at, deleted_at from posts where author_id = me limit 10000) x), '[]'),
    'likes', coalesce((select jsonb_agg(jsonb_build_object('post_id', post_id, 'at', created_at)) from likes where user_id = me), '[]'),
    'reposts', coalesce((select jsonb_agg(jsonb_build_object('post_id', post_id, 'at', created_at)) from reposts where user_id = me), '[]'),
    'bookmarks', coalesce((select jsonb_agg(jsonb_build_object('post_id', post_id, 'at', created_at)) from bookmarks where user_id = me), '[]'),
    'following', coalesce((select jsonb_agg(following_id) from follows where follower_id = me), '[]'),
    'followers', coalesce((select jsonb_agg(follower_id) from follows where following_id = me), '[]'),
    'blocked', coalesce((select jsonb_agg(blocked_id) from blocks where blocker_id = me), '[]'),
    'muted', coalesce((select jsonb_agg(muted_id) from mutes where muter_id = me), '[]'),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('conversation_id', m.conversation_id, 'sender_id', m.sender_id, 'body', m.body, 'at', m.created_at) order by m.created_at)
       from (select * from messages mm where mm.deleted_at is null and exists (select 1 from conversation_participants cp where cp.conversation_id = mm.conversation_id and cp.user_id = me) limit 10000) m), '[]'));
end $$;
revoke execute on function set_site_setting(text, jsonb), set_hashtag_excluded(text, boolean), export_my_data() from anon;
