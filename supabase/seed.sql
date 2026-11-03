-- DEVELOPMENT SEED ONLY. Clearly-labelled demo accounts; never run against production.
-- All demo accounts share the password: demo-password-123
select set_config('pulse.bypass_guard', '1', false);

do $$
declare
  u record; uid uuid;
begin
  for u in select * from (values ('demo_alice','Alice (demo)','alice@demo.local'), ('demo_bob','Bob (demo)','bob@demo.local'), ('demo_admin','Admin (demo)','admin@demo.local')) as t(username, display_name, email) loop
    uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', u.email, crypt('demo-password-123', gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', jsonb_build_object('username', u.username, 'display_name', u.display_name), now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text, 'email', jsonb_build_object('sub', uid::text, 'email', u.email), now(), now(), now());
  end loop;
end $$;

update profiles set role = 'super_admin', bio = 'DEMO admin account (seed data)' where username = 'demo_admin';
update profiles set bio = 'DEMO account (seed data)' where username in ('demo_alice', 'demo_bob');

insert into follows (follower_id, following_id)
  select a.id, b.id from profiles a, profiles b where a.username = 'demo_alice' and b.username = 'demo_bob';
insert into posts (author_id, body)
  select id, '[DEMO] Hello from ' || username || ' — this is seed data for development. #demo' from profiles where username in ('demo_alice', 'demo_bob');
insert into posts (author_id, body)
  select id, '[DEMO] سلام! این یک پست آزمایشی است. #دمو' from profiles where username = 'demo_alice';

select set_config('pulse.bypass_guard', '', false);
