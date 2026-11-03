-- PULSE fix: policies on conversation_participants referenced conversation_participants itself,
-- which makes Postgres raise "infinite recursion detected in policy". Use SECURITY DEFINER membership helpers instead.
-- Not yet executed against a database.

create function is_conversation_member(cid uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from conversation_participants where conversation_id = cid and user_id = auth.uid()) $$;
-- text variant for storage paths (avoids uuid-cast errors on unrelated objects)
create function is_conv_member_path(p text) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from conversation_participants where conversation_id::text = p and user_id = auth.uid()) $$;

drop policy conv_member on conversations;
create policy conv_member on conversations for select using (is_conversation_member(id));

drop policy cp_member on conversation_participants;
create policy cp_member on conversation_participants for select using (is_conversation_member(conversation_id));

drop policy msg_read on messages;
create policy msg_read on messages for select using (is_conversation_member(conversation_id));

drop policy msg_insert on messages;
create policy msg_insert on messages for insert with check (
  sender_id = auth.uid() and is_conversation_member(conversation_id)
  and not exists (select 1 from conversation_participants o where o.conversation_id = messages.conversation_id and o.user_id <> auth.uid() and is_blocked_between(auth.uid(), o.user_id)));

drop policy dm_upload on storage.objects;
drop policy dm_read on storage.objects;
create policy dm_upload on storage.objects for insert to authenticated with check (bucket_id = 'dm' and is_conv_member_path((storage.foldername(name))[1]));
create policy dm_read on storage.objects for select to authenticated using (bucket_id = 'dm' and is_conv_member_path((storage.foldername(name))[1]));
