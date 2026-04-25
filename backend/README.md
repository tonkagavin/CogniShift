# CogniShift Backend

## What this backend does

- Hosts API routes for user profiles and song profiles stored in Supabase.
- Hosts Spotify OAuth helper routes for the frontend Web Playback SDK:
  - `GET /spotify/authorize-url`
  - `POST /spotify/token/exchange`
  - `POST /spotify/token/refresh`
- Provides EEG dataset tooling for development:
  - `scripts/generate_eeg_pickle.py` generates synthetic BrainFlow windows and writes a `.pickle` payload for ML input.

## Required environment variables

Copy `.env.example` to `.env` and set:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REDIRECT_URI` (must match Spotify app dashboard)

## Run API

```bash
uvicorn app.main:app --reload --port 8000
```

## Build Supabase schema

Run SQL in `supabase_schema.sql` in your Supabase SQL Editor.

## Generate synthetic EEG `.pickle`

```bash
python scripts/generate_eeg_pickle.py \
  --duration-sec 120 \
  --pickle-out backend/data/eeg_synthetic_features.pkl \
  --raw-csv-out backend/data/eeg_synthetic_raw.csv
```

