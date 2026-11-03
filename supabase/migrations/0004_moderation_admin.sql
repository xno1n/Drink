-- PULSE pass 6: moderation, admin, appeals, blocks. Not yet executed against a database.

create function role_rank(r user_role) returns int language sql immutable as
$$ select case r when 'user' then 0 when 'moderator' then 1 when 'admin' then 2 else 3 end $$;
create function my_rank() returns int language sql stable security definer set search_path = public as
$$ select coalesce((select role_rank(role) from profiles where id = auth.uid()), -1) $$;
create function log_admin(p_action text, p_target text, p_meta jsonb) returns void language sql security definer set search_path = public as
$$ insert into admin_audit_log (actor_id, action, target, meta) values (auth.uid(), p_action, p_target, p_meta) $$;
revoke execute on function log_admin(text, text, jsonb) from public, anon, authenticated;

-- Profile guard: privileged RPCs below set a transaction-local flag after doing their own checks.
create or replace function guard_profile_update() returns trigger language plpgsql security definer as $$
begin
  if current_setting('pulse.bypass_guard', true) = '1' then return new; end if;
  if not is_admin() and (new.role <> old.role or new.suspended_until is distinct from old.suspended_until or new.suspended_reason is distinct from old.suspended_reason) then
    raise exception 'not allowed';
  end if;
  if new.role <> old.role then raise exception 'use set_user_role'; end if;
  return new;
end $$;

-- One open report per reporter per target
create unique index reports_once_post on reports (reporter_id, post_id) where post_id is not null;
create unique index reports_once_user on reports (reporter_id, reported_user_id) where reported_user_id is not null and post_id is null;

-- ---------- moderation ----------
create function moderate_report(p_report uuid, p_action text, p_reason text, p_days int default 7) returns void
language plpgsql security definer set search_path = public as $$
declare r reports; tgt uuid;
begin
  if not is_staff() then raise exception 'forbidden'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason required'; end if;
  select * into r from reports where id = p_report for update;
  if not found then raise exception 'report not found'; end if;
  tgt := coalesce(r.reported_user_id, (select author_id from posts where id = r.post_id));
  if p_action in ('remove_post','suspend','warn') and tgt is not null
     and role_rank((select role from profiles where id = tgt)) >= my_rank() then
    raise exception 'insufficient privileges';
  end if;
  if p_action = 'remove_post' then
    if r.post_id is null then raise exception 'report has no post'; end if;
    update posts set removed_at = now(), removed_reason = p_reason where id = r.post_id;
  elsif p_action = 'suspend' then
    if tgt is null then raise exception 'no target'; end if;
    perform set_config('pulse.bypass_guard', '1', true);
    update profiles set suspended_until = now() + make_interval(days => greatest(coalesce(p_days, 7), 1)), suspended_reason = p_reason where id = tgt;
  elsif p_action not in ('warn','dismiss') then raise exception 'unknown action';
  end if;
  insert into moderation_actions (report_id, moderator_id, target_user_id, target_post_id, action, reason)
    values (p_report, auth.uid(), tgt, r.post_id, p_action, p_reason);
  update reports set status = case when p_action = 'dismiss' then 'dismissed'::report_status else 'actioned'::report_status end where id = p_report;
  if p_action in ('remove_post','suspend') then perform log_admin('moderation.' || p_action, coalesce(tgt::text, ''), jsonb_build_object('report', p_report, 'reason', p_reason)); end if;
end $$;

create function restore_user(p_user uuid, p_reason text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason required'; end if;
  perform set_config('pulse.bypass_guard', '1', true);
  update profiles set suspended_until = null, suspended_reason = null where id = p_user;
  insert into moderation_actions (moderator_id, target_user_id, action, reason) values (auth.uid(), p_user, 'restore', p_reason);
  perform log_admin('user.restore', p_user::text, jsonb_build_object('reason', p_reason));
end $$;

-- Admins may grant up to 'moderator'; only super_admin may grant 'admin'. 'super_admin' is assigned only via SQL.
create function set_user_role(p_user uuid, p_role user_role, p_reason text) returns void language plpgsql security definer set search_path = public as $$
declare cur user_role;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if p_user = auth.uid() then raise exception 'cannot change own role'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason required'; end if;
  select role into cur from profiles where id = p_user;
  if cur is null then raise exception 'user not found'; end if;
  if role_rank(cur) >= my_rank() or role_rank(p_role) >= my_rank() then raise exception 'insufficient privileges'; end if;
  perform set_config('pulse.bypass_guard', '1', true);
  update profiles set role = p_role where id = p_user;
  perform log_admin('user.role', p_user::text, jsonb_build_object('from', cur, 'to', p_role, 'reason', p_reason));
end $$;

create function admin_overview(p_days int default 7) returns json language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => greatest(coalesce(p_days, 7), 1));
begin
  if not is_staff() then raise exception 'forbidden'; end if;
  return json_build_object(
    'total_users', (select count(*) from profiles),
    'total_posts', (select count(*) from posts where deleted_at is null and removed_at is null),
    'open_reports', (select count(*) from reports where status in ('open','reviewing')),
    'new_users', (select count(*) from profiles where created_at > since),
    'new_posts', (select count(*) from posts where created_at > since),
    'active_users', (select count(distinct author_id) from posts where created_at > since));
end $$;

-- ---------- appeals ----------
drop policy appeals_insert on appeals;
create policy appeals_insert on appeals for insert with check (
  user_id = auth.uid() and exists (select 1 from moderation_actions a where a.id = action_id and a.target_user_id = auth.uid() and a.action in ('suspend','remove_post')));
create unique index appeals_once on appeals (action_id, user_id);

create function resolve_appeal(p_appeal uuid, p_outcome text) returns void language plpgsql security definer set search_path = public as $$
declare a appeals; act moderation_actions;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if p_outcome not in ('upheld','overturned') then raise exception 'bad outcome'; end if;
  select * into a from appeals where id = p_appeal and status = 'open' for update;
  if not found then raise exception 'appeal not found'; end if;
  select * into act from moderation_actions where id = a.action_id;
  if p_outcome = 'overturned' then
    if act.action = 'suspend' then
      perform set_config('pulse.bypass_guard', '1', true);
      update profiles set suspended_until = null, suspended_reason = null where id = act.target_user_id;
    elsif act.action = 'remove_post' and act.target_post_id is not null then
      update posts set removed_at = null, removed_reason = null where id = act.target_post_id;
    end if;
  end if;
  update appeals set status = p_outcome where id = p_appeal;
  perform log_admin('appeal.' || p_outcome, p_appeal::text, null);
end $$;

-- Blocked users are hidden from the blocker by profile RLS, so expose their own block list explicitly.
create function my_blocked_users() returns table (id uuid, username text, display_name text) language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name from blocks b join profiles p on p.id = b.blocked_id where b.blocker_id = auth.uid()
$$;
revoke execute on function moderate_report(uuid, text, text, int), restore_user(uuid, text), set_user_role(uuid, user_role, text), admin_overview(int), resolve_appeal(uuid, text), my_blocked_users() from anon;
