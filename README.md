# PII Anonymisation Engine

Format-Preserving Encryption (FPE) and hashing for Singapore PII data.
Built for PDPA / GDPR / MAS TRM compliance scenarios.

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
fpe-project/
├── backend/
│   ├── crypto.py        # All encryption / hashing logic
│   ├── main.py          # FastAPI app
│   └── requirements.txt
└── frontend/
    └── src/
        └── App.jsx      # React portfolio + playground (single file)
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
# Using Vite (recommended)
npm create vite@latest frontend -- --template react
cp frontend/src/App.jsx <vite-project>/src/App.jsx
cd <vite-project>
npm install
npm run dev
```

---

## API

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
