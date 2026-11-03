-- PULSE pass 13: community guidelines, per-user moderation history, username availability. Not yet executed.

insert into site_settings (key, value) values ('community_guidelines',
  to_jsonb('Be respectful. No harassment, hate, threats, spam, or sexual content involving minors. Do not share private information. Moderators may remove content or suspend accounts and will give a reason; you can appeal from Settings.'::text))
on conflict (key) do nothing;

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
    if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric not between 1 and 10 then raise exception 'media_max_mb must be 1..10 (bucket limit)'; end if;
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

-- Moderation history for one user. Staff only; contains no private content (no messages, no email).
create function admin_user_history(p_user uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'profile', (select jsonb_build_object('id', id, 'username', username, 'display_name', display_name, 'role', role, 'created_at', created_at,
                  'suspended_until', suspended_until, 'suspended_reason', suspended_reason, 'deactivated_at', deactivated_at) from profiles where id = p_user),
    'actions', coalesce((select jsonb_agg(jsonb_build_object('action', a.action, 'reason', a.reason, 'at', a.created_at, 'by', m.username) order by a.created_at desc)
                         from moderation_actions a left join profiles m on m.id = a.moderator_id where a.target_user_id = p_user), '[]'::jsonb),
    'reports_against', coalesce((select jsonb_object_agg(s.status, s.n) from (
                         select r.status::text as status, count(*) as n from reports r
                         where r.reported_user_id = p_user or r.post_id in (select id from posts where author_id = p_user) group by r.status) s), '{}'::jsonb),
    'appeals', coalesce((select jsonb_agg(jsonb_build_object('status', status, 'message', message, 'at', created_at)) from appeals where user_id = p_user), '[]'::jsonb));
end $$;
revoke execute on function admin_user_history(uuid) from anon;

-- Live username check for the signup form (usernames are public anyway).
create function username_available(p_username text) returns boolean language sql stable security definer set search_path = public as $$
  select p_username ~ '^[a-zA-Z0-9_]{3,20}$' and not exists (select 1 from profiles where lower(username) = lower(p_username))
$$;
