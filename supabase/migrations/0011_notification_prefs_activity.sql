-- PULSE pass 12: notification preferences enforced in notify(), admin activity chart data. Not yet executed.

create or replace function notify(p_user uuid, p_actor uuid, p_type notif_type, p_post uuid) returns void
language plpgsql security definer set search_path = public as $$
declare k text := case when p_type = 'follow_request' then 'follow' else p_type::text end; allowed boolean;
begin
  if p_user is null or p_user = p_actor then return; end if;
  select coalesce((s.notify ->> k)::boolean, true) into allowed from user_settings s where s.user_id = p_user;
  if coalesce(allowed, true) = false then return; end if;
  if exists (select 1 from mutes where muter_id = p_user and muted_id = p_actor) then return; end if;
  if is_blocked_between(p_user, p_actor) then return; end if;
  insert into notifications (user_id, actor_id, type, post_id) values (p_user, p_actor, p_type, p_post) on conflict do nothing;
end $$;

create function admin_daily_activity(p_days int default 14) returns table (day date, new_posts bigint, new_users bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'forbidden'; end if;
  return query
    select d::date,
           (select count(*) from posts p where p.created_at::date = d::date),
           (select count(*) from profiles u where u.created_at::date = d::date)
    from generate_series(current_date - (least(greatest(p_days, 1), 90) - 1), current_date, interval '1 day') d
    order by 1;
end $$;
revoke execute on function admin_daily_activity(int) from anon;
