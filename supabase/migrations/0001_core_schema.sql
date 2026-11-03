-- PULSE core schema (Supabase / PostgreSQL). Not yet executed against a database.
create extension if not exists pg_trgm;

create type user_role as enum ('user','moderator','admin','super_admin');
create type report_status as enum ('open','reviewing','actioned','dismissed');
create type notif_type as enum ('follow','follow_request','like','reply','repost','mention','quote','message');

-- ---------- profiles ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 50),
  bio text check (char_length(bio) <= 160),
  location text, website text, avatar_url text, cover_url text,
  role user_role not null default 'user',
  is_protected boolean not null default false,
  suspended_until timestamptz, suspended_reason text,
  deactivated_at timestamptz,
  pinned_post_id uuid,
  created_at timestamptz not null default now()
);
create unique index profiles_username_lower on profiles (lower(username));

create table user_settings (
  user_id uuid primary key references profiles(id) on delete cascade,
  language text not null default 'fa' check (language in ('fa','en')),
  theme text not null default 'system' check (theme in ('light','dark','system')),
  likes_public boolean not null default true,
  notify jsonb not null default '{"follow":true,"like":true,"reply":true,"repost":true,"mention":true,"quote":true,"message":true}'
);

-- ---------- posts ----------
create table posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 280),
  reply_to_id uuid references posts(id) on delete cascade,
  quote_of_id uuid references posts(id) on delete set null,
  edited_at timestamptz,
  removed_at timestamptz, removed_reason text,      -- moderation soft-delete
  deleted_at timestamptz,                            -- author soft-delete
  created_at timestamptz not null default now()
);
create index posts_feed_idx on posts (created_at desc, id desc) where deleted_at is null and removed_at is null;
create index posts_author_idx on posts (author_id, created_at desc);
create index posts_reply_idx on posts (reply_to_id, created_at);
create index posts_body_trgm on posts using gin (body gin_trgm_ops);
alter table profiles add constraint profiles_pinned_fk foreign key (pinned_post_id) references posts(id) on delete set null;

create table post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  storage_path text not null, kind text not null check (kind in ('image','video')),
  alt_text text check (char_length(alt_text) <= 420), position smallint not null default 0
);
create index post_media_post_idx on post_media (post_id);

create table likes     (user_id uuid references profiles(id) on delete cascade, post_id uuid references posts(id) on delete cascade, created_at timestamptz not null default now(), primary key (user_id, post_id));
create table reposts   (user_id uuid references profiles(id) on delete cascade, post_id uuid references posts(id) on delete cascade, created_at timestamptz not null default now(), primary key (user_id, post_id));
create table bookmarks (user_id uuid references profiles(id) on delete cascade, post_id uuid references posts(id) on delete cascade, created_at timestamptz not null default now(), primary key (user_id, post_id));
create index likes_post_idx on likes (post_id);
create index reposts_post_idx on reposts (post_id);

create table hashtags (id uuid primary key default gen_random_uuid(), tag text not null unique, excluded boolean not null default false);
create table post_hashtags (post_id uuid references posts(id) on delete cascade, hashtag_id uuid references hashtags(id) on delete cascade, primary key (post_id, hashtag_id));
create index post_hashtags_tag_idx on post_hashtags (hashtag_id, post_id);
create table mentions (post_id uuid references posts(id) on delete cascade, user_id uuid references profiles(id) on delete cascade, primary key (post_id, user_id));

-- ---------- social graph ----------
create table follows (
  follower_id uuid references profiles(id) on delete cascade,
  following_id uuid references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id), check (follower_id <> following_id)
);
create index follows_following_idx on follows (following_id);
create table follow_requests (
  requester_id uuid references profiles(id) on delete cascade,
  target_id uuid references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (requester_id, target_id), check (requester_id <> target_id)
);
create table blocks (blocker_id uuid references profiles(id) on delete cascade, blocked_id uuid references profiles(id) on delete cascade, created_at timestamptz not null default now(), primary key (blocker_id, blocked_id), check (blocker_id <> blocked_id));
create table mutes  (muter_id uuid references profiles(id) on delete cascade, muted_id uuid references profiles(id) on delete cascade, created_at timestamptz not null default now(), primary key (muter_id, muted_id), check (muter_id <> muted_id));

-- ---------- notifications & messaging ----------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  actor_id uuid references profiles(id) on delete cascade,
  type notif_type not null, post_id uuid references posts(id) on delete cascade,
  read_at timestamptz, created_at timestamptz not null default now()
);
create unique index notif_dedupe on notifications (user_id, actor_id, type, coalesce(post_id,'00000000-0000-0000-0000-000000000000')) where type in ('like','follow','repost');
create index notif_user_idx on notifications (user_id, created_at desc);

create table conversations (id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now());
create table conversation_participants (
  conversation_id uuid references conversations(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conv_part_user_idx on conversation_participants (user_id);
create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  body text check (char_length(body) <= 2000), image_path text,
  deleted_at timestamptz, created_at timestamptz not null default now(),
  check (body is not null or image_path is not null)
);
create index messages_conv_idx on messages (conversation_id, created_at desc);

-- ---------- moderation & admin ----------
create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id) on delete cascade,
  post_id uuid references posts(id) on delete set null,
  reported_user_id uuid references profiles(id) on delete set null,
  category text not null check (category in ('spam','harassment','hate','violence','sexual','other')),
  details text check (char_length(details) <= 1000),
  status report_status not null default 'open',
  created_at timestamptz not null default now(),
  check (post_id is not null or reported_user_id is not null)
);
create index reports_queue_idx on reports (status, created_at);
create table moderation_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references reports(id) on delete set null,
  moderator_id uuid not null references profiles(id),
  target_user_id uuid references profiles(id) on delete set null,
  target_post_id uuid references posts(id) on delete set null,
  action text not null check (action in ('remove_post','suspend','restore','dismiss','warn')),
  reason text not null, created_at timestamptz not null default now()
);
create table appeals (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references moderation_actions(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  message text not null check (char_length(message) <= 1000),
  status text not null default 'open' check (status in ('open','upheld','overturned')),
  created_at timestamptz not null default now()
);
create table admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references profiles(id),
  action text not null, target text, meta jsonb, created_at timestamptz not null default now()
);
create table site_settings (
  key text primary key, value jsonb not null, updated_at timestamptz not null default now()
);
insert into site_settings (key, value) values
  ('post_max_chars','280'), ('media_max_mb','25'), ('registration_open','true'),
  ('maintenance_mode','false'), ('feature_flags','{}'), ('announcement','null');

-- ---------- helpers ----------
create function is_staff() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin','super_admin')) $$;
create function is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and role in ('admin','super_admin')) $$;
create function is_blocked_between(a uuid, b uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from blocks where (blocker_id=a and blocked_id=b) or (blocker_id=b and blocked_id=a)) $$;
create function can_view_author(author uuid) returns boolean language sql stable security definer set search_path = public as
$$ select author = auth.uid()
   or (not is_blocked_between(auth.uid(), author) and (
        not (select is_protected from profiles where id = author)
        or exists (select 1 from follows where follower_id = auth.uid() and following_id = author))) $$;

-- Prevent users from changing their own role/suspension
create function guard_profile_update() returns trigger language plpgsql security definer as $$
begin
  if not is_admin() and (new.role <> old.role or new.suspended_until is distinct from old.suspended_until) then
    raise exception 'not allowed';
  end if;
  if new.role <> old.role and old.id = auth.uid() then raise exception 'cannot change own role'; end if;
  if new.role = 'super_admin' and not exists (select 1 from profiles where id = auth.uid() and role = 'super_admin') then
    raise exception 'only super_admin can grant super_admin';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on profiles for each row execute function guard_profile_update();

-- Auto-create profile + settings on signup
create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, username, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text,1,8)),
                  coalesce(new.raw_user_meta_data->>'display_name', 'New user'));
  insert into user_settings (user_id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- ---------- RLS ----------
do $$ declare t text; begin
  foreach t in array array['profiles','user_settings','posts','post_media','likes','reposts','bookmarks','hashtags','post_hashtags','mentions','follows','follow_requests','blocks','mutes','notifications','conversations','conversation_participants','messages','reports','moderation_actions','appeals','admin_audit_log','site_settings']
  loop execute format('alter table %I enable row level security', t); end loop; end $$;

create policy profiles_read on profiles for select using (deactivated_at is null and not is_blocked_between(auth.uid(), id) or id = auth.uid() or is_staff());
create policy profiles_update on profiles for update using (id = auth.uid() or is_admin()) with check (id = auth.uid() or is_admin());
create policy settings_own on user_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy posts_read on posts for select using ((deleted_at is null and removed_at is null and can_view_author(author_id)) or author_id = auth.uid() or is_staff());
create policy posts_insert on posts for insert with check (author_id = auth.uid() and (select suspended_until is null or suspended_until < now() from profiles where id = auth.uid()));
create policy posts_update on posts for update using (author_id = auth.uid() or is_staff()) with check (author_id = auth.uid() or is_staff());
-- hard deletes are admin-only; authors soft-delete via deleted_at
create policy posts_delete on posts for delete using (is_admin());

create policy media_read on post_media for select using (exists (select 1 from posts p where p.id = post_id));
create policy media_write on post_media for all using (exists (select 1 from posts p where p.id = post_id and p.author_id = auth.uid())) with check (exists (select 1 from posts p where p.id = post_id and p.author_id = auth.uid()));

create policy likes_read on likes for select using (exists (select 1 from posts p where p.id = post_id));
create policy likes_write on likes for all using (user_id = auth.uid()) with check (user_id = auth.uid() and exists (select 1 from posts p where p.id = post_id));
create policy reposts_read on reposts for select using (exists (select 1 from posts p where p.id = post_id));
create policy reposts_write on reposts for all using (user_id = auth.uid()) with check (user_id = auth.uid() and exists (select 1 from posts p where p.id = post_id));
create policy bookmarks_own on bookmarks for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy hashtags_read on hashtags for select using (true);
create policy hashtags_admin on hashtags for update using (is_admin());
create policy ph_read on post_hashtags for select using (exists (select 1 from posts p where p.id = post_id));
create policy mentions_read on mentions for select using (exists (select 1 from posts p where p.id = post_id));

create policy follows_read on follows for select using (follower_id = auth.uid() or following_id = auth.uid() or can_view_author(following_id));
create policy follows_insert on follows for insert with check (follower_id = auth.uid() and not is_blocked_between(follower_id, following_id)
  and (not (select is_protected from profiles where id = following_id)));   -- protected accounts go through follow_requests + accept RPC
create policy follows_delete on follows for delete using (follower_id = auth.uid() or following_id = auth.uid());
create policy fr_read on follow_requests for select using (requester_id = auth.uid() or target_id = auth.uid());
create policy fr_insert on follow_requests for insert with check (requester_id = auth.uid() and not is_blocked_between(requester_id, target_id));
create policy fr_delete on follow_requests for delete using (requester_id = auth.uid() or target_id = auth.uid());

create policy blocks_own on blocks for all using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
create policy mutes_own on mutes for all using (muter_id = auth.uid()) with check (muter_id = auth.uid());

create policy notif_read on notifications for select using (user_id = auth.uid());
create policy notif_update on notifications for update using (user_id = auth.uid());
-- inserts happen via security-definer triggers/RPCs only

create policy conv_member on conversations for select using (exists (select 1 from conversation_participants cp where cp.conversation_id = id and cp.user_id = auth.uid()));
create policy cp_member on conversation_participants for select using (exists (select 1 from conversation_participants me where me.conversation_id = conversation_id and me.user_id = auth.uid()));
create policy cp_update_own on conversation_participants for update using (user_id = auth.uid());
create policy msg_read on messages for select using (exists (select 1 from conversation_participants cp where cp.conversation_id = messages.conversation_id and cp.user_id = auth.uid()));
create policy msg_insert on messages for insert with check (sender_id = auth.uid() and exists (select 1 from conversation_participants cp where cp.conversation_id = messages.conversation_id and cp.user_id = auth.uid())
  and not exists (select 1 from conversation_participants o where o.conversation_id = messages.conversation_id and o.user_id <> auth.uid() and is_blocked_between(auth.uid(), o.user_id)));
create policy msg_delete_own on messages for update using (sender_id = auth.uid());

create policy reports_insert on reports for insert with check (reporter_id = auth.uid());
create policy reports_read on reports for select using (reporter_id = auth.uid() or is_staff());
create policy reports_staff_update on reports for update using (is_staff());
create policy modact_read on moderation_actions for select using (is_staff() or target_user_id = auth.uid());
create policy modact_insert on moderation_actions for insert with check (is_staff() and moderator_id = auth.uid());
create policy appeals_own on appeals for select using (user_id = auth.uid() or is_staff());
create policy appeals_insert on appeals for insert with check (user_id = auth.uid());
create policy appeals_staff_update on appeals for update using (is_admin());
create policy audit_read on admin_audit_log for select using (is_admin());
create policy audit_insert on admin_audit_log for insert with check (is_staff() and actor_id = auth.uid());
create policy site_read on site_settings for select using (true);
create policy site_write on site_settings for all using (is_admin()) with check (is_admin());
