-- PULSE pass 17: close friends. Not yet executed against a database. REVIEW CAREFULLY: this changes post visibility (RLS).
-- Model: a post has audience 'public' or 'close_friends'. A close-friends post is visible to its author and to the users on the
-- author's close-friends list. Replies/quotes to a close-friends post inherit the same list (audience_owner), so friends can
-- discuss it without leaking it. The list itself is private: friends are not told they are on it.

create table close_friends (
  owner_id  uuid not null references profiles(id) on delete cascade,
  friend_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, friend_id), check (owner_id <> friend_id)
);
create index close_friends_friend_idx on close_friends (friend_id);
alter table close_friends enable row level security;
create policy cf_owner_read   on close_friends for select using (owner_id = auth.uid());
create policy cf_owner_insert on close_friends for insert with check (owner_id = auth.uid() and not is_blocked_between(owner_id, friend_id));
create policy cf_owner_delete on close_friends for delete using (owner_id = auth.uid());

alter table posts add column audience text not null default 'public' check (audience in ('public','close_friends'));
alter table posts add column audience_owner uuid references profiles(id) on delete cascade;
alter table posts add constraint posts_audience_owner_check check ((audience = 'public') = (audience_owner is null));
create index posts_audience_owner_idx on posts (audience_owner) where audience_owner is not null;

create function can_see_cf(p_owner uuid) returns boolean language sql stable security definer set search_path = public as $$
  select p_owner is not null and (p_owner = auth.uid() or exists (select 1 from close_friends where owner_id = p_owner and friend_id = auth.uid()))
$$;

-- Central visibility rule (views, search, hashtags, media, likes, etc. all go through posts RLS).
drop policy posts_read on posts;
create policy posts_read on posts for select using (
  author_id = auth.uid() or is_staff()
  or (deleted_at is null and removed_at is null and can_view_author(author_id) and (audience = 'public' or can_see_cf(audience_owner))));

-- Audience rules on insert/update.
create function trg_post_audience() returns trigger language plpgsql security definer set search_path = public as $$
declare ref uuid; par posts; v_owner uuid;
begin
  if tg_op = 'UPDATE' then
    if new.audience <> old.audience or new.audience_owner is distinct from old.audience_owner then raise exception 'audience cannot be changed'; end if;
    return new;
  end if;
  foreach ref in array array[new.reply_to_id, new.quote_of_id] loop
    if ref is not null then
      select * into par from posts where id = ref;
      if found and par.audience = 'close_friends' then
        if not can_see_cf(par.audience_owner) then raise exception 'not allowed'; end if;
        if v_owner is not null and v_owner <> par.audience_owner then raise exception 'cannot combine close-friends posts of different owners'; end if;
        v_owner := par.audience_owner;
      end if;
    end if;
  end loop;
  if v_owner is not null then new.audience := 'close_friends'; new.audience_owner := v_owner;
  elsif new.audience = 'close_friends' then new.audience_owner := new.author_id;
  else new.audience := 'public'; new.audience_owner := null; end if;
  return new;
end $$;
create trigger posts_audience before insert or update on posts for each row execute function trg_post_audience();

-- Blocking ends close-friend relationships in both directions.
create function trg_block_cleanup() returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from close_friends where (owner_id = new.blocker_id and friend_id = new.blocked_id) or (owner_id = new.blocked_id and friend_id = new.blocker_id);
  return new;
end $$;
create trigger blocks_cleanup after insert on blocks for each row execute function trg_block_cleanup();

-- Functions that must also respect the audience:
create or replace function trending_hashtags(p_hours int default 24, p_limit int default 10)
returns table (tag text, uses bigint) language sql stable security definer set search_path = public as $$
  select h.tag, count(*)::bigint
  from hashtags h
  join post_hashtags ph on ph.hashtag_id = h.id
  join posts p on p.id = ph.post_id
  join profiles a on a.id = p.author_id
  where not h.excluded and p.deleted_at is null and p.removed_at is null and p.audience = 'public'
    and not a.is_protected and a.deactivated_at is null
    and p.created_at > now() - make_interval(hours => greatest(p_hours, 1))
  group by h.tag order by count(*) desc, h.tag limit least(greatest(p_limit, 1), 50)
$$;

create or replace function trg_post_after() returns trigger language plpgsql security definer set search_path = public as $$
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
      if tg_op = 'INSERT' and (new.audience = 'public' or v_uid = new.audience_owner or exists (select 1 from close_friends cf where cf.owner_id = new.audience_owner and cf.friend_id = v_uid)) then
        perform notify(v_uid, new.author_id, 'mention', new.id); -- never reveal a close-friends post to someone outside the list
      end if;
    end if;
  end loop;
  if tg_op = 'INSERT' then
    if new.reply_to_id is not null then perform notify((select author_id from posts where id = new.reply_to_id), new.author_id, 'reply', new.id); end if;
    if new.quote_of_id is not null then perform notify((select author_id from posts where id = new.quote_of_id), new.author_id, 'quote', new.id); end if;
  end if;
  return new;
end $$;

-- Feed view gains the audience column (appended last).
create or replace view posts_feed with (security_invoker = true) as
select p.id, p.author_id, p.body, p.reply_to_id, p.quote_of_id, p.created_at, p.edited_at,
  a.username as author_username, a.display_name as author_display_name, a.avatar_url as author_avatar_url,
  (select count(*) from likes l    where l.post_id = p.id) as like_count,
  (select count(*) from reposts r  where r.post_id = p.id) as repost_count,
  (select count(*) from posts c    where c.reply_to_id = p.id and c.deleted_at is null and c.removed_at is null) as reply_count,
  exists (select 1 from likes l     where l.post_id = p.id and l.user_id = auth.uid()) as liked_by_me,
  exists (select 1 from reposts r   where r.post_id = p.id and r.user_id = auth.uid()) as reposted_by_me,
  exists (select 1 from bookmarks b where b.post_id = p.id and b.user_id = auth.uid()) as bookmarked_by_me,
  (select coalesce(json_agg(json_build_object('path', m.storage_path, 'alt', m.alt_text, 'kind', m.kind) order by m.position), '[]'::json)
     from post_media m where m.post_id = p.id) as media,
  (select json_build_object('id', q.id, 'body', q.body, 'username', qa.username, 'display_name', qa.display_name)
     from posts q join profiles qa on qa.id = q.author_id
    where q.id = p.quote_of_id and q.deleted_at is null and q.removed_at is null) as quoted,   -- RLS hides it if the viewer can't see it
  exists (select 1 from post_media m where m.post_id = p.id) as has_media,
  p.audience as audience
from posts p join profiles a on a.id = p.author_id
where p.deleted_at is null and p.removed_at is null;
