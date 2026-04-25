-- CogniShift v1 schema (Spotify identity + EEG stream storage)
-- Run this in Supabase SQL editor.

create table if not exists public.user_profiles (
  id text primary key, -- spotify user id
  name text,
  spotify_display_name text,
  spotify_email text,
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

create table if not exists public.eeg_song_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.user_profiles(id) on delete cascade,
  track_id text not null,
  session_payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.shuffle_comparison_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.user_profiles(id) on delete cascade,
  session_payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.eeg_stream_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.user_profiles(id) on delete cascade,
  source text not null default 'mock', -- mock | neuropawn
  sample_rate_hz int,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  meta jsonb not null default '{}'::jsonb
);

create table if not exists public.eeg_stream_snapshots (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.eeg_stream_sessions(id) on delete cascade,
  ts_ms bigint not null,
  delta double precision,
  theta double precision not null,
  alpha double precision not null,
  beta double precision not null,
  gamma double precision not null,
  dominant_state text not null,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.eeg_artifact_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.eeg_stream_sessions(id) on delete cascade,
  ts_ms bigint not null,
  artifact_type text not null, -- jawClench | blink | other
  confidence double precision,
  duration_ms int,
  channel text,
  peak_amplitude double precision,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists idx_song_profiles_user_id on public.song_profiles(user_id);
create index if not exists idx_eeg_song_sessions_user_id on public.eeg_song_sessions(user_id);
create index if not exists idx_shuffle_sessions_user_id on public.shuffle_comparison_sessions(user_id);
create index if not exists idx_eeg_stream_sessions_user_id on public.eeg_stream_sessions(user_id);
create index if not exists idx_eeg_stream_snapshots_session_id on public.eeg_stream_snapshots(session_id);
create index if not exists idx_eeg_artifact_events_session_id on public.eeg_artifact_events(session_id);

