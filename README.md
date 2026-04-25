# CogniShift

Monorepo skeleton for CogniShift (frontend + backend).

## Dev setup

### Backend (FastAPI)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Health check: `GET http://localhost:8000/health`

### Frontend (Vite React + TS)

This repo is generated as a standard Vite project, but **Node is required** to run it:

```bash
cd frontend
npm install
npm run dev
```

Copy env template:

```bash
cp .env.example .env
```

## EEG integration (neuropawn seam)

The app uses an **event-driven EEG emitter** abstraction (`frontend/src/features/eeg/neuropawnAdapter.ts`).

- Development uses the **mock EEG** implementation in `frontend/src/features/eeg/mockEEG.ts`.
- To wire real hardware, implement `createNeuropawnEEGEmitter()` by bridging neuropawn’s device stream + band-power callbacks into `EEGEvent` emissions.

# CogniShift