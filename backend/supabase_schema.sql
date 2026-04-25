-- CogniShift v1 schema (minimal)

create table if not exists public.user_profiles (
  id text primary key,
  name text,
  calibration_complete boolean not null default false,
  brainwave_baselines jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.song_profiles (
  user_id text not null references public.user_profiles(id) on delete cascade,
  track_id text not null,
  profile jsonb not null,
  listen_count int not null default 0,
  last_updated timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, track_id)
);

