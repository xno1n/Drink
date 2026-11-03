-- PULSE pass 8: For You ranking, quotes, media/likes tabs. Not yet executed against a database.

-- Extend the feed view (new columns appended at the end, existing order unchanged).
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
  exists (select 1 from post_media m where m.post_id = p.id) as has_media
from posts p join profiles a on a.id = p.author_id
where p.deleted_at is null and p.removed_at is null;

-- ---------- For You: transparent, configurable ranking ----------
-- score = (followed*w_followed + w_like*ln(1+likes) + w_repost*ln(1+reposts) + w_reply*ln(1+replies)
--          + w_affinity*ln(1+my_likes_of_this_author_30d) + base) * 0.5^(age_hours / half_life_hours)
-- Weights live in site_settings.for_you_weights (admin-editable). Candidates: last 7 days, top-level posts, not mine, not muted.
insert into site_settings (key, value) values
  ('for_you_weights', '{"half_life_hours":12,"followed":3,"like":1,"repost":2,"reply":1.5,"affinity":2,"base":0.1}')
on conflict (key) do nothing;

create function for_you_feed(p_limit int default 20, p_offset int default 0)
returns table (id uuid, score double precision) language sql stable as $$
  with w as (select coalesce((select value from site_settings where key = 'for_you_weights'), '{}'::jsonb) as v)
  select p.id,
    ( coalesce((select 1 from follows f where f.follower_id = auth.uid() and f.following_id = p.author_id), 0) * coalesce((w.v->>'followed')::float8, 3)
      + coalesce((w.v->>'like')::float8, 1)   * ln(1 + p.like_count::float8)
      + coalesce((w.v->>'repost')::float8, 2) * ln(1 + p.repost_count::float8)
      + coalesce((w.v->>'reply')::float8, 1.5) * ln(1 + p.reply_count::float8)
      + coalesce((w.v->>'affinity')::float8, 2) * ln(1 + (select count(*) from likes l join posts lp on lp.id = l.post_id
            where l.user_id = auth.uid() and lp.author_id = p.author_id and l.created_at > now() - interval '30 days')::float8)
      + coalesce((w.v->>'base')::float8, 0.1)
    ) * power(0.5, extract(epoch from (now() - p.created_at)) / 3600.0 / greatest(coalesce((w.v->>'half_life_hours')::float8, 12), 0.1)) as score
  from posts_feed p cross join w
  where p.reply_to_id is null and p.author_id <> auth.uid() and p.created_at > now() - interval '7 days'
    and not exists (select 1 from mutes m where m.muter_id = auth.uid() and m.muted_id = p.author_id)
  order by score desc, p.created_at desc
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
$$;

-- ---------- Likes tab, subject to the owner's privacy setting ----------
create function profile_likes(p_user uuid, p_limit int default 30) returns table (post_id uuid, liked_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.post_id, l.created_at from likes l
  where l.user_id = p_user and auth.uid() is not null and not is_blocked_between(auth.uid(), p_user)
    and (p_user = auth.uid() or coalesce((select s.likes_public from user_settings s where s.user_id = p_user), true))
  order by l.created_at desc limit least(greatest(p_limit, 1), 100)
$$;
revoke execute on function for_you_feed(int, int), profile_likes(uuid, int) from anon;

-- DB-level guard: you can only pin your own top-level post (the server action checks too, but RLS lets users update their own profile row).
create function guard_pin() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.pinned_post_id is distinct from old.pinned_post_id and new.pinned_post_id is not null
     and not exists (select 1 from posts where id = new.pinned_post_id and author_id = new.id and reply_to_id is null) then
    raise exception 'can only pin your own top-level post';
  end if;
  return new;
end $$;
create trigger profiles_pin_guard before update on profiles for each row execute function guard_pin();
