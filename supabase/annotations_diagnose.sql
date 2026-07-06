-- Annotation feature diagnosis script
-- Run in Supabase SQL Editor

-- 1) Check tables exist
select 'annotations' as name, to_regclass('public.annotations') as regclass;
select 'annotation_likes' as name, to_regclass('public.annotation_likes') as regclass;
select 'annotation_comments' as name, to_regclass('public.annotation_comments') as regclass;

-- 2) Check RLS enabled
select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where relname in ('annotations', 'annotation_likes', 'annotation_comments')
order by relname;

-- 3) Check policies
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('annotations', 'annotation_likes', 'annotation_comments')
order by tablename, policyname;

-- 4) Check grants
select table_name, privilege_type, grantee
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('annotations', 'annotation_likes', 'annotation_comments')
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;

-- 5) Basic row counts
select 'annotations' as table_name, count(*) as total from public.annotations
union all
select 'annotation_likes', count(*) from public.annotation_likes
union all
select 'annotation_comments', count(*) from public.annotation_comments;

-- 6) Sample recent rows
select id, page_path, is_public, user_id, created_at
from public.annotations
order by created_at desc
limit 5;

-- 7) If empty, insert one public test annotation (safe)
--    Uncomment and run once if needed:
-- insert into public.annotations(page_path, x_percent, y_percent, content, is_public, user_id, author_name)
-- values ('/index.html', 0.5, 0.5, '测试批注（可删除）', true, 'REPLACE_WITH_AUTH_USER_ID', '测试用户');
