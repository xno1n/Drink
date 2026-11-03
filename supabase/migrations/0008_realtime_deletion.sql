-- PULSE pass 10: realtime publication + permanent account deletion. Not yet executed against a database.

-- Realtime: RLS still applies, so clients only receive rows they could select.
do $$ begin alter publication supabase_realtime add table notifications; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table messages;      exception when others then null; end $$;

-- Permanent self-deletion. Cascades remove the profile, posts, likes, follows, notifications and the user's messages.
-- Staff accounts must be demoted first (their moderation history references them and must stay auditable).
create function delete_my_account(p_confirm text) returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if p_confirm <> 'DELETE' then raise exception 'confirmation required'; end if;
  if (select role from profiles where id = auth.uid()) <> 'user' then raise exception 'staff accounts must be demoted before deletion'; end if;
  delete from auth.users where id = auth.uid();
exception when foreign_key_violation then
  raise exception 'account has moderation records and cannot be deleted; contact an administrator';
end $$;
revoke execute on function delete_my_account(text) from anon;
