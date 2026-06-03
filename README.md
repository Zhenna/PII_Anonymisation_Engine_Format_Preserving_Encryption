# PII Anonymisation Engine

Format-Preserving Encryption (FPE) and hashing for Singapore PII data.
Built for PDPA / GDPR / MAS TRM compliance scenarios.

> 📖 Read the full write-up: [Format-Preserving Encryption: How to Protect PII Without Breaking Your Data Pipeline](https://medium.com/)

---

## Live Playground

The frontend ships with an interactive playground — no backend required.

- Paste any **NRIC, passport number, date of birth, or name**
- Hit **RUN ENCRYPT** to see pseudonymised output side by side with the original
- Hit **RUN DECRYPT** to reverse FPE fields back to the original
- Toggle **Demo mode ON** to run entirely in-browser without spinning up the backend

```bash
npm create vite@latest frontend -- --template react
cp src/App.jsx frontend/src/App.jsx
cd frontend && npm install && npm run dev
# → http://localhost:5173
```

> Demo mode uses a client-side mock of the FPE logic — useful for quick demos without a running server. Flip it off to call the real FastAPI backend.

---

## What it does

| PII type        | Method              | Reversible | Format preserved |
|-----------------|---------------------|------------|-----------------|
| NRIC / FIN      | FPE (FF1 / pyffx)   | ✅ Yes     | ✅ Yes           |
| Passport number | FPE (FF1 / pyffx)   | ✅ Yes     | ✅ Yes           |
| Date of birth   | HMAC-SHA256 masking | ❌ No      | ✅ Year + format |
| Full name       | Salted SHA-256      | ❌ No      | ❌ Hex digest    |

---

## Project structure

```
FPE_ENCRYPTION_EXPERIMENTS/
├── .gitignore
├── README.md
├── backend/
│   ├── crypto.py            # All encryption / hashing logic
│   ├── main.py              # FastAPI app
│   └── requirements.txt
└── frontend/
    └── src/
        └── App.jsx          # React portfolio + playground (single file)
```

---

## Quick start

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Optional: override the demo key
export FPE_SECRET_KEY="your-hex-key-here"

uvicorn main:app --reload --port 8000
```

Swagger UI: http://localhost:8000/docs  
ReDoc:       http://localhost:8000/redoc

### Frontend

```bash
# In a new terminal
npm create vite@latest frontend -- --template react
cp frontend/src/App.jsx frontend/src/App.jsx
cd frontend && npm install && npm run dev
```

Open http://localhost:5173 — go to the **Playground** tab.  
Toggle **Demo mode ON** to run fully in-browser without the backend.  
Switch **Demo mode OFF** to call the live FastAPI backend.

---

## Deployment

### Frontend — Vercel (free, no backend needed)

The playground runs in demo mode entirely in-browser — no backend required to share a live URL.

```bash
# 1. Create the Vite project and copy App.jsx
npm create vite@latest frontend -- --template react
cp App.jsx frontend/src/App.jsx
cd frontend && npm install

# 2. Test locally
npm run dev
# → http://localhost:5173 — toggle Demo mode ON to verify

# 3. Build and deploy
npm run build
npm install -g vercel
vercel
```

Vercel will prompt for a few settings — accept the defaults. It outputs a shareable URL like `https://pii-anon-xyz.vercel.app`.

**To redeploy after changes:**
```bash
cp ../App.jsx src/App.jsx
npm run build && vercel --prod
```

### Backend — Railway / Render (optional)

Only needed if you want demo mode OFF (real FPE, not mock). Deploy `backend/` to [Railway](https://railway.app) or [Render](https://render.com) via GitHub, then update `App.jsx`:

```javascript
// App.jsx line ~6
const API_BASE = "https://your-backend.railway.app/api";
```

Redeploy the frontend after the change.

### `POST /api/encrypt`

```json
{
  "nric":     "S9812345Z",
  "passport": "A1234567Z",
  "dob":      "1978-08-30",
  "name":     "John Smith"
}
```

### `POST /api/decrypt`

Same shape. Only `nric` and `passport` are reversed; `dob` and `name` are returned as-is.

### `POST /api/batch/encrypt` / `/api/batch/decrypt`

```json
{ "records": [ { ...record1 }, { ...record2 } ] }
```

Max 1 000 records per call.

---

## Key management

The FPE key is read from the `FPE_SECRET_KEY` environment variable.  
A hard-coded demo key is used if the variable is not set — **never use the demo key in production**.

Recommended: load the key from AWS Secrets Manager, HashiCorp Vault, or your cloud provider's secret store.

---

## Supported DOB formats

The output format always mirrors the input format.

| Input format | Example input | Example output |
|---|---|---|
| `YYYY-MM-DD` | `1978-08-30` | `1978-03-14` |
| `YYYYMMDD` | `19780830` | `19780314` |
| `DD-MMM-YYYY HH:MM:SS.fff` | `30-AUG-1978 00:00:00.000` | `14-MAR-1978 00:00:00.000` |

Year is always preserved. Month and day are pseudorandomised via HMAC-SHA256 — deterministic per input+key, not reversible.

---

## License

MIT
