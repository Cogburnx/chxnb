-- Annotation feature schema for Supabase
-- Run this in SQL editor once.

create extension if not exists pgcrypto;

create table if not exists public.annotations (
  id uuid primary key default gen_random_uuid(),
  page_path text not null,
  x_percent numeric(7,6) not null check (x_percent >= 0 and x_percent <= 1),
  y_percent numeric(7,6) not null check (y_percent >= 0 and y_percent <= 1),
  content text not null check (char_length(content) between 1 and 500),
  is_public boolean not null default true,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text,
  author_avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_annotations_page_path on public.annotations(page_path);
create index if not exists idx_annotations_page_public on public.annotations(page_path, is_public);
create index if not exists idx_annotations_user_id on public.annotations(user_id);

create table if not exists public.annotation_likes (
  annotation_id uuid not null references public.annotations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (annotation_id, user_id)
);

create index if not exists idx_annotation_likes_user_id on public.annotation_likes(user_id);

create table if not exists public.annotation_comments (
  id uuid primary key default gen_random_uuid(),
  annotation_id uuid not null references public.annotations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 300),
  author_name text,
  author_avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_annotation_comments_annotation_id on public.annotation_comments(annotation_id);
create index if not exists idx_annotation_comments_user_id on public.annotation_comments(user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_annotations_set_updated_at on public.annotations;
create trigger trg_annotations_set_updated_at
before update on public.annotations
for each row
execute function public.set_updated_at();

drop trigger if exists trg_annotation_comments_set_updated_at on public.annotation_comments;
create trigger trg_annotation_comments_set_updated_at
before update on public.annotation_comments
for each row
execute function public.set_updated_at();

alter table public.annotations enable row level security;
alter table public.annotation_likes enable row level security;
alter table public.annotation_comments enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.annotations to anon, authenticated;
grant select on public.annotation_likes to anon, authenticated;
grant select on public.annotation_comments to anon, authenticated;
grant insert, update, delete on public.annotations to authenticated;
grant insert, delete on public.annotation_likes to authenticated;
grant insert, update, delete on public.annotation_comments to authenticated;

-- annotations policies
drop policy if exists "annotations_select_visible" on public.annotations;
create policy "annotations_select_visible"
on public.annotations
for select
using (is_public or user_id = auth.uid());

drop policy if exists "annotations_insert_own" on public.annotations;
create policy "annotations_insert_own"
on public.annotations
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "annotations_update_own" on public.annotations;
create policy "annotations_update_own"
on public.annotations
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "annotations_delete_own" on public.annotations;
create policy "annotations_delete_own"
on public.annotations
for delete
to authenticated
using (user_id = auth.uid());

-- likes policies
drop policy if exists "annotation_likes_select_visible" on public.annotation_likes;
create policy "annotation_likes_select_visible"
on public.annotation_likes
for select
using (
  exists (
    select 1 from public.annotations a
    where a.id = annotation_likes.annotation_id
      and (a.is_public or a.user_id = auth.uid())
  )
);

drop policy if exists "annotation_likes_insert_own" on public.annotation_likes;
create policy "annotation_likes_insert_own"
on public.annotation_likes
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.annotations a
    where a.id = annotation_likes.annotation_id
      and (a.is_public or a.user_id = auth.uid())
  )
);

drop policy if exists "annotation_likes_delete_own" on public.annotation_likes;
create policy "annotation_likes_delete_own"
on public.annotation_likes
for delete
to authenticated
using (user_id = auth.uid());

-- comments policies
drop policy if exists "annotation_comments_select_visible" on public.annotation_comments;
create policy "annotation_comments_select_visible"
on public.annotation_comments
for select
using (
  exists (
    select 1 from public.annotations a
    where a.id = annotation_comments.annotation_id
      and (a.is_public or a.user_id = auth.uid())
  )
);

drop policy if exists "annotation_comments_insert_own" on public.annotation_comments;
create policy "annotation_comments_insert_own"
on public.annotation_comments
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.annotations a
    where a.id = annotation_comments.annotation_id
      and (a.is_public or a.user_id = auth.uid())
  )
);

drop policy if exists "annotation_comments_update_own" on public.annotation_comments;
create policy "annotation_comments_update_own"
on public.annotation_comments
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "annotation_comments_delete_own" on public.annotation_comments;
create policy "annotation_comments_delete_own"
on public.annotation_comments
for delete
to authenticated
using (user_id = auth.uid());
