-- CogniShift v1 schema (Supabase auth-aware)
-- Run this in Supabase SQL editor after enabling Auth.

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  calibration_complete boolean not null default false,
  brainwave_baselines jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.song_profiles (
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  track_id text not null,
  profile jsonb not null,
  listen_count int not null default 0,
  last_updated timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, track_id)
);

create table if not exists public.eeg_song_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  track_id text not null,
  session_payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.shuffle_comparison_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  session_payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_song_profiles_user_id on public.song_profiles(user_id);
create index if not exists idx_eeg_song_sessions_user_id on public.eeg_song_sessions(user_id);
create index if not exists idx_shuffle_sessions_user_id on public.shuffle_comparison_sessions(user_id);

-- Optional: auto-provision profile rows when a new auth user signs up
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.user_profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user_profile();

