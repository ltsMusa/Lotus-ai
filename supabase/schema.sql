-- ==========================================================
-- Lotus AI — Database Schema
-- ==========================================================
-- Run this in the Supabase SQL editor for your project.
-- Covers memory + chat history (used by js/memory.js and
-- js/storage.js), with Row Level Security so users can only
-- ever read/write their own rows.
--
-- Safe to run again and again — also on a project that was set up
-- by hand earlier: tables/indexes use "if not exists", missing
-- columns are added, policies are dropped and recreated, grants are
-- repeatable. It never deletes rows.
-- (Sign-in itself — e-mail confirmation, redirect URLs, Google —
-- is NOT set here; see supabase/KURULUM.md.)
-- ==========================================================

-- ----------------------------------------------------------
-- CONVERSATIONS
-- ----------------------------------------------------------

create table if not exists public.conversations (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users(id) on delete cascade,
    title       text not null default 'Yeni Sohbet',
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index if not exists conversations_user_id_updated_at_idx
    on public.conversations (user_id, updated_at desc);

alter table public.conversations enable row level security;

-- Older hand-made policies (same rules, other names) are replaced.
drop policy if exists "Users can view their own conversations"   on public.conversations;
drop policy if exists "Users can create their own conversations" on public.conversations;
drop policy if exists "Users can update their own conversations" on public.conversations;
drop policy if exists "Users can delete their own conversations" on public.conversations;

drop policy if exists "conversations_select_own" on public.conversations;
drop policy if exists "conversations_insert_own" on public.conversations;
drop policy if exists "conversations_update_own" on public.conversations;
drop policy if exists "conversations_delete_own" on public.conversations;

create policy "conversations_select_own"
    on public.conversations for select to authenticated
    using ((select auth.uid()) = user_id);

create policy "conversations_insert_own"
    on public.conversations for insert to authenticated
    with check ((select auth.uid()) = user_id);

create policy "conversations_update_own"
    on public.conversations for update to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

create policy "conversations_delete_own"
    on public.conversations for delete to authenticated
    using ((select auth.uid()) = user_id);


-- ----------------------------------------------------------
-- MESSAGES
-- ----------------------------------------------------------

create table if not exists public.messages (
    id               uuid primary key default gen_random_uuid(),
    conversation_id  uuid not null references public.conversations(id) on delete cascade,
    user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
    role             text not null check (role in ('user', 'assistant', 'system')),
    content          text not null,
    provider         text,
    model            text,
    created_at       timestamptz not null default now()
);

-- The app only sends conversation_id / role / content — the owner is
-- filled in from the signed-in user (before this, every insert failed
-- with "null value in column user_id").
alter table public.messages alter column user_id set default auth.uid();

create index if not exists messages_conversation_id_created_at_idx
    on public.messages (conversation_id, created_at asc);

alter table public.messages enable row level security;

drop policy if exists "Users can view their own messages"   on public.messages;
drop policy if exists "Users can create their own messages" on public.messages;
drop policy if exists "Users can delete their own messages" on public.messages;

drop policy if exists "messages_select_own" on public.messages;
drop policy if exists "messages_insert_own" on public.messages;
drop policy if exists "messages_delete_own" on public.messages;

create policy "messages_select_own"
    on public.messages for select to authenticated
    using ((select auth.uid()) = user_id);

-- A message can only be added to one of your own conversations.
create policy "messages_insert_own"
    on public.messages for insert to authenticated
    with check (
        (select auth.uid()) = user_id
        and exists (
            select 1 from public.conversations c
            where c.id = messages.conversation_id
            and c.user_id = (select auth.uid())
        )
    );

create policy "messages_delete_own"
    on public.messages for delete to authenticated
    using ((select auth.uid()) = user_id);


-- ----------------------------------------------------------
-- MEMORIES
-- ----------------------------------------------------------

create table if not exists public.memories (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users(id) on delete cascade,
    content     text not null,
    category    text not null default 'general',
    importance  smallint not null default 1 check (importance between 1 and 5),
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- Tables made earlier by hand lack these two (js/memory.js reads and writes them).
alter table public.memories add column if not exists category   text     not null default 'general';
alter table public.memories add column if not exists importance smallint not null default 1;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'memories_importance_range') then
        alter table public.memories
            add constraint memories_importance_range check (importance between 1 and 5);
    end if;
end $$;

create index if not exists memories_user_id_importance_idx
    on public.memories (user_id, importance desc, created_at desc);

alter table public.memories enable row level security;

drop policy if exists "Users can view their own memories"   on public.memories;
drop policy if exists "Users can create their own memories" on public.memories;
drop policy if exists "Users can update their own memories" on public.memories;
drop policy if exists "Users can delete their own memories" on public.memories;

drop policy if exists "memories_select_own" on public.memories;
drop policy if exists "memories_insert_own" on public.memories;
drop policy if exists "memories_update_own" on public.memories;
drop policy if exists "memories_delete_own" on public.memories;

create policy "memories_select_own"
    on public.memories for select to authenticated
    using ((select auth.uid()) = user_id);

create policy "memories_insert_own"
    on public.memories for insert to authenticated
    with check ((select auth.uid()) = user_id);

create policy "memories_update_own"
    on public.memories for update to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

create policy "memories_delete_own"
    on public.memories for delete to authenticated
    using ((select auth.uid()) = user_id);


-- ----------------------------------------------------------
-- PERMISSIONS
-- ----------------------------------------------------------
-- RLS above limits every signed-in user to their own rows. On top of
-- that: "anon" (not signed in) gets nothing, and "authenticated" only
-- the four everyday operations (no TRUNCATE, which would skip RLS).

grant usage on schema public to authenticated;

revoke all on public.conversations from anon, authenticated;
revoke all on public.messages      from anon, authenticated;
revoke all on public.memories      from anon, authenticated;

grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.messages      to authenticated;
grant select, insert, update, delete on public.memories      to authenticated;


-- ----------------------------------------------------------
-- Keep conversations.updated_at fresh when a message lands
-- (storage.js also does this from the client — this trigger
-- makes it correct even if a write bypasses the client).
-- ----------------------------------------------------------

create or replace function public.touch_conversation_updated_at()
returns trigger as $$
begin
    update public.conversations
    set updated_at = now()
    where id = new.conversation_id;

    return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Only the trigger itself should run it, never an API caller.
revoke execute on function public.touch_conversation_updated_at() from public, anon, authenticated;

drop trigger if exists messages_touch_conversation on public.messages;

create trigger messages_touch_conversation
    after insert on public.messages
    for each row
    execute function public.touch_conversation_updated_at();


-- ----------------------------------------------------------
-- Keep memories.updated_at fresh on edits.
-- ----------------------------------------------------------

create or replace function public.touch_memory_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql set search_path = public;

revoke execute on function public.touch_memory_updated_at() from public, anon, authenticated;

drop trigger if exists memories_touch_updated_at on public.memories;

create trigger memories_touch_updated_at
    before update on public.memories
    for each row
    execute function public.touch_memory_updated_at();
