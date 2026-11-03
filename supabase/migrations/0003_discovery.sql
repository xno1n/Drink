-- PULSE pass 5: discovery helpers. Not yet executed against a database.

-- Trending: real counts from public (non-protected) posts only; excluded tags are hidden.
create function trending_hashtags(p_hours int default 24, p_limit int default 10)
returns table (tag text, uses bigint) language sql stable security definer set search_path = public as $$
  select h.tag, count(*)::bigint
  from hashtags h
  join post_hashtags ph on ph.hashtag_id = h.id
  join posts p on p.id = ph.post_id
  join profiles a on a.id = p.author_id
  where not h.excluded and p.deleted_at is null and p.removed_at is null
    and not a.is_protected and a.deactivated_at is null
    and p.created_at > now() - make_interval(hours => greatest(p_hours, 1))
  group by h.tag order by count(*) desc, h.tag limit least(greatest(p_limit, 1), 50)
$$;

-- Suggestions: accounts I don't follow, not blocked either way; ranked by real follower count.
create function suggested_accounts(p_limit int default 5)
returns table (id uuid, username text, display_name text) language sql stable as $$
  select pr.id, pr.username, pr.display_name
  from profiles pr
  where pr.id <> auth.uid() and pr.deactivated_at is null
    and not exists (select 1 from follows f where f.follower_id = auth.uid() and f.following_id = pr.id)
    and not exists (select 1 from follow_requests fr where fr.requester_id = auth.uid() and fr.target_id = pr.id)
    and not is_blocked_between(auth.uid(), pr.id)
  order by (select count(*) from follows f2 where f2.following_id = pr.id) desc, pr.created_at desc
  limit least(greatest(p_limit, 1), 20)
$$;

revoke execute on function trending_hashtags(int, int) from anon;
revoke execute on function suggested_accounts(int) from anon;
