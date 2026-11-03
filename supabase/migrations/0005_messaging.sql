-- PULSE pass 7: direct messages. Not yet executed against a database.
-- NOTE: messages are protected by access control (RLS + private bucket), NOT end-to-end encrypted.

alter table messages drop constraint if exists messages_check;
alter table messages add constraint messages_content_check check (deleted_at is not null or body is not null or image_path is not null);
drop policy msg_delete_own on messages;   -- no direct edits; deletion only via delete_message()

create function start_conversation(p_other uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if p_other = auth.uid() then raise exception 'cannot message yourself'; end if;
  if is_blocked_between(auth.uid(), p_other) then raise exception 'not allowed'; end if;
  if not exists (select 1 from profiles where id = p_other and deactivated_at is null) then raise exception 'not allowed'; end if;
  perform pg_advisory_xact_lock(hashtext(least(auth.uid()::text, p_other::text) || greatest(auth.uid()::text, p_other::text)));
  select a.conversation_id into cid from conversation_participants a join conversation_participants b on b.conversation_id = a.conversation_id
    where a.user_id = auth.uid() and b.user_id = p_other limit 1;
  if cid is not null then return cid; end if;
  insert into conversations default values returning id into cid;
  insert into conversation_participants (conversation_id, user_id) values (cid, auth.uid()), (cid, p_other);
  return cid;
end $$;

create function my_conversations(p_q text default null)
returns table (conversation_id uuid, other_id uuid, other_username text, other_display_name text, last_body text, last_has_image boolean, last_at timestamptz, unread_count bigint)
language sql stable security definer set search_path = public as $$
  select c.id, o.user_id, pr.username, pr.display_name, lm.body, coalesce(lm.image_path is not null, false), coalesce(lm.created_at, c.created_at),
    (select count(*) from messages m where m.conversation_id = c.id and m.sender_id <> auth.uid() and m.deleted_at is null and m.created_at > me.last_read_at)
  from conversation_participants me
  join conversations c on c.id = me.conversation_id
  join conversation_participants o on o.conversation_id = c.id and o.user_id <> auth.uid()
  join profiles pr on pr.id = o.user_id
  left join lateral (select m.body, m.image_path, m.created_at from messages m where m.conversation_id = c.id and m.deleted_at is null order by m.created_at desc limit 1) lm on true
  where me.user_id = auth.uid() and (p_q is null or pr.username ilike '%' || p_q || '%' or pr.display_name ilike '%' || p_q || '%')
  order by 7 desc
$$;

create function delete_message(p_id uuid) returns void language sql security definer set search_path = public as $$
  update messages set deleted_at = now(), body = null, image_path = null where id = p_id and sender_id = auth.uid() and deleted_at is null
$$;

-- rate limit + notification (one unread "message" notification per sender)
create function trg_msg_before() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from messages where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 30 then raise exception 'rate limit exceeded'; end if;
  return new;
end $$;
create trigger msg_before before insert on messages for each row execute function trg_msg_before();
create function trg_msg_after() returns trigger language plpgsql security definer set search_path = public as $$
declare other uuid;
begin
  select user_id into other from conversation_participants where conversation_id = new.conversation_id and user_id <> new.sender_id limit 1;
  if other is not null and not exists (select 1 from notifications where user_id = other and actor_id = new.sender_id and type = 'message' and read_at is null) then
    perform notify(other, new.sender_id, 'message', null);
  end if;
  return new;
end $$;
create trigger msg_after after insert on messages for each row execute function trg_msg_after();

-- private attachment bucket, members only
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dm', 'dm', false, 10485760, array['image/jpeg','image/png','image/webp','image/gif']) on conflict (id) do nothing;
create policy dm_upload on storage.objects for insert to authenticated with check (bucket_id = 'dm' and exists (
  select 1 from conversation_participants cp where cp.user_id = auth.uid() and cp.conversation_id::text = (storage.foldername(name))[1]));
create policy dm_read on storage.objects for select to authenticated using (bucket_id = 'dm' and exists (
  select 1 from conversation_participants cp where cp.user_id = auth.uid() and cp.conversation_id::text = (storage.foldername(name))[1]));

revoke execute on function start_conversation(uuid), my_conversations(text), delete_message(uuid) from anon;
