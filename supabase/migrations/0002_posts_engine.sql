-- PULSE pass 3: post engine. Not yet executed against a database.

insert into site_settings (key, value) values ('post_rate_per_hour','30') on conflict do nothing;

-- ---------- feed view (RLS of the caller applies) ----------
create view posts_feed with (security_invoker = true) as
select p.id, p.author_id, p.body, p.reply_to_id, p.quote_of_id, p.created_at, p.edited_at,
  a.username as author_username, a.display_name as author_display_name, a.avatar_url as author_avatar_url,
  (select count(*) from likes l    where l.post_id = p.id) as like_count,
  (select count(*) from reposts r  where r.post_id = p.id) as repost_count,
  (select count(*) from posts c    where c.reply_to_id = p.id and c.deleted_at is null and c.removed_at is null) as reply_count,
  exists (select 1 from likes l     where l.post_id = p.id and l.user_id = auth.uid()) as liked_by_me,
  exists (select 1 from reposts r   where r.post_id = p.id and r.user_id = auth.uid()) as reposted_by_me,
  exists (select 1 from bookmarks b where b.post_id = p.id and b.user_id = auth.uid()) as bookmarked_by_me,
  (select coalesce(json_agg(json_build_object('path', m.storage_path, 'alt', m.alt_text, 'kind', m.kind) order by m.position), '[]'::json)
     from post_media m where m.post_id = p.id) as media
from posts p join profiles a on a.id = p.author_id
where p.deleted_at is null and p.removed_at is null;

-- ---------- toggles (security invoker: RLS decides) ----------
create function toggle_like(p_post uuid) returns boolean language plpgsql as $$
begin
  delete from likes where user_id = auth.uid() and post_id = p_post;
  if found then return false; end if;
  insert into likes (user_id, post_id) values (auth.uid(), p_post) on conflict do nothing;
  return true;
end $$;
create function toggle_repost(p_post uuid) returns boolean language plpgsql as $$
begin
  delete from reposts where user_id = auth.uid() and post_id = p_post;
  if found then return false; end if;
  insert into reposts (user_id, post_id) values (auth.uid(), p_post) on conflict do nothing;
  return true;
end $$;
create function toggle_bookmark(p_post uuid) returns boolean language plpgsql as $$
begin
  delete from bookmarks where user_id = auth.uid() and post_id = p_post;
  if found then return false; end if;
  insert into bookmarks (user_id, post_id) values (auth.uid(), p_post) on conflict do nothing;
  return true;
end $$;

-- ---------- follow with private-account handling ----------
create function follow_user(target uuid) returns text language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if target = auth.uid() then raise exception 'cannot follow yourself'; end if;
  if is_blocked_between(auth.uid(), target) then raise exception 'not allowed'; end if;
  if (select is_protected from profiles where id = target) then
    insert into follow_requests (requester_id, target_id) values (auth.uid(), target) on conflict do nothing;
    return 'requested';
  end if;
  insert into follows (follower_id, following_id) values (auth.uid(), target) on conflict do nothing;
  return 'following';
end $$;
create function accept_follow_request(requester uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  delete from follow_requests where requester_id = requester and target_id = auth.uid();
  if found then insert into follows (follower_id, following_id) values (requester, auth.uid()) on conflict do nothing; end if;
end $$;

-- ---------- notifications (only via triggers) ----------
create function notify(p_user uuid, p_actor uuid, p_type notif_type, p_post uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_user = p_actor then return; end if;
  if exists (select 1 from mutes where muter_id = p_user and muted_id = p_actor) then return; end if;
  if is_blocked_between(p_user, p_actor) then return; end if;
  insert into notifications (user_id, actor_id, type, post_id) values (p_user, p_actor, p_type, p_post) on conflict do nothing;
end $$;
create function trg_notify_like() returns trigger language plpgsql security definer as $$
begin perform notify((select author_id from posts where id = new.post_id), new.user_id, 'like', new.post_id); return new; end $$;
create function trg_notify_repost() returns trigger language plpgsql security definer as $$
begin perform notify((select author_id from posts where id = new.post_id), new.user_id, 'repost', new.post_id); return new; end $$;
create function trg_notify_follow() returns trigger language plpgsql security definer as $$
begin perform notify(new.following_id, new.follower_id, 'follow', null); return new; end $$;
create function trg_notify_request() returns trigger language plpgsql security definer as $$
begin perform notify(new.target_id, new.requester_id, 'follow_request', null); return new; end $$;
create trigger n_like after insert on likes for each row execute function trg_notify_like();
create trigger n_repost after insert on reposts for each row execute function trg_notify_repost();
create trigger n_follow after insert on follows for each row execute function trg_notify_follow();
create trigger n_request after insert on follow_requests for each row execute function trg_notify_request();

-- ---------- post validation, rate limit, hashtags, mentions, reply/quote notifications ----------
create function trg_post_before() returns trigger language plpgsql security definer set search_path = public as $$
declare maxc int; rate int;
begin
  if tg_op = 'INSERT' then
    select (value #>> '{}')::int into maxc from site_settings where key = 'post_max_chars';
    select (value #>> '{}')::int into rate from site_settings where key = 'post_rate_per_hour';
    if char_length(new.body) > coalesce(maxc, 280) then raise exception 'post too long'; end if;
    if (select count(*) from posts where author_id = new.author_id and created_at > now() - interval '1 hour') >= coalesce(rate, 30) then
      raise exception 'rate limit exceeded';
    end if;
    if exists (select 1 from posts where author_id = new.author_id and body = new.body and body <> '' and created_at > now() - interval '10 minutes') then
      raise exception 'duplicate content';
    end if;
    if (select value = 'true'::jsonb from site_settings where key = 'maintenance_mode') and not is_staff() then
      raise exception 'maintenance mode';
    end if;
  else
    new.edited_at := case when new.body is distinct from old.body then now() else new.edited_at end;
  end if;
  return new;
end $$;
create trigger posts_before before insert or update on posts for each row execute function trg_post_before();

create function trg_post_after() returns trigger language plpgsql security definer set search_path = public as $$
declare v_tag text; v_uname text; v_hid uuid; v_uid uuid;
begin
  delete from post_hashtags where post_id = new.id;
  delete from mentions where post_id = new.id;
  for v_tag in select distinct lower(m[1]) from regexp_matches(new.body, '#([[:alnum:]_]{1,50})', 'g') as m loop
    insert into hashtags (tag) values (v_tag) on conflict (tag) do nothing;
    select h.id into v_hid from hashtags h where h.tag = v_tag;
    insert into post_hashtags (post_id, hashtag_id) values (new.id, v_hid) on conflict do nothing;
  end loop;
  for v_uname in select distinct lower(m[1]) from regexp_matches(new.body, '@([a-zA-Z0-9_]{3,20})', 'g') as m loop
    select pr.id into v_uid from profiles pr where lower(pr.username) = v_uname;
    if v_uid is not null and v_uid <> new.author_id and not is_blocked_between(new.author_id, v_uid) then
      insert into mentions (post_id, user_id) values (new.id, v_uid) on conflict do nothing;
      if tg_op = 'INSERT' then perform notify(v_uid, new.author_id, 'mention', new.id); end if;
    end if;
  end loop;
  if tg_op = 'INSERT' then
    if new.reply_to_id is not null then perform notify((select author_id from posts where id = new.reply_to_id), new.author_id, 'reply', new.id); end if;
    if new.quote_of_id is not null then perform notify((select author_id from posts where id = new.quote_of_id), new.author_id, 'quote', new.id); end if;
  end if;
  return new;
end $$;
create trigger posts_after after insert or update of body on posts for each row execute function trg_post_after();

-- ---------- media storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 10485760, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;
create policy media_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy media_read on storage.objects for select using (bucket_id = 'media');
