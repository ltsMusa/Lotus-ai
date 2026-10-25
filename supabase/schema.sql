-- ==========================================================
-- Lotus AI — Database Schema
-- ==========================================================
-- Run this in the Supabase SQL editor for your project.
-- Covers memory + chat history (used by js/memory.js and
-- js/storage.js today), with Row Level Security so users can
-- only ever read/write their own rows — closing the "Güvenli
-- database policy'leri" / "RLS policies" gap from the audit.
--
-- Safe to run again and again: tables/indexes use "if not exists",
-- policies are dropped and recreated, grants are repeatable.
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

drop policy if exists "conversations_select_own" on public.conversations;

create policy "conversations_select_own"
    on public.conversations for select
    using (auth.uid() = user_id);

drop policy if exists "conversations_insert_own" on public.conversations;

create policy "conversations_insert_own"
    on public.conversations for insert
    with check (auth.uid() = user_id);

drop policy if exists "conversations_update_own" on public.conversations;

create policy "conversations_update_own"
    on public.conversations for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "conversations_delete_own" on public.conversations;

create policy "conversations_delete_own"
    on public.conversations for delete
    using (auth.uid() = user_id);


-- ----------------------------------------------------------
-- MESSAGES
-- ----------------------------------------------------------

create table if not exists public.messages (
    id               uuid primary key default gen_random_uuid(),
    conversation_id  uuid not null references public.conversations(id) on delete cascade,
    role             text not null check (role in ('user', 'assistant')),
    content          text not null,
    created_at       timestamptz not null default now()
);

create index if not exists messages_conversation_id_created_at_idx
    on public.messages (conversation_id, created_at asc);

alter table public.messages enable row level security;

-- Messages don't carry user_id directly — ownership is checked
-- through the parent conversation.
drop policy if exists "messages_select_own" on public.messages;

create policy "messages_select_own"
    on public.messages for select
    using (
        exists (
            select 1 from public.conversations c
            where c.id = messages.conversation_id
            and c.user_id = auth.uid()
        )
    );

drop policy if exists "messages_insert_own" on public.messages;

create policy "messages_insert_own"
    on public.messages for insert
    with check (
        exists (
            select 1 from public.conversations c
            where c.id = messages.conversation_id
            and c.user_id = auth.uid()
        )
    );

drop policy if exists "messages_delete_own" on public.messages;

create policy "messages_delete_own"
    on public.messages for delete
    using (
        exists (
            select 1 from public.conversations c
            where c.id = messages.conversation_id
            and c.user_id = auth.uid()
        )
    );


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

create index if not exists memories_user_id_importance_idx
    on public.memories (user_id, importance desc, created_at desc);

alter table public.memories enable row level security;

drop policy if exists "memories_select_own" on public.memories;

create policy "memories_select_own"
    on public.memories for select
    using (auth.uid() = user_id);

drop policy if exists "memories_insert_own" on public.memories;

create policy "memories_insert_own"
    on public.memories for insert
    with check (auth.uid() = user_id);

drop policy if exists "memories_update_own" on public.memories;

create policy "memories_update_own"
    on public.memories for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "memories_delete_own" on public.memories;

create policy "memories_delete_own"
    on public.memories for delete
    using (auth.uid() = user_id);


-- ----------------------------------------------------------
-- PERMISSIONS
-- ----------------------------------------------------------
-- Tables made through the SQL editor on some projects are not
-- reachable from the API until the "authenticated" role gets
-- table privileges (symptom: "permission denied for table …").
-- RLS above still limits every user to their own rows, and
-- "anon" (not signed in) gets nothing.

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.messages      to authenticated;
grant select, insert, update, delete on public.memories      to authenticated;

revoke all on public.conversations from anon;
revoke all on public.messages      from anon;
revoke all on public.memories      from anon;


-- ----------------------------------------------------------
-- Keep conversations.updated_at fresh when a message lands
-- (storage.js also does this from the client — this trigger
-- makes it correct even if a write bypasses the client, e.g.
-- a future backend proxy inserting on the user's behalf).
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
$$ language plpgsql;

drop trigger if exists memories_touch_updated_at on public.memories;

create trigger memories_touch_updated_at
    before update on public.memories
    for each row
    execute function public.touch_memory_updated_at();
